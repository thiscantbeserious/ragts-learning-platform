# Requirements - RAGTS MVP v3

Branch: feat/mvp-v3
Date: 2026-02-18
Status: Ready (MVP v2 merged)
Depends on: feat/mvp-v2 (merged to main)

## 1. Overview

MVP v3 delivers regression safety, dedup improvements, scale handling, organization, and search — building on the working MVP v2 foundation.

**Prerequisites:** MVP v2 merged to main (correct TUI rendering + section detection + scrollback dedup).

## 2. Context from MVP v2

### What Works
- Terminal rendering via avt WASM with resize support
- Section detection via multi-signal heuristics (50 sections per session)
- Scrollback dedup via contiguous block matching (92%+ reduction: 42K raw → 3.2K clean)
- Unified terminal document with sticky section headers
- Session upload, processing, migration pipeline

### What Needs Improvement
- **No snapshot regression tests** — Algorithm changes have been made blind (no way to catch visual regressions). This was the single biggest pain point during MVP v2 development.
- **Epoch boundary splitting** — Current per-epoch dedup can't match blocks spanning epoch boundaries. Headers at epoch boundaries produce false positives. A continuous stream approach exists in stash (`continuous-stream-dedup-rewrite`) but needs snapshot tests before merging.
- **No virtual scrolling** — Large sessions (3K+ lines) render all DOM nodes at once
- **No pagination** — Full session snapshot loaded in one API call
- **No search/filter** — Session list has no organization tools
- **No session metadata editing** — Can't correct filename or add agent type after upload

### Key Technical Debt
- Stashed `continuous-stream-dedup-rewrite` needs to be validated and merged
- Diagnostic scripts in `scripts/` should be cleaned up or removed
- `.DS_Store` in repo root

## 3. Features (Priority Order)

### FR-v3-0: Vitest Snapshot Regression Tests (CRITICAL — DO FIRST)

**Why first:** Every dedup algorithm change during MVP v2 was done blind — no way to verify output correctness without manually inspecting the browser. Snapshot tests lock down the current visual output so future changes can be validated automatically.

**Acceptance Criteria:**
- Vitest inline snapshot tests for `buildCleanDocument()` output against synthetic fixtures
- Vitest inline snapshot tests for real session dedup output (first N lines of clean document text)
- Snapshot tests for `processSessionPipeline()` end-to-end output (section count, line counts, header positions)
- Tests fail if dedup algorithm produces different output than the locked-in baseline
- Run via `npx vitest` alongside existing test suite

**Test Fixtures Needed:**
- Synthetic: 3-epoch progressive re-render (controlled, deterministic)
- Synthetic: epoch boundary spanning (header at end of epoch, content at start of next)
- Real: first 500 events of reference session processed through pipeline, snapshot the clean document text (first 50 lines)
- Real: full reference session — snapshot line count, header count, section count

**Implementation Notes:**
- Use Vitest's `toMatchInlineSnapshot()` for small fixtures
- Use Vitest's `toMatchSnapshot()` with `.snap` files for larger real-session output
- Snapshot the TEXT content (line text only, no styles) — style changes shouldn't break dedup tests

### FR-v3-1: Continuous Stream Dedup

**Why:** The per-epoch algorithm can't match blocks spanning epoch boundaries. All TUI headers sit at the LAST position in their epoch (the clear event draws the header, boundary is recorded, rest of redraw continues in next epoch). This means header blocks are always length 1, never deduped.

**Acceptance Criteria:**
- Process all raw lines as one continuous stream (no per-epoch slicing)
- Blocks can span epoch boundaries
- Epoch boundaries used only for `rawLineCountToClean` mapping
- Snapshot tests from FR-v3-0 updated to reflect improved output
- Reference session: 4 headers (down from ~37 with per-epoch approach)

**Implementation:** The stashed `continuous-stream-dedup-rewrite` already implements this. Validate against snapshot tests, merge.

### FR-v3-2: Server-Side Pagination for Large Sessions

**User Story:** As a user viewing a massive session (>50K events), the system serves content in chunks so rendering remains responsive.

**Acceptance Criteria:**
- `GET /api/sessions/:id?offset=0&limit=1000` pagination support
- Default chunk size: 1000 events (configurable via env var)
- Response: `{ chunk, total, offset, has_more }`
- Frontend lazy-loads chunks on scroll
- First chunk loads in <500ms

### FR-v3-3: Virtual Scrolling Integration

**User Story:** As a user viewing a large session, only the visible viewport is rendered for performance.

**Acceptance Criteria:**
- Use `@tanstack/vue-virtual` (NEW dependency)
- Only visible rows + buffer zone rendered in DOM
- Scroll position preserved on fold/unfold
- 100K+ events: smooth 60fps scrolling

### FR-v3-4: Agent Type Metadata

**User Story:** As a user, I can tag sessions with agent type.

**Acceptance Criteria:**
- Upload form includes agent type dropdown (default: Claude)
- `agent_type` stored in DB (column already exists from v2 migration)
- Agent type badges on session list and detail view
- Optional (nullable)

### FR-v3-5: Search and Filter Sessions

**User Story:** As a user with many sessions, I can search by filename and filter by agent type.

**Acceptance Criteria:**
- Search box: case-insensitive filename substring match
- Filter by agent type: multi-select with counts per type
- AND logic, debounced (300ms), URL-persisted params
- <500ms for 1000 sessions

### FR-v3-6: Edit Session Metadata

**Acceptance Criteria:**
- `PUT /api/sessions/:id` endpoint
- Edit filename and agent type after upload
- Modal/inline form on session detail view
- Partial updates allowed

## 4. Data Model

Shared with MVP v2. Schema already exists (sessions + sections tables with all columns). MVP v3 adds:
- `agent_type` usage in upload and edit flows
- Search/filter queries on existing indexes
- Pagination queries using existing `event_count`

## 5. API Changes

- `GET /api/sessions` — changes from array to `{ sessions, total, offset, limit }` (breaking, acceptable)
- `GET /api/sessions/:id` — adds pagination params for content chunks
- `PUT /api/sessions/:id` — NEW endpoint
- Search/filter query params on session list

## 6. Technical Context for Implementers

### Scrollback Dedup Architecture

The dedup system lives in `src/server/processing/scrollback-dedup.ts`. Key concepts:

- **Epoch**: period between clear-screen events. Epoch 0 is everything before the first clear.
- **Clean document**: deduplicated output. Lines are appended as new or mapped to existing positions.
- **Hash index**: `Map<string, number[]>` mapping line text → positions in clean doc for O(1) candidate lookup.
- **Block matching**: for each line, find longest contiguous block matching consecutive lines in clean doc. Blocks >= MIN_MATCH (3) are re-renders.
- **Stutter detection**: removes transient partial renders (line K identical to line K+N with only blank lines between).

The stashed continuous stream approach removes per-epoch slicing — all lines processed as one stream, epoch boundaries used only for the `rawLineCountToClean` mapping.

### VT WASM Module

`packages/vt-wasm/` wraps avt 0.17.0 (Rust) via wasm-pack. Built in a container (podman/docker). Binary committed to repo — developers don't need Rust.

API: `create(cols, rows, scrollback_limit)` → instance with `feed(data)`, `get_view()`, `get_all_lines()`, `get_cursor()`, `get_size()`, `resize(cols, rows)`.

### Session Pipeline

`src/server/processing/session-pipeline.ts` orchestrates:
1. Read .cast file (NDJSON streaming)
2. Replay events through VT (handling 'r' resize events)
3. Record epoch boundaries at clear-screen events
4. Run section detection
5. Capture `getAllLines()` as raw snapshot
6. Run `buildCleanDocument()` for dedup
7. Store clean snapshot + sections in DB

### Reference Session Characteristics

The primary test session (`lennart-working-session-result-1.cast`):
- 45,541 events, Claude Code session
- Terminal resizes: 255x18 → 363x18 → 363x32
- 108 clear-screen redraw cycles (never enters alt-screen)
- Raw scrollback: 42,839 lines → Clean: ~3,159 lines
- 50 detected sections

## 7. Next Steps

Once MVP v3 is merged:
1. **Authentication** — Built-in auth + OIDC integration
2. **Curation UX** — Human annotation workflow for segments
3. **Retrieval API** — MCP server for agent memory
4. Or pivot to operational concerns: deployment artifacts, monitoring, backups
