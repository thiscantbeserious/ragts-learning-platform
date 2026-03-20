# ADR: Toast Aggregation

## Status
Accepted

## Context

Multiple sources in the app can fire rapid-fire toasts:

- **Batch uploads:** `useUpload.ts` calls `fireToast()` per file on completion. Uploading 20 files produces 20 toasts.
- **SSE session processing:** `SessionCard.vue` calls `fireToast()` when a session finishes processing. If 10 sessions complete in quick succession, 10 toasts stack up.
- **Future sources:** Bulk delete, pipeline status, etc.

The goal is a **general-purpose** aggregation layer that automatically groups rapid-fire toasts of "the same kind" into summaries. It should work for ALL toast callers, not just uploads.

### The Grouping Key Problem

What makes two toasts "the same kind"?

- **Toast type alone** (success/error/warning/info): Too coarse. "Session uploaded" (success) and "Session ready" (success) are both `success` but are semantically different actions that should NOT be merged.
- **Message text:** Too fine-grained. Each message is unique ("foo.cast has been uploaded", "bar.cast has been uploaded").
- **Title:** Semantically meaningful but fragile. Title is a free-form display string -- a typo or rewording silently breaks aggregation. Two callers using slightly different titles for the same logical event ("Session uploaded" vs "Sessions uploaded") would fail to aggregate.
- **Title + type composite (original design):** Same fragility as title alone, plus `title` could not be mutated via `updateToast` because changing it would break the key.

**Predefined category enum:** A `const` object of known toast categories. Each category value is a stable, machine-readable string. Callers set `category` explicitly to opt into aggregation. The category alone is the aggregation key -- no composite with `type` needed because the enum values already encode semantic intent including success/failure distinction (e.g., `upload-success` vs `upload-failed`).

Audit of all current `fireToast` call sites (production code):

| Caller | Title | Type | Category (new) | Fires rapidly? |
|--------|-------|------|-----------------|---------------|
| useUpload (success) | "Session uploaded" | success | UPLOAD_SUCCESS | Yes (batch) |
| useUpload (error, bad response) | "Upload failed" | error | UPLOAD_FAILED | Yes (batch) |
| useUpload (error, catch) | "Upload failed" | error | UPLOAD_FAILED | Yes (batch) |
| SessionCard (ready) | "Session ready" | success | SESSION_READY | Yes (SSE burst) |
| SessionCard (failed) | "Processing failed" | error | PROCESSING_FAILED | Yes (SSE burst) |
| LandingPage (upload) | none | success | none | No |
| LandingPage (delete ok) | none | info | none | No |
| LandingPage (delete fail) | none | error | none | No |

Observation: callers that can fire rapidly map cleanly to distinct categories. Callers that fire once (LandingPage) have no category and bypass aggregation entirely.

### The Timer Problem

Raw `setTimeout` is scattered across multiple client files with no structured lifecycle:

| File | Pattern | Timer purpose |
|------|---------|---------------|
| `useToast.ts` (line 62, 93) | `Map<number, setTimeout>` + manual `clearTimeout` | Toast auto-dismiss |
| `SessionCard.vue` (line 135) | Fire-and-forget `setTimeout` | Glow animation reset (700ms) |
| `SidebarPanel.vue` (line 222-236) | Single managed timer, cancel-and-replace | Upload status announcement clear (4s) |
| `usePipelineStatus.ts` (line 75, 138) | Single managed timer with cancel | SSE reconnect backoff |

Problems with raw `setTimeout` in application code:
1. **No structured lifecycle.** Timers float as opaque handles with no clear ownership or cleanup guarantees.
2. **No batch cancellation.** Each file re-implements "cancel old, schedule new" with its own variable/map.
3. **Scattered timer management.** Every file that needs a delay re-invents the same cancel/schedule/cleanup pattern.
4. **Component lifecycle risk.** Components must manually track and clear timers in `onUnmounted`. Missing cleanup causes memory leaks and stale callbacks.

### The Timing Trap (Aggregation Design)

Aggregation is a **state problem, not a timing problem.** The initial design framed aggregation as "buffer toasts, wait for a debounce timer, then flush." This is wrong for three reasons:

1. **Debounce introduces artificial latency.** Every toast, including singles, gets delayed by the debounce window. The user sees nothing for 300ms after an action completes. This degrades perceived performance for the common case (single uploads) to optimize the rare case (batch uploads).

2. **The real question is "when does the aggregation key expire?" not "how long should I buffer?"** The answer is already in the system: a toast is visible for a known duration (managed by the auto-dismiss scheduler). As long as a toast of a given kind is still visible, subsequent toasts of the same kind should merge into it. When the toast is dismissed, the key expires naturally. No additional timers needed.

3. **Timing-based logic should be encapsulated, not scattered.** Timer management belongs in a dedicated scheduler, not sprinkled across application logic.

**Constraints:**
- Frontend only (`src/client/`).
- No new visual components -- reuses existing toast styling.
- **No raw `setTimeout` or `clearTimeout` in `useToast.ts`.** Timer management is encapsulated in a general-purpose scheduler.
- **No `setTimeout`, `setInterval`, or raw timers in the aggregation logic.** Aggregation window is the toast's visible lifetime.

## Options Considered

### Option A: Live Reactive Merge via Separate Composable

A new `useToastAggregator` composable provides `addAggregatedToast(message, type, options)`. Internally maintains an `activeKeys` map, uses `watch(toasts, ..., { flush: 'post' })` for cleanup, and calls `fireToast`/`updateToast` on the underlying `useToast`. Callers opt in by importing the aggregator instead of `useToast`.

- **Pros:**
  - `useToast` internals mostly untouched (only `fireToast` return value and `updateToast` added).
  - Explicit opt-in per caller.
- **Cons:**
  - Two toast entry points in the codebase (`fireToast` and `addAggregatedToast`) -- confusion about which to use.
  - Every rapid-fire caller must be individually migrated to import the aggregator.
  - Separate composable introduces indirection for a feature that is fundamentally about how toasts work.
  - **We are already modifying `useToast`** (adding `updateToast`, changing `fireToast` return type) -- the "keep useToast untouched" argument is already void.

### Option B: Transparent Always-On Aggregation Inside useToast

Aggregation logic lives inside `useToast` itself. When `fireToast` is called with a `category`, it checks if a toast with the same category already exists. If so, it updates the existing toast in place via `updateToast`. If not, it creates a new toast normally. Toasts without a `category` bypass aggregation entirely.

The `fireToast` options object includes optional `category`, `summaryTemplate`, `summaryNoun`, `showItemLabels`, and `itemLabel` fields. These are used only when aggregation occurs (count > 1). Single toasts display the original message unchanged.

**Mechanism:**
- `activeKeys`: a module-level `Map<string, AggregationState>` tracking which categories have a visible toast. Key is the `category` string directly.
- On `fireToast(msg, type, opts)`:
  - If no `category` in opts: create toast normally (no aggregation). Return ID.
  - If category NOT in `activeKeys`: create toast, store ID and metadata in `activeKeys`. Return ID.
  - If category IS in `activeKeys`: increment count, append `itemLabel`/message, build summary via `summaryTemplate` or built-in formatting, call `updateToast(existingId, { message: summaryMsg })`. If `updateToast` returns false (toast was dismissed between calls), start fresh as if key not found. Return existing ID.
- `watch(toasts, callback, { flush: 'post' })`: iterate `activeKeys`, prune entries whose toast ID is no longer in the `toasts` array. Shallow watch only. Registered inside an `effectScope()`.
- `effectScope`: created lazily on first `useToast()` call. Disposed by `resetToastState()`.

**Integration:** Minimal migration. Every existing caller that provides a `title` adds a `category` field from the `ToastCategory` enum. Callers without a title (LandingPage) are completely untouched.

- **Pros:**
  - **Minimal migration.** Callers add one field (`category`). No import changes for `useToast`.
  - **Single entry point.** `fireToast` is the only function callers use.
  - **Stable aggregation key.** Category is a predefined enum value, not a free-form string. Typos are caught by TypeScript.
  - **Title is safe to mutate.** With category-based keying, `title` is purely a display field and can be updated via `updateToast`.
  - **Same reactive machinery** (activeKeys, watch, effectScope, updateToast) -- well understood from the initial implementation.
- **Cons:**
  - Increases `useToast` complexity. The file includes aggregation state and watch cleanup.
  - Callers must import `ToastCategory` enum in addition to `useToast`.

### Option C: Middleware Pipeline (pluggable transform layer)

Add a middleware/interceptor system to `useToast`.

- **Pros:** Extensible. Clean separation.
- **Cons:** Over-engineered. YAGNI for one use case. Significant refactor.

### Option D: Reactive Post-Hoc Deduplication (watcher scans toast list)

Let all toasts enter the array. A watcher scans and merges matching toasts.

- **Pros:** Zero latency. Purely reactive.
- **Cons:** N toasts briefly exist in DOM causing flicker. Race conditions with dismiss. O(n) scan per mutation.

### Option E: Decorator Pattern (per-caller wrapper)

HOF wraps toast functions with merge logic per caller.

- **Pros:** Explicit opt-in. `useToast` untouched.
- **Cons:** Isolated buffers per caller prevent cross-caller aggregation.

### Timer Replacement Options

#### Option T-A: AbortController + AbortSignal.timeout()

Modern, cancellable, no setTimeout at all.

- **Pros:** No `setTimeout`/`clearTimeout`. Platform-native. Structured lifecycle.
- **Cons:** `AbortSignal.timeout()` is NOT faked by `vi.useFakeTimers()`. All existing tests that use `vi.advanceTimersByTime()` to test auto-dismiss would break and require a full rewrite.

#### Option T-B: Toast-specific DismissScheduler

A dedicated module for toast auto-dismiss only: `schedule(id, ms, cb)`, `cancel(id)`, `cancelAll()`.

- **Pros:** Clean API. Focused single purpose.
- **Cons:** Only solves the toast case. Other files (`SessionCard.vue`, `SidebarPanel.vue`, `usePipelineStatus.ts`) continue to use raw `setTimeout` with the same problems. Missed opportunity to solve the pattern once.

#### Option T-C: General-purpose `useScheduler` composable

A reusable composable any component or composable can import. Provides a `createScheduler()` factory for module-level singletons and a `useScheduler()` composable with automatic `onScopeDispose` cleanup for component/composable contexts.

- **Pros:** Solves the timer lifecycle problem once for the entire client codebase. useToast uses a module-level instance; components use the composable with automatic cleanup. Clean API with opaque cancellable handles. Works with vitest fake timers (setTimeout under the hood).
- **Cons:** Broader scope than strictly needed for toast aggregation. Mitigated: the implementation is small (~40 lines) and the pattern is already duplicated in 4+ files.

#### Option T-D: requestAnimationFrame with timestamps

rAF loop that checks deadline timestamps.

- **Pros:** No setTimeout at all.
- **Cons:** Runs at 60fps when any toast is visible (wasteful). Tab-backgrounding throttles rAF. Harder to test.

## Decision

**Option B: Transparent Always-On Aggregation Inside useToast**, with **category enum as sole aggregation key** and **general-purpose `useScheduler` composable (Option T-C) for timer encapsulation.**

### useScheduler Composable

A new module `src/client/composables/useScheduler.ts` providing two entry points:

1. **`createScheduler(): Scheduler`** -- factory function that returns a standalone scheduler instance. Used for module-level singletons (e.g., useToast's auto-dismiss). No Vue lifecycle coupling.
2. **`useScheduler(): Scheduler`** -- Vue composable that creates a scheduler and registers `cancelAll()` on `onScopeDispose`. Used inside component `setup()` or composable functions for automatic cleanup.

Both return the same `Scheduler` interface:

```typescript
/** Opaque handle returned by scheduler.after(). */
export interface SchedulerHandle {
  /** Cancel this scheduled callback. No-op if already fired or cancelled. */
  cancel(): void;
}

/** Structured timer lifecycle: schedule, cancel individually, or cancel all. */
export interface Scheduler {
  /**
   * Schedule a callback to run after delayMs milliseconds.
   * Returns a cancellable handle. No-op when delayMs <= 0 (callback never fires).
   */
  after(delayMs: number, callback: () => void): SchedulerHandle;
  /** Cancel all pending scheduled callbacks. */
  cancelAll(): void;
}
```

**Design decisions:**

- **Opaque handles, not numeric IDs.** The caller gets a `SchedulerHandle` with a `.cancel()` method. No need to manage an ID namespace or pass IDs back to a `cancel(id)` function. This is a cleaner API than the `timers` Map pattern.
- **`after()` not `schedule()`** -- reads naturally: `scheduler.after(5000, () => { ... })`.
- **`delayMs <= 0` is a no-op** -- returns a handle whose `cancel()` is also a no-op. This supports `durationMs: 0` (sticky toasts that never auto-dismiss) without special-casing at call sites.
- **No `setTimeout` type leaks.** The `ReturnType<typeof setTimeout>` type stays internal to the scheduler. Callers never see timer handles.
- **`cancelAll()` for bulk cleanup** -- used by `resetToastState()` and by `onScopeDispose` in the composable form.

**Implementation:**

```typescript
import { onScopeDispose, getCurrentScope } from 'vue';

/** Opaque handle returned by scheduler.after(). */
export interface SchedulerHandle {
  cancel(): void;
}

/** Structured timer lifecycle. */
export interface Scheduler {
  after(delayMs: number, callback: () => void): SchedulerHandle;
  cancelAll(): void;
}

const NOOP_HANDLE: SchedulerHandle = { cancel() {} };

/**
 * Creates a standalone scheduler instance. No Vue lifecycle coupling.
 * Use for module-level singletons (e.g., useToast auto-dismiss).
 */
export function createScheduler(): Scheduler {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  return {
    after(delayMs, callback) {
      if (delayMs <= 0) return NOOP_HANDLE;

      let timer: ReturnType<typeof setTimeout> | null = null;
      timer = setTimeout(() => {
        if (timer !== null) timers.delete(timer);
        callback();
      }, delayMs);
      timers.add(timer);

      return {
        cancel() {
          if (timer !== null) {
            clearTimeout(timer);
            timers.delete(timer);
            timer = null;
          }
        },
      };
    },

    cancelAll() {
      timers.forEach(clearTimeout);
      timers.clear();
    },
  };
}

/**
 * Vue composable: creates a scheduler with automatic cancelAll() on scope dispose.
 * Use inside component setup() or composable functions.
 */
export function useScheduler(): Scheduler {
  const scheduler = createScheduler();
  if (getCurrentScope()) {
    onScopeDispose(() => scheduler.cancelAll());
  }
  return scheduler;
}
```

**Integration with useToast:**

The useToast module needs the scheduler to manage timer handles keyed by toast ID (so that `updateToast` can cancel-and-reschedule for a specific toast). With opaque handles, this means useToast maintains its own `Map<number, SchedulerHandle>` mapping toast IDs to handles:

```typescript
// In useToast.ts (module level):
const scheduler = createScheduler();
const dismissHandles = new Map<number, SchedulerHandle>();

function scheduleAutoDismiss(id: number, durationMs: number): void {
  // Cancel existing timer for this toast
  dismissHandles.get(id)?.cancel();
  dismissHandles.delete(id);

  if (durationMs <= 0) return; // handled by scheduler too, but explicit for clarity

  const handle = scheduler.after(durationMs, () => {
    dismissHandles.delete(id);
    removeToast(id);
  });
  dismissHandles.set(id, handle);
}

function removeToast(id: number): void {
  dismissHandles.get(id)?.cancel();
  dismissHandles.delete(id);
  durations.delete(id);
  toasts.value = toasts.value.filter((t) => t.id !== id);
}

// In resetToastState():
scheduler.cancelAll();
dismissHandles.clear();
```

**Future migration targets (out of scope for this PR but enabled by useScheduler):**
- `SessionCard.vue` glow animation (line 135): `const scheduler = useScheduler(); scheduler.after(700, () => { justCompleted.value = false; });` -- auto-cancelled on component unmount.
- `SidebarPanel.vue` upload status (lines 222-236): replace manual timer + `onUnmounted` cleanup.
- `usePipelineStatus.ts` reconnect backoff (lines 75, 138): replace manual timer management.

### ToastCategory Enum

```typescript
/** Predefined toast categories for aggregation. Category is the sole aggregation key. */
export const ToastCategory = {
  UPLOAD_SUCCESS: 'upload-success',
  UPLOAD_FAILED: 'upload-failed',
  SESSION_READY: 'session-ready',
  PROCESSING_FAILED: 'processing-failed',
} as const;

export type ToastCategory = typeof ToastCategory[keyof typeof ToastCategory];
```

A `const` object with derived type (not a TypeScript `enum`). This is idiomatic modern TypeScript, tree-shakeable, and avoids runtime enum quirks.

**Category is the sole aggregation key.** No composite with `type`. The enum values already encode semantic intent including success/failure distinction (`upload-success` vs `upload-failed`), so combining with `type` is redundant.

**Why not composite `category + type`:** All current categories already distinguish success/failure. If a future category is type-agnostic, we add two entries rather than complicate the keying logic. YAGNI.

### Aggregation Key Migration (title to category)

The original design used `title + '\0' + type` as the aggregation key. This is replaced by `category` alone:

- **`title` is now purely a display field.** It no longer participates in keying. This means `title` is safe to mutate via `updateToast` -- add it back to the accepted fields.
- **`category` is the opt-in gate.** Toasts without `category` bypass aggregation entirely (backward compat for LandingPage).
- **`activeKeys` map key** changes from `${title}\0${type}` to the `category` string directly. No separator, no collision risk.
- **`updateToast` accepted fields** expand from `Partial<Pick<Toast, 'message' | 'icon'>>` to `Partial<Pick<Toast, 'message' | 'title' | 'icon'>>`.

### Extended fireToast Options

```typescript
export interface AddToastOptions {
  title?: string;
  durationMs?: number;
  icon?: string;
  /** Predefined category for aggregation. When set, this toast participates in aggregation. */
  category?: ToastCategory;
  /** Domain-neutral label for this item (e.g., filename). Collected into itemLabels array. */
  itemLabel?: string;
  /** Plural noun for built-in summary, e.g. "sessions uploaded" -> "5 sessions uploaded". */
  summaryNoun?: string;
  /** When true, appends truncated item labels to the summary: "3 failed: a.cast, b.cast and 1 more". */
  showItemLabels?: boolean;
  /**
   * Full override for summary formatting. When provided, summaryNoun and showItemLabels are ignored.
   * Called only when count > 1. First caller's template is used for the key's lifetime.
   */
  summaryTemplate?: (count: number, itemLabels: string[], messages: string[]) => string;
}
```

### Aggregation Lifecycle (No Additional Timers)

1. **First toast of a kind:** `fireToast(msg, type, opts)` with a `category`. No matching key in `activeKeys`. Toast created normally, ID stored in `activeKeys` with count=1. Returns ID.
2. **Subsequent toast of same kind:** Key found in `activeKeys`. Count incremented, `itemLabel`/message appended. `updateToast(existingId, { message: summaryMsg })` updates the visible toast in place. Auto-dismiss timer resets. Returns existing ID.
3. **Toast dismissed (auto or manual):** `watch(toasts, ..., { flush: 'post' })` detects the ID is gone from the array. Key removed from `activeKeys`. Next toast of that kind starts fresh at step 1.

The auto-dismiss timer reset on step 2 is handled by `updateToast`. This is desirable: if new items keep arriving, the toast stays visible longer.

### Watch Specification

The `watch` on `toasts` requires specific options:

- **`flush: 'post'`**: Callback runs after DOM updates, seeing the settled state.
- **Shallow watch** (default for `watch(ref)`): Reacts to array reference changes (from `removeToast`'s filter or `fireToast`'s push/reassignment). Does NOT fire on property mutations from `updateToast`. This is correct -- the watch only needs to detect dismissals.
- **`effectScope()`**: The watch is registered inside a lazily-created `effectScope` to avoid Vue warnings about `watch` outside component setup context. Created on first `useToast()` call. Disposed by `resetToastState()`.

Note: `updateToast` mutates properties of an existing toast object inside the array. Since `toasts` is `ref<Toast[]>` and the array reference does not change on property mutation, the shallow watch does NOT fire when `updateToast` runs. This is exactly correct.

### Error Toast Merging and Diagnostic Detail

Error toasts with the same `category` but different failure reasons get merged. The original messages are passed to `summaryTemplate` via `messages[]`, so the caller can include diagnostic detail if desired.

## Consequences

- **Easier:** Stable, type-safe aggregation keys that survive title rewording. Title is safe to mutate via `updateToast`. Timer management is encapsulated with clean lifecycle (`after`/`cancel`/`cancelAll`). The `useScheduler` composable is reusable across the entire client codebase -- any component or composable that needs a delayed callback has a structured, lifecycle-aware option. Rapid-fire toasts from any source produce calm, live-updating summaries. Zero latency for single items. No animation flicker.
- **Harder:** `useToast` is more complex internally. Callers must import `ToastCategory` enum in addition to `useToast`. One additional file (`useScheduler.ts`). useToast maintains a `dismissHandles` Map to bridge between opaque scheduler handles and toast IDs.
- **Follow-ups:** `SessionCard.vue`, `SidebarPanel.vue`, and `usePipelineStatus.ts` all have raw `setTimeout` that can migrate to `useScheduler` in future PRs.

## Decision History

1. Broadened scope from upload-only to all toasts after reviewing call sites -- `SessionCard.vue` SSE toasts also fire in bursts.
2. Chose `title + type` as grouping key because title is already used semantically by rapid-fire callers, and titleless toasts naturally bypass aggregation.
3. Chose caller-provided `summaryTemplate` over auto-pluralization to avoid fragile string manipulation and give callers explicit control over summary wording.

### Peer Review Cycle 0 Incorporated

4. **Branch prefix:** Changed from `fix/` to `feat/`.
5. **`summaryTemplate` signature:** `(count, itemLabels, messages)` so the caller controls ALL formatting.
6. **Renamed `context.filename` to `itemLabel`** -- domain-neutral naming. Now a direct field on toast options (not nested in `context`).
7. **Accepted: error merging concern.** `messages[]` passed to template for optional diagnostic detail.
8. **Accepted: stage split** for integration stages (useUpload vs SessionCard).

### Reactive Rewrite

9. **Eliminated all `setTimeout` / raw timers from the aggregation design.** Aggregation is a state problem, not a timing problem.
10. **Adopted live reactive merge.** Aggregation window is the toast's own visible lifetime. First toast appears immediately. Subsequent toasts merge via in-place mutation (`updateToast`).

### Peer Review Cycle 1 Incorporated

11. **`fireToast` returns toast ID.** One-line backward-compatible change.
12. **Adopted `updateToast` for in-place mutation.** No DOM destruction/recreation, no animation flicker, stable toast ID.
13. **Watch flush: `{ flush: 'post' }`.** Settled state after DOM updates.
14. **Shallow watch documented.** No `{ deep: true }`. Only reacts to add/remove, not property mutations.
15. **`effectScope()` for watch lifecycle.** Lazily created, disposed by `resetToastState()`.

### Option B Selected

16. **User decision: Option B (transparent aggregation inside useToast).** The "don't touch useToast" constraint was already void -- we were adding `updateToast` and changing `fireToast`'s return type regardless. Given that, placing aggregation inside `useToast` is strictly simpler: one file, one entry point, zero migration. Option A's separate composable was unnecessary indirection.
17. **`summaryTemplate` and `itemLabel` moved to `fireToast` options.** No separate `context` object. These are optional fields on the existing options parameter. Only meaningful when aggregation is active.
18. **No `useToastAggregator` file.** Aggregation lives in `useToast.ts`. No separate composable, no separate test file.

### Category Enum + useScheduler (Post-Implementation Fixes)

19. **Replaced `title + type` aggregation key with predefined `ToastCategory` enum.** Category is the sole aggregation key -- no composite with `type`. The enum values encode semantic intent including success/failure distinction. `const` object + derived type (not TS `enum`). Title becomes purely a display field.
20. **`updateToast` accepted fields expanded to include `title`.** With category-based keying, mutating `title` no longer breaks the aggregation key. Fields: `Partial<Pick<Toast, 'message' | 'title' | 'icon'>>`.
21. **General-purpose `useScheduler` composable replaces raw `setTimeout`/`clearTimeout`.** New module `src/client/composables/useScheduler.ts` with `createScheduler()` (standalone) and `useScheduler()` (auto-cleanup via `onScopeDispose`). Opaque `SchedulerHandle` with `.cancel()` instead of numeric IDs. `after(delayMs, callback)` API. useToast uses `createScheduler()` at module level with a `Map<number, SchedulerHandle>` bridging toast IDs to handles. Wraps `setTimeout` internally -- vitest fake timers continue to work.
22. **SessionCard.vue `setTimeout` (glow animation) migrates to `useScheduler` as part of Stage 6b.** Component-level `useScheduler()` composable provides automatic cleanup on unmount.
23. **Other raw `setTimeout` sites (`SidebarPanel.vue`, `usePipelineStatus.ts`) are out of scope.** They can migrate in future PRs now that `useScheduler` exists.
