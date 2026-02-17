# Implementation Plan - MVP v2

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Proposed

Depends on: ADR.md decisions (avt WASM, multi-signal detection, hybrid rendering, streaming migration)

---

## Overview

Six stages, each independently testable and reviewable. TDD throughout -- tests are written before or alongside implementation, never after.

```
Stage 1: avt WASM Bridge          (foundation -- rendering engine)
Stage 2: Server-Side Processing   (ingestion pipeline)
Stage 3: Section Detection        (algorithm + storage)
Stage 4: Client Rendering         (Vue components)
Stage 5: Migration                (existing sessions)
Stage 6: Integration + Polish     (end-to-end, edge cases)
```

---

## Stage 1: avt WASM Bridge

**Goal:** Build and test the WASM wrapper around `avt` that can process terminal output and return structured buffer state.

**Scope:**
- Create `packages/vt-wasm/` directory with a Rust crate wrapping `avt`
- wasm-bindgen interface: `create(cols, rows)`, `feed(text)`, `get_lines()`, `get_cursor()`
- `get_lines()` returns structured JSON: array of lines, each line an array of spans `{text, fg, bg, bold, italic, underline, strikethrough, dim, inverse}`
- Build script that compiles to WASM via wasm-pack
- TypeScript wrapper that loads the WASM module and provides typed API

**Tests (write first):**
- `vt-wasm.test.ts` -- Unit tests for the TypeScript wrapper:
  - Feed plain text, verify buffer contains expected characters
  - Feed ANSI SGR codes (colors, bold, etc.), verify span attributes
  - Feed cursor movement sequences, verify characters land at correct positions
  - Feed screen clear (`\x1b[2J`), verify buffer is empty
  - Feed alternate screen enter/exit, verify primary buffer preserved
  - Feed a real event sequence from the Claude reference session (first 50 events), verify no crashes
  - Feed a real event sequence from the Codex reference session (first 50 events), verify no crashes
  - Performance: feed 10,000 events in <1 second

**Files to create:**
- `packages/vt-wasm/Cargo.toml`
- `packages/vt-wasm/src/lib.rs`
- `packages/vt-wasm/build.sh` (or integrate into project build)
- `packages/vt-wasm/index.ts` (TypeScript wrapper)
- `packages/vt-wasm/vt-wasm.test.ts`

**Dependencies added:**
- `avt` (Rust crate, v0.17.0)
- `wasm-bindgen` (Rust crate)
- `wasm-pack` (build tool, dev dependency)

**Review checkpoint:** Pair reviewer verifies WASM builds, tests pass, reference session events process without errors.

**Exit criteria:** `npm test` passes all vt-wasm tests. WASM module loads in both Node.js (for server) and browser (for future client use).

---

## Stage 2: Server-Side Processing Pipeline

**Goal:** Build the server-side pipeline that processes a `.cast` file through avt and produces structured terminal snapshots.

**Scope:**
- Streaming NDJSON parser that reads `.cast` files line-by-line without loading entire file into memory
- `SessionProcessor` class that:
  1. Streams a `.cast` file
  2. Parses each NDJSON line into an event
  3. Feeds output (`"o"`) events into avt
  4. At requested event indices (section boundaries), captures a terminal buffer snapshot
  5. Returns an array of `{boundary_event, snapshot}` objects
- Snapshot format: JSON array of lines, each line an array of `{text, fg, bg, attrs}` spans
- Snapshot compression: consecutive cells with identical attributes are merged into single spans

**Tests (write first):**
- `session-processor.test.ts`:
  - Process `fixtures/sample.cast` (simple CLI) -- verify snapshot is readable text
  - Process first 1000 events of Claude reference session -- verify snapshot has styled content
  - Process with boundary at event 500 -- verify two snapshots produced
  - Streaming: process a 10MB session without exceeding 50MB memory (measure with `process.memoryUsage()`)
  - Error handling: malformed NDJSON line skipped gracefully
  - Error handling: invalid event format (not array, wrong length) skipped gracefully
  - Event counting: verify `event_count` matches actual events
  - Empty session (header only): returns empty snapshot array

**Files to create:**
- `src/server/processing/ndjson-stream.ts` (streaming NDJSON parser)
- `src/server/processing/session-processor.ts`
- `src/server/processing/snapshot-types.ts` (TypeScript types for snapshots)
- `src/server/processing/session-processor.test.ts`
- `src/server/processing/ndjson-stream.test.ts`

**Dependencies:**
- vt-wasm (from Stage 1)

**Review checkpoint:** Pair reviewer runs processor against 2-3 reference sessions, verifies snapshots look correct (manual inspection of JSON output).

**Exit criteria:** Processor handles all reference sessions without crashing. Memory stays bounded for large sessions. Tests pass.

---

## Stage 3: Section Detection Algorithm

**Goal:** Implement the multi-signal heuristic detection algorithm and store results in the database.

**Scope:**

### 3a: Detection Algorithm
- `SectionDetector` class implementing the multi-signal heuristic from ADR Decision 2:
  - Signal 1: Timing gaps (adaptive threshold)
  - Signal 2: Screen clear sequences
  - Signal 3: Alternate screen buffer transitions
  - Signal 4: Output volume bursts (tiebreaker)
- Boundary scoring, merging, and filtering
- Label generation

### 3b: Database Schema
- Migration script: add columns to `sessions`, create `sections` table, create indexes
- Per REQUIREMENTS.md Section 6 schema
- Add `snapshot` column to `sections` table (JSON blob, nullable)

### 3c: Section Repository
- `SectionRepository` interface and `SqliteSectionRepository` implementation
- CRUD operations: create sections, get sections by session, delete sections by session
- Update `SessionRepository` with new fields

### 3d: Integration with Upload
- After upload validation, trigger async processing:
  1. Run section detection to identify boundaries
  2. Run session processor (Stage 2) with detected boundaries to generate snapshots
  3. Store sections + snapshots in DB
  4. Update session metadata (event_count, detected_sections_count, detection_status)
- Processing is async -- upload returns immediately, detection runs in background
- `POST /api/sessions/:id/redetect` endpoint for re-running detection

**Tests (write first):**

Detection algorithm tests (`section-detector.test.ts`):
- Session with clear timing gaps (synthetic): detects boundaries at gaps
- Session with compressed timestamps (all < 1s): falls back to structural signals
- Session with screen clears: detects boundaries at clear events
- Session with alternate screen transitions: detects boundary at exit
- Session with markers + gaps: markers take precedence, detection fills gaps
- Session with no detectable signals: returns empty array (single block)
- Session with < 100 events: returns empty array (skip detection)
- Boundary merging: two candidates within 50 events become one
- Minimum section size: boundary creating < 100 event section is dropped
- Maximum sections: > 50 candidates reduced to top 50 by score
- Reference session test: run against Codex session, verify 5-15 sections detected at timing gaps
- Performance: detect sections in 200K event session in < 10 seconds

Database tests (`sqlite-section-repository.test.ts`):
- Create section, retrieve by session ID
- Create multiple sections, verify ordering by start_event
- Delete sections by session ID (for re-detection)
- Foreign key cascade: deleting session deletes its sections
- Migration: schema changes apply cleanly to existing DB

Integration tests:
- Upload `.cast` file -> sections created in DB
- Upload file with markers -> marker sections + detected sections coexist
- Redetect endpoint -> old detected sections replaced, marker sections preserved

**Files to create:**
- `src/server/processing/section-detector.ts`
- `src/server/processing/section-detector.test.ts`
- `src/server/db/section-repository.ts`
- `src/server/db/sqlite-section-repository.ts`
- `src/server/db/sqlite-section-repository.test.ts`
- `src/server/db/migrations/002-sections.ts`
- `src/server/routes/redetect.ts` (or add to existing sessions route)

**Review checkpoint:** Pair reviewer examines detection results for 3 reference sessions. Are the boundaries sensible? Are there too many or too few sections?

**Exit criteria:** Detection produces reasonable sections for all reference sessions. Database operations work correctly. Upload triggers async detection. Re-detection endpoint works. Tests pass.

---

## Stage 4: Client Rendering

**Goal:** Replace the broken AnsiLine/anser pipeline with components that render structured terminal snapshots.

**Scope:**

### 4a: Terminal Snapshot Component
- `TerminalSnapshot.vue` -- renders a terminal buffer snapshot (array of styled span lines)
- Each line is a flex row of `<span>` elements with CSS classes for colors and text attributes
- Monospace font, proper character grid alignment
- Supports: 16 ANSI colors, 256 color palette, true color (RGB), bold, dim, italic, underline, strikethrough, inverse
- Color CSS variables for theme support (dark theme default, light theme possible via CSS override)

### 4b: Updated Section Components
- Update `SessionContent.vue` to use sections from the API (DB-backed, not client-parsed)
- Update `MarkerSection.vue` to accept and render terminal snapshots instead of raw lines
- Add visual distinction between marker sections and detected sections (different icon/indicator)
- Default collapsed state for both types

### 4c: API Integration
- Update `useSession.ts` composable to fetch sections from the new API shape
- Sections include metadata (type, label, start_event, end_event) and snapshot data
- Lazy loading: only fetch snapshot data when a section is expanded (or preload first N sections)

### 4d: Remove Old Pipeline
- Remove `anser` dependency
- Remove `AnsiLine.vue` (replaced by `TerminalSnapshot.vue`)
- Remove the `cleanedLine` stripping logic
- Remove client-side asciicast parsing for rendering (keep for validation if needed)

**Tests (write first):**

Component tests (`terminal-snapshot.test.ts`):
- Render a snapshot with plain text -- verify text content in DOM
- Render a snapshot with colored spans -- verify CSS classes applied
- Render a snapshot with bold/italic -- verify attribute classes
- Render an empty snapshot (empty screen) -- no crash, renders empty grid
- Render a 80x24 snapshot -- verify 24 lines, correct width

Integration tests:
- Session detail page loads and displays sections with snapshots
- Expand section -> snapshot renders correctly
- Collapse section -> snapshot hidden
- Session with markers: marker sections display with labels
- Session with detected sections: auto labels display

Visual regression tests:
- `fixtures/sample.cast` renders identically to MVP v1 output (screenshot comparison)
- Claude reference session renders without garbage (manual visual check, automated screenshot)
- Codex reference session renders without garbage

**Files to create:**
- `src/client/components/TerminalSnapshot.vue`
- `src/client/components/TerminalSnapshot.test.ts`
- `src/client/components/terminal-colors.css` (color palette CSS variables)

**Files to modify:**
- `src/client/components/SessionContent.vue`
- `src/client/components/MarkerSection.vue`
- `src/client/composables/useSession.ts`
- `src/client/pages/SessionDetailPage.vue`
- `package.json` (remove `anser`)

**Files to delete:**
- `src/client/components/AnsiLine.vue`
- `src/client/components/AnsiLine.test.ts`
- `src/client/components/AnsiLine.demo.vue`

**Review checkpoint:** Pair reviewer opens the app, uploads a reference session, verifies it renders correctly. Compare with what a real terminal shows for the same session.

**Exit criteria:** All reference sessions render correctly in the browser. No garbage output. Colors and styles preserved. Fold/unfold works for both marker and detected sections. `anser` removed from bundle. Tests pass.

---

## Stage 5: Migration

**Goal:** Migrate existing MVP v1 sessions to the new schema with sections and snapshots.

**Scope:**
- Migration CLI command: `npm run migrate:v2`
- For each existing session:
  1. Count events (stream line count)
  2. Extract markers -> insert into `sections` table with `type='marker'`
  3. Run section detection -> insert detected boundaries
  4. Generate snapshots at all section boundaries
  5. Update session metadata
- Progress logging (session N of M, percentage complete)
- Idempotent: re-running skips already-migrated sessions (check `detection_status`)
- Error handling: log and continue on individual session failure

**Tests (write first):**

Migration tests (`migration-v2.test.ts`):
- Migrate a DB with one simple session -> event_count populated, no sections detected (< 100 events)
- Migrate a DB with a session that has markers -> markers appear in sections table
- Migrate a DB with a large session -> sections detected, snapshots generated
- Idempotency: run migration twice, verify no duplicate sections
- Error resilience: corrupt `.cast` file -> session skipped, others still migrate
- Schema migration: new columns and tables exist after migration

**Files to create:**
- `src/server/db/migrations/002-sections.ts` (if not already created in Stage 3)
- `src/server/scripts/migrate-v2.ts`
- `src/server/scripts/migrate-v2.test.ts`

**Review checkpoint:** Pair reviewer runs migration against a test database with several uploaded sessions. Verify data integrity -- markers match original, event counts are correct, snapshots render properly.

**Exit criteria:** Migration completes successfully for all existing sessions. Migrated sessions render correctly in the updated UI. Migration is idempotent. Tests pass.

---

## Stage 6: Integration and Polish

**Goal:** End-to-end testing, edge case handling, performance validation, and documentation.

**Scope:**

### 6a: End-to-End Tests
- Upload Claude reference session -> sections detected -> renders correctly -> fold/unfold works
- Upload Codex reference session -> same
- Upload simple CLI session (`fixtures/sample.cast`) -> backward compatible rendering
- Upload hybrid session (markers + no markers) -> both section types coexist
- Re-detection: upload session, then hit redetect endpoint -> sections updated

### 6b: Edge Cases
- Empty session (header only): displays gracefully with message
- Session with single event: renders as single block, no sections
- Very wide terminal (363 columns, from the hybrid reference session): horizontal scrolling or wrapping
- Unicode content in terminal output: correct character width handling
- Session where avt encounters unknown escape sequence: graceful skip, no crash

### 6c: Performance Validation
- Upload the 207MB Gemini session: ingestion completes, detection runs in < 10s
- First paint for any session < 2 seconds
- Fold/unfold < 200ms
- Memory: server stays under 500MB during processing of largest session
- Memory: browser stays under 200MB for any session (snapshots, not raw events)

### 6d: Build and CI
- Ensure WASM builds work in CI (GitHub Actions)
- Pre-built WASM binary checked into repo (or CI step) so developers without Rust can still build the JS/TS parts
- Update `package.json` scripts for new build steps
- Update `.gitignore` for WASM build artifacts

### 6e: Documentation
- Update MEMORY.md with decisions made
- Add build instructions for the WASM component to README or CONTRIBUTING docs

**Files to modify:**
- `MEMORY.md` (update project state, decisions)
- `package.json` (build scripts)
- CI configuration (if exists)

**Review checkpoint:** Pair reviewer performs full manual testing with reference sessions. Performance benchmarks reviewed.

**Exit criteria:** All acceptance criteria from REQUIREMENTS.md Section 10 pass. All reference sessions render correctly. Performance targets met. CI green.

---

## Stage Dependencies

```
Stage 1 (avt WASM)
    |
    v
Stage 2 (Server Processing)
    |
    v
Stage 3 (Section Detection) ----+
    |                            |
    v                            v
Stage 4 (Client Rendering)   Stage 5 (Migration)
    |                            |
    +------- both must complete -+
             |
             v
      Stage 6 (Integration)
```

Stages 4 and 5 can proceed in parallel once Stage 3 is complete. Stage 6 requires both.

---

## Risk Mitigation

| Risk | Mitigation | Stage |
|------|-----------|-------|
| Rust/wasm-pack build complexity | Pre-build WASM binary, commit to repo; only rebuild when Rust code changes | 1 |
| avt missing escape sequences for our data | Test against all 5 reference sessions in Stage 1; file upstream issues if needed | 1 |
| 200MB session crashes server | Streaming NDJSON parser, bounded memory; test explicitly in Stage 2 | 2 |
| Detection produces bad boundaries | Algorithm is tunable (thresholds, weights); re-detection endpoint allows iteration | 3 |
| Snapshot storage bloat | Span merging compression; monitor DB size; can add lazy-snapshot-generation later | 2, 3 |
| Bundle size regression from WASM | WASM module loaded async; compare bundle size before/after in Stage 6 | 4, 6 |

---

## Estimated Complexity

| Stage | Description | Relative Size |
|-------|------------|---------------|
| 1 | avt WASM Bridge | Medium (Rust wrapper + TS types + build tooling) |
| 2 | Server Processing | Medium (streaming parser + avt integration) |
| 3 | Section Detection | Large (algorithm + DB schema + repository + async integration) |
| 4 | Client Rendering | Medium (Vue components + CSS + API integration) |
| 5 | Migration | Small (reuses Stage 2+3 code, adds CLI wrapper) |
| 6 | Integration | Medium (E2E tests + performance + CI) |
