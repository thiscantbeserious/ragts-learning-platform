# ADR + PLAN: Scrollback Deduplication for TUI Sessions

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Proposed

---

## Context

### The Problem

TUI applications (Claude Code, Gemini CLI, Codex) perform clear-screen + redraw cycles on the **primary** screen buffer. Each redraw re-renders previous conversation content, which the VT engine pushes into scrollback. When the pipeline calls `getAllLines()` at the end of replay, the scrollback contains massive duplication.

Measured on a real Claude Code session (`lennart-working-session-result-1.cast`):
- Total scrollback lines from `getAllLines()`: 58,995
- Unique non-empty lines: 3,687
- **Duplication ratio: 90.6%**
- 108 clear-screen events (`\x1b[2J\x1b[H`)
- The Claude Code header appears 109 times

### Why This Happens

The current pipeline (in `src/server/processing/session-pipeline.ts`) already distinguishes CLI from TUI using alt-screen tracking (`\x1b[?1049h` / `\x1b[?1049l`). Sections during alt-screen mode get viewport snapshots via `getView()`. Sections outside alt-screen get line ranges via `getAllLines()`.

The gap: **TUI apps that operate on the primary buffer without entering alt-screen.** Claude Code is the prime example -- it uses `\x1b[2J\x1b[H` (clear screen + home cursor) to redraw, never entering alt-screen mode. The pipeline sees these as "CLI" sections and records line counts from a scrollback that contains 16x duplicated content.

The session-level snapshot (`session.snapshot`) stores the raw `getAllLines()` output. Since CLI sections reference line ranges into this document, every section after a redraw cycle starts with duplicated content from the previous section.

### What Users See

Section 3 (L118-L336) starts with: "I can see the issue. Let me also check the parent issue..."
Section 4 (L337-L1056) starts with: THE SAME TEXT -- the TUI redrew the screen between sections 3 and 4, pushing the previous content back into scrollback before writing new content.

### Forces

1. **Must use the existing VT WASM (avt)** -- the VT engine provides `getAllLines()` and `getView()` as the document source. No reinventing terminal parsing.
2. **Must work for ALL terminal applications** -- not hard-coded for Claude Code patterns. Any TUI that clears and redraws on the primary buffer.
3. **Must not regress CLI sessions** -- pure linear output (no screen clears) must continue working perfectly.
4. **Section line ranges must be correct** -- no overlapping or missing content after dedup.
5. **Performance matters** -- sessions have 30K+ events, 60K+ raw lines. The dedup must not add excessive overhead.
6. **The stored snapshot should be the clean document** -- the session-level snapshot in the DB should reflect deduplicated content.

---

## Options Considered

### Option 1: Clear-Screen Epoch Tracking (Screen-Clear-Aware Snapshots)

**Core idea**: Detect clear-screen events (`\x1b[2J`) during replay and reset the "document origin" at each clear. Instead of one continuous `getAllLines()` at the end, build the document from epochs -- each epoch starts after a clear-screen event and contains only the new content written after that clear.

**How it works**:
1. During replay, track clear-screen events (`\x1b[2J`, `\x1b[3J`).
2. When a clear-screen is detected, record the current `getAllLines().lines.length` as the epoch start offset.
3. At each section boundary, record both the current line count AND the current epoch start offset.
4. At end of replay, build the clean document by extracting only the content from each epoch (not the full cumulative scrollback).
5. Section line ranges are recomputed against the clean document.

**Variant A -- Post-hoc extraction**: Replay once, record epoch boundaries and section boundaries, then build the clean document by slicing `getAllLines()` at epoch boundaries and concatenating only the "new" content from each epoch.

**Variant B -- Multi-VT approach**: Create a fresh VT at each clear-screen, feed subsequent events into the fresh VT, and use its `getAllLines()` as the epoch content. Concatenate epoch outputs into the final clean document.

**Pros**:
- Directly addresses the root cause (clear-screen redraws push duplicate content).
- Works for any TUI that uses clear-screen, not just Claude Code.
- The clean document is built deterministically from observable terminal events.
- CLI sessions (no clear-screens) degrade to the current behavior -- zero epochs, full `getAllLines()` is the document.
- No line-by-line hashing or comparison needed.

**Cons**:
- Requires careful tracking of what "new content" means after a clear. A clear-screen resets the viewport, but scrollback from before the clear still exists in `getAllLines()`. The epoch extraction must correctly identify which lines are "new" vs "scrollback from before the clear."
- A clear-screen does not always mean a full redraw -- partial clears (`\x1b[J` erase-below) or cursor-addressed overwrites could confuse epoch boundaries.
- Variant B (Multi-VT) loses terminal state across epoch boundaries (colors, modes, cursor position). Content written after a clear assumes the state from before the clear.
- Does not handle duplication caused by mechanisms OTHER than clear-screen (e.g., cursor-addressed overwrites, scroll-region tricks).

### Option 2: Content-Hash Deduplication (Line-Level Fingerprinting)

**Core idea**: After replay, take the raw `getAllLines()` output and deduplicate it by comparing line content. Build a clean document containing only unique lines in their first-seen order, then remap section boundaries.

**How it works**:
1. Replay all events through a single VT (as today).
2. Call `getAllLines()` once at the end.
3. Iterate through lines, computing a fingerprint for each line (text content + styling hash).
4. Build a clean document by keeping only lines that are "new" relative to what we have seen. A line is considered new if it does not duplicate the most recently seen occurrence of the same content.
5. At each section boundary, record the position in the clean document (not the raw document).
6. Store the clean document as the session snapshot.

**Variant A -- Simple text hash**: Hash only the text content (ignore styling). Fast but could incorrectly merge lines that differ only in color.

**Variant B -- Full span hash**: Hash text + all styling attributes. Precise but more expensive.

**Variant C -- Sliding window match**: Instead of individual line hashes, compare blocks of N consecutive lines. A block that matches a previously-seen block is a duplicate redraw. This handles cases where individual lines are common (empty lines, prompt lines) but blocks are unique.

**Pros**:
- Works regardless of how duplication was introduced -- handles clear-screen, cursor-addressed overwrites, scroll-region tricks, and any other mechanism.
- No dependency on detecting specific escape sequences.
- The clean document is compact and semantically correct.
- Variant C (sliding window) is robust against false positives from common individual lines.

**Cons**:
- **Hashing 60K lines is not free** -- though at ~O(n) it is fast enough for a single-pass post-processing step.
- Risk of false positives: two genuinely different sections that happen to produce the same terminal output (e.g., repeated test runs) would be collapsed. Variant C mitigates this by requiring block-level matches.
- Risk of false negatives: lines that are semantically the same but differ by trailing whitespace, cursor position artifacts, or minor ANSI differences would not be detected as duplicates.
- Section boundary remapping is complex -- the original section line counts (from `getAllLines()` during replay) must be translated to positions in the deduplicated document. This requires a mapping from raw line indices to clean line indices.
- Does not leverage knowledge of terminal semantics -- treats the problem as pure text dedup.

### Option 3: Viewport-Accumulation Model (Build Document from Snapshots, Not Scrollback)

**Core idea**: Instead of using `getAllLines()` as the document source, build the session document by accumulating viewport snapshots captured at meaningful points during replay. The document is composed of viewport "frames" rather than the raw scrollback.

**How it works**:
1. During replay, track clear-screen events and section boundaries.
2. At each clear-screen event (or section boundary, whichever is more frequent), capture `getView()` -- the current viewport.
3. Compare the new viewport to the last captured viewport. If they differ significantly (not a minor cursor-position change), append the new viewport's content to the document.
4. The accumulated viewports form the clean document -- each viewport is a "page" in the document.
5. Section boundaries map to ranges of these accumulated pages.

**Variant A -- Capture at clear-screen events only**: Simple trigger, but misses content changes between clears.

**Variant B -- Capture at both clear-screen and section boundaries**: More complete but more snapshots.

**Variant C -- Periodic capture** (every N events): Most complete but generates many snapshots and requires diffing to avoid storing redundant frames.

**Pros**:
- Directly captures "what the user saw" at each point in time -- the viewport is the user's view, not the invisible scrollback.
- Naturally deduplicates because a viewport is a fixed-size window. There is no scrollback accumulation.
- Works well for TUI apps where the viewport IS the content.
- Simple to reason about: the document is a sequence of screens.

**Cons**:
- **Fundamentally breaks CLI sessions.** For pure CLI output (e.g., a long build log), the viewport shows only the last N rows. All scrolled-off content is lost. This would be a massive regression for CLI sessions.
- Requires a different document model than the current one (which is a single long scrollable document). The client would need to understand "pages" rather than a contiguous line range.
- viewport-to-viewport diffing is needed to avoid storing duplicate frames (a TUI that redraws without changing content would generate identical viewports).
- The accumulated document does not form a natural vertical scroll -- it is a sequence of screen-sized snapshots that may overlap or repeat header/chrome lines.

### Option 4: Hybrid -- Clear-Screen Epoch Tracking with Scrollback-Aware Extraction (Recommended)

**Core idea**: Combine the precision of epoch tracking (Option 1) with awareness of what `getAllLines()` actually contains after a clear-screen. The key insight is that when `\x1b[2J` clears the screen, **the VT engine pushes the cleared viewport lines into scrollback**. So after a clear, `getAllLines()` contains: [old scrollback] + [pushed viewport lines] + [new content]. The epoch boundary tells us exactly where the "new" epoch begins in the scrollback.

**How it works**:
1. During replay, maintain a **clear-screen counter** (epoch counter).
2. When `\x1b[2J` is detected in the event data:
   - Record the current `getAllLines().lines.length` as `epochStartRaw[epoch]`.
   - Increment the epoch counter.
3. At each section boundary, record both the epoch counter and the raw line count.
4. At end of replay, call `getAllLines()` once for the full raw document.
5. **Build the clean document**:
   - For epoch 0 (before any clear): take lines `[0, epochStartRaw[1])`.
   - For epoch N (after Nth clear): take lines `[epochStartRaw[N], epochStartRaw[N+1])` -- only the content written AFTER the clear, before the next clear.
   - For the final epoch: take lines `[epochStartRaw[last], end)`.
   - Concatenate these slices to form the clean document.
6. **Remap section boundaries**: Each section's line range in the raw document maps to a position in the clean document via the epoch-to-clean-offset mapping.
7. Store the clean document as the session snapshot.

**Why this works**: The VT engine's `getAllLines()` returns scrollback + viewport in order. A clear-screen pushes the current viewport into scrollback, then the new content occupies the viewport (and eventually scrollback as it grows). So `epochStartRaw[N]` marks the exact point in the scrollback where new content begins after the Nth clear. Everything between `epochStartRaw[N-1]` and `epochStartRaw[N]` is the content from epoch N-1 -- which includes both the original content AND the redraw of prior content. By taking only the last epoch's content (or the "new" slice of each epoch), we eliminate the redraw duplication.

**For CLI sessions**: Zero clear-screen events means zero epochs, and the clean document equals the raw `getAllLines()` output. No change in behavior.

**For TUI sessions without clear-screen (pure cursor-addressed redraws)**: This approach would not help. However, analysis of real TUI sessions shows that clear-screen is the dominant pattern for TUI apps operating on the primary buffer. Claude Code uses it 108 times in a single session. Gemini CLI and Codex also use clear-screen for major transitions. Cursor-addressed rewrites without clear-screen are edge cases that would need Option 2's hash-based approach as a future enhancement.

**Pros**:
- Directly addresses the root cause with terminal-semantic precision.
- O(n) -- single pass through events to record epoch boundaries, then one slice-and-concatenate pass to build the clean document.
- No hashing, no diffing, no false positives.
- CLI sessions are completely unaffected (zero epochs = identity transform).
- Works for any TUI that uses clear-screen, regardless of the specific application.
- The epoch boundary is a precisely defined point in the scrollback (the line count at the moment of clear-screen), not a heuristic.
- Section line ranges remap cleanly via the epoch-to-offset mapping.
- Can be combined with a hash-based verification pass (Option 2 variant) as a safety net without it being the primary mechanism.

**Cons**:
- Requires calling `getAllLines()` at each clear-screen event to record the epoch boundary. This is a performance concern -- `getAllLines()` on a large scrollback is not free. Mitigation: avt's `getAllLines()` returns a snapshot object; we only need `.lines.length`, not the full content. If the WASM API does not support a "line count only" call, we may need to optimize or accept the cost.
- Does not handle duplication from non-clear-screen mechanisms (cursor-addressed overwrites). Acceptable because clear-screen is the dominant TUI pattern on the primary buffer.
- The epoch extraction assumes that content after a clear-screen is genuinely new. If a TUI clears the screen and then redraws exactly the same content (e.g., a refresh without changes), that content would be included twice -- once from the pre-clear epoch and once from the post-clear epoch. This is a minor issue: the content IS the same, so including it twice is a small regression from the fully-deduplicated ideal, but far better than the current 16x duplication.

---

## Decision

**Option 4: Hybrid Clear-Screen Epoch Tracking with Scrollback-Aware Extraction.**

### Rationale

1. **Precision over heuristics.** Epoch tracking uses terminal-semantic events (clear-screen) as boundaries, not content hashing. This means zero false positives (genuine duplicate test output is preserved) and zero false negatives (every clear-screen redraw is caught).

2. **Zero regression for CLI sessions.** The transformation is an identity function when there are no clear-screen events. This is the strongest safety guarantee.

3. **Performance.** The approach adds O(epochs) calls to `getAllLines().lines.length` during replay, plus O(total_lines) for the final document assembly. For the reference session (108 epochs, 59K lines), this is well within budget.

4. **Simplicity.** The core algorithm is ~50 lines of logic: track epoch boundaries during replay, slice the raw document, concatenate. No hash tables, no sliding windows, no diffing.

5. **Composability.** If future TUI patterns emerge that bypass clear-screen (pure cursor-addressed redraws), Option 2's hash-based approach can be layered on top as a secondary dedup pass. The epoch-based approach reduces the input size for any subsequent dedup by 90%+, making the hash approach feasible even for very large sessions.

### Trade-offs Accepted

- TUI patterns that redraw without clear-screen are not addressed. Accepted because clear-screen is the dominant pattern in observed sessions.
- A "refresh without changes" (clear + identical redraw) would result in minor duplication. Accepted because this is rare and the impact is small.
- Additional `getAllLines()` calls during replay at each clear-screen event add overhead. Accepted because the call returns quickly when we only need the line count.

---

## Consequences

### What Becomes Easier
- Session documents for TUI sessions drop from ~59K lines to ~4K lines (based on reference session metrics).
- Section content no longer repeats previous sections' content.
- Storage footprint for TUI session snapshots decreases by ~90%.
- Client rendering performance improves (fewer lines to render).

### What Becomes Harder
- The pipeline gains a new intermediate step (epoch tracking + document assembly).
- Section line range computation becomes a two-phase process (raw ranges -> clean document ranges).
- Testing requires TUI-style test fixtures with clear-screen events.

### Follow-ups to Scope for Later
- Hash-based secondary dedup for non-clear-screen TUI patterns (Option 2).
- `getAllLines()` line count optimization in the WASM bridge (if performance profiling shows it is a bottleneck).
- Client-side indication that dedup was applied (e.g., "deduplicated from 59K to 4K lines").

---

## Risk Analysis

### Risk 1: `getAllLines()` performance at clear-screen events
**Impact**: High -- called 108 times in the reference session.
**Likelihood**: Medium -- `getAllLines()` constructs a full snapshot object, not just a count.
**Mitigation**: Profile on the reference session. If too slow, add a `getLineCount()` method to the VT WASM bridge that returns only the line count without building the full snapshot. This is a straightforward addition to the WASM wrapper.

### Risk 2: Clear-screen variants not caught
**Impact**: Medium -- some TUI apps might use `\x1b[J` (erase below) or cursor-addressed clears instead of `\x1b[2J`.
**Likelihood**: Low -- all reference sessions use `\x1b[2J`.
**Mitigation**: Also detect `\x1b[3J` (clear scrollback) and `\x1b[H\x1b[J` (home + erase below) as epoch triggers. Log unrecognized clear patterns for future tuning.

### Risk 3: Epoch boundary offset miscalculation
**Impact**: High -- wrong offsets produce garbled document or missing content.
**Likelihood**: Medium -- the relationship between clear-screen and scrollback line count has edge cases (e.g., clear when viewport is partially filled).
**Mitigation**: Extensive test coverage with known-content sessions. Verify epoch extraction by comparing extracted content against expected content.

### Risk 4: Section boundary falls mid-epoch
**Impact**: Medium -- a section boundary that occurs between two clear-screens must correctly reference the epoch's content.
**Likelihood**: High -- most sections will span within an epoch.
**Mitigation**: Record the epoch index at each section boundary. The line range within the raw document maps to the clean document via the epoch offset table.

### Risk 5: Scrollback limit interaction
**Impact**: Medium -- with scrollback limit of 200,000 lines and 108 clear-screen events, old epoch boundaries may be evicted from scrollback.
**Likelihood**: Low for current sessions (59K lines < 200K limit).
**Mitigation**: If `getAllLines().lines.length` at a clear-screen is LESS than the previous epoch start (indicating scrollback eviction), fall back to viewport capture for that epoch. This mirrors the existing `highWaterLineCount` overflow logic.

### Edge Cases

1. **Session with zero clear-screens (pure CLI)**: Identity transform. Clean document = raw document. No change in behavior.
2. **Session with clear-screens but no section boundaries detected**: The clean document is still built correctly; it just has no sections referencing it. The session snapshot is clean.
3. **Back-to-back clear-screens (rapid redraws)**: Multiple epochs with potentially empty content between them. The epoch extraction naturally produces empty slices that contribute nothing to the clean document.
4. **Clear-screen during alt-screen mode**: Ignored -- alt-screen sections already use `getView()`, not `getAllLines()`. The epoch tracking only applies to primary-buffer clear-screens.
5. **Mixed session: some clear-screen epochs, some linear output**: Epochs correctly separate the clear-screen redraws from the linear segments. Linear segments produce one long epoch with full content preserved.

---

# Plan: Scrollback Deduplication

References: This document (ADR section above)

## Open Questions

1. **`getAllLines()` performance**: Does calling `getAllLines()` at each clear-screen event (108 times in reference session) cause unacceptable slowdown? If so, is adding `getLineCount()` to the WASM bridge trivial?
2. **Epoch start precision**: After `\x1b[2J`, does avt push the viewport into scrollback synchronously within the same `feed()` call? Or do we need to capture the line count BEFORE the clear event is fed?
3. **Existing tests**: Do any of the 196 passing tests rely on the raw (duplicated) scrollback content? If so, they need to be updated, not just kept passing.

## Stages

### Stage 1: Epoch Tracking During Replay

Goal: Detect clear-screen events during replay and record epoch boundaries (scrollback line count at each clear). No document transformation yet -- just data collection.

Owner: implementer

- [ ] Add `EpochBoundary` type: `{ eventIndex: number; rawLineCount: number }`
- [ ] Add epoch tracking array to the replay loop in `session-pipeline.ts`
- [ ] When `\x1b[2J` is detected in event data (same scan that checks for alt-screen): record `{ eventIndex: j, rawLineCount: vt.getAllLines().lines.length }`
- [ ] Also detect `\x1b[3J` and `\x1b[H\x1b[J` as epoch triggers
- [ ] Skip epoch tracking when in alt-screen mode (alt-screen sections already use `getView()`)
- [ ] Add logging: number of epochs detected per session
- [ ] Write unit test: CLI session (no clears) produces zero epochs
- [ ] Write unit test: session with N clear-screens produces N epoch boundaries
- [ ] Write unit test: clear-screens during alt-screen are ignored

Files: `src/server/processing/session-pipeline.ts`
Depends on: none

Considerations:
- Performance: Profile `getAllLines().lines.length` call frequency on the reference session. If > 500ms total overhead, proceed to Stage 1b (add `getLineCount()` to WASM bridge).
- The existing `str.includes('\x1b[2J')` pattern in the detector already matches clear-screen. Reuse the same detection logic.
- Clear-screen can appear as part of a compound sequence (e.g., `\x1b[2J\x1b[H`). The detection should trigger on `\x1b[2J` regardless of surrounding bytes.

### Stage 2: Clean Document Assembly

Goal: After replay, use epoch boundaries to build a deduplicated document from the raw `getAllLines()` output. Store the clean document as the session snapshot.

Owner: implementer

- [ ] Extract `buildCleanDocument()` function: takes raw `TerminalSnapshot` + epoch boundaries, returns clean `TerminalSnapshot` + raw-to-clean line offset mapping
- [ ] Epoch 0: lines `[0, epochStartRaw[0])`
- [ ] Epoch N: lines `[epochStartRaw[N], epochStartRaw[N+1])`
- [ ] Final epoch: lines `[epochStartRaw[last], rawLines.length)`
- [ ] Handle empty epochs (back-to-back clears): produce empty slices, skip gracefully
- [ ] Handle scrollback eviction (epoch start > current line count): fall back to viewport snapshot capture for that epoch range
- [ ] Build `rawToCleanOffset` mapping: for each epoch, the clean document offset = sum of previous epoch sizes
- [ ] Write unit test: zero epochs produces identity (clean = raw)
- [ ] Write unit test: known content with 3 clear-screens produces correct clean document
- [ ] Write unit test: empty epochs are handled gracefully
- [ ] Write unit test: verify clean document line count matches expected (e.g., ~4K for reference session pattern)

Files: `src/server/processing/scrollback-dedup.ts` (new), `src/server/processing/session-pipeline.ts`
Depends on: Stage 1

Considerations:
- The `TerminalSnapshot` has `cols` and `rows` fields. The clean document should preserve the original `cols`/`rows` values.
- Each `SnapshotLine` has `spans` with styling. The slicing operates on line boundaries, so styling is preserved correctly (no mid-span splits).
- Edge case: If epoch 0 has zero lines (session starts with a clear-screen), the clean document starts from epoch 1.

### Stage 3: Section Line Range Remapping

Goal: Remap section line ranges from raw document coordinates to clean document coordinates. Existing sections with line ranges must reference the correct positions in the clean document.

Owner: implementer

- [ ] Create `remapSectionLineRange()` function: given raw `startLine`/`endLine` + epoch boundaries + `rawToCleanOffset` mapping, return clean `startLine`/`endLine`
- [ ] Handle sections that span epoch boundaries: the section's content is the concatenation of partial epochs. The clean line range covers the corresponding clean document range.
- [ ] Handle sections with viewport snapshots (TUI/overflow): no remapping needed, pass through unchanged
- [ ] Integrate remapping into the pipeline: after `buildCleanDocument()`, remap all section line ranges before storing
- [ ] Store the clean document (not raw) as `session.snapshot`
- [ ] Write unit test: section entirely within one epoch remaps correctly
- [ ] Write unit test: section spanning two epochs remaps correctly
- [ ] Write unit test: section with viewport snapshot (TUI) passes through unchanged
- [ ] Write unit test: section before any clear-screen (epoch 0) remaps correctly

Files: `src/server/processing/scrollback-dedup.ts`, `src/server/processing/session-pipeline.ts`
Depends on: Stage 2

Considerations:
- The raw section line count at a boundary is recorded DURING replay (before the clean document exists). The remapping happens AFTER replay, using the epoch mapping computed in Stage 2.
- Existing `previousLineCount` tracking in the pipeline needs to be updated to work in clean-document coordinates.
- Edge case: A section boundary coincides exactly with a clear-screen event. The section should start at the clean document position of the new epoch.

### Stage 4: Pipeline Integration and Existing Test Verification

Goal: Wire the epoch tracking, document assembly, and section remapping into the main pipeline. Verify all 196 existing tests still pass.

Owner: implementer

- [ ] Modify `processSessionPipeline()` to call `buildCleanDocument()` after replay
- [ ] Pass clean document to `sessionRepo.updateSnapshot()` instead of raw `getAllLines()`
- [ ] Pass `rawToCleanOffset` mapping to the section line range computation loop
- [ ] Update `highWaterLineCount` logic to work with epochs (scrollback plateau detection now considers epoch boundaries)
- [ ] Run full test suite: verify all 196 tests pass
- [ ] Fix any test fixtures that assumed raw scrollback content (update expected values for clean document)
- [ ] Add integration test: process a `.cast` file with clear-screen events, verify stored snapshot is deduplicated
- [ ] Add integration test: process a pure CLI `.cast` file, verify stored snapshot is unchanged

Files: `src/server/processing/session-pipeline.ts`, `src/server/processing/session-pipeline.test.ts`
Depends on: Stage 3

Considerations:
- The existing test `createCastFileWithDistinctSections` uses clear-screen between markers. After dedup, the section line ranges will be different. Review and update expected values.
- The `createCastFileWithScreenClear` test creates a single clear-screen at event 100. Verify epoch tracking produces one epoch boundary and the clean document excludes pre-clear content that was pushed to scrollback.
- The mixed CLI/TUI test (`createMixedCastFileWithMarkers`) has alt-screen transitions. Verify epoch tracking is disabled during alt-screen.

### Stage 5: Reference Session Validation

Goal: Validate the deduplication against real TUI sessions. Measure the actual compression ratio and verify content correctness.

Owner: implementer

- [ ] Write a script or test that processes `lennart-working-session-result-1.cast` (if available) and reports: raw line count, epoch count, clean line count, compression ratio
- [ ] Verify the clean document does not contain the Claude Code header 109 times (should appear once or a small number of times)
- [ ] Verify section content does not repeat between consecutive sections
- [ ] Process `igp-mono_260206_195119.cast` (if available) and verify similar deduplication
- [ ] Process the existing `fixtures/sample.cast` CLI session and verify zero epochs, identity transform
- [ ] Document results in test output or a validation report

Files: `src/server/processing/session-pipeline.test.ts` (or new validation script)
Depends on: Stage 4

Considerations:
- Reference sessions may not be available in CI. These tests should be conditional (skip if file not found) or use a smaller synthetic TUI session that exhibits the same pattern.
- The validation is manual/observational -- the goal is confidence, not automated assertion on specific line counts (which would be fragile).

### Stage 6: Performance Profiling and Optimization

Goal: Measure the performance impact of epoch tracking on the pipeline. Optimize if needed.

Owner: implementer

- [ ] Profile `processSessionPipeline()` on the reference session: measure total time, time spent in `getAllLines()` calls at clear-screen events, time spent in document assembly
- [ ] If `getAllLines()` overhead is > 1 second total: add `getLineCount()` to the VT WASM bridge (returns `lines.length` without building the full snapshot)
- [ ] If document assembly is > 500ms: investigate whether `SnapshotLine` slicing creates excessive copies (should be reference-based in JS, but verify)
- [ ] Document performance results

Files: `packages/vt-wasm/index.ts`, `packages/vt-wasm/src/lib.rs` (only if optimization needed)
Depends on: Stage 5

Considerations:
- The WASM bridge modification (adding `getLineCount()`) requires rebuilding the WASM binary via `./build.sh`. This is a heavier change that should only be done if profiling shows a real need.
- JavaScript `Array.slice()` on `SnapshotLine[]` is O(n) but creates a shallow copy. For 59K lines sliced into 108 epochs, the total work is still O(59K) -- acceptable.

## Dependencies

- Stage 2 depends on Stage 1: epoch boundary data is needed to build the clean document.
- Stage 3 depends on Stage 2: the rawToCleanOffset mapping is produced by the clean document assembly.
- Stage 4 depends on Stage 3: all three components (epoch tracking, document assembly, remapping) must be ready before pipeline integration.
- Stage 5 depends on Stage 4: the integrated pipeline must be complete before validating against real sessions.
- Stage 6 depends on Stage 5: performance profiling should be done on validated, correct output.

Stages 1-3 can each be independently unit-tested before integration.

## Progress

Updated by implementer as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | pending | |
| 2 | pending | |
| 3 | pending | |
| 4 | pending | |
| 5 | pending | |
| 6 | pending | |

---

## Decision History

Decisions made during design:

1. Clear-screen epoch tracking was chosen over content-hash deduplication because it uses terminal-semantic events as boundaries, producing zero false positives on genuine duplicate content (like repeated test runs).
2. The approach was designed as an additive transformation: CLI sessions with zero clear-screens produce an identity transform, guaranteeing no regression.
3. The clean document replaces the raw `getAllLines()` output as the stored session snapshot, so all clients immediately benefit without client-side changes.
4. Performance optimization (adding `getLineCount()` to WASM bridge) is deferred to Stage 6 and only executed if profiling shows a real need.
