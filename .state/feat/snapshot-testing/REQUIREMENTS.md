# Requirements: Comprehensive Snapshot and Visual Regression Testing

Branch: feat/snapshot-testing
Date: 2026-02-26
Revised: 2026-02-26 (post adversarial review)

## Problem Statement

MVP v2 delivered a fully working terminal rendering pipeline, scrollback deduplication algorithm, and Vue-based session browser. Every correctness decision during that cycle — including the dedup algorithm's contiguous block matching, epoch boundary handling, and stutter removal — was validated by assertion-based tests only. There are zero snapshot files and zero visual regression screenshots.

This creates two concrete risks:

1. **Algorithm regressions go undetected.** The stashed `continuous-stream-dedup-rewrite` is ready to be merged once regressions are covered. Without locked snapshots, any change to the dedup algorithm that shifts its output is invisible until a human manually inspects the browser.

2. **UI regressions go undetected.** Vue component output, ANSI color rendering, and Playwright-level page layouts are not locked down. Future work (virtual scrolling, search, pagination) could silently break visual output.

The existing 217 tests across 15 files all pass, but none of them record and compare output against a known-good baseline.

## Desired Outcome

After this cycle:

- The scrollback dedup algorithm, section detector, and session pipeline all have locked Vitest snapshot files that will fail if their output changes.
- Every Vue component (all 7) has its rendered HTML snapshotted so structural regressions are caught automatically.
- Playwright visual regression tests comprehensively capture the full browser-rendered UI — landing page, session detail, terminal rendering, and error states — with 30+ screenshots that will fail if the layout drifts beyond a defined threshold.
- The test suite grows from 217 tests to at least 324 tests with at least 13 snapshot files and at least 31 committed screenshots.
- Any future developer merging the stashed continuous-stream-dedup-rewrite can run `test:snapshot` to immediately see which algorithm outputs changed.
- Zero production source files are modified in the process.

## Scope

### In Scope

- New test infrastructure: `playwright.config.ts`, shared test helpers in `tests/helpers/`, new npm scripts (`test:snapshot`, `test:visual`, `test:all`, `test:update-snapshots`)
- `@playwright/test` added as a devDependency
- `.gitignore` additions for Playwright artifacts (`test-results/`, `playwright-report/`, `tests/.test-data/`)
- `vite.config.ts` `environmentMatchGlobs` update to register new backend snapshot test paths under the `node` environment
- Backend Vitest snapshot tests in `tests/snapshots/backend/`:
  - `scrollback-dedup.snapshot.test.ts` (minimum 10 tests) — CRITICAL priority
  - `section-detector.snapshot.test.ts` (minimum 7 tests)
  - `session-pipeline.snapshot.test.ts` (minimum 4 tests)
  - `ndjson-stream.snapshot.test.ts` (minimum 5 tests)
  - `asciicast.snapshot.test.ts` (minimum 5 tests)
  - `vt-wasm.snapshot.test.ts` (minimum 10 tests)
- Frontend Vitest component snapshot tests in `tests/snapshots/frontend/`:
  - `terminal-snapshot.snapshot.test.ts` (minimum 10 tests)
  - `section-header.snapshot.test.ts` (minimum 5 tests)
  - `session-content.snapshot.test.ts` (minimum 6 tests)
  - `session-list.snapshot.test.ts` (minimum 5 tests)
  - `upload-zone.snapshot.test.ts` (minimum 4 tests)
  - `app-header.snapshot.test.ts` (minimum 2 tests)
  - `toast-container.snapshot.test.ts` (minimum 3 tests)
- Playwright visual regression tests in `tests/visual/`:
  - `landing-page.visual.test.ts` (minimum 8 tests)
  - `session-detail.visual.test.ts` (minimum 10 tests)
  - `terminal-rendering.visual.test.ts` (minimum 8 tests)
  - `error-states.visual.test.ts` (minimum 5 tests)
- Three new synthetic fixtures: `synthetic-dedup-3epoch.json`, `synthetic-vt-sequences.json`, `synthetic-tui-session.cast` (with screen clears and re-renders to exercise dedup pipeline path)
- Committed golden screenshots in `tests/visual/__screenshots__/` (Docker-generated for platform determinism)

### Out of Scope

- Any modification to any file under `src/`
- Moving or refactoring existing tests in `src/`
- Merging or integrating the stashed `continuous-stream-dedup-rewrite`
- Algorithm improvements of any kind
- Virtual scrolling, pagination, search, or filter features
- CI/CD pipeline configuration
- Performance benchmarks
- Authentication, multi-tenancy, or curation features

## Acceptance Criteria

### Infrastructure
- [ ] `@playwright/test` is present as a devDependency in `package.json`
- [ ] `playwright.config.ts` exists at the project root, auto-starts the dev server, waits for API readiness at `http://localhost:3000/api/sessions`, uses 1280x720 viewport, and sets `expect.toHaveScreenshot` globally with `maxDiffPixelRatio: 0.05` and `threshold: 0.2` (no individual test overrides)
- [ ] `tests/helpers/test-utils.ts` exists with `makeLine()`, `makeSnapshot()`, `makeStyledLine()`, `snapshotToText()`, `createCastContent()`, and `createCastContentWithEpochs()` helpers
- [ ] `tests/helpers/seed-visual-data.ts` exists with `uploadFixture()`, `waitForProcessing()`, and `deleteAllSessions()` Playwright helpers
- [ ] `vite.config.ts` `environmentMatchGlobs` includes `['tests/snapshots/backend/**', 'node']`
- [ ] `package.json` has `test:snapshot`, `test:visual`, `test:all`, and `test:update-snapshots` scripts
- [ ] `.gitignore` excludes `test-results/`, `playwright-report/`, and `tests/.test-data/`
- [ ] `tests/fixtures/synthetic-tui-session.cast` exists with screen clears and re-render patterns that exercise the dedup epoch pipeline path

### Backend Snapshot Tests — Scrollback Dedup
- [ ] `tests/snapshots/backend/scrollback-dedup.snapshot.test.ts` exists with a minimum of 10 tests
- [ ] Zero-epochs identity transform output is snapshotted
- [ ] 3-epoch progressive re-render clean line texts, line count, and `rawToClean` mapping are snapshotted
- [ ] Epoch boundary spanning known-limitation behavior is snapshotted
- [ ] Stutter removal clean output is snapshotted
- [ ] `rawToClean` for a stuttered line index verifies the probe-forward fallback behavior
- [ ] Interior block matching, multiple-blocks-within-single-epoch, and below-MIN_MATCH results are snapshotted
- [ ] Styled lines matching on text only is snapshotted
- [ ] `rawToClean` + `rawLineCountToClean` boundary mapping values are snapshotted
- [ ] Synthetic TUI fixture through VT + dedup integration snapshot captures clean line count and first/last 5 lines

### Backend Snapshot Tests — Section Detector
- [ ] `tests/snapshots/backend/section-detector.snapshot.test.ts` exists with a minimum of 7 tests
- [ ] Timing gap, screen clear, and alt-screen exit detection boundary positions and labels are snapshotted
- [ ] Multiple signals merged within window produces a snapshotted merged result
- [ ] `detectWithMarkers` marker precedence boundary list is snapshotted
- [ ] `valid-with-markers.cast` real fixture boundary array is snapshotted
- [ ] Maximum sections cap at 50: count and score range are snapshotted

### Backend Snapshot Tests — Session Pipeline
- [ ] `tests/snapshots/backend/session-pipeline.snapshot.test.ts` exists with a minimum of 4 tests
- [ ] CLI session with markers snapshots sections (type, label, startEvent, endEvent, startLine, endLine, hasSnapshot) and snapshot line count
- [ ] Synthetic TUI session with screen clears exercises the dedup epoch pipeline path (epochs > 0)
- [ ] Snapshots exclude nanoid-generated IDs, timestamps (`uploaded_at`, `created_at`), and sort sections by `start_event`
- [ ] Detection status transitions are snapshotted

### Backend Snapshot Tests — Parsing and VT
- [ ] `tests/snapshots/backend/ndjson-stream.snapshot.test.ts` exists with a minimum of 5 tests — fixture header, event count, first 5 events, and malformed JSON handling snapshotted
- [ ] `tests/snapshots/backend/asciicast.snapshot.test.ts` exists with a minimum of 5 tests — parsed/normalized headers, marker extraction, and cumulative time computation snapshotted
- [ ] `tests/snapshots/backend/vt-wasm.snapshot.test.ts` exists with a minimum of 10 tests — plain text, 16-color, 256-palette, true color `getView()` spans snapshotted; text attributes snapshotted; screen clear + redraw, scrollback, resize snapshotted; real fixture first 50 feed events resulting `getView()` snapshotted

### Frontend Component Snapshot Tests
- [ ] `tests/snapshots/frontend/terminal-snapshot.snapshot.test.ts` exists with a minimum of 10 tests — plain text, all color modes, all text attributes, line numbers, empty lines, and 100-line input HTML all snapshotted
- [ ] `tests/snapshots/frontend/section-header.snapshot.test.ts` exists with a minimum of 5 tests — expanded/collapsed, marker/detected type, viewport sections, and large line counts snapshotted
- [ ] `tests/snapshots/frontend/session-content.snapshot.test.ts` exists with a minimum of 6 tests — sections with line ranges, preamble, TUI viewports, empty state, and defaultCollapsed snapshotted
- [ ] `tests/snapshots/frontend/session-list.snapshot.test.ts` exists with a minimum of 5 tests — loading, empty, error, and populated states with router stub (including named `session-detail` route) snapshotted; uses fixed ISO dates for determinism
- [ ] `tests/snapshots/frontend/upload-zone.snapshot.test.ts` exists with a minimum of 4 tests — default, dragging, uploading, and error states snapshotted
- [ ] `tests/snapshots/frontend/app-header.snapshot.test.ts` exists with a minimum of 2 tests — default render snapshotted
- [ ] `tests/snapshots/frontend/toast-container.snapshot.test.ts` exists with a minimum of 3 tests — success, error, and info toast types snapshotted

### Playwright Visual Regression Tests
- [ ] `tests/visual/landing-page.visual.test.ts` exists with a minimum of 8 tests — empty state, with sessions, upload zone states, session card interactions
- [ ] `tests/visual/session-detail.visual.test.ts` exists with a minimum of 10 tests — loaded sections, collapsed/expanded, sticky headers, preamble, fold/unfold transitions
- [ ] `tests/visual/terminal-rendering.visual.test.ts` exists with a minimum of 8 tests — ANSI colors, line numbers, section header badges, horizontal scroll, terminal chrome
- [ ] `tests/visual/error-states.visual.test.ts` exists with a minimum of 5 tests — invalid session, empty session, processing failed, upload error, network-level errors
- [ ] All Playwright screenshots use `mask` to hide dynamic elements (timestamps, IDs, filenames)
- [ ] `playwright.config.ts` sets `expect.toHaveScreenshot` globally with `maxDiffPixelRatio: 0.05` and `threshold: 0.2` — no individual test overrides
- [ ] Golden screenshots committed in `tests/visual/__screenshots__/`
- [ ] `tests/visual/README.md` documents which OS, browser version, and environment generated the golden screenshots

### Snapshot Determinism
- [ ] Pipeline snapshots exclude `id`, `uploaded_at`, `created_at` — deterministic fields only
- [ ] Sections sorted by `start_event` before snapshotting
- [ ] Frontend tests use fixed IDs (`'section-1'`) and fixed ISO dates (`'2024-01-15T12:00:00Z'`)
- [ ] All imports from `tests/` to `src/` use the `.js` extension (ESM convention)
- [ ] `SessionList` test controls `Intl.DateTimeFormat` output for deterministic date rendering

### Snapshot Quality Gate
- [ ] All `.snap` files have been reviewed and confirmed to contain meaningful non-empty baselines (not blank, loading, or error-state captures)
- [ ] All `__screenshots__/*.png` have been reviewed and confirmed to show the intended visual state

### No Source Modifications
- [ ] `git diff --name-only HEAD` after implementation shows zero files changed under `src/`
- [ ] All new files are within `tests/`, `playwright.config.ts`, or `package.json` / `vite.config.ts` / `.gitignore` (infrastructure only)

### Outcome Metrics
- [ ] Total test files grow from 15 to at least 32
- [ ] Total tests grow from 217 to at least 324
- [ ] Snapshot files (.snap) grow from 0 to at least 13
- [ ] Committed visual screenshots grow from 0 to at least 31
- [ ] All existing 217 tests continue to pass

## Constraints

- Zero modifications to any file under `src/` — this is a hard constraint, not a preference
- All new test files go in `tests/` only
- All imports from `tests/` to `src/` must use the `.js` extension to match the project's ESM convention
- Visual regression uses `maxDiffPixelRatio: 0.05` and `threshold: 0.2` — genuinely flexible to tolerate font rendering differences across platforms
- Snapshots for session pipeline must exclude nanoid-generated IDs, timestamps, and sort sections by `start_event` to remain deterministic
- Frontend snapshot tests use fixed dates and stable IDs to avoid environment-dependent output
- The stashed `continuous-stream-dedup-rewrite` must NOT be merged during this cycle — it is the first consumer of these tests in the next cycle
- `initVt()` is idempotent; `beforeAll` is sufficient and preferred in all new test files

## Context

- MVP v2 is complete and merged to main as of 2026-02-18
- The scrollback dedup algorithm was the single most painful part of MVP v2 — multiple dead-end approaches were tried before the contiguous block matching solution was reached (see MEMORY.md "Scrollback Deduplication — Deep Technical Context")
- A stashed branch `continuous-stream-dedup-rewrite` exists and is ready to merge once snapshot tests protect against regressions — this is the primary motivation for this cycle
- Current test state: 217 tests, 15 files, all passing, zero snapshot files, zero screenshots, zero E2E tests
- Backend tests cover DB, storage, parsing, pipeline, and dedup via assertions only
- Frontend tests cover TerminalSnapshot only (12 assertion-based tests)
- Tech stack: Vitest (existing), Vue 3 + Vite (existing), VT WASM (existing), Playwright (new)
- The `valid-with-markers.cast` fixture has zero screen clears (no dedup epochs) — a synthetic TUI fixture with epochs is required for meaningful pipeline dedup testing
- Adversarial review identified: ESM `.js` import convention, Playwright port race condition, snapshot determinism gaps, and platform-dependent screenshot risks — all resolved in this revision

---
**Sign-off:** Pending
