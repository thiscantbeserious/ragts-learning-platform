# ADR: Fix Empty Session Display -- Server Detection + Client Fallback

## Status
Proposed

## Context

Uploading terminal session recordings from tools other than Claude Code (e.g. Codex, Gemini CLI) produces zero detected section boundaries. The server marks the job `detection_status: 'completed'` with `sections: []` (zero sections). The client has no rendering branch for this state and shows a misleading UI. This is a two-layer problem requiring architectural decisions on both the server (detection heuristics) and the client (rendering contract).

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

**Key architectural requirement:** The requirements mandate a **platform rendering contract** -- the rendering decision must be driven by `detection_status` + `sections.length` + `snapshot`, with clear ownership split between components. Server-side Typia validation ensures the client can trust the response shape.

## Options Considered

### Server Detection

#### Server Option A: Erase-to-End Detection (`\x1b[J`)

Add a new signal that detects `\x1b[J` (erase from cursor to end of display) in output events. Score it at 0.8 (same as alt-screen exit). Does not depend on timing reliability.

- **Pros:** Directly addresses the missed signal; format-general (many TUI apps use `\x1b[J`); simple (one new method, same pattern as `detectScreenClears`); low regression risk (Claude Code uses `\x1b[2J`, not `\x1b[J`)
- **Cons:** Weaker signal than `\x1b[2J` -- may fire on partial redraws; may produce excess candidates (32 in fixture vs ~5-8 expected sections) -- but the merge/filter pipeline handles this

#### Server Option B: Adaptive Timing Thresholds

Analyze the session's timing distribution before detection. Set gap threshold at the 95th percentile of the session's own timing gaps instead of a fixed 5s.

- **Pros:** Makes timing detection inherently format-agnostic; called out in VISION_STEP.md as promising
- **Cons:** The Codex fixture has genuinely uniform timing (~0.033s/event) -- no meaningful pauses exist. Even adaptive thresholds find noise, not structure. Does not address the fundamental issue (escape sequence detection, not timing). Risk of false positives in existing sessions.

#### Server Option C: Combined Erase-to-End + Scroll Region Reset

Add `\x1b[J` detection (Option A) plus scroll region reset detection (`\x1b[r`). Two corroborating signals merge within the 50-event window for higher confidence.

- **Pros:** Two signals reduce false positives vs. `\x1b[J` alone
- **Cons:** Scroll region resets are noisy (many are not section boundaries); more implementation surface; merge/scoring tuning needed; marginal benefit given the existing merge pipeline already handles excess candidates

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

### Server: Option A -- Erase-to-End Detection

1. **Simplest change that solves the problem.** The Codex fixture has ~32 `\x1b[J` events. After merge (50-event window) and minimum section size (100 events) filters, these collapse into a reasonable number of boundaries.
2. **Option B does not solve this case.** The timing is genuinely uniform -- no meaningful pauses exist.
3. **Option C adds complexity for marginal benefit.** The merge pipeline already handles corroboration naturally.
4. **Low regression risk.** Claude Code uses `\x1b[2J` (which is detected) and `\x1b[3J` (which is not currently detected but is not a section boundary signal -- it clears the scrollback buffer, not the visible screen). Neither overlaps with `\x1b[J`.

### Client: Option B -- Use the Session Model Directly

1. **The contract already exists.** The `SessionDetailResponse` type in `src/shared/types/api.ts` is the shared model. The server validates it with `typia.validate<SessionDetailResponse>()` before sending (warn-only, non-blocking). Both server and client already use it. No new type needed.
2. **Zero abstraction overhead.** The client checks `detection_status`, `sections.length`, and `snapshot` directly in the template. `v-if`/`v-else-if` branches are readable and obvious. `useSession` already exposes all three fields — no composable changes needed.
3. **Natural component split.** `SessionDetailView.vue` handles HTTP-level states (loading, fetch errors). `SessionContent.vue` handles all terminal rendering states — it already knows how to render snapshots and sections, so the zero-section fallback belongs there.
4. **Option A (scattered conditionals across multiple components with no clear ownership) is rejected** — each component should own a coherent set of states.
5. **Option C (component registry) is rejected** — overkill for the number of states involved.

## Consequences

### What becomes easier
- Sessions from TUI-based tools that use `\x1b[J` will get section boundaries
- Zero-section and failed sessions never produce blank pages or empty scrollable containers
- Adding new detection statuses or rendering states: add a template branch in `SessionContent.vue`
- Testing rendering decisions: mount `SessionContent.vue` with props — the decision tree is in the template
- Future detection signals (adaptive timing, scroll regions) can be added incrementally

### What becomes harder
- `SessionContent.vue` gains awareness of `detection_status` (previously it only cared about sections and snapshot)
- Developers must understand the rendering split: HTTP states in `SessionDetailView`, terminal states in `SessionContent`

### Follow-ups to scope for later
- Adaptive timing thresholds (Server Option B) for sessions with meaningful but small timing gaps
- Scroll region reset signal (Server Option C) for corroboration
- Confidence scoring per session
- Manual section marking UI

## Decision History

1. Investigation confirmed Codex uses `\x1b[J` (erase from cursor to end) instead of `\x1b[2J` (erase entire display), with no alt-screen transitions or meaningful timing gaps.
2. Chose Server Option A (erase-to-end) over adaptive timing because the fixture has genuinely uniform timing -- the problem is escape sequence detection, not timing sensitivity.
3. Chose Client Option B (direct SessionDetailResponse model usage) over inline conditionals scattered across multiple components. `SessionDetailView.vue` handles HTTP states; `SessionContent.vue` handles all terminal rendering states including zero-section fallback, checking `detection_status`, `sections.length`, and `snapshot`. Typia validates the response shape server-side.
4. Rejected Client Option C (component registry) as over-engineered for the number of rendering states.
