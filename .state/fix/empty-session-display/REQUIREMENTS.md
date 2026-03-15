# Requirements: Fix Empty Session Display -- Server Detection + Client Fallback

## Problem Statement

Uploading terminal session recordings from tools other than Claude Code (e.g. Codex, Gemini CLI) produces zero detected section boundaries. The server marks the job `detection_status: 'completed'` with `detected_sections_count: 0` — a silent false success. The client has no rendering branch for this state: `SessionContent.vue` renders content exclusively through sections, so zero sections produces a blank page. The user sees empty terminal chrome despite valid session content existing in the database. Processing failures (`detection_status: 'failed'`) have the same blank-page outcome.

## Desired Outcome

After this fix:
1. The section detector produces meaningful boundaries for a broader range of session formats, starting with the `fixtures/failing-session.cast` fixture (Codex origin, 1172 lines, 553 KB).
2. The client never renders a blank page when session content exists. Two explicit fallback states replace the missing rendering branch.
3. Existing Claude Code sessions continue to detect the same (or better) section boundaries — no regressions.
4. The fallback contract (`detection_status` + `detected_sections_count` → rendering path) is a first-class platform pattern, not a one-off conditional.

## Scope

### In Scope

- Server: investigate `fixtures/failing-session.cast` signal profile to understand why current heuristics miss it
- Server: improve `section-detector.ts` heuristics to detect boundaries in previously-failing session formats (format-general, not Codex-specific)
- Server: preserve backward compatibility — existing Claude Code detection behavior must not regress
- Client: implement State A rendering path — `detection_status: 'completed'` AND `detected_sections_count: 0` → render session snapshot as continuous document with informational banner
- Client: implement State B rendering path — `detection_status: 'failed'` → render error banner plus snapshot if available; if no snapshot, render a clear error state
- Client: session list view — zero-section sessions appear as normal entries with no error indicator; the unsectioned state is revealed only on open
- Client: fallback paths implemented as a reusable rendering contract tied to `detection_status` + `detected_sections_count`, not as ad-hoc conditionals
- Visual treatment uses existing design system tokens from `design/styles/` exclusively

### Out of Scope

- Virtual scrolling for large unsectioned sessions
- Manual section marking UI
- Session re-processing triggers from the client UI
- Changes to the upload flow or pipeline architecture
- Rewriting the pipeline to multi-pass
- Full format-specific detection profiles or per-tool configuration knobs
- Schema migrations (existing `detection_status` values and `detected_sections_count` field are sufficient)

## Acceptance Criteria

### Server — Detection

- [ ] Re-processing `fixtures/failing-session.cast` through the updated detector yields a non-zero count of section boundaries that correspond to recognizable units of work (verifiable by running the detection pipeline against the fixture and inspecting output)
- [ ] The detection improvement does not introduce any new per-tool configuration knob or Codex-specific code path (format-general approach confirmed by code review)
- [ ] All existing server-side section detection tests pass without modification — no Claude Code session regressions
- [ ] The improved detector operates within the single-pass streaming pipeline architecture (no second-pass requirement introduced)

### Client — State A (zero sections, completed)

- [ ] When `detection_status` is `'completed'` and `detected_sections_count` is `0`, the session page renders the full session snapshot as a continuous document — no blank page
- [ ] An informational (non-error) banner is displayed communicating that section boundaries were not found — the framing is a limitation, not a failure
- [ ] The informational banner uses design system tokens only (no custom colors or components outside the system)
- [ ] The session list entry for a zero-section `'completed'` session shows no error indicator; the unsectioned state is not surfaced until the user opens the session

### Client — State B (processing failed)

- [ ] When `detection_status` is `'failed'` and a snapshot exists, the session page renders an error banner plus the available snapshot content — no blank page
- [ ] When `detection_status` is `'failed'` and no snapshot exists, the session page renders a clear error state explaining that content is unavailable — no blank page
- [ ] Error messaging for State B communicates failure honestly (this is an error, not a limitation)
- [ ] The error banner uses design system tokens only

### Platform contract

- [ ] The rendering decision (which state to show) is driven exclusively by the combination of `detection_status` and `detected_sections_count` — not by inline component conditionals specific to this bug
- [ ] The same rendering contract handles any future `detection_status` value without requiring new client-side code for each case

## Constraints

- **Existing design system:** All visual treatment must use tokens from `design/styles/`. No new colors, no custom components outside the system.
- **Existing data model:** No schema changes. Sessions already store `detection_status`, `detected_sections_count`, and a full snapshot. Both fixes use only these existing fields.
- **Vue 3 + existing component hierarchy:** `SessionContent.vue`, `TerminalSnapshot.vue`, and `SectionHeader.vue` are the rendering primitives. Client changes work within this structure.
- **Single-pass pipeline:** Detection improvements must operate within the streaming model. No second-pass rewrites.
- **Backward compatibility:** Existing Claude Code sessions must not regress in detection quality. This is a hard constraint — any detection change that degrades existing sessions must be rejected.

## Context

- Bug first surfaced with `fixtures/failing-session.cast` (Codex session, 553 KB). The detector returns zero boundaries on this file; the exact reason is unknown until the fixture is analyzed.
- `detection_status` already has values `'completed'`, `'failed'`, `'interrupted'` — no enum extension needed.
- `SessionContent.vue` currently renders exclusively via `v-for` over sections, producing nothing when `sections.length === 0`. The client fix adds rendering branches before this loop.
- The VISION_STEP.md identifies adaptive detection thresholds (analyzing session timing distribution before setting thresholds) as the most promising format-general approach. The Architect decides specifics after fixture analysis.
- Zero-section sessions must not alarm users browsing the list — the limitation is minor and only relevant inside the session view.

---
**Sign-off:** Pending
