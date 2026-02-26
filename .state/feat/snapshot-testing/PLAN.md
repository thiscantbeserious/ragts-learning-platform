# Plan: Snapshot and Visual Regression Testing

References: ADR.md

## Open Questions

Implementation challenges to solve (architect identifies, implementer resolves):

1. **Fixture data for synthetic dedup tests.** The `synthetic-dedup-3epoch.json` fixture needs pre-built `TerminalSnapshot` + `EpochBoundary[]` data. The implementer constructs this using the `makeLine`/`makeSnapshot` helpers and the `buildCleanDocument` API signature.

2. **Synthetic TUI session fixture.** `tests/fixtures/synthetic-tui-session.cast` must contain screen clear sequences (`\x1b[2J`) and re-render patterns that produce epoch boundaries when replayed through VT. The implementer must verify this fixture produces epochs > 0 in the pipeline.

3. **Playwright seed data lifecycle.** Visual regression tests need uploaded and processed sessions. `waitForProcessing()` must poll `detection_status` until `'completed'` with a 30-second timeout and 200ms polling interval. Handle the `'failed'` status as a test error.

4. **Dynamic element masking in Playwright.** The implementer must identify all dynamic selectors to mask: `.session-detail-page__title`, any element rendering `uploaded_at`, session IDs in URLs, and timestamp text in session cards. Build a reusable mask array.

5. **Frontend type imports.** New tests in `tests/snapshots/frontend/` must import the `Section` type from `@client/composables/useSession` (using the Vite alias). The `SessionList` router stub must include a named route `{ name: 'session-detail', path: '/sessions/:id' }`.

## Determinism Checklist

All snapshot tests must follow these rules:

- [ ] Pipeline snapshots exclude `id`, `uploaded_at`, `created_at` — deterministic fields only
- [ ] Sections sorted by `start_event` before snapshotting
- [ ] Frontend tests use fixed IDs (`'section-1'`, `'section-2'`) and fixed ISO dates (`'2024-01-15T12:00:00Z'`)
- [ ] All imports from `tests/` use `.js` extension (ESM convention: `../../../src/server/processing/scrollback-dedup.js`)
- [ ] `initVt()` called in `beforeAll` (idempotent — `beforeAll` is sufficient and preferred)
- [ ] `SessionList` test controls date rendering for deterministic output
- [ ] NdjsonStream snapshots capture parsed data, not filesystem paths
- [ ] Playwright screenshots mask all dynamic elements (timestamps, IDs, filenames)

## Stages

### Stage 1: Infrastructure

Goal: Install dependencies, create config files, add shared helpers and fixtures. All existing 217 tests must still pass after this stage.
Owner: Implementer

- [ ] Install `@playwright/test` as devDependency and run `npx playwright install chromium`
- [ ] Create `playwright.config.ts` at project root:
  - `testDir: './tests/visual'`
  - `webServer.command: 'npm run dev'`
  - `webServer.url: 'http://localhost:3000/api/sessions'` (wait for API readiness, not just Vite)
  - Chromium only, 1280x720 viewport
  - `expect.toHaveScreenshot: { maxDiffPixelRatio: 0.05, threshold: 0.2 }` (global, not per-test)
  - `snapshotPathTemplate` targeting `tests/visual/__screenshots__/`
- [ ] Add `['tests/snapshots/backend/**', 'node']` to `vite.config.ts` `environmentMatchGlobs`
- [ ] Add npm scripts to `package.json`: `test:snapshot`, `test:visual`, `test:all`, `test:update-snapshots`
- [ ] Add `test-results/`, `playwright-report/`, `tests/.test-data/` to `.gitignore`
- [ ] Create `tests/helpers/test-utils.ts` with `makeLine()`, `makeSnapshot()`, `makeStyledLine()`, `snapshotToText()`, `createCastContent()`, `createCastContentWithEpochs()`
- [ ] Create `tests/helpers/seed-visual-data.ts` with `uploadFixture()`, `waitForProcessing(id, 30000)`, `deleteAllSessions()`
- [ ] Create `tests/fixtures/synthetic-dedup-3epoch.json` with pre-built epoch data
- [ ] Create `tests/fixtures/synthetic-vt-sequences.json` with escape sequence test data
- [ ] Create `tests/fixtures/synthetic-tui-session.cast` with screen clears and re-render patterns (must produce epochs > 0)
- [ ] Verify: `npx vitest run` passes all 217 existing tests (no regressions from config changes)

Files:
- `playwright.config.ts` (new)
- `vite.config.ts` (modify: 1 line in environmentMatchGlobs)
- `package.json` (modify: devDependency + 4 scripts)
- `.gitignore` (modify: 3 lines added)
- `tests/helpers/test-utils.ts` (new)
- `tests/helpers/seed-visual-data.ts` (new)
- `tests/fixtures/synthetic-dedup-3epoch.json` (new)
- `tests/fixtures/synthetic-vt-sequences.json` (new)
- `tests/fixtures/synthetic-tui-session.cast` (new)

Depends on: none

Considerations:
- The `tests/helpers/test-utils.ts` helpers duplicate `makeLine`/`makeSnapshot` from `scrollback-dedup.test.ts` intentionally — existing helpers are local and cannot be imported without modifying `src/`.
- `createCastContentWithEpochs()` must generate cast content with `\x1b[2J` (clear screen) sequences that produce epoch boundaries during VT replay.
- Playwright `webServer.url` must point to the API server (port 3000), not Vite (5173), to avoid the race condition where Vite starts before Hono is ready.

### Stage 2: Backend Snapshot Tests

Goal: Add Vitest snapshot tests for all backend processing modules. Generate and commit `.snap` files as golden baselines.
Owner: Implementer

- [ ] Create `tests/snapshots/backend/scrollback-dedup.snapshot.test.ts` (minimum 10 tests): zero-epochs identity, 3-epoch progressive re-renders (clean texts + rawToClean mapping array), epoch boundary spanning, stutter removal, rawToClean for stuttered line index (probe-forward fallback), interior block matching, multiple blocks in single epoch, below MIN_MATCH, styled lines text matching, synthetic TUI fixture via VT + dedup integration
- [ ] Create `tests/snapshots/backend/section-detector.snapshot.test.ts` (minimum 7 tests): timing gap, screen clear, alt-screen exit, multiple signals merged, detectWithMarkers precedence, valid-with-markers.cast fixture, max sections cap at 50
- [ ] Create `tests/snapshots/backend/session-pipeline.snapshot.test.ts` (minimum 4 tests): CLI session with markers (serialized sections excluding IDs/timestamps, sorted by start_event + snapshot line count), synthetic TUI session with epochs (exercises dedup path), valid-with-markers.cast full pipeline, detection status transitions. Uses `mkdtempSync`/`initDatabase`/`SqliteSessionRepository`/`SqliteSectionRepository` pattern.
- [ ] Create `tests/snapshots/backend/ndjson-stream.snapshot.test.ts` (minimum 5 tests): fixture header + event count, header-only, malformed JSON handling, first 5 events verbatim
- [ ] Create `tests/snapshots/backend/asciicast.snapshot.test.ts` (minimum 5 tests): parsed headers, marker extraction, cumulative time computation, v3 header normalization, event type parsing
- [ ] Create `tests/snapshots/backend/vt-wasm.snapshot.test.ts` (minimum 10 tests): plain text, 16-color, 256-palette, true color spans, bold/italic/underline/strikethrough/faint/inverse attributes, screen clear + redraw, scrollback beyond viewport, resize getSize + getView, real fixture first 50 feed events getView(). Uses `await initVt()` in `beforeAll`.
- [ ] Verify: `npx vitest run tests/snapshots/backend` passes all >= 41 tests with `.snap` files generated

Files:
- `tests/snapshots/backend/scrollback-dedup.snapshot.test.ts` (new)
- `tests/snapshots/backend/section-detector.snapshot.test.ts` (new)
- `tests/snapshots/backend/session-pipeline.snapshot.test.ts` (new)
- `tests/snapshots/backend/ndjson-stream.snapshot.test.ts` (new)
- `tests/snapshots/backend/asciicast.snapshot.test.ts` (new)
- `tests/snapshots/backend/vt-wasm.snapshot.test.ts` (new)
- `tests/snapshots/backend/__snapshots__/*.snap` (generated)

Depends on: Stage 1

Considerations:
- `scrollback-dedup.snapshot.test.ts` is the highest priority file — primary motivation for this cycle.
- Section serialization excludes nanoid IDs and timestamps: `sections.map(s => ({ type: s.type, label: s.label, startEvent: s.start_event, endEvent: s.end_event, startLine: s.start_line, endLine: s.end_line, hasSnapshot: s.snapshot !== null })).sort((a, b) => a.startEvent - b.startEvent)`.
- Import paths use `.js` extension: `import { buildCleanDocument } from '../../../src/server/processing/scrollback-dedup.js'`.
- `initVt()` is idempotent. `beforeAll` is sufficient everywhere. `processSessionPipeline` calls `initVt()` internally.
- All 6 test files within this stage can be implemented in parallel (no shared file ownership).

### Stage 3: Frontend Snapshot Tests

Goal: Add Vitest component HTML snapshot tests for all 7 Vue components. Generate and commit `.snap` files.
Owner: Implementer

- [ ] Create `tests/snapshots/frontend/terminal-snapshot.snapshot.test.ts` (minimum 10 tests): plain text, standard ANSI colors (fg=1,4 bg=2), 256 palette (fg=208), true color (fg='#ff5733'), all text attributes, combined attrs+colors, line numbers with offset, empty lines, 100-line large input, grayscale (fg=240)
- [ ] Create `tests/snapshots/frontend/section-header.snapshot.test.ts` (minimum 5 tests): expanded marker, collapsed marker, detected type, viewport section (null line ranges), large line count (42839)
- [ ] Create `tests/snapshots/frontend/session-content.snapshot.test.ts` (minimum 6 tests): sections with line ranges, preamble rendering, TUI viewport section, empty state, mixed CLI + TUI, defaultCollapsed (prop-only, no event-driven toggling)
- [ ] Create `tests/snapshots/frontend/session-list.snapshot.test.ts` (minimum 5 tests): loading, empty, error, populated (3 sessions), zero markers. Router stub with named `session-detail` route. Fixed ISO dates for determinism.
- [ ] Create `tests/snapshots/frontend/upload-zone.snapshot.test.ts` (minimum 4 tests): default, dragging, uploading, error states.
- [ ] Create `tests/snapshots/frontend/app-header.snapshot.test.ts` (minimum 2 tests): default render, brand link present
- [ ] Create `tests/snapshots/frontend/toast-container.snapshot.test.ts` (minimum 3 tests): success, error, info toast types
- [ ] Verify: `npx vitest run tests/snapshots/frontend` passes all >= 35 tests with `.snap` files generated

Files:
- `tests/snapshots/frontend/terminal-snapshot.snapshot.test.ts` (new)
- `tests/snapshots/frontend/section-header.snapshot.test.ts` (new)
- `tests/snapshots/frontend/session-content.snapshot.test.ts` (new)
- `tests/snapshots/frontend/session-list.snapshot.test.ts` (new)
- `tests/snapshots/frontend/upload-zone.snapshot.test.ts` (new)
- `tests/snapshots/frontend/app-header.snapshot.test.ts` (new)
- `tests/snapshots/frontend/toast-container.snapshot.test.ts` (new)
- `tests/snapshots/frontend/__snapshots__/*.snap` (generated)

Depends on: Stage 1

Considerations:
- Frontend tests run in `happy-dom` (default) — no environmentMatchGlobs entry needed.
- Import `Section` type via `@client/composables/useSession` (Vite alias). Use stable IDs like `'section-1'`.
- `SessionList.vue` needs router with named routes: `createRouter({ history: createMemoryHistory(), routes: [{ path: '/', name: 'home', component: { template: '<div/>' } }, { path: '/sessions/:id', name: 'session-detail', component: { template: '<div/>' } }] })`.
- `SessionContent.vue` collapsed/expanded testing uses `defaultCollapsed` prop only (no click interaction needed for snapshots).
- `UploadZone.vue` props: `uploading: boolean`, `error: string | null`, `isDragging: boolean`.
- All 7 test files within this stage can be implemented in parallel.
- Stages 2 and 3 can be implemented in parallel (no file overlap).

### Stage 4: Playwright Visual Regression Tests

Goal: Add comprehensive Playwright screenshot tests for all page states, error paths, and visual details. Generate and commit golden screenshots. **Minimum 31 tests across 4 files.**
Owner: Implementer

- [ ] Create `tests/visual/landing-page.visual.test.ts` (minimum 8 tests):
  - Empty state (no sessions)
  - With 1 session uploaded
  - With 3+ sessions (grid layout)
  - Upload zone default state
  - Upload zone hover/drag-over
  - Upload in progress (spinner)
  - Upload error displayed
  - Session card hover / after delete
- [ ] Create `tests/visual/session-detail.visual.test.ts` (minimum 10 tests):
  - Loading state
  - Loaded with terminal content + sections
  - All sections expanded
  - All sections collapsed
  - Mixed expanded/collapsed
  - Sticky header on scroll
  - Back navigation link
  - Preamble visible before first section
  - Section fold/unfold transition
  - Large section with many lines
- [ ] Create `tests/visual/terminal-rendering.visual.test.ts` (minimum 8 tests):
  - ANSI 16-color rendering
  - Line numbers aligned
  - Section header marker badge
  - Section header detected badge
  - Terminal horizontal scroll (wide content)
  - Empty terminal state
  - Multiple sections with different content
  - Full terminal chrome (border, background, padding)
- [ ] Create `tests/visual/error-states.visual.test.ts` (minimum 5 tests):
  - Invalid session ID (404-like state)
  - Empty session (no content after processing)
  - Session with processing failed status
  - Upload of invalid file
  - Network error display
- [ ] Create `tests/visual/README.md` documenting screenshot generation environment (OS, browser version, Docker image if used)
- [ ] Generate golden screenshots and commit to `tests/visual/__screenshots__/`
- [ ] Verify: `npx playwright test` passes all >= 31 tests with screenshots matching

Files:
- `tests/visual/landing-page.visual.test.ts` (new)
- `tests/visual/session-detail.visual.test.ts` (new)
- `tests/visual/terminal-rendering.visual.test.ts` (new)
- `tests/visual/error-states.visual.test.ts` (new)
- `tests/visual/README.md` (new)
- `tests/visual/__screenshots__/**/*.png` (generated, committed)

Depends on: Stage 1

Considerations:
- Each test uses `deleteAllSessions()` in `beforeEach` for clean state, then seeds via `uploadFixture()` + `waitForProcessing()`.
- Dynamic elements MUST be masked: session titles, upload timestamps, nanoid IDs, any `uploaded_at` display. Build a shared mask array.
- `maxDiffPixelRatio: 0.05` set globally in config — no per-test overrides.
- Docker-based screenshot generation for determinism. Document environment in `README.md`.
- Stage 4 can run in parallel with Stages 2 and 3 (no file overlap).

### Stage 5: Verification and Commit

Goal: Run the full test suite, review all generated snapshots and screenshots, verify zero `src/` modifications, confirm quality gate.
Owner: Implementer

- [ ] Run `npx vitest run` — all 217 existing + >= 76 new snapshot tests pass (total >= 293)
- [ ] Run `npx playwright test` — all >= 31 visual tests pass
- [ ] Run `npm run test:all` — combined command succeeds
- [ ] Run `npm run test:update-snapshots` — verify update workflow works
- [ ] Run `npx playwright test --update-snapshots` — verify Playwright update workflow works
- [ ] Verify `git diff --name-only` shows zero files changed under `src/`
- [ ] Review all `.snap` files — confirm non-empty, meaningful baselines (not blank/loading/error captures)
- [ ] Review all `__screenshots__/*.png` — confirm correct visual state
- [ ] Count: >= 32 test files, >= 324 tests, >= 13 snapshot files, >= 31 screenshots
- [ ] Paste `.snap` file content summaries in PR description for PO review

Files: none (verification only)
Depends on: Stages 2, 3, and 4

Considerations:
- The `.snap` files and screenshots must be committed — they ARE the golden baselines.
- First-generation snapshots require careful human review. Every `.snap` file must be opened and verified.
- If any existing test fails, investigate regression from config changes (Stage 1) before proceeding.
- Each `.snap` file content summary in the PR gives PO a review artifact.

## Dependencies

```
Stage 1 (infrastructure) ──┬──> Stage 2 (backend snapshots)  ──┐
                            ├──> Stage 3 (frontend snapshots) ──┼──> Stage 5 (verification)
                            └──> Stage 4 (Playwright visual)  ──┘
```

- Stage 1 must complete before any other stage (config, helpers, fixtures needed by all).
- Stages 2, 3, and 4 can all run in parallel — zero file overlap.
- Within Stage 2, all 6 backend test files can be implemented in parallel.
- Within Stage 3, all 7 frontend test files can be implemented in parallel.
- Within Stage 4, all 4 Playwright test files can be implemented in parallel.
- Stage 5 depends on all of Stages 2, 3, and 4 completing.

## Progress

Updated by implementer as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | pending | |
| 2 | pending | |
| 3 | pending | |
| 4 | pending | |
| 5 | pending | |
