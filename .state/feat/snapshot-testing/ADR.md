# ADR: Snapshot and Visual Regression Testing

## Status
Proposed (revised post adversarial review)

## Context

MVP v2 shipped 217 assertion-based tests across 15 files. Every test validates behavior through explicit `expect()` calls, but none records and compares output against a known-good baseline. This means:

1. **Algorithm regressions are invisible.** The scrollback dedup algorithm (the hardest part of MVP v2, with multiple failed approaches before the contiguous block matching solution) produces complex structured output. A stashed `continuous-stream-dedup-rewrite` branch is ready to merge but cannot safely land without locked baselines to diff against.

2. **UI regressions are invisible.** Vue component rendering (ANSI colors, line numbers, section headers) and full-page layouts are not locked down. Future work (virtual scrolling, search, pagination) could silently break visual output.

The goal is to add three layers of regression protection -- Vitest data snapshots, Vitest HTML snapshots, and Playwright visual screenshots -- without modifying any production source file under `src/`.

Forces at play:
- The existing `vite.config.ts` test include pattern (`tests/**/*.{test,spec}.{js,ts}`) already covers new test paths in `tests/`.
- Backend tests require the `node` environment; frontend tests use the default `happy-dom`.
- The VT WASM module requires async `initVt()` before use — but it is idempotent (early-returns if already initialized).
- Session pipeline tests follow a specific setup pattern (`mkdtempSync`, `initDatabase`, repository instantiation).
- All existing imports in the project use `.js` extensions (ESM convention with `"type": "module"` in package.json).
- Playwright is a new dependency; the project currently has zero E2E tests.
- The `npm run dev` command starts two servers via `concurrently`: Vite (5173) and Hono (3000). Both must be ready for visual tests.

## Options Considered

### Option 1: Vitest Snapshots Only
- Pros: Zero new dependencies. Fast execution (~1-2s). Locks algorithm outputs and component HTML. Covers the primary use case (protecting dedup before merging the stashed rewrite).
- Cons: HTML snapshots capture DOM structure but miss CSS rendering bugs. Cannot catch pixel-level regressions. No protection against visual drift. Does not match the "VERY VERY extended" testing requirement.

### Option 2: Playwright Visual Regression Only
- Pros: Catches everything visible to a user — CSS, layout, colors, fonts, scroll behavior. Holistic end-to-end coverage.
- Cons: Requires new dependency plus Chromium install. Slow (~30-60s). Cannot pinpoint which algorithm output changed. Requires running dev server. Dynamic elements must be masked. Not granular enough for algorithm-level verification.

### Option 3: Vitest Snapshots + Playwright Visual Regression — Both Layers (CHOSEN)
- Pros: Complementary — Vitest is fast and granular (locks algorithm output), Playwright is holistic (locks visual rendering). 76+ Vitest snapshot tests for data/HTML correctness. 31+ Playwright tests for comprehensive visual coverage including error states and interactions. Developers run `test:snapshot` during development (fast) and `test:visual` before merge.
- Cons: Two test runners. Chromium install required. Screenshot files add ~5-10MB to repo. Two update workflows.

## Decision

**Option 3: Both Vitest Snapshots + Playwright Visual Regression.**

Key sub-decisions:

**1. Test file location:** All new tests in `tests/`, split into `snapshots/backend/`, `snapshots/frontend/`, and `visual/`. Respects zero `src/` modification constraint. Enables `vitest run tests/snapshots` for targeted runs.

**2. Import convention:** All imports from `tests/` to `src/` use the `.js` extension to match the project's ESM convention. Example: `import { buildCleanDocument } from '../../../src/server/processing/scrollback-dedup.js'`. Frontend tests may use the `@client` alias.

**3. Playwright configuration:**
- `webServer.url: 'http://localhost:3000/api/sessions'` — waits for API server readiness, not just Vite frontend. This resolves the race condition where Vite starts instantly but Hono needs compilation time.
- Chromium only (DOM-based rendering, no cross-browser variance expected).
- `maxDiffPixelRatio: 0.05`, `threshold: 0.2` — genuinely flexible thresholds that tolerate font rendering differences across platforms.
- Docker-based screenshot generation for platform determinism. Environment documented in `tests/visual/README.md`.

**4. Snapshot granularity:** Backend data snapshots use `toMatchSnapshot()` for full output arrays. Frontend HTML snapshots use `wrapper.html()`. Pipeline snapshots exclude nanoid IDs, timestamps, and sort sections by `start_event`. Frontend tests use fixed IDs and fixed ISO dates.

**5. `initVt()` lifecycle:** `initVt()` is idempotent (checks `if (wasmModule) return`). `beforeAll` is sufficient and preferred in all new tests. `processSessionPipeline` calls `initVt()` internally, so pipeline tests do not strictly need it — but including it for explicitness is harmless.

**6. Environment configuration:** Add `['tests/snapshots/backend/**', 'node']` to `environmentMatchGlobs`. Frontend snapshot tests use default `happy-dom`.

**7. Fixture strategy:** The existing `valid-with-markers.cast` has zero screen clears (no dedup epochs). A synthetic `tests/fixtures/synthetic-tui-session.cast` with screen clears and re-renders is created to exercise the dedup pipeline path. This avoids needing the 57MB real reference session while still testing the critical code path.

**8. Comprehensive Playwright scope:** 30+ visual tests across 4 files covering all page states, error paths, interactions, and component visual details. This matches the "VERY VERY extended" emphasis.

## Consequences

What becomes easier:
- Merging the stashed `continuous-stream-dedup-rewrite` — run `test:snapshot` to see exactly which outputs changed
- Detecting UI regressions from future CSS or component changes
- Reviewing algorithm changes — snapshot diffs show exact before/after
- Onboarding contributors — snapshots document expected behavior as committed artifacts
- Catching error state regressions (404, network errors, processing failures)

What becomes harder:
- Contributors need Chromium installed (`npx playwright install chromium`)
- Two separate test commands (`test:snapshot` for Vitest, `test:visual` for Playwright)
- Screenshot files committed to repo (~5-10MB with 31+ screenshots)
- Intentional output changes require snapshot updates (`vitest -u` and/or `playwright --update-snapshots`)
- First `.snap` generation requires careful human review before committing
- Screenshot regeneration needed when switching between development environments

Follow-ups for later:
- CI pipeline integration (explicitly out of scope)
- Snapshot tests for new components added in future cycles
- Cross-browser visual testing if issues appear

## Decision History

1. Vitest + Playwright dual-layer strategy chosen — Vitest locks algorithm output (fast, granular), Playwright catches visual regressions (CSS, layout).
2. All new tests in `tests/` — respects hard `src/` constraint, enables independent test runs.
3. All imports use `.js` extension — matches project ESM convention required by `"type": "module"`.
4. Playwright waits for API readiness at `http://localhost:3000/api/sessions` — fixes race condition where Vite starts before Hono.
5. `maxDiffPixelRatio: 0.05` (5% pixel tolerance) — genuinely flexible for cross-platform font rendering.
6. Docker-based screenshot generation — ensures platform determinism.
7. `initVt()` uses `beforeAll` everywhere — it is idempotent, `beforeAll` is sufficient.
8. Pipeline snapshots exclude IDs + timestamps, sort sections by `start_event` — ensures determinism.
9. Synthetic TUI fixture with epochs created — exercises dedup pipeline path without the 57MB reference session.
10. Playwright expanded to 30+ tests across 4 files — matches user's "VERY VERY extended" emphasis.
11. Frontend tests use `@client` alias for type imports, stable IDs, fixed ISO dates.
12. AppHeader and ToastContainer added to component snapshot coverage — all 7 components covered.
