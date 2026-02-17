# Implementation Plan - MVP v2

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Proposed

Depends on: ADR.md decisions (avt WASM, multi-signal detection with co-primary signals, hybrid rendering with viewport-only snapshots, section content model, streaming migration)

---

## Overview

Six stages, each independently testable and reviewable. TDD throughout -- tests are written before or alongside implementation, never after.

```
Stage 1: avt WASM Bridge          (foundation -- rendering engine, de facto PoC)
Stage 2: Server-Side Processing   (ingestion pipeline)
Stage 3: Section Detection        (algorithm + storage)
Stage 4: Client Rendering         (Vue components)
Stage 5: Migration                (existing sessions)
Stage 6: Integration + Polish     (end-to-end, edge cases)
```

---

## Stage 1: avt WASM Bridge

**Goal:** Build and test the WASM wrapper around `avt` that can process terminal output and return structured buffer state. This stage serves as the de facto proof-of-concept -- it validates that avt produces correct rendering output against real reference sessions before any other work proceeds.

**Scope:**

### 1a: Containerized Build System
- Create `packages/vt-wasm/Dockerfile` -- build container based on `rust:1.82-slim` with `wasm-pack`
- wasm-pack runs at container runtime (CMD), not build time (RUN), so output is written to the host-mounted volume
- Create `packages/vt-wasm/build.sh` -- runs Podman/Docker to compile WASM, mounts output directory, outputs to `pkg/`
- Supports `CONTAINER_ENGINE` env var (defaults to `podman`, falls back to `docker`)
- Build produces platform-independent `.wasm` binary + JS glue + TypeScript types

**Dockerfile:**
```dockerfile
FROM rust:1.82-slim
RUN cargo install wasm-pack
WORKDIR /build
COPY Cargo.toml ./
COPY src/ src/
CMD ["wasm-pack", "build", "--target", "nodejs", "--release", "--out-dir", "/output/pkg"]
```

**build.sh:**
```bash
#!/bin/bash
set -euo pipefail
CONTAINER_ENGINE="${CONTAINER_ENGINE:-podman}"
$CONTAINER_ENGINE build -t ragts-vt-build .
$CONTAINER_ENGINE run --rm -v "$(pwd)/pkg:/output/pkg" ragts-vt-build
echo "WASM build complete -> pkg/"
```

### 1b: Rust WASM Wrapper
- Create `packages/vt-wasm/Cargo.toml` -- depends on `avt = "0.17.0"`, `wasm-bindgen`, `serde-wasm-bindgen`
- Create `packages/vt-wasm/src/lib.rs` -- thin wasm-bindgen wrapper:
  - `create(cols, rows, scrollback_limit)` -> `Vt` instance
  - `vt.feed(text)` -> changed row indices
  - `vt.get_view()` -> structured JSON: array of lines, each line an array of spans `{text, fg, bg, bold, italic, underline, strikethrough, faint, inverse, wrapped}`
  - `vt.get_cursor()` -> cursor position or null
  - `vt.get_size()` -> `[cols, rows]`
- Uses `serde-wasm-bindgen` for JSON serialization (simpler than player's `repr(C)` zero-copy; can optimize later)
- **Important:** Map avt's `Pen.intensity` (Bold/Faint) separately from `Pen.attrs` bitfield. The WASM wrapper must use avt's layout (italic=bit0, underline=bit1, etc.), NOT the player's TextAttrs layout (Bold=bit0). See ADR Decision 1 warning.

### 1c: TypeScript Wrapper + Types
- Create `packages/vt-wasm/index.ts` -- typed API that imports from `pkg/`
- Export types: `TerminalSnapshot`, `SnapshotLine`, `SnapshotSpan` (matching ADR Decision 3 data model)
- Async WASM init: `initVt()` loads the WASM module once
- Factory: `createVt(cols, rows, scrollbackLimit?)` returns typed instance

### 1d: Build and Commit Binary
- Run `./build.sh` to produce `pkg/` directory
- Commit `pkg/` contents to repo -- developers never need Rust/Podman for normal work
- Add `packages/vt-wasm/pkg/` to git (NOT in `.gitignore`)

**Tests (write first):**
- `vt-wasm.test.ts` -- Unit tests for the TypeScript wrapper:
  - Feed plain text, verify buffer contains expected characters
  - Feed ANSI SGR codes (colors, bold, etc.), verify span attributes
  - Feed cursor movement sequences, verify characters land at correct positions
  - Feed screen clear (`\x1b[2J`), verify buffer is empty
  - Feed alternate screen enter/exit, verify primary buffer preserved
  - Feed a real event sequence from the Claude reference session (first 50 events), verify no crashes
  - Feed a real event sequence from the Codex reference session (first 50 events), verify no crashes
  - Verify Bold/Faint are correctly mapped from `Pen.intensity` (not from `Pen.attrs` bits)
  - Performance: feed 10,000 events in <1 second

**Files to create:**
```
packages/vt-wasm/
+-- Dockerfile              # rust:1.82-slim + wasm-pack, CMD runs wasm-pack
+-- build.sh                # podman/docker build + run with volume mount
+-- Cargo.toml              # avt 0.17.0 + wasm-bindgen + serde-wasm-bindgen
+-- src/lib.rs              # WASM-bindgen wrapper
+-- index.ts                # TypeScript typed wrapper
+-- vt-wasm.test.ts         # Tests
+-- pkg/                    # COMMITTED -- build output
    +-- vt_wasm_bg.wasm
    +-- vt_wasm.js
    +-- vt_wasm.d.ts
```

**Dependencies:**
- Rust crates (inside container only): `avt 0.17.0`, `wasm-bindgen`, `serde-wasm-bindgen`
- No `wee_alloc` -- it is unmaintained (last release 2020, known memory leaks). Modern wasm-bindgen uses the default allocator which is fine.
- No new npm dependencies -- the WASM module is loaded directly

**Review checkpoint:** Pair reviewer verifies: (1) `./build.sh` produces WASM with Podman, (2) tests pass against committed binary, (3) reference session events process without errors.

**Exit criteria:** `npm test` passes all vt-wasm tests. WASM module loads in Node.js. Binary committed to repo. Reference sessions produce correct output (de facto PoC validated).

---

## Stage 2: Server-Side Processing Pipeline

**Goal:** Build the server-side pipeline that processes a `.cast` file through avt and produces structured terminal snapshots at section boundaries.

**Scope:**
- Streaming NDJSON parser that reads `.cast` files line-by-line without loading entire file into memory
- `SessionProcessor` class that:
  1. Streams a `.cast` file
  2. Parses each NDJSON line into an event
  3. Feeds output (`"o"`) events into avt
  4. At requested event indices (section boundaries), captures a terminal buffer snapshot via `vt.view()` (viewport only, per ADR Decision 5)
  5. Returns an array of `{boundary_event, snapshot}` objects
- Snapshot format: JSON array of lines, each line an array of `{text, fg, bg, attrs}` spans
- Snapshot compression: consecutive cells with identical attributes are merged into single spans
- Viewport-only snapshots: `vt.view()` captures the visible terminal grid. For TUI apps this is the complete content. For non-TUI output, scrollback is not captured (acknowledged trade-off, see ADR Decision 3 and Decision 5).

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
  - Signal 1: Timing gaps (co-primary, dominant for raw recordings)
  - Signal 2: Screen clear sequences (co-primary, dominant for AGR-processed sessions)
  - Signal 3: Alternate screen buffer transitions
  - Signal 4: Output volume bursts (tiebreaker, only active alongside Signal 1 when timing data is available)
- Boundary scoring, merging, and filtering
- Label generation
- Note: timing gaps and screen clears are co-primary signals with dominance depending on session type. Most sessions in the reference corpus are AGR-processed, making screen clears the dominant signal in practice.

### 3b: Database Schema
- Migration script: add columns to `sessions`, create `sections` table, create indexes
- Per REQUIREMENTS.md Section 6 schema
- Add `snapshot` column to `sections` table (JSON blob, nullable) -- this extends the REQUIREMENTS schema as specified in ADR Decision 3 Schema Extensions

### 3c: Section Repository
- `SectionRepository` interface and `SqliteSectionRepository` implementation
- CRUD operations: create sections, get sections by session, delete sections by session
- Update `SessionRepository` with new fields

### 3d: Integration with Upload
- After upload validation, trigger async processing:
  1. Run section detection to identify boundaries
  2. Run session processor (Stage 2) with detected boundaries to generate viewport snapshots (per ADR Decision 5: snapshot at section END only)
  3. Store sections + snapshots in DB
  4. Update session metadata (event_count, detected_sections_count, detection_status)
- Processing is async -- upload returns immediately, detection runs in background
- `POST /api/sessions/:id/redetect` endpoint for re-running detection

**Tests (write first):**

Detection algorithm tests (`section-detector.test.ts`):
- Session with clear timing gaps (synthetic): detects boundaries at gaps
- Session with compressed timestamps (all < 1s): falls back to screen clears (co-primary signal)
- Session with screen clears: detects boundaries at clear events
- Session with alternate screen transitions: detects boundary at exit
- Session with markers + gaps: markers take precedence, detection fills gaps
- Session with no detectable signals: returns empty array (single block)
- Session with < 100 events: returns empty array (skip detection)
- Boundary merging: two candidates within 50 events become one
- Minimum section size: boundary creating < 100 event section is dropped
- Maximum sections: > 50 candidates reduced to top 50 by score
- Signal 4 tiebreaker: verify Signal 4 only fires when Signal 1 is active (timing available), promotes marginal timing gaps
- Reference session test: run against Codex session, verify 5-15 sections detected at timing gaps
- Performance: detect sections in 200K event session in < 10 seconds

Database tests (`sqlite-section-repository.test.ts`):
- Create section with snapshot, retrieve by session ID
- Create multiple sections, verify ordering by start_event
- Delete sections by session ID (for re-detection)
- Foreign key cascade: deleting session deletes its sections
- Migration: schema changes apply cleanly to existing DB
- Verify snapshot column accepts JSON blob and null

Integration tests:
- Upload `.cast` file -> sections created in DB with viewport snapshots
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

**Goal:** Replace the broken AnsiLine/anser pipeline with components that render structured terminal snapshots (viewport-only, per ADR Decision 5).

**Scope:**

### 4a: Terminal Snapshot Component
- `TerminalSnapshot.vue` -- renders a terminal buffer snapshot (array of styled span lines)
- Each line is a flex row of `<span>` elements with CSS classes for colors and text attributes
- Monospace font, proper character grid alignment
- Supports: 16 ANSI colors, 256 color palette, true color (RGB), bold, dim, italic, underline, strikethrough, inverse
- Color CSS variables for theme support (dark theme default, light theme possible via CSS override)
- Renders one viewport-sized grid per expanded section (per Decision 5: snapshot at section END)

### 4b: Updated Section Components
- Update `SessionContent.vue` to use sections from the API (DB-backed, not client-parsed)
- Update `MarkerSection.vue` to accept and render terminal snapshots instead of raw lines
- Add visual distinction between marker sections and detected sections (different icon/indicator)
- Default collapsed state for both types
- When expanded, show the viewport snapshot -- one static terminal screen per section

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
- Expand section -> viewport snapshot renders correctly (one screen)
- Collapse section -> snapshot hidden
- Session with markers: marker sections display with labels
- Session with detected sections: auto labels display
- Alternate screen content: section during alt screen shows alt buffer content

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

**Goal:** Migrate existing MVP v1 sessions to the new schema with sections and viewport snapshots.

**Scope:**
- Migration CLI command: `npm run migrate:v2`
- For each existing session:
  1. Count events (stream line count)
  2. Extract markers -> insert into `sections` table with `type='marker'`
  3. Run section detection (co-primary signals: timing gaps + screen clears) -> insert detected boundaries
  4. Generate viewport snapshots at all section boundaries (per ADR Decision 5: snapshot at section END only)
  5. Update session metadata
- Progress logging (session N of M, percentage complete)
- Idempotent: re-running skips already-migrated sessions (check `detection_status`)
- Error handling: log and continue on individual session failure

**Tests (write first):**

Migration tests (`migration-v2.test.ts`):
- Migrate a DB with one simple session -> event_count populated, no sections detected (< 100 events)
- Migrate a DB with a session that has markers -> markers appear in sections table with snapshots
- Migrate a DB with a large session -> sections detected, viewport snapshots generated
- Idempotency: run migration twice, verify no duplicate sections
- Error resilience: corrupt `.cast` file -> session skipped, others still migrate
- Schema migration: new columns and tables exist after migration, including `snapshot` column

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
- Upload Claude reference session -> sections detected (screen clears as dominant signal for AGR-processed) -> viewport snapshots render correctly -> fold/unfold works
- Upload Codex reference session -> sections detected (timing gaps as dominant signal for raw recording) -> same
- Upload simple CLI session (`fixtures/sample.cast`) -> backward compatible rendering
- Upload hybrid session (markers + no markers) -> both section types coexist
- Re-detection: upload session, then hit redetect endpoint -> sections updated with new snapshots

### 6b: Edge Cases
- Empty session (header only): displays gracefully with message
- Session with single event: renders as single block, no sections
- Very wide terminal (363 columns, from the hybrid reference session): horizontal scrolling or wrapping
- Unicode content in terminal output: correct character width handling
- Session where avt encounters unknown escape sequence: graceful skip, no crash
- Alternate screen buffer: section boundary during alt screen shows alt buffer content; next section after exit shows primary buffer (per ADR Decision 5)
- Non-TUI CLI output: viewport snapshot captures only the visible grid (acknowledged trade-off)

### 6c: Performance Validation
- Upload the 207MB Gemini session: ingestion completes, detection runs in < 10s
- First paint for any session < 2 seconds
- Fold/unfold < 200ms
- Memory: server stays under 500MB during processing of largest session
- Memory: browser stays under 200MB for any session (viewport snapshots, not raw events)

### 6d: Build and CI
- WASM binary is committed to repo -- no CI build step needed for WASM
- Verify `npm install && npm run dev` works without Rust/Podman (uses committed binary)
- Add `npm run build:wasm` script that runs `packages/vt-wasm/build.sh` (for maintainers updating avt)
- Update `package.json` scripts for new build steps
- Ensure `.gitignore` does NOT exclude `packages/vt-wasm/pkg/` (it must be committed)
- Verify Dockerfile uses CMD (not RUN) for wasm-pack and build.sh mounts output volume correctly

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
Stage 1 (avt WASM -- de facto PoC)
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
| Rust/wasm-pack build complexity | Containerized build (Podman/Docker) with CMD (not RUN); WASM binary committed to repo; developers never install Rust | 1 |
| avt missing escape sequences for our data | Test against all 5 reference sessions in Stage 1 (de facto PoC); file upstream issues if needed | 1 |
| 200MB session crashes server | Streaming NDJSON parser, bounded memory; test explicitly in Stage 2 | 2 |
| Detection produces bad boundaries | Algorithm is tunable (thresholds, weights); co-primary signals adapt to session type; re-detection endpoint allows iteration | 3 |
| Snapshot storage bloat | Viewport-only snapshots are compact (one screen per section); span merging compression; monitor DB size | 2, 3 |
| Bundle size regression from WASM | WASM module loaded async; compare bundle size before/after in Stage 6 | 4, 6 |
| Pen.attrs vs TextAttrs confusion | Warning in ADR Decision 1 and Appendix A4; explicit test for Bold/Faint mapping in Stage 1 | 1 |
| Non-TUI scrollback loss | Acknowledged trade-off in ADR Decision 3 and 5; future improvement path documented | 2 |

---

## Estimated Complexity

| Stage | Description | Relative Size |
|-------|------------|---------------|
| 1 | avt WASM Bridge (de facto PoC) | Medium (Rust wrapper + TS types + build tooling) |
| 2 | Server Processing | Medium (streaming parser + avt integration + viewport snapshots) |
| 3 | Section Detection | Large (algorithm with co-primary signals + DB schema + repository + async integration) |
| 4 | Client Rendering | Medium (Vue components + CSS + API integration) |
| 5 | Migration | Small (reuses Stage 2+3 code, adds CLI wrapper) |
| 6 | Integration | Medium (E2E tests + performance + CI) |
