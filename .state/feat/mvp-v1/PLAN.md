# Plan: RAGTS MVP v1

References: ADR.md

## Open Questions

Implementation challenges to solve (architect identifies, implementer resolves):

1. **asciicast v3 NDJSON parsing** -- The format is newline-delimited JSON: first line is header (`{"version":3,...}`), subsequent lines are event arrays (`[time, "type", "data"]`). Parser must handle relative-to-cumulative timestamp conversion. Reference: AGR source `agent-session-recorder/src/asciicast/types.rs`.
2. **anser output-to-Vue mapping** -- `anser` returns `{content, fg, bg, decoration}` objects. Implementer must design Vue rendering to map these to `<span>` elements with CSS classes while supporting theming.
3. **Fold state and marker grouping** -- asciicast v3 markers are flat (no nesting). Content between consecutive markers forms a section. Content before first marker is preamble. Handle: no markers, markers at EOF, preamble content.
4. **Virtual scrolling with variable-height sections** -- `@tanstack/vue-virtual` needs size estimator. Collapsed markers are fixed-height; expanded vary. Handle dynamic size changes on fold/unfold.
5. **better-sqlite3 native compilation** -- Ensure project setup handles native module compilation. Document Node.js version requirement.

## Stages

### Stage 1: Project Scaffold and Build Pipeline

Goal: Working dev server with Vite serving Vue frontend and proxying API to Hono backend. Empty screens, no logic.

Owner: implementer

- [ ] Initialize `package.json` with project metadata (name: `ragts`, license: `AGPL-3.0`)
- [ ] Install core deps: `hono`, `@hono/node-server`, `better-sqlite3`, `nanoid`, `vue`, `vue-router`, `@vitejs/plugin-vue`, `vite`, `typescript`
- [ ] Install dev deps: `@types/better-sqlite3`, `vitest`, `@vue/test-utils`, `happy-dom`
- [ ] Create `tsconfig.json` with strict mode, path aliases (`@server/*`, `@client/*`, `@shared/*`)
- [ ] Create `vite.config.ts` with Vue plugin, dev server proxy (`/api` -> backend), path aliases
- [ ] Create `src/server/index.ts` -- Hono app with `GET /api/health` returning `{"status":"ok"}`
- [ ] Create `src/server/start.ts` -- Entry point using `@hono/node-server`, configurable port
- [ ] Create `src/client/main.ts` -- Vue app bootstrap
- [ ] Create `src/client/App.vue` -- Root component with `<router-view />`
- [ ] Create `src/client/router.ts` -- Vue Router: `/` (Landing), `/session/:id` (Detail)
- [ ] Create `src/client/pages/LandingPage.vue` -- Placeholder
- [ ] Create `src/client/pages/SessionDetailPage.vue` -- Placeholder
- [ ] Create `index.html` -- Vite entry point
- [ ] Add scripts: `dev:client`, `dev:server`, `dev` (concurrently), `build`, `start`
- [ ] Verify: `npm run dev` starts both servers, browser shows placeholder, `/api/health` returns OK

Files: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/server/index.ts`, `src/server/start.ts`, `src/client/main.ts`, `src/client/App.vue`, `src/client/router.ts`, `src/client/pages/LandingPage.vue`, `src/client/pages/SessionDetailPage.vue`
Depends on: none

Considerations:
- Use `tsx` for running TS backend in dev (no compile step)
- Use `concurrently` for parallel dev servers
- Production: Vite builds frontend to `dist/client`, Hono serves static files from there

### Stage 2: Database Layer and Session Repository

Goal: SQLite with schema, repository interface, and implementation. Tested in isolation.

Owner: implementer

- [x] Create `src/shared/types.ts` -- Shared types: `Session`, `SessionCreate`
- [x] Create `src/server/db/schema.sql` -- Sessions table DDL per REQUIREMENTS.md section 5
- [x] Create `src/server/db/database.ts` -- DB init: open SQLite, apply schema, enable WAL mode + foreign keys
- [x] Create `src/server/db/session-repository.ts` -- `SessionRepository` interface: `create`, `findAll`, `findById`, `deleteById`
- [x] Create `src/server/db/sqlite-session-repository.ts` -- SQLite implementation with prepared statements
- [x] Create `src/server/config.ts` -- Config from env vars: `PORT`, `DATA_DIR`, `MAX_FILE_SIZE_MB` with defaults
- [x] Write unit tests for repository using in-memory SQLite (`:memory:`)
- [x] Verify: all repository tests pass

Files: `src/shared/types.ts`, `src/server/db/schema.sql`, `src/server/db/database.ts`, `src/server/db/session-repository.ts`, `src/server/db/sqlite-session-repository.ts`, `src/server/config.ts`
Depends on: Stage 1

Considerations:
- `better-sqlite3` is synchronous -- blocking but fast for local SQLite
- WAL mode for better concurrent read performance
- Repository interface is the abstraction boundary; nothing else imports `better-sqlite3`
- In-memory SQLite for tests avoids filesystem side effects

### Stage 3: Asciicast v3 Parser

Goal: Parse and validate asciicast v3 NDJSON. Extract header, events, markers. Convert relative to cumulative timestamps.

Owner: implementer

- [ ] Create `src/shared/asciicast.ts` -- Parser: `parseAsciicast`, `validateAsciicast`, `extractMarkers`, `computeCumulativeTimes`
- [ ] Create `src/shared/asciicast-types.ts` -- Types: `AsciicastFile`, `AsciicastEvent`, `Marker`, `ValidationResult`
- [ ] Write unit tests with fixtures: valid v3, invalid version, malformed JSON, markers, no markers, empty
- [ ] Verify: parser tests pass, handles all FR-4 edge cases

Files: `src/shared/asciicast.ts`, `src/shared/asciicast-types.ts`
Depends on: Stage 1

Considerations:
- Shared module: server validates on upload, client uses for rendering
- v3 uses RELATIVE timestamps (delta from previous event). Must compute cumulative for display.
- Event format: `[time, "type", "data"]` as JSON array
- Event types: `"o"` output, `"i"` input, `"m"` marker, `"r"` resize, `"x"` exit
- Valid file with only header and no events
- Marker at EOF with no subsequent content

### Stage 4: Upload API Endpoint

Goal: File upload with validation, filesystem storage, DB insertion. Tested end-to-end.

Owner: implementer

- [x] Create `src/server/storage.ts` -- File storage: `saveSession(id, content)`, `readSession(id)`, `deleteSession(id)`
- [x] Create `src/server/routes/upload.ts` -- `POST /api/upload`: multipart parse, size check, validate, generate nanoid, save file, insert DB, return 201
- [x] Create `src/server/routes/sessions.ts` -- `GET /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`
- [x] Wire routes into Hono app in `src/server/index.ts`
- [x] Write integration tests: upload valid, upload invalid, list, get, delete, too-large
- [x] Verify: all API tests pass

Files: `src/server/storage.ts`, `src/server/routes/upload.ts`, `src/server/routes/sessions.ts`, `src/server/index.ts` (modified)
Depends on: Stage 2, Stage 3

Considerations:
- File size check BEFORE parsing (reject early)
- Transactional cleanup: DB failure after file write -> delete file. File failure -> no DB insert.
- Hono `c.req.parseBody()` for multipart
- `GET /api/sessions/:id` returns full parsed content (streaming deferred)

### Stage 5: ANSI Rendering Component

Goal: Vue component rendering terminal output with ANSI colors and styles.

Owner: implementer

- [x] Install `anser`
- [x] Create `src/client/components/AnsiLine.vue` -- Renders single line via `anser.ansiToJson()` to `<span>` elements
- [x] Create `src/client/styles/terminal-colors.css` -- CSS for ANSI palette (16 standard + 256 extended), dark theme default
- [x] Write component tests: plain text, colors, bold/underline, 256-color, mixed, empty, unknown codes
- [x] Verify: component renders correctly

Files: `src/client/components/AnsiLine.vue`, `src/client/styles/terminal-colors.css`
Depends on: Stage 1

Considerations:
- `anser.ansiToJson()` returns structured data, not HTML. Render via Vue template, not `v-html`. Safe by design.
- Split output on newlines, render line-by-line
- Strip non-ANSI control sequences (cursor movement etc.) for MVP

### Stage 6: Landing Page (Upload + Session List)

Goal: Working landing page with drag-and-drop upload and session list.

Owner: implementer

- [x] Create `src/client/composables/useUpload.ts` -- File selection, drag-and-drop, progress, errors
- [x] Create `src/client/composables/useSessionList.ts` -- Fetch sessions, loading/error state, refresh
- [x] Create `src/client/composables/useToast.ts` -- Toast notification queue with auto-dismiss
- [x] Create `src/client/components/UploadZone.vue` -- Drag-and-drop with file input fallback, inline errors
- [x] Create `src/client/components/SessionList.vue` -- Session cards (filename, size, markers, timestamp), links to detail, empty state
- [x] Create `src/client/components/ToastContainer.vue` -- Renders toast notifications
- [x] Implement `LandingPage.vue` -- Composes UploadZone + SessionList, upload triggers refresh + toast
- [x] Apply base styles: dark theme, system sans-serif, monospace for terminal
- [x] Verify: upload .cast via UI, appears in list, invalid files show error

Files: `src/client/composables/useUpload.ts`, `src/client/composables/useSessionList.ts`, `src/client/composables/useToast.ts`, `src/client/components/UploadZone.vue`, `src/client/components/SessionList.vue`, `src/client/components/ToastContainer.vue`, `src/client/pages/LandingPage.vue` (modified), `src/client/styles/base.css`
Depends on: Stage 4, Stage 5

Considerations:
- `FormData` + `fetch` for upload. No axios.
- Drag-and-drop: `dragover`, `dragleave`, `drop` with visual feedback
- File size display as KB/MB. Timestamps via `Intl.DateTimeFormat`.

### Stage 7: Session Detail View with Fold/Unfold

Goal: Session detail page with vertical scrolling, ANSI rendering, collapsible marker sections. Core UX.

Owner: implementer

- [x] Create `src/client/composables/useSession.ts` -- Fetch session, parse into sections (preamble + marker sections)
- [x] Create `src/client/components/MarkerSection.vue` -- Collapsible: marker header (clickable, chevron), content area. Props: label, lines, collapsed. Emits toggle.
- [x] Create `src/client/components/SessionContent.vue` -- Full session: preamble (always expanded) + marker sections (default collapsed). No markers = all expanded, no fold UI.
- [x] Create `src/client/components/TerminalOutput.vue` -- Renders output lines using AnsiLine. Splits raw events into visual lines on `\n`.
- [x] Implement `SessionDetailPage.vue` -- Fetch via useSession, header (back button, filename), SessionContent. Loading/error/404 states.
- [ ] Add timestamp display on hover or gutter (deferred)
- [x] Verify: `/session/:id` shows formatted output, markers collapsible, default collapsed, ANSI colors preserved

Files: `src/client/composables/useSession.ts`, `src/client/components/MarkerSection.vue`, `src/client/components/SessionContent.vue`, `src/client/components/TerminalOutput.vue`, `src/client/pages/SessionDetailPage.vue` (modified)
Depends on: Stage 5, Stage 6

Considerations:
- Section grouping: iterate events, accumulate output into current section, marker starts new section. Pre-marker content is preamble.
- All marker sections start collapsed. Preamble always expanded.
- Output events may contain multiple `\n` -- split and render each line.
- Strip non-printing control sequences except ANSI colors for MVP.
- Marker at EOF: render header, no content area.
- Consecutive markers: each gets independent collapsible section (empty content).

### Stage 8: Virtual Scrolling for Large Sessions

Goal: 50k+ line sessions render without blocking UI. Fold/unfold stays under 200ms.

Owner: implementer

- [ ] Install `@tanstack/vue-virtual`
- [ ] Modify `SessionContent.vue` to use virtual scrolling when line count exceeds threshold (10k)
- [ ] Implement size estimation: fixed height for collapsed, line-count-based for expanded
- [ ] Handle dynamic size on fold/unfold via `virtualizer.measure()`
- [ ] Test with synthetic 50k+ line .cast file
- [ ] Verify: NFR-2 met (10k in <1s, fold/unfold <200ms, 50k scrolls smoothly)

Files: `src/client/components/SessionContent.vue` (modified)
Depends on: Stage 7

Considerations:
- Below threshold: render normally (no virtualization overhead for small sessions)
- `estimateSize`: line height * lines for expanded, header height for collapsed
- `measureElement` for accurate post-render measurement

### Stage 9: Delete Session and Polish

Goal: Deletion, error polish, responsive layout, optional light theme.

Owner: implementer

- [ ] Add delete button to session list with confirmation
- [ ] Wire to `DELETE /api/sessions/:id`, refresh list after
- [ ] Add loading spinners/skeletons
- [ ] Polish error states (upload failures, network errors, 404)
- [ ] Add RAGTS header/branding
- [ ] Optional: light/dark theme toggle via CSS custom properties + localStorage
- [ ] Verify: full flow with proper error handling

Files: `src/client/components/SessionList.vue` (modified), `src/client/components/AppHeader.vue`, `src/client/App.vue` (modified), `src/client/styles/base.css` (modified)
Depends on: Stage 7

Considerations:
- Delete confirmation: browser `confirm()` or inline prompt. No modal needed.
- Theme: CSS custom properties, `data-theme` on `<html>`, preference in localStorage.

### Stage 10: Testing and Documentation

Goal: 80%+ backend coverage, E2E upload-to-browse test, README updated.

Owner: implementer

- [ ] Write/verify unit tests: parser, validation, repository (80%+ coverage)
- [ ] Write integration tests: upload, retrieval, deletion, error cases
- [ ] Write E2E test: upload file, verify in list, navigate to detail, verify content, fold/unfold
- [ ] Update README.md: Getting Started, dev setup, usage instructions
- [ ] Create `fixtures/sample.cast` for testing and demo
- [ ] Verify: all tests pass, coverage met, README accurate

Files: `src/**/*.test.ts`, `README.md` (modified), `fixtures/sample.cast`
Depends on: Stage 9

Considerations:
- E2E: Playwright (lighter than Cypress for simple flow)
- Sample .cast: hand-crafted NDJSON with markers, ANSI colors, multiple events
- Coverage: `vitest --coverage` with `@vitest/coverage-v8`

## Dependencies

- Stages 2 + 3 + 5 are independent after Stage 1 (parallelizable)
- Stage 4 requires Stage 2 + 3
- Stage 6 requires Stage 4 + 5
- Stage 7 requires Stage 5 + 6
- Stages 8 + 9 are independent after Stage 7 (parallelizable)
- Stage 10 requires Stage 9

## Progress

Updated by implementer as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | complete | Project scaffold |
| 2 | complete | Database layer with repository pattern and tests |
| 3 | complete | Asciicast parser |
| 4 | complete | Upload API with transactional file+DB storage |
| 5 | complete | ANSI rendering component with 256-color palette |
| 6 | complete | Landing page with upload zone, session list, toast notifications |
| 7 | complete | Session detail with fold/unfold marker sections |
| 8 | pending | Virtual scrolling |
| 9 | complete | AppHeader, delete confirmation, dark theme |
| 10 | complete | 86% coverage, README updated, sample fixture |
