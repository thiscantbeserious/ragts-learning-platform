# Stories: Fix Empty Session Display -- Server Detection + Client Fallback

> When uploading certain session formats (e.g. Codex, Gemini CLI), the section detector returns zero boundaries and the client shows a blank page despite valid session content existing.

## Stories

### Platform user (uploading from a non-Claude-Code tool)

As a platform user uploading a Codex or Gemini CLI session, I want the section detector to find meaningful boundaries in my session so that I can browse and fold the content the same way I do with Claude Code sessions.

Acceptance signal: Re-processing `fixtures/failing-session.cast` through the updated detector yields a non-zero count of section boundaries that correspond to recognizable units of work in the session.

### Platform user (zero sections detected)

As a platform user whose session completed processing with no sections found, I want to see my full session content with a clear informational message rather than a blank page so that I know the upload worked and can still read my session.

Acceptance signal: When `detection_status` is `'completed'` and `detected_sections_count` is `0`, the client renders the session snapshot as a continuous document with an informational banner -- no blank terminal chrome.

### Platform user (processing failed)

As a platform user whose session processing failed entirely, I want to see whatever content is available alongside an honest error message so that I understand what happened and am not left wondering whether my upload was lost.

Acceptance signal: When `detection_status` is `'failed'`, the client shows an error banner plus the snapshot if one exists; if no snapshot exists, a clear error state is shown. A blank page is never rendered under this condition.

### Platform user (session list)

As a platform user browsing the session list, I want zero-section sessions to appear as normal entries rather than as warnings or errors so that I am not alarmed before I even open a session where the limitation is minor.

Acceptance signal: A session with `detected_sections_count: 0` and `detection_status: 'completed'` appears in the session list without a visible error indicator; the unsectioned state is revealed only on open.

### Self-hosting operator

As a self-hosting operator, I want the detection pipeline to handle diverse terminal session formats without manual configuration so that users on my deployment can upload recordings from any tool without needing operator intervention.

Acceptance signal: The detection improvements are format-general (not a Codex-specific code path), confirmed by the fixture test passing with no new per-tool configuration knobs exposed.

### Developer extending the platform

As a developer adding support for a new session tool or heuristic, I want the client's fallback contract ("always show the snapshot when sections fail") to be the established platform pattern so that any new processing failure mode is automatically handled without additional client work.

Acceptance signal: The client fallback paths (State A and State B) are implemented as a reusable rendering contract tied to `detection_status` + `detected_sections_count`, not as one-off conditionals specific to this bug.

## Out of Scope

- Virtual scrolling for large unsectioned sessions
- Manual section marking UI
- Session re-processing triggers from the client
- Changes to the upload flow or pipeline architecture
- Full format-specific detection profiles (Codex special-casing)
- Rewriting the pipeline to multi-pass

---
**Sign-off:** Pending
