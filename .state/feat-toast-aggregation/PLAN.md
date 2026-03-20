# Plan: Toast Aggregation

References: ADR.md

## Git Contract

- Branch: `feat/client-toast-aggregation`
- Commit scope: `client`
- Allowed paths: `src/client/**`

## Open Questions

None.

## Stages

### Stage 1: useToast aggregation enhancement (TDD)

Goal: Add `updateToast`, `fireToast` return value, and aggregation logic to `useToast`. Full test coverage.

Owner: frontend-engineer

- [x] Write tests for new `useToast` capabilities:
  - **fireToast return value:**
    - `fireToast` returns the toast ID (number)
  - **updateToast:**
    - `updateToast` changes message of existing toast
    - `updateToast` changes icon of existing toast
    - `updateToast` returns false for non-existent ID (no-op)
    - `updateToast` returns true for existing ID
    - `updateToast` resets auto-dismiss timer
  - **Aggregation (titled toasts):**
    - First titled toast: created normally, returns ID
    - Second toast with same `title + type`: existing toast updated in place, count=2, returns same ID
    - Third toast with same key: updated to count=3, same ID throughout
    - `summaryTemplate` receives `(count, itemLabels, messages)` and its return value is used as updated message
    - Default summary when no `summaryTemplate`: "{N} notifications"
    - Same title but different type: separate keys, not merged
    - Same type but different titles: separate keys, not merged
    - Icon and title from original toast preserved on update
    - `itemLabel` values collected and passed to `summaryTemplate`
    - Original messages collected and passed to `summaryTemplate`
  - **Aggregation cleanup:**
    - Toast dismissed (removed from array): `activeKeys` cleaned up; next toast of same kind starts fresh
    - User dismisses mid-burst: next toast of same kind creates new single toast, not a continuation
    - `updateToast` returning false (toast dismissed between calls): `fireToast` handles gracefully by creating fresh toast
    - `resetToastState()` clears `activeKeys` map and disposes `effectScope`
  - **Non-aggregation (titleless toasts):**
    - Toast without title: created normally, no aggregation state tracked
    - Multiple titleless toasts: each creates a separate toast (existing behavior preserved)
  - **Existing tests continue to pass unchanged**
- [x] Implement changes to `useToast`
- [x] All tests pass (new + existing)

Files: `src/client/composables/useToast.ts`, `src/client/composables/useToast.test.ts`, `src/client/composables/useToast.aggregation.test.ts`
Depends on: none

### Stage 2a: Add summaryTemplate + itemLabel to useUpload

Goal: Add aggregation context to `useUpload`'s toast calls. No import changes needed -- still calls `fireToast` from `useToast`.

Owner: frontend-engineer

- [x] In `useUpload.ts`: add `summaryNoun`, `showItemLabels`, and `itemLabel` to the three `fireToast(...)` options
- [x] Verify existing `useUpload.test.ts` tests pass unchanged
- [x] Add test: simulate rapid-fire upload completions, verify single toast with aggregated message
- [ ] Manual verification: single upload shows original filename toast, batch upload shows live-updating summary

Files: `src/client/composables/useUpload.ts`, `src/client/composables/useUpload.test.ts`
Depends on: Stage 1

### Stage 2b: Add summaryTemplate + itemLabel to SessionCard

Goal: Add aggregation context to `SessionCard`'s SSE-driven toast calls.

Owner: frontend-engineer

- [x] In `SessionCard.vue`: add `summaryNoun`, `showItemLabels`, and `itemLabel` to the two `fireToast(...)` options
- [x] Add test: simulate rapid SSE completion events, verify single toast with aggregated message
- [ ] Manual verification: single session completion shows original toast, burst of completions shows live-updating summary

Files: `src/client/components/SessionCard.vue`, `src/client/components/SessionCard.toast.test.ts`
Depends on: Stage 1

### Stage 3: useScheduler composable (TDD)

Goal: Create a general-purpose `useScheduler` composable that encapsulates `setTimeout` behind a structured lifecycle API. Fully tested in isolation before integrating into useToast.

Owner: frontend-engineer

- [x] Write tests for `useScheduler` in `src/client/composables/useScheduler.test.ts`:

  **Test setup:** All tests use `vi.useFakeTimers()` in `beforeEach` and `vi.useRealTimers()` in `afterEach`.

  - **`createScheduler` -- `after()` basics:**
    - `after(5000, cb)` fires callback after 5000ms (`vi.advanceTimersByTime(5000)`)
    - `after(5000, cb)` does NOT fire callback before 5000ms (`vi.advanceTimersByTime(4999)`, assert cb not called)
    - `after(0, cb)` returns a handle but callback never fires (advance timers by any amount, assert cb not called)
    - `after(-1, cb)` returns a handle but callback never fires
    - Multiple `after()` calls schedule independent timers -- each fires at its own delay
    - Callback receives no arguments (void signature)

  - **`createScheduler` -- `handle.cancel()`:**
    - Calling `handle.cancel()` prevents the callback from firing
    - Calling `handle.cancel()` twice is a no-op (no throw)
    - Calling `handle.cancel()` after the callback has already fired is a no-op (no throw)
    - Cancelling one handle does not affect other scheduled callbacks

  - **`createScheduler` -- `cancelAll()`:**
    - `cancelAll()` prevents all pending callbacks from firing
    - `cancelAll()` when no timers are pending is a no-op (no throw)
    - After `cancelAll()`, new `after()` calls still work (scheduler is reusable)
    - `cancelAll()` does not affect callbacks that have already fired

  - **`useScheduler` -- Vue lifecycle integration:**
    - `useScheduler()` inside an `effectScope` calls `cancelAll()` when the scope is disposed
    - `useScheduler()` outside any scope still works (no throw), just no auto-cleanup
    - Verify: create scheduler in scope, schedule a callback, dispose scope, advance timers -- callback does NOT fire

  - **`NOOP_HANDLE`:**
    - The handle returned by `after(0, cb)` has a `.cancel()` that is a no-op (no throw)

- [x] Implement `src/client/composables/useScheduler.ts`:

  Exact type definitions and implementation:

  ```typescript
  import { onScopeDispose, getCurrentScope } from 'vue';

  /** Opaque handle returned by scheduler.after(). */
  export interface SchedulerHandle {
    /** Cancel this scheduled callback. No-op if already fired or cancelled. */
    cancel(): void;
  }

  /** Structured timer lifecycle: schedule delayed callbacks, cancel individually or all at once. */
  export interface Scheduler {
    /**
     * Schedule a callback to run after delayMs milliseconds.
     * Returns a cancellable handle.
     * When delayMs <= 0, callback never fires (returns a no-op handle).
     */
    after(delayMs: number, callback: () => void): SchedulerHandle;
    /** Cancel all pending scheduled callbacks. Scheduler remains reusable after this call. */
    cancelAll(): void;
  }

  /** Shared no-op handle for delayMs <= 0 — avoids allocation per call. */
  const NOOP_HANDLE: SchedulerHandle = Object.freeze({ cancel() {} });

  /**
   * Creates a standalone scheduler instance with no Vue lifecycle coupling.
   * Use for module-level singletons (e.g., useToast auto-dismiss timer management).
   */
  export function createScheduler(): Scheduler {
    const timers = new Set<ReturnType<typeof setTimeout>>();

    return {
      after(delayMs, callback) {
        if (delayMs <= 0) return NOOP_HANDLE;

        let timer: ReturnType<typeof setTimeout> | null = null;
        timer = setTimeout(() => {
          if (timer !== null) timers.delete(timer);
          timer = null;
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
   * Use inside component setup() or composable functions for lifecycle-safe timer management.
   *
   * When called outside a Vue scope (e.g., in a plain function), behaves identically
   * to createScheduler() — no auto-cleanup, no error.
   */
  export function useScheduler(): Scheduler {
    const scheduler = createScheduler();
    if (getCurrentScope()) {
      onScopeDispose(() => scheduler.cancelAll());
    }
    return scheduler;
  }
  ```

- [x] All useScheduler tests pass

Files: `src/client/composables/useScheduler.ts`, `src/client/composables/useScheduler.test.ts`
Depends on: none (can run in parallel with Stages 2a/2b)

Considerations:
- Uses `vi.useFakeTimers()` and `vi.advanceTimersByTime()` -- same pattern as existing useToast tests.
- The `timer = null` assignment inside the setTimeout callback is important: it prevents the cancel closure from double-clearing after the callback has already fired.
- `NOOP_HANDLE` is `Object.freeze`d to catch accidental mutations. The `cancel` method is intentionally a no-op.
- `timers` is a `Set` (not a `Map`) because handles are opaque -- no external ID needed. The Set tracks live timer handles for `cancelAll()`.
- For the Vue lifecycle test, use `effectScope()` from Vue to simulate component scope creation and disposal:
  ```typescript
  import { effectScope } from 'vue';
  const scope = effectScope();
  let scheduler: Scheduler;
  scope.run(() => { scheduler = useScheduler(); });
  const cb = vi.fn();
  scheduler!.after(1000, cb);
  scope.stop(); // triggers onScopeDispose -> cancelAll
  vi.advanceTimersByTime(2000);
  expect(cb).not.toHaveBeenCalled();
  ```
- `cancelAll()` uses `timers.forEach(clearTimeout)` which passes `(value, value, set)` to `clearTimeout`. `clearTimeout` ignores extra args, so this is safe.
- The handle's `cancel()` sets `timer = null` to prevent double-clear. After cancel, the closure holds a null reference -- GC-friendly.

### Stage 4: Integrate useScheduler into useToast

Goal: Replace all raw `setTimeout`/`clearTimeout` in `useToast.ts` with the `useScheduler`'s `createScheduler`. Zero behavior change -- all existing tests must pass unchanged.

Owner: frontend-engineer

- [x] Modify `useToast.ts` -- exact changes:

  1. **Add import:**
     ```typescript
     import { createScheduler } from './useScheduler.js';
     import type { SchedulerHandle } from './useScheduler.js';
     ```

  2. **Replace `timers` map** (current line 62):
     Delete:
     ```typescript
     const timers = new Map<number, ReturnType<typeof setTimeout>>();
     ```
     Add:
     ```typescript
     const scheduler = createScheduler();
     const dismissHandles = new Map<number, SchedulerHandle>();
     ```

  3. **Replace `scheduleAutoDismiss` function** (current lines 88-95):
     Replace entire function body with:
     ```typescript
     function scheduleAutoDismiss(id: number, durationMs: number): void {
       dismissHandles.get(id)?.cancel();
       dismissHandles.delete(id);

       if (durationMs <= 0) return;

       const handle = scheduler.after(durationMs, () => {
         dismissHandles.delete(id);
         removeToast(id);
       });
       dismissHandles.set(id, handle);
     }
     ```
     Note: `scheduler.after()` handles `durationMs <= 0` internally, but the explicit guard avoids creating a map entry for sticky toasts.

  4. **Replace timer cancel in `removeToast`** (current lines 78-83):
     Replace the `clearTimeout`/`timers.delete` block:
     ```typescript
     function removeToast(id: number): void {
       dismissHandles.get(id)?.cancel();
       dismissHandles.delete(id);
       durations.delete(id);
       toasts.value = toasts.value.filter((t) => t.id !== id);
     }
     ```

  5. **Replace timer cleanup in `resetToastState`** (current lines 125-126):
     Replace `timers.forEach(clearTimeout); timers.clear();` with:
     ```typescript
     scheduler.cancelAll();
     dismissHandles.clear();
     ```

- [x] Verify: **zero `setTimeout`, `clearTimeout`, or `ReturnType<typeof setTimeout>` references remain in `useToast.ts`**. Grep the file to confirm.
- [x] All existing tests pass unchanged:
  - `useToast.test.ts`: all auto-dismiss tests, manual dismiss tests, `resetToastState` tests
  - `useToast.aggregation.test.ts`: all aggregation tests including cleanup/dismiss tests
  - `useUpload.test.ts`: unchanged
- [x] The `durations` map stays in `useToast.ts` -- it is NOT moved into the scheduler. It persists the original duration per toast so `updateToast` can look up the correct reset duration.

Files: `src/client/composables/useToast.ts`
Depends on: Stage 3

Considerations:
- This stage is a pure refactor -- no behavior change. If any test fails, the integration is wrong.
- `dismissHandles` is a `Map<number, SchedulerHandle>` bridging toast IDs to opaque scheduler handles. This is the toast-specific layer; the scheduler itself knows nothing about toast IDs.
- `scheduleAutoDismiss` calls `dismissHandles.get(id)?.cancel()` before scheduling a new one. This is equivalent to the old "cancel existing timer for the same id" pattern.
- The `dismissHandles.delete(id)` inside the `scheduler.after` callback is important: it cleans up the map entry when the timer fires naturally, so `removeToast` doesn't try to cancel an already-fired timer (which would be a no-op but leaves a stale map entry).
- `scheduler.cancelAll()` in `resetToastState` cancels all pending timers. `dismissHandles.clear()` removes the stale map entries. Both are needed.

### Stage 5: ToastCategory enum + category-based aggregation key (TDD)

Goal: Replace `title + type` aggregation key with predefined `ToastCategory` enum. Title becomes purely a display field. `updateToast` gets `title` back in accepted fields.

Owner: frontend-engineer

- [x] Define `ToastCategory` in `src/client/composables/useToast.ts` (exported, at top of file before interfaces):

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

- [x] Add `category` field to `AddToastOptions`:

  ```typescript
  export interface AddToastOptions {
    title?: string;
    durationMs?: number;
    icon?: string;
    /** Predefined category for aggregation. When set, this toast participates in aggregation. */
    category?: ToastCategory;
    itemLabel?: string;
    summaryNoun?: string;
    showItemLabels?: boolean;
    summaryTemplate?: (count: number, itemLabels: string[], messages: string[]) => string;
  }
  ```

- [x] Change `updateToast` accepted fields from `Partial<Pick<Toast, 'message' | 'icon'>>` to `Partial<Pick<Toast, 'message' | 'title' | 'icon'>>`. Add the title mutation line:
  ```typescript
  if (fields.title !== undefined) toast.title = fields.title;
  ```

- [x] Remove the old `updateToast` JSDoc line "Title is intentionally excluded" and update to reflect new behavior.

- [x] Change aggregation key logic in `fireToast` / `addTitledToast`:
  - **Old gate:** `if (!title)` -- bypass aggregation when no title
  - **New gate:** `if (!opts.category)` -- bypass aggregation when no category
  - **Old key computation:** `const key = \`${title}\0${type}\`;`
  - **New key computation:** `const key = opts.category;` (the category string IS the key, no computation needed)
  - Rename `addTitledToast` to `addCategorizedToast` (or similar) to reflect new semantics

- [x] Write/update tests in `useToast.aggregation.test.ts`:
  - **New test: "category-based aggregation"**
    - First toast with `category: ToastCategory.UPLOAD_SUCCESS` created normally
    - Second toast with same category merges into first (regardless of title)
    - Two toasts with different categories are NOT merged
    - Toast with category but no title still participates in aggregation (category is the gate, not title)
    - Toast without category bypasses aggregation (backward compat)
  - **New test: "title is purely display"**
    - Two toasts with same category but different titles: MERGED (title is not part of key)
    - Toast title preserved on aggregation update (original title stays)
  - **New test: "updateToast can change title"**
    - `updateToast(id, { title: 'New Title' })` changes the title
    - Title change does NOT break aggregation (category is the key)
  - **Update existing aggregation tests:**
    - All tests that use `{ title: 'Session uploaded' }` to trigger aggregation must add `category: ToastCategory.UPLOAD_SUCCESS` (or appropriate category)
    - Tests that rely on `title` as the aggregation gate must be updated to use `category` as the gate
    - Tests for "same title but different type: separate keys" should become "different category: separate" tests
    - The "titleless toasts bypass aggregation" tests remain valid but the gate is now "no category" not "no title"
  - **Add test in `useToast.test.ts` (updateToast section):**
    - `updateToast` changes title of existing toast (was removed when title was excluded from accepted fields; add it back)

- [x] Update `useToast.test.ts` -- the `resetToastState` test "clears the activeKeys aggregation map" (line 184): add `category` to the fireToast options since title alone no longer triggers aggregation

- [x] All tests pass (new + updated + existing non-aggregation tests)

Files: `src/client/composables/useToast.ts`, `src/client/composables/useToast.test.ts`, `src/client/composables/useToast.aggregation.test.ts`
Depends on: Stage 4

Considerations:
- The `ToastCategory` const object and type are exported from `useToast.ts` so callers can import them alongside `useToast`. This avoids creating a separate types file for four values.
- When updating existing aggregation tests: every `fireToast('msg', 'success', { title: 'X' })` call that expects aggregation must become `fireToast('msg', 'success', { title: 'X', category: ToastCategory.UPLOAD_SUCCESS })` (or whichever category fits the test).
- Tests that intentionally test "no aggregation" (titleless toasts in LandingPage style) should NOT add `category` -- they test the bypass path.
- The `AggregationState` interface does NOT change -- it still tracks `toastId`, `count`, `itemLabels`, `messages`, `summaryNoun`, `showItemLabels`, `summaryTemplate`.
- Edge case: `fireToast('msg', 'success', { category: ToastCategory.UPLOAD_SUCCESS })` with NO title. This is valid -- the toast aggregates by category but has no title displayed. The aggregation gate is `category`, not `title`.

### Stage 6a: Migrate useUpload to ToastCategory

Goal: Add `category` field to `useUpload`'s `fireToast` calls using the `ToastCategory` enum.

Owner: frontend-engineer

- [x] In `useUpload.ts`:
  - Add `ToastCategory` to existing import: `import { useToast, ToastCategory } from './useToast.js';`
    (Note: currently imports destructured `{ fireToast }` from `useToast()` call, not directly. The `ToastCategory` import is from the module, not the composable return. So the import line becomes:)
    ```typescript
    import { useToast, ToastCategory } from './useToast.js';
    ```
  - Success toast (line ~121-126): add `category: ToastCategory.UPLOAD_SUCCESS`
  - Error toast, bad response (line ~110-116): add `category: ToastCategory.UPLOAD_FAILED`
  - Error toast, catch (line ~131-137): add `category: ToastCategory.UPLOAD_FAILED`

  Exact updated calls:

  ```typescript
  // Success (line ~121):
  fireToast(`${file.name} has been uploaded`, 'success', {
    title: 'Session uploaded',
    icon: 'icon-upload',
    category: ToastCategory.UPLOAD_SUCCESS,
    itemLabel: file.name,
    summaryNoun: 'sessions uploaded',
  });

  // Error bad response (line ~110):
  fireToast(error.value ?? 'Upload failed', 'error', {
    title: 'Upload failed',
    icon: 'icon-error-circle',
    category: ToastCategory.UPLOAD_FAILED,
    itemLabel: file.name,
    summaryNoun: 'uploads failed',
    showItemLabels: true,
  });

  // Error catch (line ~131):
  fireToast(error.value ?? 'Upload failed', 'error', {
    title: 'Upload failed',
    icon: 'icon-error-circle',
    category: ToastCategory.UPLOAD_FAILED,
    itemLabel: file.name,
    summaryNoun: 'uploads failed',
    showItemLabels: true,
  });
  ```

- [x] Verify `useUpload.test.ts` tests pass unchanged (the `fireToast` mock captures args -- new `category` field is just an additional property in the options object)
- [x] No changes needed to `useUpload.test.ts` unless mocks assert exact option shapes

Files: `src/client/composables/useUpload.ts`
Depends on: Stage 5

### Stage 6b: Migrate SessionCard to ToastCategory + useScheduler

Goal: Add `category` field to `SessionCard`'s `fireToast` calls and replace the raw `setTimeout` for glow animation with `useScheduler`.

Owner: frontend-engineer

- [x] In `SessionCard.vue`:
  - Add `ToastCategory` to the existing useToast import:
    ```typescript
    import { useToast, ToastCategory } from '../composables/useToast.js';
    ```
  - Add `useScheduler` import:
    ```typescript
    import { useScheduler } from '../composables/useScheduler.js';
    ```
  - Add scheduler instance in setup (after the existing `useToast()` call):
    ```typescript
    const scheduler = useScheduler();
    ```
  - Session ready toast (line ~129-134): add `category: ToastCategory.SESSION_READY`
  - Processing failed toast (line ~140-146): add `category: ToastCategory.PROCESSING_FAILED`
  - Replace glow animation setTimeout (line 135):
    - **Old:** `setTimeout(() => { justCompleted.value = false; }, 700);`
    - **New:** `scheduler.after(700, () => { justCompleted.value = false; });`
    - The `useScheduler()` composable auto-cancels on component unmount via `onScopeDispose`, so no manual cleanup needed. The existing code had no cleanup -- this is strictly better.

  Exact updated watch block (lines ~126-148):

  ```typescript
  if (next === 'completed' && !hasNotifiedTerminal.value) {
    hasNotifiedTerminal.value = true;
    justCompleted.value = true;
    fireToast(`${props.session.filename} is ready`, 'success', {
      title: 'Session ready',
      icon: 'icon-file-check',
      category: ToastCategory.SESSION_READY,
      itemLabel: props.session.filename,
      summaryNoun: 'sessions ready',
    });
    scheduler.after(700, () => { justCompleted.value = false; });
    sessionList?.refreshOnSessionComplete();
  } else if ((next === 'failed' || next === 'interrupted') && !hasNotifiedTerminal.value) {
    hasNotifiedTerminal.value = true;
    fireToast(`${props.session.filename} processing failed`, 'error', {
      title: 'Processing failed',
      icon: 'icon-error-circle',
      category: ToastCategory.PROCESSING_FAILED,
      itemLabel: props.session.filename,
      summaryNoun: 'sessions failed',
      showItemLabels: true,
    });
    sessionList?.refreshOnSessionComplete();
  }
  ```

- [x] Verify `SessionCard.toast.test.ts` tests pass (if they exist and assert toast options)
- [x] Verify: no raw `setTimeout` remains in `SessionCard.vue` after this change
- [x] No changes needed to test files unless mocks assert exact option shapes

Files: `src/client/components/SessionCard.vue`
Depends on: Stage 5 (ToastCategory must be defined), Stage 3 (useScheduler must exist)

Considerations:
- The `useScheduler()` composable is called inside the component's `setup()` function, so `onScopeDispose` automatically registers cleanup. If the component unmounts before the 700ms glow timer fires, the timer is cancelled. The old code had a fire-and-forget `setTimeout` with no cleanup -- this is a strict improvement.
- If the glow animation fires multiple times rapidly (unlikely but possible), each `scheduler.after()` call creates an independent handle. They don't cancel each other. This matches the old behavior where each `setTimeout` was independent.

## Dependencies

- Stages 2a and 2b depend on Stage 1 (aggregation logic must exist in `useToast`).
- Stage 2a and 2b are independent of each other (no file overlap) and can run in parallel.
- Stage 3 has NO dependencies -- can run in parallel with Stages 2a/2b.
- Stage 4 depends on Stage 3 (useScheduler must exist).
- Stage 5 depends on Stage 4 (all timer refactoring complete before changing aggregation keys).
- Stages 6a and 6b depend on Stage 5 (ToastCategory must be defined and aggregation key logic updated).
- Stage 6b also depends on Stage 3 (useScheduler must exist for glow timer migration).
- Stages 6a and 6b are independent of each other (no file overlap) and can run in parallel.

## Progress

Updated by engineers as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | complete | |
| 2a | complete | |
| 2b | pending | |
| 3 | complete | |
| 4 | complete | |
| 5 | complete | |
| 6a | complete | |
| 6b | complete | |
