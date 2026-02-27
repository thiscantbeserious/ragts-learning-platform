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
- `docker-compose.yml` — New file providing the Penpot self-hosted design stack (6 services)
- `AGENTS.md` — Add "Your Purpose", "Startup Proposal", and "The Project" bootstrap sections

### Out of Scope

- Any file under `src/` — no application code changes
- Any file under `packages/` — no WASM or build changes
- Any file under `tests/` — no test file changes
- Any changes to the Penpot MCP server configuration itself (that is a local environment concern)
- Any changes to the SDLC state files for other branches

## Acceptance Criteria

### TBD Placeholder Removal

- [ ] `commands.md` contains no occurrence of "TBD" and includes runnable commands for: `npx vitest run`, `npm test`, `npx vitest run --coverage`, `npx playwright test`, `npx vue-tsc --noEmit`, `docker compose up -d`, `docker compose down`
- [ ] `verification.md` contains no occurrence of "TBD" and specifies the mandatory pre-commit check commands matching the actual stack
- [ ] `tdd.md` contains no occurrence of "TBD" and documents: Vitest as the test runner, `happy-dom` as the default environment, the `// @vitest-environment node` pragma for server tests, and snapshot test policy

### Rust Terminology Removal

- [ ] `reviewer.md` contains no Rust-specific terms: no `empty vec`, no `usize::MAX`, no `i64::MAX`, no `Panic on valid input` — TypeScript/JavaScript equivalents are used instead (`empty array`, `Number.MAX_SAFE_INTEGER`, `Infinity`, `Uncaught throw on valid input`)
- [ ] `.claude/settings.local.json` contains no `WebFetch(domain:docs.rs)` entry
- [ ] `.claude/settings.local.json` contains `WebFetch(domain:vitejs.dev)`, `WebFetch(domain:vitest.dev)`, `WebFetch(domain:hono.dev)`, `WebFetch(domain:vuejs.org)`

### New Role Files

- [ ] `agents/skills/roles/references/frontend-engineer.md` exists and declares scope as `src/client/` and `src/shared/`
- [ ] `agents/skills/roles/references/backend-engineer.md` exists and declares scope as `src/server/` and `packages/`
- [ ] `agents/skills/roles/references/frontend-designer.md` exists and specifies Penpot MCP as primary tool, Chrome MCP as fallback, maximum 5 iterations per design element, and handoff via PLAN.md design notes
- [ ] Each new engineer role file specifies the correct test environment for its scope (frontend: `happy-dom`; backend: `// @vitest-environment node` pragma)
- [ ] Each new engineer role file includes a parallel constraints section prohibiting cross-domain file edits without Coordinator involvement

### Dynamic Coordinator

- [ ] `coordinator.md` contains a dynamic role selection table mapping file path patterns to roles (`src/client/` → frontend-engineer, `src/server/` → backend-engineer, both → implementer or split)
- [ ] `coordinator.md` documents the Design Iteration Phase trigger conditions (PLAN stages include new Vue components or significant UI changes)
- [ ] `coordinator.md` contains Task invocation examples for `frontend-designer`, `frontend-engineer`, and `backend-engineer`
- [ ] `coordinator.md` Quick Reference table covers: UI feature, API/backend feature, full-stack feature, config/docs/chore, bug fix — each with the expected role sequence

### Design Tool Infrastructure

- [ ] `docker-compose.yml` exists at the project root with exactly 6 services: `penpot-frontend`, `penpot-backend`, `penpot-exporter`, `penpot-postgres`, `penpot-valkey`, `penpot-mailcatch`
- [ ] `penpot-frontend` is accessible at `http://localhost:9001`
- [ ] `penpot-mailcatch` mail UI is accessible at `http://localhost:1080`
- [ ] All Penpot services have `enable-access-tokens` in their `PENPOT_FLAGS` (required for MCP API access)
- [ ] `commands.md` documents `docker compose up -d`, `docker compose down`, and `docker compose down -v` under a "Docker (Design Stack)" section

### AGENTS.md Bootstrap Sections

- [ ] `AGENTS.md` contains a "Your Purpose" section that instructs agents to auto-load the `roles` skill and the `instructions` skill on startup
- [ ] `AGENTS.md` contains a "Startup Proposal" section describing the SDLC Workflow vs Direct Assist paths
- [ ] `AGENTS.md` contains a "The Project" section pointing agents to `README.md`
- [ ] `AGENTS.md` retains the snapshot test policy and license notice from the original file

### SDLC Process File

- [ ] `sdlc.md` role table includes: Coordinator, Product Owner, Architect, Frontend Designer, Frontend Engineer, Backend Engineer, Implementer, Reviewer, Maintainer
- [ ] `sdlc.md` includes a Dynamic Role Selection section with a task-type-to-role-sequence table
- [ ] `sdlc.md` SDLC flow shows the optional Visual Design phase between Design and Code

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
