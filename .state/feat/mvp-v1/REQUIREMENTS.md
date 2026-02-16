# Requirements - RAGTS MVP v1

Branch: feat/mvp-v1
Date: 2026-02-16
Status: Final

## 1. MVP Scope

**Goal:** Build the smallest vertical slice that delivers real value - upload, browse, and fold/unfold sessions. No auth, no curation, no retrieval API. Pure browsing experience.

**In scope:**
- Upload .cast files (asciicast v3)
- Store sessions in SQLite + filesystem
- Display sessions as vertical scrolling documents
- Fold/unfold sections via markers
- Preserve ANSI colors in terminal output

**Out of scope (deferred to future iterations):**
- Authentication / multi-user
- Curation workflow
- Agent retrieval API / MCP server
- AGR transform integration
- Search / indexing
- Workspaces / teams

This MVP validates the core browsing UX and technical foundation.

## 2. Tech Stack

### Backend
**Open — Architect to research and recommend**

User asked for a recommendation. The PO defers this to the Architect who should evaluate options (TypeScript/Node, Go, Python, Rust, etc.) considering:
- Vue frontend pairing
- SQLite support quality
- Self-hostable local-first deployment
- Future extensibility toward the full RAGTS architecture
- Developer experience for single developer

### Frontend
**Vue 3**

User preference. Composition API recommended for maintainability.

Build tool: **Vite** (standard for Vue 3)

### Database
**SQLite**

Single-file, embedded, zero-config. Perfect for self-hostable MVP. DB abstraction layer allows future PostgreSQL migration.

### Storage
**Hybrid: Filesystem + SQLite metadata**

- `.cast` files stored as files in a sessions directory
- SQLite tracks metadata (filename, upload timestamp, size, marker count, etc.)
- Filesystem path stored in DB, content read on demand

### Deployment
**Local dev server (`npm run dev`)**

No containerization for MVP. Run locally with Node.js. Docker deferred to future iteration.

## 3. Functional Requirements

### FR-1: Upload Sessions

**User Story:** As a user, I can upload a .cast file so that I can browse it in RAGTS.

**Acceptance Criteria:**
- Upload page is the landing page (root route `/`)
- Upload UI at top, session list below
- User can select or drag-and-drop .cast files
- File is validated as asciicast v3 format
- File is stored in filesystem with unique ID
- Metadata inserted into SQLite
- Upload completion shows success message
- Session appears in the list below immediately
- Invalid files rejected with clear error message

**Validation Rules:**
- Must be valid JSON
- Must have `version: 3` (asciicast v3)
- File size limit: 50 MB (configurable via env var)

### FR-2: List Sessions

**User Story:** As a user, I see all uploaded sessions on the landing page so I can select one to browse.

**Acceptance Criteria:**
- Sessions listed below upload UI on root route `/`
- Each entry shows:
  - Upload timestamp
  - Original filename
  - File size
  - Marker count (if any)
- List ordered by upload timestamp DESC (newest first)
- Clicking a session navigates to detail view
- Empty state shown if no sessions uploaded yet

**Empty State:**
"No sessions yet. Upload a .cast file above to get started."

### FR-3: Browse Session (Detail View)

**User Story:** As a user, I can view a session as a vertical scrolling document so I can read terminal output naturally.

**Acceptance Criteria:**
- Session detail view at `/session/:id`
- Displays terminal output line-by-line in vertical scroll
- Preserves ANSI color codes (render as HTML/CSS)
- Preserves timing information (display timestamps on hover or inline)
- Monospace font for terminal output
- Dark theme by default (terminal aesthetic)
- Back button to return to landing page

**Performance:**
- Large sessions (>10k lines) must render without blocking UI
- Lazy loading or virtualization if session exceeds 50k lines

### FR-4: Fold/Unfold Markers

**User Story:** As a user, I can collapse and expand sections of a session via markers so I can focus on what matters and hide noise.

**Acceptance Criteria:**
- Markers from asciicast v3 rendered as collapsible headers
- Marker text is highlighted/distinct (e.g., bold, colored, or styled differently)
- Clicking a marker toggles fold/unfold
- Default state: **all markers collapsed**
- Collapsed state shows marker text only
- Expanded state shows all content between marker and next marker (or EOF)
- Visual indicator for collapsed/expanded state (chevron icon or similar)
- Nested markers supported (if present in asciicast v3)

**Edge Cases:**
- Session with no markers: display entire session expanded, no fold UI
- Marker at end of session (no content below): show marker but no collapse control
- Multiple markers in rapid succession: each is independently collapsible

### FR-5: ANSI Color Rendering

**User Story:** As a user, I see terminal colors preserved in the browser so I can understand errors, warnings, and semantic output.

**Acceptance Criteria:**
- ANSI escape codes parsed and rendered as HTML/CSS
- Standard 16 colors + 256-color palette supported
- Bold, dim, italic, underline styles preserved
- Background colors supported
- Unknown codes gracefully ignored (don't break rendering)

**Recommendation:** Use existing library (e.g., ansi-to-html, anser, chalk-to-html) rather than rolling custom parser.

## 4. Non-Functional Requirements

### NFR-1: Local-First

**Requirement:** MVP runs locally with `npm run dev` or `npm start`. No containerization required.

**Acceptance Criteria:**
- Default config works out-of-box (no env vars required)
- SQLite file and session storage in local `data/` directory
- README includes development setup instructions

### NFR-2: Performance

**Requirement:** Browsing large sessions must be responsive.

**Acceptance Criteria:**
- Session detail view renders initial viewport in <1 second for sessions up to 10k lines
- Fold/unfold operations complete in <200ms
- Lazy loading or virtualization for sessions >50k lines

### NFR-3: Data Integrity

**Requirement:** Uploaded sessions must be stored durably.

**Acceptance Criteria:**
- SQLite writes are synchronous (ACID guarantees)
- File writes complete before success response
- DB schema includes foreign key constraints
- Upload failures leave no orphaned files or DB rows (transactional cleanup)

### NFR-4: Browser Compatibility

**Requirement:** Works in modern browsers.

**Acceptance Criteria:**
- Chrome/Edge/Brave 100+
- Firefox 100+
- Safari 15+
- No IE11 support required

## 5. Data Model

### SQLite Schema

**sessions table:**
```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,              -- UUID or nanoid
  filename TEXT NOT NULL,           -- Original uploaded filename
  filepath TEXT NOT NULL UNIQUE,    -- Relative path in storage directory
  size_bytes INTEGER NOT NULL,
  marker_count INTEGER DEFAULT 0,
  uploaded_at TEXT NOT NULL,        -- ISO 8601 timestamp
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

**Indexes:**
```sql
CREATE INDEX idx_sessions_uploaded_at ON sessions(uploaded_at DESC);
```

**Future tables (not MVP):**
- users
- workspaces
- curated_segments
- markers (if extracted from sessions)

### Filesystem Structure

```
/data/
  sessions/
    <id>.cast
  ragts.db
```

`<id>` matches the primary key in `sessions` table.

## 6. API Endpoints (Backend)

### POST /api/upload
Upload a .cast file.

**Request:**
- Content-Type: multipart/form-data
- Field: `file` (binary)

**Response (success):**
```json
{
  "id": "abc123",
  "filename": "my-session.cast",
  "size_bytes": 123456,
  "marker_count": 5,
  "uploaded_at": "2026-02-16T10:30:00Z"
}
```

**Response (error):**
```json
{
  "error": "Invalid asciicast format: missing version field"
}
```

Status codes:
- 201 Created (success)
- 400 Bad Request (validation failure)
- 413 Payload Too Large (file size limit exceeded)
- 500 Internal Server Error (storage/DB failure)

### GET /api/sessions
List all sessions.

**Response:**
```json
{
  "sessions": [
    {
      "id": "abc123",
      "filename": "my-session.cast",
      "size_bytes": 123456,
      "marker_count": 5,
      "uploaded_at": "2026-02-16T10:30:00Z"
    }
  ]
}
```

### GET /api/sessions/:id
Get session detail (metadata + content).

**Response:**
```json
{
  "id": "abc123",
  "filename": "my-session.cast",
  "size_bytes": 123456,
  "marker_count": 5,
  "uploaded_at": "2026-02-16T10:30:00Z",
  "content": { /* full asciicast v3 JSON */ }
}
```

**Response (error):**
```json
{
  "error": "Session not found"
}
```

Status codes:
- 200 OK (success)
- 404 Not Found (invalid ID)
- 500 Internal Server Error (file read failure)

## 7. UI/UX Requirements

### Layout

**Landing Page (`/`):**
```
+------------------------------------------+
|  RAGTS                         [Dark/Light toggle]
+------------------------------------------+
|  Upload Session                          |
|  [Drag & drop or click to select]       |
+------------------------------------------+
|  Sessions                                |
|  +-------------------------------------+ |
|  | 2026-02-16 10:30 | my-session.cast | |
|  | 123 KB | 5 markers               [>]| |
|  +-------------------------------------+ |
|  | 2026-02-15 14:22 | debug-run.cast  | |
|  | 456 KB | 12 markers              [>]| |
|  +-------------------------------------+ |
+------------------------------------------+
```

**Session Detail View (`/session/:id`):**
```
+------------------------------------------+
|  [< Back] my-session.cast                |
+------------------------------------------+
|  > Marker 1: Setup environment           | <- collapsed (default)
|  > Marker 2: Install dependencies        |
|  v Marker 3: Run tests                   | <- expanded (user clicked)
|    $ npm test                            |
|    PASS src/test.ts                      |  <- ANSI colors preserved
|    ✓ should pass (5ms)                   |
|  > Marker 4: Build                       |
+------------------------------------------+
```

### Visual Design

**Theme:**
- Default: Dark (terminal aesthetic)
- Optional light theme toggle (nice-to-have, not blocking MVP)

**Colors:**
- Background: `#1e1e1e` (dark) or `#ffffff` (light)
- Text: `#d4d4d4` (dark) or `#333333` (light)
- Markers: Bold, slightly lighter than body text, or colored accent
- ANSI colors: Standard terminal palette

**Typography:**
- Body: Sans-serif (system font stack)
- Terminal output: Monospace (Fira Code, Cascadia Code, or fallback to `monospace`)

**Responsive:**
- Mobile-friendly (but terminal output is inherently desktop-oriented; mobile is low priority)

## 8. Configuration

All configuration via environment variables.

**MVP Env Vars:**
```bash
PORT=3000                          # HTTP port
DATA_DIR=/data                     # Storage root (SQLite + sessions)
MAX_FILE_SIZE_MB=50                # Upload limit
NODE_ENV=production                # development | production
```

**Defaults work out-of-box.** No config file required.

## 9. Testing Requirements

### Unit Tests
- Asciicast v3 validation logic
- ANSI color parser (if custom)
- DB repository layer

### Integration Tests
- Upload flow (API + filesystem + DB)
- Session retrieval (DB + filesystem)
- Marker parsing from asciicast

### E2E Tests
- Upload a session via UI
- View session list
- Navigate to session detail
- Fold/unfold markers

**Coverage target:** 80%+ for backend logic. Frontend coverage optional for MVP.

## 10. Deployment Requirements

**MVP:** `npm run dev` for development, `npm start` for production-like local run.

Docker and container deployment deferred to a future iteration.

## 11. Documentation Requirements

**README.md updates:**
- Getting Started section with Docker run example
- Architecture overview (high-level)
- Development setup (Node.js, npm, how to run locally)
- Upload a session (UI steps)
- Browse a session (UI steps)

**No separate documentation site for MVP.** README is sufficient.

## 12. Success Criteria

The MVP is considered successful if:
1. A user can upload a .cast file via the web UI
2. The session appears in the list immediately
3. Clicking the session shows vertical scrolling terminal output with colors preserved
4. Markers are visible as collapsible headers (default collapsed)
5. Clicking a marker expands/collapses that section
6. The entire flow works in a single Docker container with no external dependencies

## 13. Open Questions (for Architect/Implementer)

- **ANSI parser library:** Which library to use? (ansi-to-html, anser, etc.)
- **Frontend state management:** Needed for MVP? (Pinia, plain Vue refs, etc.)
- **Lazy loading strategy:** Virtual scrolling lib or custom?
- **Marker nesting:** How to handle nested markers if present in asciicast v3?
- **File ID generation:** UUID, nanoid, or something else?
- **Error handling UX:** Toast notifications, inline errors, or modal dialogs?
- **Session deletion:** Needed for MVP or defer? (If included, add DELETE endpoint)

## 14. Out of Scope (Deferred)

- Authentication / user accounts
- Multi-tenancy / workspaces
- Curation workflow (annotations, tags)
- Search / indexing
- Agent retrieval API / MCP server
- AGR transform integration
- Session versioning
- Cross-workspace sharing
- Retention policies
- Notifications / webhooks
- White-label theming (beyond basic dark/light toggle)
- Export sessions (e.g., to HTML, PDF)
- Session diff/compare
- Live session streaming

These are all valid future features, but not necessary to validate the core browsing UX.

## 15. Acceptance Checklist

Before declaring MVP complete, verify:

- [ ] User can upload a .cast file via web UI
- [ ] Uploaded session appears in list on landing page
- [ ] Clicking session navigates to detail view
- [ ] Session displays as vertical scrolling document
- [ ] ANSI colors are preserved and rendered correctly
- [ ] Markers are visible as collapsible headers
- [ ] Default state: all markers collapsed
- [ ] Clicking marker toggles expand/collapse
- [ ] Performance: 10k line session renders in <1 second
- [ ] Fold/unfold completes in <200ms
- [ ] Runs locally with `npm run dev` / `npm start` with no config required
- [ ] Data persists in local `data/` directory
- [ ] README includes development setup instructions
- [ ] Unit tests cover validation and DB logic (80%+ coverage)
- [ ] E2E test covers full upload-to-browse flow

## 16. Next Steps

Hand off to **Architect** for:
- DB abstraction layer design
- ANSI parser library selection
- Frontend component structure
- Performance strategy for large sessions

Then hand off to **Implementer** for execution.
