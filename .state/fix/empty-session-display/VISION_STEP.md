# Vision: Fix Empty Session Display -- Server Detection + Client Fallback

> When a user uploads a valid terminal session, Erika must detect meaningful sections regardless of the session's tool origin -- and even when detection falls short, never show a blank page.

## Core Intent

Reliability across session formats. Erika's section detection pipeline was built and tuned against Claude Code sessions, which produce distinctive signals: regular timing gaps, screen clears via `\x1b[2J`+`\x1b[3J`, alt-screen transitions, volume bursts. But sessions from other tools -- Codex, Gemini CLI, manual recordings -- may lack some or all of these signals. The detector silently returns zero sections and marks the job "completed," which the client then renders as a blank page.

This is a two-layer fix. The primary layer is making the server smarter: the section detector must handle more session formats by identifying what signals Codex and similar sessions DO produce, and using those to find boundaries. The secondary layer is making the client resilient: even if detection genuinely finds nothing, the user must still see their content.

Both layers are required. Better detection without a client fallback still breaks on the next unknown format. A client fallback without better detection means most sessions render as unsegmented walls of text, defeating Erika's core value of structured, foldable browsing.

## Current State

**Server side -- the root cause:** The multi-signal section detector (`section-detector.ts`) uses four heuristic channels:

1. **Timing gaps** -- pauses between events above a threshold suggest section boundaries
2. **Screen clears** -- `\x1b[2J` / `\x1b[3J` escape sequences that wipe the terminal
3. **Alt-screen transitions** -- `\x1b[?1049h/l` toggling between primary and alternate buffers
4. **Volume bursts** -- sudden spikes in output volume after quiet periods

Claude Code sessions hit multiple of these signals reliably (the MEMORY.md notes ~108 clear-screen events, ~50 detected boundaries per session). Codex sessions, however, appear to use a different terminal interaction pattern. The `fixtures/failing-session.cast` file is 1172 lines and 553KB of real content, yet the detector returns zero boundaries. The pipeline marks `detection_status: 'completed'` with `detected_sections_count: 0` -- a silent false success. There is no distinction between "I looked and found nothing" and "the signals I look for do not exist in this format."

**Client side -- the visible symptom:** `SessionContent.vue` renders content exclusively through sections. When `sections.length === 0`, the `v-for` loop produces nothing. The session snapshot exists in the database and is loaded by the client, but there is no rendering branch for the zero-section case. The user sees empty terminal chrome.

**The gap is on both sides.** The server fails to detect structure in valid sessions. The client fails to show content when detection comes up empty.

## Design Direction

### Server: Robust Multi-Format Detection

The section detector needs to be investigated against the failing fixture to understand what signals Codex sessions DO produce and why the current heuristics miss them. The investigation informs which heuristics to add or adjust -- the architect decides the specifics after analyzing the fixture. The goal is not to special-case Codex but to make the detector more generally robust.

The existing `detection_status` type already includes `'failed'`, `'interrupted'`, and `'completed'` -- no schema changes needed. The client uses `detection_status` + `detected_sections_count` to choose the rendering path.

### Client: Defense in Depth

This is a reliability fix, not a design overhaul. The emotional target is **confidence** -- the user should never wonder whether their upload worked. The client must handle two distinct fallback states:

**State A: Detection completed, zero sections found (limitation)**
- The user must see their session content, not a blank page
- An informational message communicates that section boundaries were not found -- this is a limitation, not a failure
- The unsectioned view should feel like a natural part of the platform, not a degraded fallback

**State B: Processing failed entirely (error)**
- The client must still show whatever content is available -- if a snapshot exists, show it
- If nothing exists (truly broken upload), show a clear error state
- The messaging should communicate failure honestly -- this IS an error, and the user should know it
- No silent blank pages under any circumstance

Both states need the user to see content when content exists. The key principle: **if content exists anywhere in the system, show it.** The architect and designer decide how.

## Key Interactions

### 1. Investigation: Characterize Why Codex Sessions Fail Detection

Before writing any fix, the failing fixture (`fixtures/failing-session.cast`) must be analyzed to understand its signal profile. What timing patterns does it exhibit? What escape sequences appear? Where would a human place section boundaries? This investigation directly informs which detection heuristics to add or adjust. Without it, any server fix is guesswork.

### 2. Server Detects Sections in Previously-Failing Sessions

After the detection improvements, re-processing `fixtures/failing-session.cast` produces meaningful section boundaries. The sections correspond to logical units of work in the session -- not perfect, but useful. The user can browse and fold the session the same way they browse Claude Code sessions.

### 3. Upload Completes, Zero Sections -- User Still Sees Content

For sessions where even the improved detector finds nothing, the client shows the session content rather than a blank page. The user understands that section boundaries weren't found but can still read and scroll through their session.

### 4. Processing Fails -- User Sees What's Available

When the pipeline fails (`detection_status: 'failed'`), the client shows whatever content exists with an honest error message. If nothing exists, a clear error state. No silent blank pages.

### 5. Session List Shows No False Alarms

Zero-section sessions appear as normal sessions in the list view. The user discovers the unsectioned state only when they open the session. Zero sections is a limitation, not an error.

## Opportunities

**1. Adaptive detection thresholds.** Rather than fixed timing thresholds tuned to Claude Code, the detector could analyze the session's timing distribution first and set thresholds relative to the median/mean. This makes detection inherently format-agnostic.

**2. Raw content as the universal fallback.** The client-side pattern established here -- "always show the snapshot when sections fail" -- becomes the platform's general contract for any future processing failure.

Further opportunities (confidence scoring, manual section marking) are tracked in VISIONBOOK.md.

## Constraints

- **Existing design system:** All visual treatment must use tokens from `design/styles/`. No new colors, no custom components outside the system.
- **Existing data model:** Sessions already store a full snapshot and a section count. No schema migration needed -- the data to drive both fixes already exists.
- **Vue 3 + existing component structure:** `SessionContent.vue`, `TerminalSnapshot.vue`, and `SectionHeader.vue` are the rendering primitives. The client fix works within this component hierarchy.
- **Single-pass pipeline architecture:** The session pipeline streams events through the VT engine and detector simultaneously. Detection improvements must work within this streaming model, not require a second pass.
- **Backward compatibility:** Existing Claude Code sessions must continue to detect the same boundaries. Detection improvements add sensitivity to new patterns without breaking existing ones.

## Out of Scope

- Virtual scrolling for large unsectioned sessions (already tracked as a future MVP item)
- Manual section marking UI
- Session re-processing triggers from the client UI
- Changes to the upload flow or pipeline architecture
- Rewriting the pipeline to multi-pass (improvements work within single-pass streaming)
- Full format-specific detection profiles (this fix makes the existing detector more general, not format-dispatched)

## Success Criteria

1. **The failing fixture produces meaningful sections.** Re-processing `fixtures/failing-session.cast` through the improved detector yields a non-zero number of section boundaries that correspond to logical units in the session. This is the primary success measure.
2. **Existing sessions are not regressed.** Claude Code sessions continue to produce the same (or better) section boundaries. No existing test breaks.
3. **Zero-section sessions render their full content.** When a session genuinely has zero detected sections but has a valid snapshot, the client shows the snapshot as a continuous document with an informational banner -- not a blank page.
4. **Failed sessions show error state with available content.** When `detection_status` is `'failed'`, the client shows an error banner plus whatever content exists (snapshot if available), or a clear error message if nothing exists. No silent blank pages.
5. **The fix is format-general, not format-specific.** Detection improvements work by being more sensitive to diverse signals, not by special-casing Codex.

---
**Sign-off:** Pending
