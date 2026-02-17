# Requirements - RAGTS MVP v2

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Draft

## 1. MVP v2 Scope

**Goal:** Make RAGTS usable with real recorded agent sessions based on analysis of 81 production sessions.

**Critical Findings from Real Data:**
- **83% of sessions have zero markers** - MVP v1's fold/unfold UX is useless for most real sessions
- **Sessions are massive** - Up to 207MB (199K lines), median 1-5MB, 10 sessions exceed 50MB
- **Sessions are agent-typed** - Organized by agent (claude/, gemini/, codex/, echo/)
- **MVP v1 loads entire files into memory** - This crashes on real data

**MVP v2 delivers:**
1. **Auto-structure for markerless sessions** - Detect command boundaries as fold points
2. **Scale handling** - Virtual scrolling + server-side pagination/lazy loading for massive sessions
3. **Agent metadata + search** - Organize sessions by agent type, search/filter by filename and metadata
4. **Increased upload limit** - 250MB (covers all real sessions)

**Explicitly OUT of scope:**
- AGR transform integration (deferred to future iteration)
- Tool call detection (requires AGR)
- Folders/workspaces (deferred)
- Curation workflow (still deferred from MVP v1)
- Authentication/multi-user (still deferred from MVP v1)
- Retrieval API/MCP server (still deferred from MVP v1)

This is a significant iteration focused on making the browsing experience work with real, large, markerless sessions.

## 2. Context: What Changed Since MVP v1

MVP v1 shipped with:
- Upload .cast files
- Browse as vertical scrolling documents
- Fold/unfold via asciicast v3 markers (default collapsed)
- SQLite + filesystem storage
- Hono backend, Vue 3 frontend

**What MVP v1 cannot handle:**
- Sessions without markers (83% of real data) render as walls of text
- Large sessions (>50MB, up to 207MB) crash or hang
- No way to organize or search sessions
- Upload limit too restrictive (50MB)

**MVP v2 fixes these problems.**

## 3. Functional Requirements

### FR-1: Auto-Detect Section Boundaries

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

### FR-2: Server-Side Pagination for Large Sessions

**User Story:** As a user viewing a massive session (>50K events), the system serves content in chunks so that rendering remains responsive and does not crash the browser.

**Acceptance Criteria:**
- Session detail endpoint supports pagination: `GET /api/sessions/:id?offset=0&limit=1000`
- Default chunk size: 1000 events (configurable via env var)
- Response includes:
  - Chunk content (events 0-999, or requested range)
  - Total event count
  - Current offset
  - Has more data (boolean)
- Frontend lazy-loads chunks as user scrolls (infinite scroll pattern)
- Fold/unfold state preserved across chunk boundaries
- **Chunks are fixed-size event ranges** (e.g., events 0-999, 1000-1999). Chunks do NOT attempt to align with section boundaries — this avoids combinatorial complexity. Sections and chunks are independent coordinate systems that the frontend overlays.
- First chunk loads immediately (<500ms)
- Subsequent chunks load on-demand as user approaches end of current chunk

**Edge Cases:**
- User scrolls very fast: load multiple chunks in parallel (max 3 simultaneous requests)
- User jumps to bottom: load final chunk directly
- Session smaller than chunk size: serve entire session in single response (no pagination overhead)
- Section spans multiple chunks: frontend loads additional chunks as needed when user expands a section that crosses chunk boundaries

**Performance:**
- First paint (initial chunk) must happen in <1 second for any session size
- Chunk loading must not block UI (async, non-blocking)
- Browser memory usage must stay under 500MB for 200MB session (only loaded chunks in memory)

### FR-3: Virtual Scrolling Integration

**User Story:** As a user viewing a large session with many sections, only the visible viewport is rendered so that the browser remains responsive even with 100K+ events loaded.

**Acceptance Criteria:**
- Use `@tanstack/vue-virtual` (decided in MVP v1 ADR but not yet installed — must be added as dependency in MVP v2)
- Virtual scrolling applies to the session detail view
- Only visible rows rendered in DOM (viewport + buffer zone)
- Scroll position preserved when expanding/collapsing sections
- Smooth scrolling (no jank when scrolling through large sections)
- Works correctly with variable-height rows (sections vary in size)

**Edge Cases:**
- User expands section with 10K events: virtual scrolling keeps rendering smooth
- User collapses large section: scroll position adjusts to prevent jump
- Search/jump to event: virtual scroller scrolls to target position

**Performance:**
- Rendering 100K events session: smooth 60fps scrolling
- Expand/collapse: completes in <200ms (same as MVP v1 NFR)

### FR-4: Agent Type Metadata

**User Story:** As a user uploading a session, I can specify the agent type (claude, gemini, codex, echo, other) so that sessions are organized by agent.

**Acceptance Criteria:**
- Upload form includes agent type dropdown:
  - Options: Claude, Gemini, Codex, Echo, Other (freeform text)
  - Default: Claude (most common in analyzed data)
- Agent type stored in DB (new `agent_type` column)
- Session list displays agent type badge next to each session
- Agent type shown in session detail view header
- Bulk operations: if uploading multiple files, user can set agent type once for all
- Agent type can be edited after upload (PUT endpoint)

**Validation:**
- Agent type is optional (can be null/empty)
- "Other" type allows freeform text (max 50 chars, alphanumeric + hyphen/underscore)

### FR-5: Search and Filter Sessions

**User Story:** As a user with many uploaded sessions, I can search by filename and filter by agent type so I can quickly find specific sessions.

**Acceptance Criteria:**
- Search box at top of session list (landing page)
- Search matches session filename (case-insensitive, substring match)
- Filter by agent type: multi-select dropdown or checkbox list
  - Show count per agent type (e.g., "Claude (34)", "Gemini (12)")
- Search and filter work together (AND logic)
- Results update in real-time as user types (debounced, 300ms)
- Empty results state: "No sessions match your search. Try different terms."
- Search query persists in URL (`?search=refactoring&agent=claude,gemini`)
- Clear search/filters button

**Performance:**
- Search/filter response in <500ms for 1000 sessions
- No full table scan - DB index on filename and agent_type (see data model)

**Edge Cases:**
- Search with special characters: sanitized, no SQL injection risk
- Filter with no agent type set (null values): include in "Other" category or separate "Unspecified" option

### FR-6: Increased Upload Limit

**User Story:** As a user with large sessions (>50MB), I can upload files up to 250MB so that all my real recorded sessions can be imported.

**Acceptance Criteria:**
- Per-file upload limit increased to 250MB (from 50MB in MVP v1)
- Configurable via env var: `MAX_FILE_SIZE_MB=250`
- **Client-side** upload progress indicator for large files (using `XMLHttpRequest.upload.onprogress` or fetch upload stream — Hono's server-side `parseBody()` does not expose progress events)
- Large file uploads do not timeout (adjust server request timeout)
- Validation error message if file exceeds limit: "File too large. Maximum size: 250MB. Consider processing with AGR to reduce size."

**Performance:**
- 100MB file upload completes in <30 seconds on typical connection
- Upload progress updates visually during upload (client-side, not server-side)

### FR-7: Edit Session Metadata

**User Story:** As a user, I can edit session metadata (filename, agent type) after upload so I can correct mistakes or add missing information.

**Acceptance Criteria:**
- Session detail view includes "Edit" button
- Edit modal/inline form with fields:
  - Filename (text input)
  - Agent type (dropdown, same as upload)
- Save button commits changes (PUT endpoint)
- Cancel button discards changes
- Success message: "Session updated."
- Changes reflected immediately in UI (no page reload)

**Validation:**
- Filename required, max 255 chars
- Agent type optional

## 4. Non-Functional Requirements

### NFR-1: Performance

**Requirements:**
- Session list page loads in <500ms (all sessions with metadata)
- Session detail view first paint in <1 second (first chunk + structure)
- Search/filter response in <500ms for up to 1000 sessions
- Chunk loading in <500ms per chunk
- Fold/unfold completes in <200ms (same as MVP v1)
- Browser memory usage stays under 500MB even for 200MB sessions

**Acceptance Criteria:**
- Performance tests pass for dataset of 100 sessions (mix of sizes: 10x <1MB, 50x 1-10MB, 30x 10-50MB, 10x 50-250MB)
- No UI blocking during scroll or chunk load
- Virtual scrolling maintains 60fps

### NFR-2: Data Integrity

**Requirements:**
- Command boundary detection stored durably in DB
- Pagination chunk boundaries align on event boundaries (one event = one NDJSON line)
- Metadata edits are atomic (no partial updates)

**Acceptance Criteria:**
- SQLite transactions used for all writes
- Detection failures do not block upload (session saved, detection marked as failed, can retry)
- Chunk boundary calculation is deterministic (same session always chunks identically)

### NFR-3: Backward Compatibility

**Requirements:**
- Existing MVP v1 sessions (uploaded before v2) continue to work
- Sessions with markers: markers take precedence over auto-detection
- Sessions without agent type (old data): handled gracefully (show as "Unspecified")

**Acceptance Criteria:**
- Migration script updates schema without data loss
- Old sessions display correctly in new UI
- API breaking changes are acceptable where required (e.g., `GET /api/sessions` response shape changes from array to paginated object). There are no external consumers — only the RAGTS frontend.

### NFR-4: Scalability

**Requirements:**
- System handles 1000 uploaded sessions without performance degradation
- Session list pagination (not MVP v2 scope, but DB must support future pagination)

**Acceptance Criteria:**
- DB queries use indexes (no full table scans)
- Session list query returns in <500ms even with 1000 sessions

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

## 6. API Changes

### Updated Endpoints

#### POST /api/upload
**Request (multipart/form-data):**
- `file` (binary)
- `agent_type` (optional string)

**Response (201):**
```json
{
  "id": "abc123",
  "filename": "my-session.cast",
  "size_bytes": 123456,
  "event_count": 5420,
  "marker_count": 5,
  "detected_sections_count": 0,  // Pending detection
  "agent_type": "claude",
  "uploaded_at": "2026-02-17T10:30:00Z",
  "detection_status": "pending"
}
```

**Changes from v1:**
- Added `agent_type` field in request
- Added `event_count`, `detected_sections_count`, `agent_type`, `detection_status` in response

#### GET /api/sessions
**Request:**
- Query params:
  - `search` (optional): filename substring
  - `agent_type` (optional): comma-separated list (e.g., `claude,gemini`)
  - `offset` (optional, default 0): for future pagination
  - `limit` (optional, default 100): for future pagination

**Response (200):**
```json
{
  "sessions": [
    {
      "id": "abc123",
      "filename": "my-session.cast",
      "size_bytes": 123456,
      "event_count": 5420,
      "marker_count": 5,
      "detected_sections_count": 34,
      "agent_type": "claude",
      "uploaded_at": "2026-02-17T10:30:00Z",
      "detection_status": "completed"
    }
  ],
  "total": 1,
  "offset": 0,
  "limit": 100
}
```

**Changes from v1:**
- Added search and filter query params
- Added `event_count`, `detected_sections_count`, `agent_type`, `detection_status` to response objects
- Added `total`, `offset`, `limit` for pagination support

#### GET /api/sessions/:id
**Request:**
- Query params:
  - `offset` (optional, default 0): event index to start from
  - `limit` (optional, default 1000): number of events to return

**Response (200):**
```json
{
  "id": "abc123",
  "filename": "my-session.cast",
  "size_bytes": 123456,
  "event_count": 5420,
  "marker_count": 5,
  "detected_sections_count": 34,
  "agent_type": "claude",
  "uploaded_at": "2026-02-17T10:30:00Z",
  "detection_status": "completed",
  "content": {
    "version": 3,
    "width": 80,
    "height": 24,
    "events": [ /* NDJSON events for requested range */ ]
  },
  "sections": [
    {
      "id": "sec1",
      "type": "marker",
      "start_event": 0,
      "end_event": 120,
      "label": "Setup environment"
    },
    {
      "id": "sec2",
      "type": "detected",
      "start_event": 121,
      "end_event": 340,
      "label": "$ npm install"
    }
  ],
  "pagination": {
    "offset": 0,
    "limit": 1000,
    "total_events": 5420,
    "has_more": true,
    "next_offset": 1000
  }
}
```

**Changes from v1:**
- Added `offset` and `limit` query params
- Added `event_count`, `detected_sections_count`, `agent_type`, `detection_status` fields
- Added `sections` array (replaces inline marker detection in v1)
- Added `pagination` object
- `content.events` only includes events in requested range (not entire file)

#### PUT /api/sessions/:id
**NEW endpoint**

**Request (application/json):**
```json
{
  "filename": "updated-session.cast",
  "agent_type": "gemini"
}
```

**Response (200):**
```json
{
  "id": "abc123",
  "filename": "updated-session.cast",
  "agent_type": "gemini",
  "updated_at": "2026-02-17T11:00:00Z"
}
```

#### POST /api/sessions/:id/redetect
**NEW endpoint**

**Purpose:** Re-run command boundary detection (if detection logic improves or failed initially)

**Request:** Empty body

**Response (202 Accepted):**
```json
{
  "id": "abc123",
  "detection_status": "pending",
  "message": "Detection queued. Reload session to see results."
}
```

**Background Processing:**
- Detection runs asynchronously (in-process async job for MVP, no queue infrastructure needed)
- Status updates to 'completed' or 'failed' when done
- Frontend polls status or uses SSE (optional, defer if complex)

### Removed Endpoints
None. MVP v2 is additive.

## 7. UI/UX Requirements

### Updated Landing Page Layout

```
+--------------------------------------------------------+
|  RAGTS                               [Dark/Light toggle]
+--------------------------------------------------------+
|  Upload Session                                         |
|  [Drag & drop or click to select]                     |
|  Agent Type: [Claude v] (dropdown)                     |
+--------------------------------------------------------+
|  Search: [__________________] [x]                      |
|  Filter: [Agent Type v] (multiselect)                  |
|        [x] Claude (34)  [x] Gemini (12)  [ ] Codex (5) |
+--------------------------------------------------------+
|  Sessions (47 results)                                 |
|  +---------------------------------------------------+ |
|  | [Claude] 2026-02-17 10:30 | my-session.cast       | |
|  | 123 KB | 5 markers | 34 detected | 5420 events[>]| |
|  +---------------------------------------------------+ |
|  | [Gemini] 2026-02-16 14:22 | debug-run.cast        | |
|  | 456 KB | 12 markers | 0 detected | 12K events [>]| |
|  +---------------------------------------------------+ |
+--------------------------------------------------------+
```

**Changes from v1:**
- Agent type dropdown in upload form
- Search box and filter controls added
- Agent type badge on each session ([Claude], [Gemini], etc.)
- Session list shows `detected_sections_count` and `event_count`
- Result count displayed

### Updated Session Detail View Layout

```
+--------------------------------------------------------+
|  [< Back] my-session.cast            [Claude] [Edit]   |
|  123 KB | 5420 events | 5 markers | 34 auto-detected  |
+--------------------------------------------------------+
|  > Section: Setup environment          [marker]        | <- collapsed
|  v Section: $ npm install              [detected]      | <- expanded
|    $ npm install                                       |
|    npm notice created a lockfile as package-lock.json  |
|    added 142 packages in 8.3s                          |
|  > Section: $ npm test                 [detected]      |
|  > Section: Run build                  [marker]        |
+--------------------------------------------------------+
|                                [Load More (chunk 2/6)] | <- if paginated
+--------------------------------------------------------+
```

**Changes from v1:**
- Agent type badge and Edit button in header
- Section metadata shows `[marker]` or `[detected]` type
- Line count and detected section count in header
- "Load More" button or infinite scroll for large sessions

### Edit Modal/Form

```
+----------------------------------------+
|  Edit Session                      [x] |
+----------------------------------------+
|  Filename:                             |
|  [my-session.cast___________________]  |
|                                        |
|  Agent Type:                           |
|  [Claude                          v]   |
|                                        |
|          [Cancel]  [Save]              |
+----------------------------------------+
```

### Visual Design Updates

**Agent Type Badges:**
- Claude: Blue background, white text
- Gemini: Green background, white text
- Codex: Purple background, white text
- Echo: Orange background, white text
- Other: Gray background, white text
- Unspecified: Dashed gray border, gray text

**Section Type Indicators:**
- Marker sections: Solid colored header (same as MVP v1)
- Detected sections: Slightly desaturated color + `[detected]` label

**Search/Filter:**
- Search box: Standard input with search icon
- Filter: Dropdown or checkbox group, shows counts
- Active filters shown as removable pills below controls

## 8. Configuration

**Updated Env Vars:**
```bash
PORT=3000                          # HTTP port (unchanged)
DATA_DIR=/data                     # Storage root (unchanged)
MAX_FILE_SIZE_MB=250               # Upload limit (was 50MB)
NODE_ENV=production                # development | production (unchanged)

# NEW for MVP v2
CHUNK_SIZE=1000                    # Pagination chunk size (events)
DETECTION_TIMEOUT_MS=5000          # Max time for command detection per session
VIRTUAL_SCROLL_BUFFER=10           # Number of rows to buffer above/below viewport
```

## 9. Testing Requirements

### Unit Tests (Backend)

- Command boundary detection algorithm
  - Various shell prompt formats
  - Edge cases (no prompts, nested prompts, false positives)
- Pagination logic
  - Chunk boundary alignment with sections
  - First/last chunk edge cases
- Search and filter query builder
  - SQL injection prevention
  - Multiple filters combined
- Section repository CRUD
- Session metadata update logic

### Integration Tests (Backend)

- Upload with agent type → detection runs → sections created
- Session retrieval with pagination → correct chunks returned
- Search with multiple filters → correct results
- Edit session metadata → DB updated, response correct
- Re-run detection → old sections replaced, new sections created

### Unit Tests (Frontend)

- Virtual scrolling component with variable-height rows
- Search input debouncing (300ms)
- Filter checkbox state management
- Section expand/collapse with pagination

### E2E Tests

- Upload large session (>50MB) with agent type → detection completes → browse with pagination
- Upload markerless session → auto-detected sections appear
- Search by filename → filter by agent type → results update
- Open large session → scroll to bottom → chunks load lazily
- Expand/collapse detected sections → state persists across chunks
- Edit session metadata → changes saved and displayed

**Coverage target:** 80%+ for backend logic, 70%+ for frontend components (higher due to complexity)

## 10. Performance Testing

**Load Test Scenarios:**

1. **Large session browse:** Open 200MB session, measure:
   - Time to first paint
   - Memory usage during scroll
   - Chunk load latency

2. **Search with 1000 sessions:** Type search query, measure:
   - Response time (should be <500ms)
   - UI responsiveness during typing

3. **Concurrent uploads:** Upload 10 sessions simultaneously, measure:
   - Upload completion time
   - Detection queue backlog
   - System resource usage

**Acceptance Criteria:**
- All performance NFRs met (see NFR-1)
- No memory leaks during 10-minute scroll session
- No UI jank (frame drops) during search/filter

## 11. Migration Plan

**From MVP v1 to MVP v2:**

1. **Database migration:**
   - Add new columns to `sessions` table
   - Create `sections` table
   - Create indexes
   - Populate `event_count` for existing sessions (scan .cast files)
   - Set `agent_type` to NULL for existing sessions
   - Set `detection_status` to 'pending'

2. **Background detection:**
   - Trigger detection for all existing sessions
   - Run asynchronously, do not block startup
   - Log progress and failures

3. **Frontend migration:**
   - MVP v2 frontend fully replaces MVP v1 section rendering
   - No backward-compatible fallback needed — migration converts all existing data
   - Frontend always uses the `sections` array from API (never parses markers inline)

**Migration script design is an Architect responsibility** — the exact approach for extracting inline markers to the sections table, handling large files during event_count calculation, and running async detection on existing sessions should be specified in the ADR/PLAN.

## 12. Success Criteria

The MVP v2 is considered successful if:

1. A user can upload a 200MB markerless session
2. The session appears in the list with agent type and detected section count
3. Opening the session shows auto-detected command boundaries as collapsible sections
4. Scrolling through the session is smooth (60fps) with lazy-loaded chunks
5. Searching for a filename substring returns results in <500ms
6. Filtering by agent type updates the list immediately
7. Editing session metadata persists changes correctly
8. Browser memory stays under 500MB even with 200MB session open
9. All existing MVP v1 functionality (markers, ANSI colors, fold/unfold) continues to work

## 13. Open Questions (for Architect)

- **CRITICAL — Detection algorithm design:** Real sessions are TUI application recordings (Claude Code, Codex, Gemini CLI) with heavy escape codes, box-drawing, cursor movements, and screen redraws. Shell prompt regex will NOT work. The Architect must analyze the reference session files listed in FR-1 and design an algorithm that works with real TUI output. This is the hardest problem in MVP v2.
- **Migration strategy:** How to extract inline markers from existing .cast files into the new sections table. How to calculate event_count efficiently for large files (200MB+). Design of the async detection trigger for existing sessions.
- **Detection queue:** In-process async or separate worker process? (Recommend in-process for MVP v2, defer worker to future)
- **Virtual scrolling with sections:** How to calculate row heights for collapsed vs expanded sections? How does virtual scrolling interact with chunk loading?
- **Search index:** Add full-text search (SQLite FTS5) or stick with substring LIKE queries? (Recommend LIKE for MVP v2)
- **Polling vs SSE for detection status:** Frontend polls every 2 seconds, or use Server-Sent Events? (Recommend polling for simplicity)
- **Section nesting:** If detected sections overlap with marker sections, which takes precedence? (Decision: markers always win)
- **PUT /api/sessions/:id error handling:** 404 for non-existent session? Partial updates allowed (change only one field)?

## 14. Out of Scope (Explicitly Deferred)

These are NOT included in MVP v2:

- AGR transform integration (background optimization, silence removal)
- Tool call detection (requires AGR markers)
- Folders/workspaces for organizing sessions
- Multi-user authentication
- Curation workflow (annotations, tags beyond agent type)
- Retrieval API / MCP server for agents
- Session versioning (original vs transformed)
- Export sessions (HTML, PDF, markdown)
- Session comparison/diff
- Real-time session streaming
- Sharing sessions across users
- Retention policies / auto-archival
- Advanced search (full-text, semantic)
- Bulk operations (delete multiple, re-detect all)

These remain valid future features but are not necessary to solve the immediate problem: making RAGTS work with real recorded sessions.

## 15. Acceptance Checklist

Before declaring MVP v2 complete, verify:

**Upload & Detection:**
- [ ] User can upload a .cast file up to 250MB
- [ ] User can select agent type during upload
- [ ] Large file upload shows progress indicator
- [ ] Command boundary detection runs asynchronously after upload
- [ ] Detection completes in <10 seconds for 200K event session
- [ ] Sessions with markers + detected sections render both correctly

**Search & Filter:**
- [ ] User can search sessions by filename (substring, case-insensitive)
- [ ] User can filter sessions by agent type (multi-select)
- [ ] Search and filter work together (AND logic)
- [ ] Results update in <500ms
- [ ] Result count displayed correctly
- [ ] Empty state shown when no matches

**Session Detail View:**
- [ ] Large sessions (>50MB) load first chunk in <1 second
- [ ] Scrolling is smooth (60fps) with virtual scrolling
- [ ] Lazy loading triggers as user scrolls (chunks load on-demand)
- [ ] Detected sections appear as collapsible headers (default collapsed)
- [ ] Expanding detected section shows command + output correctly
- [ ] Fold/unfold completes in <200ms
- [ ] Browser memory stays under 500MB for 200MB session

**Metadata Editing:**
- [ ] User can click Edit button on session detail view
- [ ] User can change filename and agent type
- [ ] Changes save correctly (PUT endpoint)
- [ ] Changes reflected immediately in UI

**Performance:**
- [ ] Session list loads in <500ms with 1000 sessions
- [ ] Search/filter response in <500ms
- [ ] No UI blocking during scroll or chunk load
- [ ] No memory leaks during extended browsing

**Backward Compatibility:**
- [ ] Existing MVP v1 sessions continue to work
- [ ] Sessions with markers render correctly
- [ ] Sessions without agent type show "Unspecified"

**Testing:**
- [ ] Unit tests cover detection algorithm (80%+ coverage)
- [ ] Integration tests cover upload → detection → retrieval flow
- [ ] E2E tests cover full user journey (upload, search, browse, edit)
- [ ] Performance tests validate NFR-1 requirements

**Documentation:**
- [ ] README updated with agent type upload instructions
- [ ] README updated with search/filter usage
- [ ] README updated with performance characteristics (supports up to 250MB)

## 16. Dependencies and Risks

**Dependencies:**
- `@tanstack/vue-virtual` — NEW dependency (decided in MVP v1 ADR but never installed; must be added)
- No other new external dependencies required (detection is custom logic)

**Technical Risks:**

1. **Detection accuracy:** Auto-detection may have high false positive rate
   - Mitigation: Allow manual re-detection, users can collapse false sections
   - Future: Let users manually add/remove section boundaries

2. **Chunk alignment complexity:** Aligning chunks with section boundaries may be tricky
   - Mitigation: Start with simple approach (allow mid-section chunks), optimize later

3. **Virtual scrolling with dynamic sections:** Calculating heights for expand/collapse is complex
   - Mitigation: Use `@tanstack/vue-virtual`'s built-in support for variable heights

4. **Memory usage with large sessions:** Even with chunking, 200MB JSON parse may OOM
   - Mitigation: Stream .cast file parsing (NDJSON line-by-line, do not load entire file)
   - Worst case: Add env var for absolute max size (e.g., 500MB hard limit)

5. **Detection queue backlog:** Many simultaneous uploads may overwhelm detection
   - Mitigation: Simple in-process queue, process serially
   - Future: Proper job queue (BullMQ, etc.)

**Non-Technical Risks:**

1. **User confusion with detected vs marker sections:** May not be obvious which sections are auto-detected
   - Mitigation: Clear visual distinction (`[marker]` vs `[detected]` labels)

2. **Slow detection for very large sessions:** 5 second timeout may not be enough for 200MB
   - Mitigation: Allow timeout to be configurable, log slow detections for future optimization

## 17. Next Steps

Hand off to **Architect** for:
- **Detection algorithm design** — MUST analyze reference session files from `~/recorded_agent_sessions/` (see FR-1 for specific files). Real data is TUI output, not shell sessions. This is the hardest open problem.
- **Migration strategy** — Inline marker extraction, event_count calculation, async detection for existing sessions
- **Pagination + virtual scrolling architecture** — How chunks, sections, and virtual scrolling interact
- **Streaming .cast file reads** — Server-side approach for reading 200MB files without loading into memory

Then hand off to **Implementer** for execution.

---

**END OF REQUIREMENTS.md**
