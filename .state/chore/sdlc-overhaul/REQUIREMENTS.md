# Requirements: SDLC Infrastructure Overhaul

## Problem Statement

The agent infrastructure files were left in an incomplete, partially-migrated state after the tech stack was decided. Three categories of stale content blocked the SDLC from functioning correctly:

1. **TBD placeholders** — Three instruction files still contained "TBD - tech stack not yet decided" blocks. Agents reading these files would receive no actionable guidance on how to run tests, verify code, or write new tests, because the commands section was empty and the framework section deferred to a future decision that had already been made.

2. **Rust terminology leakage** — The reviewer and settings files still contained Rust-specific language (`empty vec`, `usize::MAX`, `i64::MAX`, `Panic on valid input`) and a Rust documentation domain (`docs.rs`). A TypeScript project has no Rust collections, no Rust primitive overflow types, and no reason to fetch Rust documentation. These references would mislead any agent performing a code review by applying wrong language semantics to TypeScript/Vue code.

3. **Missing roles and static SDLC** — The SDLC had no specialized roles for visual design or split frontend/backend implementation. The coordinator was static: it always spawned the same set of roles regardless of task type. There was no design iteration phase. Frontend and backend work was conflated into a single generic implementer role, making it impossible to scope agents correctly for a project with a clear client/server split (Vue 3 frontend + Hono backend).

4. **AGENTS.md gap** — The RAGTS AGENTS.md was missing the bootstrapping sections present in the AGR companion project: "Your Purpose" (skill auto-load), "Startup Proposal" (SDLC vs Direct Assist), and "The Project" (README pointer). Agents starting a session had no structured on-ramp.

## Desired Outcome

After the overhaul:
- Every instruction file contains real, runnable commands matched to the actual TypeScript/Vue/Hono/Vitest stack
- No Rust-specific terminology, types, or documentation domains remain in any SDLC file
- The coordinator dynamically selects roles based on task type and file path patterns
- A frontend designer role exists and is triggered when the coordinator identifies UI work in the PLAN
- Specialized frontend-engineer and backend-engineer roles exist as alternatives to the generic implementer
- A self-hosted Penpot design stack can be launched via docker compose for design sessions
- AGENTS.md bootstraps agents with the same structure as the AGR project

## Scope

### In Scope

- `agents/skills/instructions/references/commands.md` — Replace TBD block with Vitest, Playwright, vue-tsc, and Docker commands
- `agents/skills/instructions/references/verification.md` — Replace TBD block with actual verification commands
- `agents/skills/instructions/references/tdd.md` — Replace TBD framework block with Vitest configuration, environment pragmas, and snapshot testing guidance
- `agents/skills/instructions/references/project.md` — Rewrite to reflect actual tech stack and codebase structure
- `agents/skills/instructions/references/sdlc.md` — Rewrite to include new roles and dynamic selection table
- `agents/skills/roles/references/reviewer.md` — Replace Rust-specific terminology with TypeScript/JavaScript equivalents
- `agents/skills/roles/references/coordinator.md` — Rewrite with dynamic role selection logic and design iteration phase
- `agents/skills/roles/references/frontend-engineer.md` — New role file scoped to `src/client/` and `src/shared/`
- `agents/skills/roles/references/backend-engineer.md` — New role file scoped to `src/server/` and `packages/`
- `agents/skills/roles/references/frontend-designer.md` — New role file for Penpot-based visual design with iteration cap
- `.claude/settings.local.json` — Remove `docs.rs`, add `vitejs.dev`, `vitest.dev`, `hono.dev`, `vuejs.org`
- `docker-compose.yml` — New file providing the Penpot self-hosted design stack (7 services including MCP server)
- `AGENTS.md` — Add "Your Purpose", "Startup Proposal", and "The Project" bootstrap sections

### Out of Scope

- Any file under `src/` — no application code changes
- Any file under `packages/` — no WASM or build changes
- Any file under `tests/` — no test file changes
- Any changes to the Penpot MCP server configuration itself (that is a local environment concern)
- Any changes to the SDLC state files for other branches

## Acceptance Criteria

### TBD Placeholder Removal

- [x] `commands.md` contains no occurrence of "TBD" and includes runnable commands for: `npx vitest run`, `npm test`, `npx vitest run --coverage`, `npx playwright test`, `npx vue-tsc --noEmit`, `docker compose up -d`, `docker compose down`
  - Evidence: `agents/skills/instructions/references/commands.md` — grep for "TBD" returns no matches. File contains all required commands: `npx vitest run` (line 32), `npm test` (line 33), `npx vitest run --coverage` (line 34), `npx playwright test` (line 35), `npx vue-tsc --noEmit` (line 41), `docker compose up -d` (line 46), `docker compose down` (line 48).

- [x] `verification.md` contains no occurrence of "TBD" and specifies the mandatory pre-commit check commands matching the actual stack
  - Evidence: `agents/skills/instructions/references/verification.md` — grep for "TBD" returns no matches. File specifies `npx vitest run`, `npx vue-tsc --noEmit`, and `npx playwright test` as mandatory pre-commit checks (lines 10–13).

- [x] `tdd.md` contains no occurrence of "TBD" and documents: Vitest as the test runner, `happy-dom` as the default environment, the `// @vitest-environment node` pragma for server tests, and snapshot test policy
  - Evidence: `agents/skills/instructions/references/tdd.md` — grep for "TBD" returns no matches. File documents Vitest (`npx vitest run`, line 48), `happy-dom` as default environment (line 46), `// @vitest-environment node` pragma (line 47), and snapshot test policy with the `--update` guard and `[snapshot-update]` commit requirement (lines 52–67).

### Rust Terminology Removal

- [x] `reviewer.md` contains no Rust-specific terms: no `empty vec`, no `usize::MAX`, no `i64::MAX`, no `Panic on valid input` — TypeScript/JavaScript equivalents are used instead (`empty array`, `Number.MAX_SAFE_INTEGER`, `Infinity`, `Uncaught throw on valid input`)
  - Evidence: `agents/skills/roles/references/reviewer.md` — grep for `usize|empty vec|panic on valid|i64::MAX|usize::MAX` (case-insensitive) returns no matches. TypeScript equivalents confirmed present: `empty array` (line 131), `Number.MAX_SAFE_INTEGER` (line 133), `Infinity` (line 133), `Uncaught throw on valid input` (line 86).

- [x] `.claude/settings.local.json` contains no `WebFetch(domain:docs.rs)` entry
  - Evidence: `.claude/settings.local.json` is present and readable. grep for `docs.rs` returns no matches. File confirmed to not contain any `docs.rs` entry.

- [x] `.claude/settings.local.json` contains `WebFetch(domain:vitejs.dev)`, `WebFetch(domain:vitest.dev)`, `WebFetch(domain:hono.dev)`, `WebFetch(domain:vuejs.org)`
  - Evidence: `.claude/settings.local.json` lines 34–37 contain all four required entries: `WebFetch(domain:vitejs.dev)`, `WebFetch(domain:vitest.dev)`, `WebFetch(domain:hono.dev)`, `WebFetch(domain:vuejs.org)`.

### New Role Files

- [x] `agents/skills/roles/references/frontend-engineer.md` exists and declares scope as `src/client/` and `src/shared/`
  - Evidence: File exists. Line 5: `> **Scope:** Client-side code (`src/client/`, shared types in `src/shared/`), Vue 3 components, Vite configuration, and related tests.`

- [x] `agents/skills/roles/references/backend-engineer.md` exists and declares scope as `src/server/` and `packages/`
  - Evidence: File exists. Line 5: `> **Scope:** Server-side code (`src/server/`), WASM packages (`packages/`), server-side tests, database migrations, and API routes.`

- [x] `agents/skills/roles/references/frontend-designer.md` exists and specifies Penpot MCP as primary tool, Chrome MCP as fallback, maximum 5 iterations per design element, and handoff via PLAN.md design notes
  - Evidence: File exists. Primary tool: `### Primary: Penpot MCP` (line 22). Fallback: `### Fallback: Chrome MCP` (line 43). Iteration cap: `Maximum **5 iterations** per design element` (line 53). Handoff: `Update PLAN.md with:` including screenshot references and design notes (lines 62–68).

- [x] Each new engineer role file specifies the correct test environment for its scope (frontend: `happy-dom`; backend: `// @vitest-environment node` pragma)
  - Evidence: `frontend-engineer.md` line 40: `**Test environment:** \`happy-dom\` (default Vitest environment for client tests)`. `backend-engineer.md` line 32: `**Test environment:** Use \`// @vitest-environment node\` pragma for server tests`.

- [x] Each new engineer role file includes a parallel constraints section prohibiting cross-domain file edits without Coordinator involvement
  - Evidence: `frontend-engineer.md` lines 93–96: `## Scope Boundaries` — prohibits touching `src/server/` or `packages/` without Coordinator. `backend-engineer.md` lines 86–89: `## Scope Boundaries` — prohibits touching `src/client/` without Coordinator.

### Dynamic Coordinator

- [x] `coordinator.md` contains a dynamic role selection table mapping file path patterns to roles (`src/client/` → frontend-engineer, `src/server/` → backend-engineer, both → implementer or split)
  - Evidence: `agents/skills/roles/references/coordinator.md` lines 38–42 contain the assessment table: `src/client/`, `src/shared/` → `frontend-engineer`; `src/server/`, `packages/` → `backend-engineer`; both → full-stack → `implementer`.

- [x] `coordinator.md` documents the Design Iteration Phase trigger conditions (PLAN stages include new Vue components or significant UI changes)
  - Evidence: `agents/skills/roles/references/coordinator.md` lines 63–105: `## Design Iteration Phase` section. Trigger conditions at lines 68–70: `PLAN stages include new Vue components or significant UI changes`, `REQUIREMENTS.md mentions user-facing visual changes`, `Architect's PLAN explicitly calls for design work`.

- [x] `coordinator.md` contains Task invocation examples for `frontend-designer`, `frontend-engineer`, and `backend-engineer`
  - Evidence: `agents/skills/roles/references/coordinator.md` — `Task(frontend-designer, ...)` at lines 86 and 141; `Task(frontend-engineer, ...)` at lines 100, 111, 147, 503; `Task(backend-engineer, ...)` at lines 112, 153, 504.

- [x] `coordinator.md` Quick Reference table covers: UI feature, API/backend feature, full-stack feature, config/docs/chore, bug fix — each with the expected role sequence
  - Evidence: `agents/skills/roles/references/coordinator.md` lines 55–61: `### Task Type Quick Reference` table covers all five task types with complete role sequences.

### Design Tool Infrastructure

- [x] `docker-compose.yml` exists at the project root with 7 services: `penpot-frontend`, `penpot-backend`, `penpot-exporter`, `penpot-postgres`, `penpot-valkey`, `penpot-mailcatch`, `penpot-mcp`
  - Evidence: `docker-compose.yml` contains all 7 services. The MCP server was added as a 7th service (ADR Decision History #10) because the Penpot MCP server is not bundled in official Penpot Docker images. Scope expanded from original 6 with user approval.

- [x] `penpot-frontend` is accessible at `http://localhost:9001`
  - Evidence: `docker-compose.yml` line 20: `- "9001:8080"` under `penpot-frontend`. Comments at line 10: `## Penpot UI: http://localhost:9001`.

- [x] `penpot-mailcatch` mail UI is accessible at `http://localhost:1080`
  - Evidence: `docker-compose.yml` line 94: `- "1080:1080"` under `penpot-mailcatch`. Comments at line 13: `## Mail UI: http://localhost:1080`.

- [x] Penpot frontend and backend services have `enable-access-tokens` in their `PENPOT_FLAGS` (required for MCP API access)
  - Evidence: `docker-compose.yml` — `PENPOT_FLAGS` with `enable-access-tokens` present on `penpot-frontend` (line 27) and `penpot-backend` (line 38). The exporter, postgres, valkey, mailcatch, and MCP services do not parse `PENPOT_FLAGS` — only the frontend and backend application services use this flag for authentication token support.

- [x] `commands.md` documents `docker compose up -d`, `docker compose down`, and `docker compose down -v` under a "Docker (Design Stack)" section
  - Evidence: `agents/skills/instructions/references/commands.md` — `## Docker (Design Stack)` section (line 43) contains `docker compose up -d` (line 46), `docker compose down` (line 48), `docker compose down -v` (line 49).

### AGENTS.md Bootstrap Sections

- [x] `AGENTS.md` contains a "Your Purpose" section that instructs agents to auto-load the `roles` skill and the `instructions` skill on startup
  - Evidence: `AGENTS.md` line 5: `## Your Purpose`. Lines 9–10: `Auto-load the \`roles\` skill` and `Auto-load the \`instructions\` skill`.

- [x] `AGENTS.md` contains a "Startup Proposal" section describing the SDLC Workflow vs Direct Assist paths
  - Evidence: `AGENTS.md` line 13: `## Startup Proposal`. Lines 17–18 describe `**SDLC Workflow**` and `**Direct Assist**` paths.

- [x] `AGENTS.md` contains a "The Project" section pointing agents to `README.md`
  - Evidence: `AGENTS.md` line 22: `## The Project`. Line 24: `Read \`README.md\` for the project vision and public-facing description.`

- [x] `AGENTS.md` retains the snapshot test policy and license notice from the original file
  - Evidence: `AGENTS.md` line 33: `## Snapshot Tests` section with full policy including `--update` guard and `[snapshot-update]` commit requirement (lines 35–40). Line 42: `## License`. Line 44: `This project is licensed under AGPL-3.0.`

### SDLC Process File

- [x] `sdlc.md` role table includes: Coordinator, Product Owner, Architect, Frontend Designer, Frontend Engineer, Backend Engineer, Implementer, Reviewer, Maintainer
  - Evidence: `agents/skills/instructions/references/sdlc.md` lines 9–17: role table includes all nine required roles: Coordinator, Product Owner, Architect, Frontend Designer, Frontend Engineer, Backend Engineer, Implementer, Reviewer, Maintainer.

- [x] `sdlc.md` includes a Dynamic Role Selection section with a task-type-to-role-sequence table
  - Evidence: `agents/skills/instructions/references/sdlc.md` line 19: `## Dynamic Role Selection`. Lines 23–29 contain the task-type table covering UI feature, API/backend feature, Full-stack feature, Config/docs/chore, and Bug fix.

- [x] `sdlc.md` SDLC flow shows the optional Visual Design phase between Design and Code
  - Evidence: `agents/skills/instructions/references/sdlc.md` line 36: `3. Visual Design→ [Optional] Frontend Designer creates mockups (when UI work present)` — positioned between Design (step 2) and Code (step 4). Also visible in the iterative cycle diagram at line 46: `Requirements → Design → [Visual Design] → Code → Test → Feedback → Deploy`.

## Constraints

- **No `src/` modifications** — This is a pure infrastructure change. No application source code, tests, or WASM packages may be touched. All changes are confined to `agents/`, `.claude/`, `AGENTS.md`, and `docker-compose.yml`.
- **Penpot MCP is the primary design tool** — Chrome MCP is the fallback only. The frontend-designer role must reflect this priority order.
- **Designer entry is Coordinator-gated** — The frontend-designer is not triggered by a standing rule; the Coordinator decides when to spawn it based on PLAN content. The designer does not self-activate.
- **Dynamic SDLC, not prescriptive** — The coordinator must assess task type and select roles accordingly. Not every cycle uses every role. The old static sequence (always spawn all roles) must not persist.

## Context

- Tech stack was finalized before this overhaul: Hono (backend), Vue 3 + Vite (frontend), Vitest (unit/integration), Playwright (E2E), vue-tsc (type checking)
- Design tool selection was researched and compared: Figma official MCP (read-only), Figma community MCP (paid), Penpot MCP (free, open source, full create/modify/read, self-hostable), Pencil.dev (no self-host), Chrome MCP (quick prototyping via HTML/CSS)
- Penpot was chosen because it is the only option that is free, open source, self-hostable, and supports full programmatic create/modify/read access via MCP
- The Penpot docker-compose requires `enable-access-tokens` for MCP access; `disable-email-verification` and `disable-secure-session-cookies` are acceptable for local dev only
- AGR (companion project) already had the "Your Purpose / Startup Proposal / The Project" bootstrap pattern in its AGENTS.md; RAGTS was lagging behind
- The `decisions.md` Rust-style config path (`~/.config/[app]/config.toml`) was noted but is out of scope for this cycle (it is in a different instructions file not central to the SDLC agent flow)

---
**Sign-off:** Approved by user
