# Vision: Toast Aggregation for Batch Uploads

> Batch uploads should feel like one action, not N individual events.

## Core Intent

When a user drops 20 `.cast` files onto the upload zone, they performed one gesture. The system should acknowledge that gesture with one notification -- not 20. The goal is to preserve the calm, oriented feel of the UI during high-throughput operations while keeping the existing per-file toast behavior for single uploads untouched.

## Current State

- `useToast.ts` is a module-level singleton. Any composable calls `addToast()` and the toast appears globally.
- `useUpload.ts` calls `addToast()` inside `uploadFileWithOptimistic()` -- once per file, on success or failure.
- Batch uploads (multiple files selected or dropped) loop over files, calling `uploadFileWithOptimistic()` per file. Each call independently fires a toast.
- Result: uploading 10 files produces 10 toasts stacking up in rapid succession. The user sees a wall of near-identical messages.

**The gap:** There is no concept of "these toasts belong to the same user action." Each toast is independent and stateless relative to its siblings.

## Design Direction

- **Calm, not noisy.** A batch result should read like a summary, not a log stream.
- **Honest.** If 8 succeeded and 2 failed, show both counts. Do not hide failures behind a success summary.
- **Familiar.** The aggregated toast should look and feel like a normal toast -- same styling, same position, same auto-dismiss. No new UI paradigm.
- **Transparent.** Single-file uploads remain exactly as they are today. The user should not notice any change unless they upload multiple files.

## Key Interactions

### 1. Batch Upload -- All Succeed

The user drops 12 files. Uploads complete over a few hundred milliseconds. Instead of 12 individual "Session uploaded" toasts, a single toast appears: "12 sessions uploaded" with the upload icon and success styling. It feels like one acknowledgment for one action.

### 2. Batch Upload -- Mixed Results

The user drops 8 files. 6 succeed, 2 fail. Two aggregated toasts appear: "6 sessions uploaded" (success) and "2 uploads failed" (error). The error toast persists longer (existing error duration). The user sees a clear summary without scrolling through individual messages.

### 3. Single File Upload -- Unchanged

The user uploads one file. They see exactly the same toast as today: "filename.cast has been uploaded" with the file name visible. No aggregation kicks in.

### 4. Staggered Uploads -- Separate Batches

The user uploads 5 files. A minute later, they upload 3 more. Each batch gets its own aggregated toast. The time gap between batches means they are treated as separate actions.

## Opportunities

1. **Aggregation as a reusable pattern.** While scoped to uploads now, the aggregation layer's design (a time-windowed collector that intercepts toast calls from a specific domain) could later serve pipeline status toasts or bulk session operations (delete, archive) without rearchitecting. Keep the interface narrow but the concept portable.

2. **Mixed-result summary in a single toast.** Rather than two separate toasts for success/failure, a single compound toast ("8 uploaded, 2 failed") could be even calmer. This is a stretch goal -- two separate toasts is the safe, clear default.

## Constraints

- Frontend only -- changes scoped to `src/client/`.
- The `useToast` API contract (`addToast(message, type, options)`) must not change. Existing callers outside upload must continue working identically.
- The aggregation layer sits between `useUpload` and `useToast` -- it is a separate composable or utility, not woven into the toast system internals.
- Existing design tokens and toast component styling are reused. No new visual components needed.
- The time window for aggregation should be tunable but sensible (a few hundred milliseconds is the right ballpark for rapid-fire upload completions).

## Out of Scope

- Changes to `useToast.ts` internals or its public API.
- Backend changes.
- Pipeline status toasts (SSE-driven) -- those can use this pattern later but are not part of this cycle.
- Toast stacking/queue limits or dismissal UX changes.
- Progress indicators during upload (separate concern).

## Success Criteria

- Uploading N files in a batch produces at most 2 toasts (one success summary, one error summary) instead of N individual toasts.
- Uploading 1 file produces the same individual toast as before, including the filename in the message.
- The aggregation logic lives in its own composable/utility file, not embedded in `useToast.ts` or `useUpload.ts`.
- Existing tests for toast and upload behavior continue to pass without modification.

---
**Sign-off:** Pending
