# Requirements - RAGTS MVP v2

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Draft

## 1. MVP v2 Scope

**Goal:** Fix the foundational rendering problem — make RAGTS correctly display real recorded agent sessions.

**Critical Findings from Real Data:**
- **83% of sessions have zero markers** — MVP v1's fold/unfold UX is useless for most real sessions
- **Sessions are massive** — Up to 207MB (199K lines), median 1-5MB, 10 sessions exceed 50MB
- **Sessions are agent-typed** — Organized by agent (claude/, gemini/, codex/, echo/)
- **MVP v1 loads entire files into memory** — This crashes on real data
- **CRITICAL: MVP v1 rendering is fundamentally broken for real TUI sessions** — Real sessions are recordings of TUI applications (Claude Code, Codex, Gemini CLI) that emit cursor movement, screen clearing, alternate screen buffers, and in-place updates. MVP v1 strips all of this, producing garbage output. The `anser` library only handles ANSI SGR (colors) — not terminal state operations.

**MVP v2 Scope (this branch):**
1. **Correct terminal rendering** — Replace the broken strip-and-split pipeline with a proper terminal emulator that handles TUI output
2. **Section detection for markerless sessions** — Detect structural boundaries in TUI output as fold points

**Deferred to MVP v3 (follow-up branch `feat/mvp-v3`):**
The following features were originally scoped for MVP v2 but are deferred because correct rendering is the prerequisite. They are fully specified in Section 18 of this document so the follow-up branch can start immediately.
3. ~~Scale handling~~ — Virtual scrolling + server-side pagination/lazy loading
4. ~~Agent metadata + search~~ — Organize sessions by agent type, search/filter
5. ~~Increased upload limit~~ — 250MB
6. ~~Edit session metadata~~ — PUT endpoint for filename/agent type

**Explicitly OUT of scope (not in v2 or v3):**
- AGR transform integration (deferred to future iteration)
- Tool call detection (requires AGR)
- Folders/workspaces (deferred)
- Curation workflow (still deferred from MVP v1)
- Authentication/multi-user (still deferred from MVP v1)
- Retrieval API/MCP server (still deferred from MVP v1)

**Why this split:** Correct rendering is the foundation. Pagination, search, and metadata are useless if the session output is garbage. Solving the terminal emulation problem first unblocks everything else.

## 2. Context: What Changed Since MVP v1

MVP v1 shipped with:
- Upload .cast files
- Browse as vertical scrolling documents
- Fold/unfold via asciicast v3 markers (default collapsed)
- SQLite + filesystem storage
- Hono backend, Vue 3 frontend

**What MVP v1 cannot handle:**
- **BROKEN: TUI session rendering** — Real sessions are TUI application recordings (Claude Code, Codex, Gemini CLI). They emit cursor movement (`\x1b[nA/B/C/D`), screen clearing (`\x1b[2J`), cursor positioning (`\x1b[row;colH`), alternate screen buffer (`\x1b[?1049h`), and in-place updates. MVP v1's pipeline (concatenate output → split on `\n` → strip cursor codes → render with anser) produces garbage. The `AnsiLine.vue` component explicitly strips all non-SGR escape sequences with a comment "for MVP."
- Sessions without markers (83% of real data) render as walls of text
- Large sessions (>50MB, up to 207MB) crash or hang
- No way to organize or search sessions
- Upload limit too restrictive (50MB)

**MVP v2 fixes the rendering problem. MVP v3 fixes the rest.**

### The Rendering Problem in Detail

The current pipeline:
```
.cast file → parse NDJSON → extract "o" events → concatenate data → split on \n → strip non-SGR codes → anser (colors) → HTML spans
```

This works for **simple CLI output** (the `fixtures/sample.cast` demo file) but fails for **TUI applications** because:
1. TUI apps redraw the screen in-place using cursor positioning
2. Progress bars, status lines, and interactive elements overwrite previous content
3. Alternate screen buffers contain transient UI that shouldn't appear in output
4. The "split on newline" approach doesn't account for cursor-based line addressing

What's needed: a **terminal emulator** that processes the event stream as a state machine and produces the correct rendered output at each point in time.

### Architect Research Required

The Architect must evaluate rendering approaches before designing the implementation. Key options:

1. **asciinema-player** — The official asciinema player uses a Rust/WASM terminal emulator. Research whether its rendering engine can be extracted or adapted to produce static document output (not timeline playback). This could serve as the foundation for RAGTS's own session browser. The Architect should study the asciinema-player source code deeply.

2. **xterm.js** — Full VT-compatible terminal emulator for browsers. Could process events per section and extract the final buffer state as static HTML. Mature and battle-tested, but designed for live terminals.

3. **Custom terminal state machine** — Build minimal cursor tracking + screen buffer. Full control but high implementation risk (escape codes are notoriously subtle).

The Architect should recommend which approach to take, with a proof-of-concept against the reference session files.

## 3. Functional Requirements (MVP v2 Scope)

### FR-1: Correct Terminal Rendering

**User Story:** As a user viewing any recorded session (including TUI applications like Claude Code, Codex, or Gemini CLI), I see the correct terminal output as it would have appeared on screen, not garbage from stripped escape codes.

**Acceptance Criteria:**
- Terminal output rendered using a proper terminal emulator (not just ANSI color parsing)
- Cursor movement, screen clearing, in-place updates processed correctly
- Alternate screen buffer content handled appropriately (Architect to decide: show, hide, or collapse)
- Existing simple CLI sessions (like `fixtures/sample.cast`) continue to render correctly
- ANSI colors (16, 256, true color), bold, dim, italic, underline still supported
- Unknown/unsupported escape sequences gracefully ignored

**Reference sessions to test against** (located at `~/recorded_agent_sessions/`):
- `claude/agnt-ses-rec_260203_171636.cast` — 6.6MB, Claude Code TUI
- `codex/codex-pattern-analysis.cast` — 4.3MB, Codex TUI
- `gemini/aggressive-terminal-noise-reduction.cast` — 207MB, Gemini CLI (stress test)
- `claude/fix-grid-field-type-batch-update.cast` — 13MB, 4 markers (hybrid)
- `fixtures/sample.cast` — Simple CLI output (regression test)

**Architect Research Deliverable:**
The Architect must evaluate and recommend a rendering approach. Options to research:
1. **asciinema-player engine** — Extract/adapt the Rust/WASM terminal emulator from asciinema-player to produce static document output. Study the source deeply. Could RAGTS build its own session browser on this foundation?
2. **xterm.js** — Use as a processing engine to replay events and extract rendered buffer per section
3. **Custom terminal state machine** — Minimal implementation with cursor tracking and screen buffer

The recommendation must include a proof-of-concept tested against the reference sessions above.

**Performance:**
- Rendering pipeline must handle sessions up to 200K events
- First visible output must appear within 2 seconds for any session size
- Rendering should be incremental where possible (don't block on processing entire file)

### FR-2: Auto-Detect Section Boundaries

**User Story:** As a user viewing a markerless session, I can collapse and expand sections based on detected structural boundaries so I can navigate the session even without explicit markers.

**Critical Context — Real Session Data:**
Analysis of 81 production sessions reveals that the vast majority are **TUI application recordings** (Claude Code, OpenAI Codex, Gemini CLI), NOT traditional shell sessions. The terminal output is heavily escape-coded with box-drawing characters, cursor movements, screen redraws, and interactive UI elements. **Shell prompt regex detection (e.g., matching `$ `) will not work** for this data and must NOT be the detection approach.

**Reference sessions for Architect analysis** (located at `~/recorded_agent_sessions/`):
- `claude/agnt-ses-rec_260203_171636.cast` — 6.6MB, 34K lines, markerless Claude Code TUI session
- `codex/codex-pattern-analysis.cast` — 4.3MB, 10K lines, markerless Codex TUI session
- `gemini/aggressive-terminal-noise-reduction.cast` — 207MB, 199K lines, markerless Gemini CLI session (largest)
- `claude/fix-grid-field-type-batch-update.cast` — 13MB, 30K lines, 4 markers (hybrid example)
- `claude/extraction-pipeline-config-migration-overhaul.cast` — 47MB, 175K lines, 12 markers (large hybrid)

The Architect MUST analyze these reference sessions to design a detection algorithm that works with real TUI output, not hypothetical shell prompts.

**Acceptance Criteria:**
- System detects structural boundaries in terminal output as section fold points
- Detection algorithm designed by Architect based on analysis of real production sessions (see reference files above)
- Auto-detected sections behave identically to marker-based sections (collapse/expand, visual indicator)
- **Default state: auto-detected sections collapsed** (same as markers)
- Sessions WITH markers: markers take precedence; auto-detection fills unmarked regions
- Hybrid sessions (some markers, mostly unmarked): both systems coexist
- Detection happens server-side during session ingestion (stored in DB)
- Re-detection can be triggered manually if detection logic improves

**Edge Cases:**
- Session with no detectable boundaries: falls back to rendering entire session as single expanded block
- Very long output between boundaries (>10k events): still treat as single section
- Very short sessions (<100 events): skip detection, render as single block

**Performance:**
- Detection must complete in <10 seconds for sessions up to 200K events
- Detection runs asynchronously during upload, does not block upload completion

**Detection Algorithm:**
- **NOT prescribed here** — the Architect must analyze the reference session files and design an appropriate algorithm
- The PO explicitly rejects regex-based shell prompt detection as the primary approach
- Possible directions the Architect should explore (not exhaustive): timing gaps between events, ANSI screen clear sequences, TUI redraw patterns, output volume patterns — but the real data must drive the decision
- Algorithm design is an **open question for the Architect** (see Section 13)

### Deferred to MVP v3

The following functional requirements are **fully specified in Section 18** and will be implemented on branch `feat/mvp-v3` after MVP v2 ships:
- Server-side pagination for large sessions
- Virtual scrolling integration
- Agent type metadata
- Search and filter sessions
- Increased upload limit (250MB)
- Edit session metadata

## 4. Non-Functional Requirements (MVP v2 Scope)

### NFR-1: Rendering Correctness

**Requirements:**
- TUI session output rendered correctly (cursor movement, screen clearing, in-place updates)
- Simple CLI output continues to render correctly (backward compatible)
- ANSI colors preserved (16, 256, true color)

**Acceptance Criteria:**
- Reference TUI sessions from `~/recorded_agent_sessions/` render without garbage output
- `fixtures/sample.cast` still renders correctly (regression test)
- Visual comparison: rendered output matches what would appear in a real terminal

### NFR-2: Performance

**Requirements:**
- Session detail view first paint in <2 seconds for sessions up to 50MB
- Fold/unfold completes in <200ms (same as MVP v1)
- Detection completes in <10 seconds for sessions up to 200K events

**Acceptance Criteria:**
- No UI blocking during rendering
- Detection failures do not block upload

### NFR-3: Backward Compatibility

**Requirements:**
- Existing MVP v1 sessions continue to work
- Sessions with markers: markers take precedence over auto-detection
- API breaking changes are acceptable (no external consumers)

**Acceptance Criteria:**
- Migration script updates schema without data loss
- Old sessions display correctly with new rendering pipeline

## 5. Coordinate System Definition

**CRITICAL: "Event index" is the canonical coordinate system throughout MVP v2.**

A `.cast` file is NDJSON: line 1 is the header, lines 2+ are events. Each event has a type (`"o"` for output, `"m"` for marker, etc.). The coordinate system:

- **Event index** — 0-indexed position in the events array (excluding the header). Event 0 is the first event after the header. This is used for:
  - Section boundaries (`start_event`, `end_event`)
  - Pagination offsets and limits
  - Marker positions (already stored as event indices in MVP v1)

- **NOT rendered output lines** — Concatenating output events and splitting on `\n` produces "rendered lines," but these are NOT used as coordinates. Rendered lines are a frontend concern only.

- `event_count` — Total number of events in the session (NDJSON lines minus 1 for the header). Used for pagination math and progress display.

This definition means: `GET /api/sessions/:id?offset=0&limit=1000` returns events 0-999, not "rendered lines 0-999."

## 6. Data Model Changes

### Updated SQLite Schema

**sessions table (updated):**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- nanoid (unchanged)
  filename TEXT NOT NULL,           -- Original uploaded filename
  filepath TEXT NOT NULL UNIQUE,    -- Relative path in storage directory
  size_bytes INTEGER NOT NULL,
  marker_count INTEGER DEFAULT 0,   -- Count of explicit markers (unchanged)
  uploaded_at TEXT NOT NULL,        -- ISO 8601 timestamp
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  -- NEW FIELDS for MVP v2
  agent_type TEXT,                  -- Agent type: claude, gemini, codex, echo, other (nullable)
  event_count INTEGER,              -- Total event count (NDJSON lines minus header)
  detected_sections_count INTEGER DEFAULT 0,  -- Count of auto-detected boundaries
  detection_status TEXT DEFAULT 'pending'     -- pending, completed, failed
);
```

**sections table (NEW):**
```sql
CREATE TABLE sections (
  id TEXT PRIMARY KEY,              -- nanoid
  session_id TEXT NOT NULL,         -- Foreign key to sessions.id
  type TEXT NOT NULL,               -- 'marker' or 'detected'
  start_event INTEGER NOT NULL,     -- 0-indexed event where section starts
  end_event INTEGER,                -- Event where section ends (null = EOF)
  label TEXT,                       -- Marker text or detected label
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);
```

**Indexes (NEW):**
```sql
CREATE INDEX idx_sessions_agent_type ON sessions(agent_type);
CREATE INDEX idx_sessions_filename ON sessions(filename);  -- For search
CREATE INDEX idx_sessions_uploaded_at ON sessions(uploaded_at DESC);  -- Already exists from v1
CREATE INDEX idx_sections_session_id ON sections(session_id);
CREATE INDEX idx_sections_start_event ON sections(session_id, start_event);  -- For chunk boundary alignment
```

**Migration Notes:**
- Existing sessions: `agent_type` defaults to NULL
- Existing sessions: `event_count` calculated during migration (count NDJSON lines minus 1 — fast, no parsing needed, just count newlines)
- Existing sessions: `detection_status` defaults to 'pending', background job re-processes
- Existing markers extracted to `sections` table during migration (markers already use event indices in MVP v1, so mapping is direct)
- **Marker extraction from MVP v1**: Current code parses markers on-the-fly from .cast files. Migration must read each existing session's .cast file, extract markers using existing `extractMarkers()`, and insert them into the `sections` table with `type='marker'`. This is a one-time migration, after which markers are served from DB, not re-parsed.

## 7. API Changes (MVP v2 Scope)

MVP v2 API changes are minimal — focused on the rendering pipeline replacement. The existing endpoints remain but the session detail response may change shape based on the Architect's rendering approach decision.

**Key changes:**
- `GET /api/sessions/:id` response `content` field will change format based on the new rendering pipeline (Architect to define)
- Sections stored in DB may be included in the response (see data model)
- POST `/api/sessions/:id/redetect` — NEW endpoint to re-run section detection

**Full API spec for pagination, search/filter, agent type, and edit endpoints is in Section 18 (MVP v3).**

## 8. Testing Requirements (MVP v2 Scope)

### Unit Tests
- Terminal rendering engine correctness (TUI escape sequences processed correctly)
- Section boundary detection algorithm (against reference sessions)
- Section repository CRUD
- Migration script (marker extraction, event_count calculation)

### Integration Tests
- Upload session → rendering produces correct output
- Upload TUI session → detected sections created
- Existing MVP v1 sessions render correctly after migration

### Visual Regression Tests
- Compare rendered output of reference sessions against expected terminal state
- `fixtures/sample.cast` renders identically to MVP v1 (regression)

**Coverage target:** 80%+ for backend rendering and detection logic

## 9. Success Criteria (MVP v2)

The MVP v2 is considered successful if:

1. TUI sessions (Claude Code, Codex, Gemini CLI) render correctly — cursor movement, screen clearing, in-place updates produce the right output
2. Simple CLI sessions continue to render correctly (backward compatible)
3. Markerless sessions have auto-detected section boundaries for fold/unfold
4. Existing MVP v1 sessions with markers continue to work
5. ANSI colors still preserved
6. Detection runs async after upload, doesn't block

## 10. Acceptance Checklist (MVP v2)

**Terminal Rendering:**
- [ ] TUI sessions render correctly (test against reference sessions)
- [ ] Cursor movement processed (in-place updates show final state, not all intermediate states)
- [ ] Screen clearing handled appropriately
- [ ] Simple CLI sessions still render correctly (regression)
- [ ] ANSI colors (16, 256, true color) preserved
- [ ] Bold, dim, italic, underline styles preserved

**Section Detection:**
- [ ] Markerless sessions have auto-detected section boundaries
- [ ] Detected sections collapse/expand correctly
- [ ] Sessions with markers: markers take precedence
- [ ] Detection runs asynchronously after upload
- [ ] Detection completes in <10 seconds for 200K event session
- [ ] Re-detection endpoint works

**Backward Compatibility:**
- [ ] Existing MVP v1 sessions render correctly after migration
- [ ] Markers extracted to sections table during migration
- [ ] event_count populated for existing sessions

**Testing:**
- [ ] Unit tests cover rendering engine (80%+ coverage)
- [ ] Integration tests cover upload → render → detect flow
- [ ] Visual regression tests against reference sessions

## 11. Dependencies and Risks

**Dependencies (Architect to finalize):**
- Terminal emulator library (xterm.js, asciinema-player engine, or custom) — Architect research required
- Existing dependencies preserved (Hono, Vue 3, better-sqlite3, anser may be replaced)

**Technical Risks:**

1. **Terminal emulator complexity:** Rendering TUI output correctly is non-trivial. Escape code handling has many edge cases.
   - Mitigation: Use battle-tested library (xterm.js or asciinema-player) rather than building from scratch
   - Architect must provide proof-of-concept against reference sessions

2. **Performance of terminal emulation:** Processing 200K events through a terminal emulator may be slow
   - Mitigation: Process per-section rather than entire file; incremental rendering

3. **Detection accuracy for TUI output:** Auto-detection algorithm design is the hardest open problem
   - Mitigation: Architect must analyze real data first; accept imperfect detection for MVP v2

## 12. Open Questions (for Architect)

- **CRITICAL — Rendering approach:** Evaluate xterm.js, asciinema-player engine, and custom terminal state machine. Research asciinema-player source deeply — can its Rust/WASM terminal emulator be extracted to produce static document output? Could RAGTS build its own session browser on this foundation?
- **CRITICAL — Detection algorithm:** Real sessions are TUI recordings, not shell sessions. Analyze reference files from FR-1. Design detection that works with real TUI output.
- **Migration strategy:** How to extract inline markers to sections table. How to calculate event_count for large files.
- **Rendering architecture:** Does the terminal emulator run server-side (pre-render) or client-side (browser)? Trade-offs for each.
- **Section nesting:** If detected sections overlap with marker sections, which takes precedence? (Decision: markers always win)

## 13. Next Steps

Hand off to **Architect** for:
- **Rendering engine research** — Evaluate xterm.js, asciinema-player (study source deeply), and custom approaches. Test against reference sessions. Provide proof-of-concept.
- **Detection algorithm design** — Analyze reference session files. Real data is TUI output, not shell sessions.
- **Migration strategy** — Marker extraction, event_count calculation

Then hand off to **Implementer** for execution.

## 14. Out of Scope (Explicitly Deferred)

These are NOT included in MVP v2 (some are in MVP v3, see Section 18):

- Server-side pagination (MVP v3)
- Virtual scrolling (MVP v3)
- Agent type metadata (MVP v3)
- Search and filter (MVP v3)
- Increased upload limit (MVP v3)
- Edit session metadata (MVP v3)
- AGR transform integration
- Folders/workspaces
- Multi-user authentication
- Curation workflow
- Retrieval API / MCP server

---

## 18. Deferred Features — MVP v3 Specification

The following features were originally scoped for MVP v2 but are deferred to branch `feat/mvp-v3` because correct terminal rendering (MVP v2) is the prerequisite. These are **fully specified** so MVP v3 can start immediately after MVP v2 ships.

### MVP v3 Prerequisites
- MVP v2 must be merged (correct terminal rendering + section detection)
- The rendering approach chosen in MVP v2 determines how pagination and virtual scrolling integrate

### FR-v3-1: Server-Side Pagination for Large Sessions

**User Story:** As a user viewing a massive session (>50K events), the system serves content in chunks so that rendering remains responsive and does not crash the browser.

**Acceptance Criteria:**
- Session detail endpoint supports pagination: `GET /api/sessions/:id?offset=0&limit=1000`
- Default chunk size: 1000 events (configurable via env var)
- Response includes: chunk content, total event count, current offset, has_more boolean
- Frontend lazy-loads chunks as user scrolls (infinite scroll pattern)
- **Chunks are fixed-size event ranges.** Chunks do NOT align with section boundaries.
- First chunk loads immediately (<500ms)

**Edge Cases:**
- User scrolls very fast: load multiple chunks in parallel (max 3 simultaneous)
- Session smaller than chunk size: serve entire session in single response
- Section spans multiple chunks: frontend loads additional chunks as needed

**Performance:**
- First paint in <1 second for any session size
- Browser memory stays under 500MB for 200MB session

### FR-v3-2: Virtual Scrolling Integration

**User Story:** As a user viewing a large session, only the visible viewport is rendered for performance.

**Acceptance Criteria:**
- Use `@tanstack/vue-virtual` (NEW dependency to add)
- Only visible rows rendered in DOM (viewport + buffer zone)
- Scroll position preserved when expanding/collapsing sections
- Works with variable-height rows

**Performance:**
- 100K+ events: smooth 60fps scrolling
- Expand/collapse: <200ms

### FR-v3-3: Agent Type Metadata

**User Story:** As a user, I can tag sessions with agent type (claude, gemini, codex, echo, other).

**Acceptance Criteria:**
- Upload form includes agent type dropdown (default: Claude)
- Agent type stored in DB (`agent_type` column)
- Agent type badges on session list and detail view
- Agent type editable after upload (PUT endpoint)
- Optional (nullable)

### FR-v3-4: Search and Filter Sessions

**User Story:** As a user with many sessions, I can search by filename and filter by agent type.

**Acceptance Criteria:**
- Search box: case-insensitive filename substring match
- Filter by agent type: multi-select with counts per type
- AND logic between search and filter
- Debounced (300ms), URL-persisted query params
- <500ms response for 1000 sessions

### FR-v3-5: Increased Upload Limit

**Acceptance Criteria:**
- Per-file limit increased to 250MB (from 50MB)
- Client-side upload progress indicator (Hono limitation)
- Configurable via `MAX_FILE_SIZE_MB=250`

### FR-v3-6: Edit Session Metadata

**Acceptance Criteria:**
- PUT `/api/sessions/:id` endpoint
- Edit filename and agent type after upload
- Modal/inline form on session detail view
- 404 for non-existent session
- Partial updates allowed

### MVP v3 Data Model

See Section 6 of this document for the full schema (sessions table additions, sections table, indexes). The data model is shared between MVP v2 and v3 — MVP v2 creates the schema, MVP v3 adds the agent_type usage and search/filter queries.

### MVP v3 API

Full API specifications are defined in the original Section 6 of this document (before the scope split). Key endpoints:
- `POST /api/upload` — adds `agent_type` field
- `GET /api/sessions` — changes from array to `{ sessions, total, offset, limit }`, adds search/filter params
- `GET /api/sessions/:id` — adds pagination params, sections array
- `PUT /api/sessions/:id` — NEW
- `POST /api/sessions/:id/redetect` — NEW (may already exist from MVP v2)

### MVP v3 Configuration

```bash
MAX_FILE_SIZE_MB=250               # Upload limit (was 50MB)
CHUNK_SIZE=1000                    # Pagination chunk size (events)
VIRTUAL_SCROLL_BUFFER=10           # Rows to buffer above/below viewport
```

---

**END OF REQUIREMENTS.md**
