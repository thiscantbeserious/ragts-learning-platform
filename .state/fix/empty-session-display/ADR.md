# ADR: Fix Empty Session Display -- Server Detection + Client Fallback

## Status
Proposed

## Context

Uploading terminal session recordings from tools other than Claude Code (e.g. Codex, Gemini CLI) produces zero detected section boundaries. The server marks the job `detection_status: 'completed'` with `sections: []` (zero sections). The client has no rendering branch for this state and shows a misleading UI. This is a two-layer problem requiring architectural decisions on both the server (detection heuristics) and the client (rendering contract).

### Fixture Analysis

Analysis of all 8 fixture files reveals a systematic detection failure across all non-Claude agent formats. Full data is in `fixture-analysis.md`; summary below.

| Fixture | Agent | Events | `\x1b[2J` | `\x1b[J` (erase-end) | Alt-screen | `\x1b[2K` (erase-line) | Gaps > 1s | Current detector result |
|---|---|---|---|---|---|---|---|---|
| claude-medium | Claude | 1379 | 2 | 0 | 0 | 10 | 12 | 2 screen clears -> **1 section** |
| claude-small | Claude | 18 | 0 | 0 | 0 | 1 | 1 | Too small (< 100 events) |
| codex-medium | Codex | 1171 | 0 | 32 | 0 | 0 | 3 | **NOTHING** |
| codex-small | Codex | 64 | 0 | 6 | 0 | 0 | 6 | Too small (< 100 events) |
| failing-session | Codex | 1171 | 0 | 32 | 0 | 0 | 3 | **NOTHING** (identical to codex-medium) |
| gemini-medium | Gemini | 674 | 0 | 0 | 0 | 323 | 19 | **NOTHING** |
| gemini-small | Gemini | 7 | 0 | 0 | 0 | 0 | 0 | Too small (< 100 events) |
| sample | (synthetic) | 24 | 0 | 0 | 0 | 0 | 0 | Too small (markers only) |

**Critical finding: the timing gate is broken for all real sessions.** The `isTimingReliable()` check requires median gap >= 0.1s. Every real agent session has a median gap well below 0.1s because TUI redraw ticks (0.0-0.08s) vastly outnumber meaningful pauses. This disables timing gap detection AND volume burst detection in every session -- the two signals that are format-agnostic. Only escape-sequence signals remain active, and those are format-specific.

**Root cause: two compounding failures.**

*Failure 1 -- Timing gate locks out valid data.* The median-based reliability check was designed for human terminal sessions where most events have human-paced timing. TUI applications like Claude Code, Codex, and Gemini CLI produce rapid UI redraw ticks (0.0-0.08s) that dominate the gap distribution, making the median ~0 even when real structural pauses exist. The gate disables both timing gap detection (Signal 1) and volume burst detection (Signal 4) for every agent session.

*Failure 2 -- Screen clear detection is too narrow.* The detector only recognizes `\x1b[2J` (clear entire screen). Codex uses `\x1b[J` (erase from cursor to end of screen) -- these are the same ECMA-48 CSI Ps J family, differing only in the Ps parameter. Gemini uses `\x1b[2K` (erase line) -- a different operation entirely.

**Agent UI patterns differ fundamentally:**
- **Claude Code:** Uses `\x1b[2J` (full screen clear) between conversation turns. Already detected.
- **Codex:** Uses `\x1b[J` (erase to end of display) with scroll regions. Not detected -- no `\x1b[2J]` or alt-screen.
- **Gemini CLI:** Uses `\x1b[2K]` (erase line) + `\x1b[1A]` (cursor up) to redraw UI frame-by-frame. No screen-level clear sequences of any kind. Zero `\x1b[2J]`, zero `\x1b[J]`, zero alt-screen, zero scroll regions.

**But timing gaps exist in all formats:**
- Codex medium: 3 gaps > 1s (user typing pauses between prompts)
- Gemini medium: 19 gaps > 1s (including session resumption and user interaction pauses)
- Claude medium: 12 gaps > 1s (user typing pauses)

These gaps are real structural signals buried under the mass of fast UI ticks that skew the median.

**Quantitative impact of each fix approach alone:**

| Approach | Codex (1171 events) | Gemini (674 events) |
|---|---|---|
| Timing gate fix only | 3 gaps > 1s -> ~2-3 sections (~400 events/section -- very coarse) | 19 gaps > 1s -> ~10-15 sections (~45-67 events/section -- good) |
| `\x1b[J]` detection only | 32 candidates -> ~8-15 sections after merge (~80-150 events/section -- good) | 0 candidates -> **no sections** |
| Both combined | Timing corroborates `\x1b[J]` at transitions | Timing provides all boundaries |

For Codex, timing alone gives only 2-3 coarse sections -- too few for useful browsing. The `\x1b[J]` signal provides the granularity that makes section navigation worthwhile. For Gemini, timing is the only viable signal. The combined approach is necessary because neither fix alone covers both formats at useful granularity.

### Server Investigation Findings

Analysis of `fixtures/failing-session.cast` (Codex session, 1171 events, 553 KB) reveals why the detector returns zero boundaries:

**Signal 1 -- Timing gaps:** The fixture uses asciicast v3 delta timestamps. Nearly all gaps are 0.000-0.041s (UI refresh ticks at ~30fps). The median gap is well below 0.1s, so `isTimingReliable()` returns `false`. This disables both timing gap detection AND volume burst detection. Two of four signal channels are eliminated.

**Signal 2 -- Screen clears (`\x1b[2J`):** Zero occurrences. Codex does not use full-screen erase. Instead it uses `\x1b[J` (erase from cursor to end of display) combined with cursor positioning (`\x1b[H`, scroll regions, reverse index `\x1bM`). The detector only looks for `\x1b[2J`. This is the primary missed signal.

**Signal 3 -- Alt-screen transitions (`\x1b[?1049h/l`):** Zero occurrences. Codex renders in the primary buffer using scroll regions and cursor movement, never entering alternate screen mode.

**Signal 4 -- Volume bursts:** Disabled because timing is unreliable (see Signal 1).

**Result:** All four signal channels produce zero candidates. The detector is not broken -- it simply does not recognize the signals this session format produces.

**What signals Codex DOES produce:**
- `\x1b[J` (erase from cursor to end of display): ~32 occurrences. Used when Codex redraws its TUI.
- `\x1b[nS` (scroll up): ~13 occurrences. Content scrolling.
- `\x1bM` (reverse index): ~12 occurrences. Used with scroll regions for UI layout.
- Scroll region changes (`\x1b[n;mr`): frequent. Codex manipulates scroll regions to manage its split-pane UI.
- `\x1b[1;1H` or `\x1b[H` followed by `\x1b[J`: effectively a screen clear. ~39 occurrences of cursor positioning to row 1.

**Where a human would place section boundaries:**
Codex sessions have a clear structure: the user submits a prompt, Codex thinks/acts, then returns to the prompt. Each prompt-response cycle is a logical section. These transitions correlate with scroll region resets and `\x1b[J` erasures after cursor positioning to the top of the content area.

### Client Architecture Analysis

The rendering pipeline currently works like this:

1. `useSession.ts` composable fetches session data, exposes `sections`, `snapshot`, `detectionStatus`, `error`, `loading`
2. `SessionDetailView.vue` checks `loading` > `error` > `!hasContent` > renders `SessionContent`
3. `SessionContent.vue` checks `v-if="snapshot || sections.length > 0"` to decide between `OverlayScrollbar` and the `v-else` "No content available" block

**Actual behavior with zero sections:**
- When `snapshot` is non-null and `sections.length === 0`: `SessionContent.vue` line 51 (`v-if="snapshot || sections.length > 0"`) passes, the `OverlayScrollbar` renders, but the `v-for` over sections produces nothing. The preamble logic returns `[]` because `sections.length === 0`. Result: an empty scrollable container with no visible content -- the terminal chrome shell renders but nothing is inside it.
- When `snapshot` is also null: the `v-else` block shows "No content available" -- a generic message with no context about what happened or why.

Neither state communicates to the user that section detection completed but found no boundaries, or that the session content is still viewable as a raw snapshot.

The composable already exposes `detectionStatus` but `SessionDetailView.vue` does not use it. The `snapshot` is parsed and available but has no rendering path when `sections.length === 0`.

**Note on snapshot wire format:** `SessionDetailResponse.snapshot` is typed as `string | TerminalSnapshot | null | undefined` on the wire. The `useSession` composable handles the string-to-object parsing (JSON.parse for string values, passthrough for already-parsed objects). All rendering branches downstream operate on the parsed `TerminalSnapshot | null`.

**Existing infrastructure (no schema changes needed):**
- `SessionDetailResponse` carries `detection_status` and `sections[]`
- `useSession.ts` already parses and exposes `detectionStatus`, `snapshot`, and `sections`
- Typia validation on the response is already wired in `sessions.ts` route handler
- The `DetectionStatus` union type already includes `'failed'` and `'completed'`

**Key architectural requirement:** The requirements mandate a **platform rendering contract** -- the rendering decision must be driven by `detection_status` + `sections.length` + `snapshot`, with clear ownership split between components. Server-side Typia validation ensures the client can trust the response shape.

## Options Considered

### Server Detection

#### Server Option A: Erase-to-End Detection (`\x1b[J`)

Add a new signal that detects `\x1b[J` (erase from cursor to end of display) in output events. Score it at 0.8 (same as alt-screen exit). Does not depend on timing reliability.

- **Pros:** Directly addresses the missed Codex signal; format-general for TUI apps that use `\x1b[J]`; simple (one new method, same pattern as `detectScreenClears`); low regression risk (Claude Code uses `\x1b[2J`, not `\x1b[J`)
- **Cons:** Only helps formats that use `\x1b[J]` -- does nothing for Gemini (zero `\x1b[J]` occurrences); produces only coarse escape-sequence boundaries without timing corroboration

#### Server Option B: Fix the Timing Gate

The current `isTimingReliable()` uses median gap >= 0.1s as the reliability check. This is fundamentally broken for TUI applications: UI redraw ticks (0.0-0.08s) dominate the distribution, making the median ~0 even when real timing gaps exist. The fix: replace the median check with a presence-of-significant-gaps check. Instead of "is the median gap >= 0.1s?", ask "do any gaps > a significance floor exist?".

- **Pros:** Format-agnostic -- works for ANY agent that has real timing pauses. Fixes Gemini which has zero escape-sequence signals but abundant timing gaps. Unlocks volume burst detection as well (also gated by `isTimingReliable`). Small change -- one method, same file.
- **Cons:** Produces only 2-3 coarse sections for Codex (3 gaps > 1s for 1171 events -- ~400 events per section). Insufficient granularity for Codex-style TUI sessions where timing pauses are rare but UI redraws are frequent. Does not address the `\x1b[J]` gap.

#### Server Option C: Combined Erase-to-End + Scroll Region Reset

Add `\x1b[J` detection (Option A) plus scroll region reset detection (`\x1b[r`). Two corroborating signals merge within the 50-event window for higher confidence.

- **Pros:** Two signals reduce false positives vs. `\x1b[J` alone
- **Cons:** Scroll region resets are noisy (many are not section boundaries); more implementation surface; merge/scoring tuning needed; marginal benefit given the existing merge pipeline already handles excess candidates; still does nothing for Gemini

#### Server Option D: Both -- Fix Timing Gate + Add `\x1b[J` Detection

Apply both Option A (add `\x1b[J` signal) and Option B (fix timing gate). Two independent, complementary changes:

1. Fix `isTimingReliable()` to use presence-of-significant-gaps instead of median check
2. Add `\x1b[J` as a new escape sequence signal

- **Pros:** Maximum coverage -- Codex gets fine-grained `\x1b[J]` boundaries (8-15 sections) corroborated by timing gaps. Gemini gets timing signals (the only viable signal for its format, producing 10-15 sections). Claude gets timing signals in addition to existing `\x1b[2J]` (more boundaries in multi-turn sessions). The two changes are independent and testable in isolation. The merge pipeline handles corroboration naturally when both produce candidates near the same event index.
- **Cons:** Larger change surface than either alone (though still small -- two methods in one file). Need to tune the timing gate threshold to avoid false positives. Risk of over-segmentation if both signals produce many candidates -- but the merge window (50 events), minimum section size (100 events), and max sections cap (50) provide adequate filtering.

### Client Rendering

#### Client Option A: Inline Conditional Branches

Add `v-if`/`v-else-if` branches directly in `SessionContent.vue` and `SessionDetailView.vue` for the zero-section and failed states. Each state gets its own template block.

- **Pros:** Straightforward; easy to understand; no new abstractions
- **Cons:** Violates the platform contract requirement -- each new `detection_status` value requires a new conditional block. Conditionals spread across two components. Not extensible.

#### Client Option B: Use the Session Model Directly

The `SessionDetailResponse` type in `src/shared/types/api.ts` already carries `detection_status`, `sections`, and `snapshot`. This IS the rendering model — the client just needs to handle all its states instead of only the "has sections" case. No new types, no new abstractions. Typia validates this shape server-side (in `sessions.ts` route handler via `typia.validate<SessionDetailResponse>`), so the client can trust the shape it receives.

Rendering responsibility is split between two components:

**`SessionDetailView.vue`** owns top-level routing (HTTP-level states):
- `loading` → skeleton
- `error` (fetch failure, 404) → error message
- Otherwise → pass `detection_status`, `sections`, `snapshot` to `SessionContent`

**`SessionContent.vue`** owns all terminal rendering states (receives `detection_status` as a new prop):
- `sections.length > 0` → render sections with fold/unfold (existing behavior)
- `detection_status === 'completed'` + `sections.length === 0` + `snapshot` exists → render full snapshot + info banner ("No section boundaries detected -- showing full session")
- `detection_status === 'completed'` + `sections.length === 0` + `snapshot` is null → "No content" state
- `detection_status === 'failed'` or `'interrupted'` + `snapshot` exists → render snapshot + error banner
- `detection_status === 'failed'` or `'interrupted'` + no `snapshot` → error state
- Non-terminal status → processing/loading indicator

This split keeps all terminal rendering in `SessionContent.vue` (which already knows how to render snapshots and sections) while `SessionDetailView.vue` handles only HTTP-level concerns.

- **Pros:** Zero new abstractions; the shared SessionDetailResponse model IS the contract; no indirection between data and rendering; obvious to read; nothing to maintain beyond the existing type; terminal rendering stays in the terminal rendering component
- **Cons:** `SessionContent.vue` gains a `detection_status` prop dependency — but this is a natural extension of its existing role

##### Rendering State Table

The client renders based on the SessionDetailResponse fields directly — no intermediate mapping:

| `detection_status` | `sections.length` | `snapshot` | Component | Renders |
|---|---|---|---|---|
| `completed` | > 0 | any | `SessionContent` | Sections with fold/unfold (existing) |
| `completed` | 0 | exists | `SessionContent` | Full snapshot + info banner |
| `completed` | 0 | null | `SessionContent` | "No content" state |
| `failed` / `interrupted` | any | exists | `SessionContent` | Full snapshot + error banner |
| `failed` / `interrupted` | any | null | `SessionContent` | Error state |
| non-terminal | any | any | `SessionContent` | Processing indicator |
| (fetch error / 404) | n/a | n/a | `SessionDetailView` | Error message |
| (loading) | n/a | n/a | `SessionDetailView` | Skeleton |

#### Client Option C: Strategy Pattern via Component Registry

Define a mapping from `(detectionStatus, hasSections, hasSnapshot)` to a Vue component. `SessionDetailView` resolves the component dynamically and renders it. Each rendering state is a separate component.

- **Pros:** Maximum separation of concerns; each state component is independently testable and designable; adding a new state = adding a component + registry entry
- **Cons:** Over-engineered for 4-5 states; component proliferation; harder to see the full rendering logic at a glance; Vue's dynamic component model adds debugging friction; the team is small and the states are unlikely to grow rapidly

## Decision

### Server: Option D -- Both Fixes (Timing Gate + `\x1b[J]` Detection)

The fixture analysis demonstrates that neither fix alone produces adequate results:

1. **`\x1b[J]` alone leaves Gemini undetected.** Gemini produces zero screen-level escape sequences of any kind -- only `\x1b[2K]` (erase line). The `\x1b[J]` signal helps Codex (32 occurrences) and any future TUI that uses erase-to-end, but Gemini's 674-event session with 19 timing gaps > 1s would still produce zero sections.

2. **Timing gate alone leaves Codex under-segmented.** Codex has only 3 gaps > 1s (and 0 gaps > 5s with the current threshold), producing at most 2-3 sections for 1171 events -- roughly 400 events per section. This is too coarse for useful browsing. But Codex has 32 `\x1b[J]` events that, after merge, produce 8-15 sections at ~80-150 events each -- much closer to a logical unit of work. For Codex, `\x1b[J]` is the primary signal; timing corroborates it.

3. **The two changes are independent and testable in isolation.** Neither depends on the other. Both can be staged, tested, and reviewed separately.

The implementation breaks into three parts:

**Part A -- Relax `isTimingReliable()`:** Replace the median-based check (`median >= 0.1s`) with a presence-of-significant-gaps check: return `true` if at least one gap exceeds a significance floor (e.g., 0.5s). This unlocks timing detection for sessions that have real pauses buried under fast UI ticks, while still filtering truly compressed sessions (synthetic timestamps where ALL gaps are < 0.01s).

**Part B -- Make the gap threshold adaptive:** Consider replacing the fixed `TIMING_GAP_THRESHOLD = 5` with an adaptive threshold computed from the session's gap distribution (e.g., percentile-based or `P75 + k * IQR`). This finds "unusual pauses" relative to each session's own baseline, regardless of absolute timing scale. *Note: the engineer may elect to keep the fixed 5s threshold in the initial implementation and add adaptive thresholds as a follow-up if the fixed threshold proves adequate for the fixture suite.*

**Part C -- Add `\x1b[J]` / `\x1b[0J]` detection:** Extend erase-in-display detection to recognize the full ECMA-48 CSI Ps J family, not just `\x1b[2J]`:
- `\x1b[0J]` or `\x1b[J]` -- erase from cursor to end of screen (Ps=0, default)
- `\x1b[2J]` -- erase entire screen (Ps=2, currently detected)

Score `\x1b[J]` / `\x1b[0J]` at 0.8 (same as alt-screen exit). ADR2 argued for 0.6 on the grounds that a partial erase is a weaker boundary signal than a full screen clear -- the engineer should use 0.8 as the starting point but may tune down to 0.6 if testing against the fixture suite shows over-segmentation.

**Why `\x1b[2K]` (erase-line) is deliberately excluded:** Gemini has 323 `\x1b[2K]` events in 674 total events -- nearly every other event is an erase-line. This is Gemini's routine rendering mechanism (spinner redraw: `\x1b[2K]\x1b[1A]` repeated 11-12 times per frame), not a boundary signal. Treating it as a boundary candidate would produce ~323 candidates for 674 events -- catastrophic over-segmentation that the merge/filter pipeline cannot recover from. Gemini is adequately served by adaptive timing (19 gaps > 1s -> ~10-15 sections). If future analysis shows timing is insufficient for some Gemini sessions, `\x1b[2K]` could be explored with aggressive deduplication, but that is out of scope here.

4. **Coverage across all fixture formats:**

   | Agent | `\x1b[J]` signal (Part C) | Timing gate fix (Parts A+B) | Combined |
   |---|---|---|---|
   | Claude | No change (already has `\x1b[2J]`) | Adds timing gaps (12 > 1s) | More boundaries in multi-turn sessions |
   | Codex | 32 candidates -> 8-15 sections | 3 timing gaps > 1s -> 2-3 sections | `\x1b[J]` provides granularity, timing corroborates |
   | Gemini | No help (0 occurrences) | 19 timing gaps > 1s -> 10-15 sections | **Only fix that helps Gemini** |

5. **Backward compatibility:** For Claude Code sessions, the relaxed reliability gate changes nothing -- if Claude's median gap is already >= 0.1s, timing was already enabled. If it is below 0.1s (as in claude-medium), the new gate unlocks timing gaps that were previously suppressed, producing additional boundaries -- a net improvement. Claude's `\x1b[2J]` signals continue to be detected by the same code path. The new `\x1b[J]` detection does not fire for Claude (0 occurrences in the fixture). No regression risk.

6. **Signal interaction:** When both adaptive timing and `\x1b[J]` fire near the same event (within the 50-event merge window), they merge into a single boundary with combined signals and the higher score. This is the existing merge behavior -- no new logic needed.

### Client: Option B -- Use the Session Model Directly

1. **The contract already exists.** The `SessionDetailResponse` type in `src/shared/types/api.ts` is the shared model. The server validates it with `typia.validate<SessionDetailResponse>()` before sending (warn-only, non-blocking). Both server and client already use it. No new type needed.
2. **Zero abstraction overhead.** The client checks `detection_status`, `sections.length`, and `snapshot` directly in the template. `v-if`/`v-else-if` branches are readable and obvious. `useSession` already exposes all three fields — no composable changes needed.
3. **Natural component split.** `SessionDetailView.vue` handles HTTP-level states (loading, fetch errors). `SessionContent.vue` handles all terminal rendering states — it already knows how to render snapshots and sections, so the zero-section fallback belongs there.
4. **Option A (scattered conditionals across multiple components with no clear ownership) is rejected** — each component should own a coherent set of states.
5. **Option C (component registry) is rejected** — overkill for the number of states involved.

## Consequences

### What becomes easier
- **Codex sessions** get fine-grained detection (8-15 sections from `\x1b[J]`) instead of coarse timing-only (2-3 sections) or nothing at all
- **Gemini sessions** get detection via adaptive timing (10-15 sections from 19 gaps > 1s) where they previously got nothing
- **Any future session format** with either timing gaps or erase-in-display sequences is automatically covered without per-tool configuration
- Zero-section and failed sessions never produce blank pages or empty scrollable containers
- Adding new detection statuses or rendering states: add a template branch in `SessionContent.vue`
- Testing rendering decisions: mount `SessionContent.vue` with props — the decision tree is in the template
- Future detection signals can be added incrementally, benefiting from the now-functional timing baseline

### What becomes harder
- `SessionContent.vue` gains awareness of `detection_status` (previously it only cared about sections and snapshot)
- Developers must understand the rendering split: HTTP states in `SessionDetailView`, terminal states in `SessionContent`
- Two signal changes in one fix means more to test and tune, though the existing merge/filter pipeline handles interaction
- The timing gate change may produce boundaries at session-resumption points (e.g., overnight idle gaps in Gemini) that are not prompt-response boundaries -- but these are still meaningful structural markers for navigation

### Follow-ups to scope for later
- Adaptive timing thresholds (dynamically set `TIMING_GAP_THRESHOLD` based on session distribution, e.g., `P75 + k * IQR`) if the fixed 5s threshold proves inadequate for some session formats
- `\x1b[2K]` (erase-line) signal exploration for Gemini, with aggressive deduplication, if adaptive timing proves insufficient
- Scroll region reset signal (Server Option C) for corroboration in Codex-like formats
- Confidence scoring per session
- Manual section marking UI
- Virtual scrolling for large unsectioned sessions

## Decision History

1. Initial investigation confirmed Codex uses `\x1b[J]` (erase from cursor to end) instead of `\x1b[2J]` (erase entire display), with no alt-screen transitions.
2. Initially chose Server Option A (`\x1b[J]` only) based on analysis of the Codex fixture alone.
3. Fixture analysis of all 8 files revealed: (a) Gemini has zero escape-sequence signals but 19 timing gaps > 1s, (b) the timing gate (`isTimingReliable()` using median >= 0.1s) is broken for ALL real agent sessions because TUI redraw ticks dominate the gap distribution, (c) timing alone gives Codex only 2-3 coarse sections while `\x1b[J]` gives 8-15 useful sections.
4. Revised to Server Option D (both fixes) because: (a) `\x1b[J]` alone leaves Gemini undetected, (b) timing alone leaves Codex under-segmented, (c) the two changes are independent and testable in isolation.
5. Deliberately excluded `\x1b[2K]` (erase-line) from detection. Gemini uses it 323 times in 674 events -- it is a rendering mechanism, not a boundary signal. Over-segmentation risk is too high. Adaptive timing handles Gemini adequately.
6. Chose Client Option B (direct SessionDetailResponse model usage). `SessionDetailView.vue` handles HTTP states; `SessionContent.vue` handles all terminal rendering states including zero-section fallback, checking `detection_status`, `sections.length`, and `snapshot`. Typia validates the response shape server-side.
7. Rejected Client Option C (component registry) as over-engineered for the number of rendering states.
