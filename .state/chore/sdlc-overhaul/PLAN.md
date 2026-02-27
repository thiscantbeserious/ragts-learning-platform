# Plan: SDLC Infrastructure Overhaul

References: ADR.md

## Open Questions

None. All questions were resolved during implementation (retroactive plan).

## Stages

### Stage 1: Replace TBD placeholders in instruction files

Goal: Every instruction file contains real, runnable commands matched to the actual TypeScript/Vue/Hono/Vitest stack. No "TBD" text remains.
Owner: implementer

- [x] Replace TBD block in `commands.md` with Vitest, Playwright, vue-tsc, and Docker commands
- [x] Add "Docker (Design Stack)" section to `commands.md` with `docker compose up -d`, `docker compose down`, `docker compose down -v`
- [x] Replace TBD block in `verification.md` with mandatory pre-commit check commands (`vitest run`, `vue-tsc --noEmit`, `playwright test`)
- [x] Replace TBD block in `tdd.md` with Vitest configuration, `happy-dom` default environment, `// @vitest-environment node` pragma for server tests, and snapshot testing guidance

Files:
- `agents/skills/instructions/references/commands.md`
- `agents/skills/instructions/references/verification.md`
- `agents/skills/instructions/references/tdd.md`

Depends on: none

### Stage 2: Remove Rust terminology and update templates

Goal: No Rust-specific terms remain in any SDLC file. TypeScript/JavaScript equivalents used throughout.
Owner: implementer

- [x] Replace `empty vec` with `empty array` in `reviewer.md`
- [x] Replace `usize::MAX, i64::MAX` with `Number.MAX_SAFE_INTEGER, Infinity` in `reviewer.md`
- [x] Replace `Panic on valid input` with `Uncaught throw on valid input` in `reviewer.md`
- [x] Replace `~/.config/[app]/config.toml` with `.env` / `src/server/config.ts` in `decisions.md` template
- [x] Confirm `settings.local.json` already has no `docs.rs` and has `vitejs.dev`, `vitest.dev`, `hono.dev`, `vuejs.org` (verified: already correct on main)

Files:
- `agents/skills/roles/references/reviewer.md`
- `agents/skills/instructions/templates/decisions.md`

Depends on: none

### Stage 3: Rewrite project overview

Goal: `project.md` reflects the actual tech stack, codebase structure, and related projects.
Owner: implementer

- [x] Rewrite tech stack section (Hono, Vue 3, Vitest, Playwright, vue-tsc, avt WASM)
- [x] Add codebase structure table (`src/server/`, `src/client/`, `src/shared/`, `packages/vt-wasm/`, `tests/`, `scripts/`, `.state/`)
- [x] Add AGR as related project with link
- [x] Add reference links (asciicast v3 spec, AGR repo, RAGTS repo)

Files:
- `agents/skills/instructions/references/project.md`

Depends on: none

### Stage 4: Create new role files

Goal: Specialized frontend-engineer, backend-engineer, and frontend-designer roles exist with correct scope boundaries, test environments, and parallel constraints.
Owner: implementer

- [x] Create `frontend-engineer.md` scoped to `src/client/` and `src/shared/` with `happy-dom` test environment, design integration section, and parallel constraints
- [x] Create `backend-engineer.md` scoped to `src/server/` and `packages/` with `// @vitest-environment node` pragma, and parallel constraints
- [x] Create `frontend-designer.md` with Penpot MCP as primary tool, Chrome MCP as fallback, max 5 iterations per design element, and handoff via PLAN.md design notes
- [x] Create agent config files: `agents/agents/frontend-engineer.md`, `agents/agents/backend-engineer.md`, `agents/agents/frontend-designer.md`
- [x] Update `implementer.md` to clarify it is the general-purpose fallback role

Files:
- `agents/skills/roles/references/frontend-engineer.md` (new)
- `agents/skills/roles/references/backend-engineer.md` (new)
- `agents/skills/roles/references/frontend-designer.md` (new)
- `agents/agents/frontend-engineer.md` (new)
- `agents/agents/backend-engineer.md` (new)
- `agents/agents/frontend-designer.md` (new)
- `agents/skills/roles/references/implementer.md` (updated)

Depends on: none

### Stage 5: Rewrite coordinator for dynamic role selection

Goal: Coordinator dynamically selects roles based on task type and file path patterns. Design iteration phase is documented. Task invocation examples cover all new roles.
Owner: implementer

- [x] Add dynamic role selection table mapping file path patterns to roles
- [x] Add assessment criteria and decision logic sections
- [x] Add task type quick reference table (UI feature, API/backend, full-stack, config/docs/chore, bug fix)
- [x] Add design iteration phase with trigger conditions and flow diagram
- [x] Add Task invocation examples for `frontend-designer`, `frontend-engineer`, `backend-engineer`
- [x] Update quick implementation loop to assess scope and choose appropriate agent
- [x] Update pair review flow to use "Engineer/Implementer" terminology
- [x] Update parallel execution rules for specialized engineers
- [x] Update role summary table with all new roles
- [x] Update SDLC visual flow diagram with designer and specialized engineers
- [x] Update coordinator agent config to include new Task targets
- [x] Update roles SKILL.md to reference new roles in quick implementation loop and phases

Files:
- `agents/skills/roles/references/coordinator.md`
- `agents/agents/coordinator.md`
- `agents/skills/roles/SKILL.md`

Depends on: Stage 4 (role files must exist for coordinator to reference them)

### Stage 6: Rewrite SDLC process file

Goal: `sdlc.md` reflects the new roles, dynamic selection, and optional visual design phase.
Owner: implementer

- [x] Update role table to include: Coordinator, Product Owner, Architect, Frontend Designer, Frontend Engineer, Backend Engineer, Implementer, Reviewer, Maintainer
- [x] Add dynamic role selection section with task-type-to-role-sequence table
- [x] Update SDLC flow to show optional Visual Design phase between Design and Code
- [x] Update iterative cycle diagram

Files:
- `agents/skills/instructions/references/sdlc.md`

Depends on: Stage 4 (role definitions must exist)

### Stage 7: Update roles README

Goal: README.md in the roles skill directory documents the new architecture including all roles, phases, and the updated SDLC flow diagram.
Owner: implementer

- [x] Update flow diagram with Frontend Designer, specialized engineers
- [x] Update role descriptions for all new roles
- [x] Add Frontend Designer, Frontend Engineer, Backend Engineer sections
- [x] Update Implementer description as general-purpose fallback
- [x] Add "Dynamic role selection" to Key Principles
- [x] Update phase definitions section

Files:
- `agents/skills/roles/README.md`

Depends on: Stage 4, Stage 5

### Stage 8: Create Penpot docker-compose

Goal: A self-hosted Penpot design stack can be launched via docker-compose for design sessions. All 6 required services present with `enable-access-tokens` for MCP API access.
Owner: implementer

- [x] Create `docker-compose.yml` at project root with 6 services: `penpot-frontend`, `penpot-backend`, `penpot-exporter`, `penpot-postgres`, `penpot-valkey`, `penpot-mailcatch`
- [x] Configure `penpot-frontend` accessible at `http://localhost:9001`
- [x] Configure `penpot-mailcatch` mail UI accessible at `http://localhost:1080`
- [x] Add `enable-access-tokens` to `PENPOT_FLAGS` on frontend and backend services
- [x] Add `disable-email-verification` and `disable-secure-session-cookies` for local dev
- [x] Configure telemetry disabled, local SMTP via mailcatcher
- [x] Add named volumes for postgres data and assets

Files:
- `docker-compose.yml` (new)

Depends on: none

### Stage 9: Bootstrap AGENTS.md

Goal: AGENTS.md contains the same bootstrap structure as the AGR companion project, while retaining snapshot test policy and license notice.
Owner: implementer

- [x] Add "Your Purpose" section (auto-load `roles` and `instructions` skills)
- [x] Add "Startup Proposal" section (SDLC Workflow vs Direct Assist paths)
- [x] Add "The Project" section (pointer to `README.md`)
- [x] Retain "Snapshot Tests" section with policy
- [x] Retain "License" section with AGPL-3.0 notice

Files:
- `AGENTS.md`

Depends on: none

### Stage 10: Enforce role isolation via I/O contracts

Goal: Every role is a standalone black box with defined inputs and outputs. Roles never address other roles directly. The Coordinator is the only component aware of the full role topology and acts as a transparent routing layer. A complete routing map exists for every blocked-request category.
Owner: implementer

- [x] Add "Core Architectural Principle: Role Isolation via Input/Output Contracts" to ADR.md
- [x] Add "Role I/O Definitions" table to ADR.md — inputs, outputs, and scope for all 10 roles
- [x] Add "Coordinator Routing Map" to ADR.md — complete routing table mapping every role's blocked-request categories to routing targets, with routing rules (fallback to user, file-path-based engineer selection, transparent routing)
- [x] Replace "Allowed targets: [role names]" with "When Blocked" sections in all 8 role files: product-owner, architect, frontend-engineer, backend-engineer, frontend-designer, implementer, reviewer (all 3 phases), maintainer
- [x] Rename SKILL.md Section 3 from "Role-to-Role Collaboration Protocol" to "Blocked Request Protocol" — request format uses `Need:` instead of `To Role:`
- [x] Make cross-consultation protocol in SKILL.md role-agnostic (generic language, no named role targets)
- [x] Add principle #9 to roles README.md: "Role isolation — each role is a standalone black box..."
- [x] Update roles README.md flow diagram: designer hands off "via Coordinator" not directly to engineer

Files:
- `.state/chore/sdlc-overhaul/ADR.md` (modified — principle, I/O table, routing map)
- `agents/skills/roles/references/product-owner.md` (modified — When Blocked)
- `agents/skills/roles/references/architect.md` (modified — When Blocked)
- `agents/skills/roles/references/frontend-engineer.md` (modified — When Blocked)
- `agents/skills/roles/references/backend-engineer.md` (modified — When Blocked)
- `agents/skills/roles/references/frontend-designer.md` (modified — When Blocked)
- `agents/skills/roles/references/implementer.md` (modified — When Blocked)
- `agents/skills/roles/references/reviewer.md` (modified — When Blocked for all 3 phases)
- `agents/skills/roles/references/maintainer.md` (modified — When Blocked)
- `agents/skills/roles/SKILL.md` (modified — Blocked Request Protocol)
- `agents/skills/roles/README.md` (modified — principle #9, flow diagram)

Depends on: Stages 4, 5, 7 (all role files, coordinator, and README must exist)

## Dependencies

```
Stage 1 ─────────────────────────────────────────────┐
Stage 2 ─────────────────────────────────────────────┤
Stage 3 ─────────────────────────────────────────────┤
Stage 4 ─────────────────────────────────────┐       ├─── All complete
Stage 8 ─────────────────────────────────────┤       │
Stage 9 ─────────────────────────────────────┤       │
                                             │       │
Stage 5 (depends on Stage 4) ────────────────┤       │
Stage 6 (depends on Stage 4) ────────────────┤       │
Stage 7 (depends on Stage 4, 5) ─────────────┤       │
Stage 10 (depends on Stage 4, 5, 7) ─────────┘───────┘
```

Stages 1, 2, 3, 4, 8, 9 have no inter-dependencies and could have been implemented in parallel.
Stages 5, 6, 7 depend on Stage 4 (role files must exist before coordinator/sdlc/readme can reference them).
Stage 7 additionally depends on Stage 5 (coordinator must be finalized before README can document the flow).
Stage 10 depends on Stages 4, 5, 7 (all role files, coordinator, and README must exist before isolation enforcement).

## File Change Manifest

| File | Action | Stage |
|------|--------|-------|
| `agents/skills/instructions/references/commands.md` | Modified | 1 |
| `agents/skills/instructions/references/verification.md` | Modified | 1 |
| `agents/skills/instructions/references/tdd.md` | Modified | 1 |
| `agents/skills/roles/references/reviewer.md` | Modified | 2 |
| `agents/skills/instructions/templates/decisions.md` | Modified | 2 |
| `agents/skills/instructions/references/project.md` | Modified | 3 |
| `agents/skills/roles/references/frontend-engineer.md` | Created | 4 |
| `agents/skills/roles/references/backend-engineer.md` | Created | 4 |
| `agents/skills/roles/references/frontend-designer.md` | Created | 4 |
| `agents/agents/frontend-engineer.md` | Created | 4 |
| `agents/agents/backend-engineer.md` | Created | 4 |
| `agents/agents/frontend-designer.md` | Created | 4 |
| `agents/skills/roles/references/implementer.md` | Modified | 4 |
| `agents/skills/roles/references/coordinator.md` | Modified | 5 |
| `agents/agents/coordinator.md` | Modified | 5 |
| `agents/skills/roles/SKILL.md` | Modified | 5 |
| `agents/skills/instructions/references/sdlc.md` | Modified | 6 |
| `agents/skills/roles/README.md` | Modified | 7 |
| `docker-compose.yml` | Created | 8 |
| `AGENTS.md` | Modified | 9 |
| `agents/skills/roles/references/product-owner.md` | Modified | 10 |
| `agents/skills/roles/references/architect.md` | Modified | 10 |
| `agents/skills/roles/references/maintainer.md` | Modified | 10 |
| `.state/chore/sdlc-overhaul/ADR.md` | Modified | 10 |
| `.state/chore/sdlc-overhaul/NOTES.md` | Created | (planning) |
| `.state/chore/sdlc-overhaul/REQUIREMENTS.md` | Created | (planning) |

Total: 26 files changed (9 created, 17 modified). Note: several files modified in Stage 10 are already listed under their creation/modification stages above.

## Progress

Updated retroactively. All stages complete.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | complete | TBD blocks replaced in commands.md, verification.md, tdd.md |
| 2 | complete | Rust terms replaced in reviewer.md, decisions.md; settings.local.json confirmed clean |
| 3 | complete | project.md rewritten with full stack and structure |
| 4 | complete | 3 new role files + 3 agent configs created, implementer updated |
| 5 | complete | Coordinator rewritten with dynamic selection, design iteration, new Task examples |
| 6 | complete | sdlc.md updated with new roles, dynamic selection table, visual design phase |
| 7 | complete | roles README.md updated with new flow diagram and all role descriptions |
| 8 | complete | docker-compose.yml created with 6 Penpot services |
| 9 | complete | AGENTS.md bootstrapped with Your Purpose, Startup Proposal, The Project |
| 10 | complete | Role isolation enforced: I/O contracts, When Blocked pattern across all 8 roles, Coordinator Routing Map, Blocked Request Protocol in SKILL.md |
