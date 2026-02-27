# ADR: SDLC Infrastructure Overhaul

## Status
Proposed

## Context

The RAGTS agent infrastructure was left in a partially-migrated state after the tech stack was finalized. Three categories of stale content blocked the SDLC from functioning correctly:

1. **TBD placeholders in instruction files.** Three instruction files (`commands.md`, `verification.md`, `tdd.md`) contained "TBD - tech stack not yet decided" blocks. Agents reading these files received no actionable guidance on how to run tests, verify code, or write new tests -- the commands were empty and the framework section deferred to a future decision that had already been made (Vitest, Playwright, vue-tsc).

2. **Rust terminology leakage.** The reviewer role file and decisions template contained Rust-specific language (`empty vec`, `usize::MAX`, `i64::MAX`, `Panic on valid input`, `~/.config/[app]/config.toml`). A TypeScript/Vue/Hono project has no Rust collections or primitive overflow types. These references would mislead any agent performing code review by applying wrong-language semantics.

3. **Static SDLC with no specialized roles.** The SDLC had a single generic implementer role. Frontend and backend work was conflated. There was no design iteration phase, no specialized engineers, and no visual design tooling. The coordinator always spawned the same set of roles regardless of task type -- no dynamic selection based on file paths or scope.

4. **AGENTS.md missing bootstrap sections.** The AGR companion project already had "Your Purpose", "Startup Proposal", and "The Project" sections for structured agent on-ramp. RAGTS lacked these, leaving agents with no structured startup flow.

Forces at play:
- The tech stack (Hono, Vue 3, Vitest, Playwright, vue-tsc) was already decided and in use
- The SDLC roles skill and instructions skill were already structurally sound -- the content was the problem
- Multiple design tools were available (Figma MCP, Penpot MCP, Chrome MCP, Pencil.dev) with varying license/self-host characteristics
- The project has a clear client/server split (`src/client/` vs `src/server/`) that warranted specialized roles
- No application source code (`src/`, `packages/`, `tests/`) should be modified for an infrastructure-only change

## Options Considered

### Option 1: Patch TBD blocks only

- Pros: Minimal change. Fills in the commands and framework references. Unblocks test/verification guidance immediately.
- Cons: Does not address Rust terminology. Does not add specialized roles. Coordinator remains static. No design infrastructure. AGENTS.md bootstrap gap persists. Incremental but incomplete -- agents would still receive wrong-language review criteria and lack role specialization.

### Option 2: Full SDLC infrastructure overhaul (CHOSEN)

Replace all stale content, introduce specialized roles (frontend-engineer, backend-engineer, frontend-designer), rewrite the coordinator for dynamic role selection, add Penpot docker-compose for design sessions, and bootstrap AGENTS.md.

- Pros: Comprehensive fix. Every instruction file matches the actual stack. Coordinator dynamically selects roles by task type. Design iteration phase added. Specialized engineers enforce scope boundaries. AGENTS.md matches the AGR project's bootstrap pattern.
- Cons: Larger change (26 files, ~1000 lines net). Introduces Penpot dependency for design sessions (6-service docker-compose). More roles increase coordinator decision complexity. Requires agents to understand role selection logic.

### Option 3: Overhaul without design tooling

Same as Option 2 but defer Penpot/design infrastructure to a separate cycle.

- Pros: Smaller scope. No new docker-compose dependency. Still fixes all instruction and role content.
- Cons: Loses the design iteration phase, which was identified as a gap. Frontend-designer role would exist but have no tooling. The research into design tools (Figma MCP limitations, Penpot advantages) was already complete.

## Decision

**Option 2: Full SDLC infrastructure overhaul.**

The overhaul addresses all four categories simultaneously because they are interconnected: specialized roles need correct instruction files, the coordinator needs the role definitions, and the design phase needs both the role file and the docker-compose infrastructure. Shipping partial fixes would leave agents in an inconsistent state where some files reference roles that do not exist or tools that are not configured.

### Core Architectural Principle: Role Isolation via Input/Output Contracts

Every role is a **standalone black box**. It receives defined inputs, does its work, and produces defined outputs. When a role needs information it cannot produce itself, it describes **what** it needs, not **who** should provide it. The Coordinator is the only component aware of the full role topology; it acts as a **transparent routing layer** between roles.

**Isolation scope:** Isolation is enforced at the **operational** level — blocked requests, routing, and tool invocations. Roles may reference other roles by name in descriptive prose (e.g., "requirements are created by the Product Owner") for readability and workflow context, but they must never operationally address, invoke, or depend on another role directly. All operational inter-role communication flows through the Coordinator.

This means:
- **Inputs** are artifacts (REQUIREMENTS.md, ADR.md, PLAN.md, design screenshots, PR diffs) and context provided by the Coordinator at spawn time
- **Outputs** are artifacts produced (files written, PRs created, review findings, approval/rejection)
- **Blocked requests** describe the information needed ("I need clarification on the intended behavior of X") — the Coordinator decides which role can answer and routes the question
- Roles never import, reference, or depend on another role's internal behavior or instructions

The Coordinator is transparent: it does not inject its own domain opinions into routed messages. It is a message bus with gating logic, not a domain expert.

### Role I/O Definitions

Each role's contract — what it receives, what it produces, and what scope it owns.

| Role | Inputs | Outputs | Scope |
|------|--------|---------|-------|
| Product Owner | User request, existing context | REQUIREMENTS.md | Requirements, acceptance criteria, scope boundaries |
| Architect | REQUIREMENTS.md | ADR.md, PLAN.md | Options analysis, decisions, execution stages |
| Frontend Designer | REQUIREMENTS.md, PLAN.md, existing UI (`src/client/components/`) | Approved mockup screenshots, design notes in PLAN.md | Visual design, layout, UX — no code |
| Frontend Engineer | ADR.md, PLAN.md, approved designs (if any) | Code changes in `src/client/`, `src/shared/`, PR | Client-side implementation |
| Backend Engineer | ADR.md, PLAN.md | Code changes in `src/server/`, `packages/`, PR | Server-side implementation |
| Implementer | ADR.md, PLAN.md | Code changes (any scope), PR | Cross-cutting or infrastructure implementation |
| Reviewer (pair) | PLAN stage diff, ADR.md, PLAN.md | Questions, observations, flags | Incremental stage validation |
| Reviewer (internal) | Full PR diff, ADR.md, PLAN.md, pair review context | Severity-classified findings | Adversarial full-PR validation |
| Reviewer (coderabbit) | CodeRabbit comments, ADR.md, PLAN.md | Valid/invalid classifications with fix descriptions | External finding triage |
| Maintainer | PR, ADR.md, all approvals | Merged PR, updated ADR status | Merge, release, CI monitoring |

### Coordinator Routing Map

When a role submits a blocked request, the Coordinator uses this map to decide where to route it. This is the **complete** routing table — if a request category is missing, add it here before routing.

| Requesting Role | Need Category | Route To |
|-----------------|---------------|----------|
| **Product Owner** | Technical feasibility of a requirement | Architect |
| | Validation risk / testability of acceptance criteria | Reviewer (internal) |
| | Existing codebase behavior or patterns | Implementer or relevant Engineer |
| **Architect** | Requirements clarification or scope interpretation | Product Owner |
| | Risk, testability, or reviewability of a design choice | Reviewer (internal) |
| | Current implementation details or constraints | Implementer or relevant Engineer |
| **Frontend Designer** | Requirements clarification | Product Owner |
| | Technical feasibility of a design | Architect |
| | Implementation feasibility of a visual pattern | Frontend Engineer |
| | Existing codebase UI patterns | Frontend Engineer |
| **Frontend Engineer** | Design clarification (mockup, layout, spacing) | Frontend Designer |
| | ADR interpretation or design intent | Architect |
| | API contract or server-side behavior | Backend Engineer |
| | Requirements clarification | Product Owner |
| **Backend Engineer** | ADR interpretation or design intent | Architect |
| | Client-side expectations or contract shape | Frontend Engineer |
| | Requirements clarification | Product Owner |
| **Implementer** | ADR interpretation or design intent | Architect |
| | Requirements clarification | Product Owner |
| | Domain-specific implementation detail | Frontend Engineer or Backend Engineer (by file scope) |
| **Reviewer (any phase)** | Implementation intent behind a code choice | The engineer who wrote it (Frontend/Backend/Implementer) |
| | ADR interpretation or decision boundary | Architect |
| | Requirements verification or acceptance criteria | Product Owner |
| **Maintainer** | Blocking findings resolution status | Reviewer (internal) |
| | Scope acceptance / release readiness | Product Owner |
| | CI failure diagnosis | The engineer who last committed |

**Routing rules:**
- If a need doesn't match any row, the Coordinator asks the user before inventing a route
- "Relevant Engineer" means the Coordinator checks file paths to determine Frontend vs Backend vs Implementer
- The Coordinator never exposes the routing decision to the requesting role — it simply relays the answer back

### Sub-decisions

1. **Penpot as primary design tool.** Free, open source, self-hostable, and the only tool with full programmatic create/modify/read access via MCP. Figma official MCP is read-only. Figma community MCP requires a paid subscription. Pencil.dev has no self-host option. Chrome MCP retained as fallback for quick prototyping.

2. **Dynamic coordinator, not prescriptive.** The coordinator assesses each task by file path patterns and spawns only the roles needed. A backend-only change does not spawn a frontend designer. This replaces the old static sequence that always spawned every role.

3. **Three engineer roles.** Frontend engineer (scoped to `src/client/`, `src/shared/`), backend engineer (scoped to `src/server/`, `packages/`), and implementer (general-purpose fallback for cross-cutting or infrastructure work). Parallel constraints prohibit cross-domain file edits without coordinator involvement.

4. **Designer entry is coordinator-gated.** The frontend-designer does not self-activate. The coordinator decides when to spawn it based on PLAN content (new Vue components, significant UI changes). Maximum 5 iterations per design element.

5. **`settings.local.json` updated.** Removed Rust `docs.rs` domain and added `vitejs.dev`, `vitest.dev`, `hono.dev`, `vuejs.org`. Change is local-only (file is gitignored).

6. **Decisions template config path updated.** `~/.config/[app]/config.toml` (Rust convention) replaced with `.env` / `src/server/config.ts` (TypeScript convention).

7. **Role isolation enforced.** All role files define inputs, outputs, and scope boundaries. Blocked requests describe what is needed, not who can answer. The Coordinator owns all routing decisions.

## Consequences

What becomes easier:
- Agents receive correct, runnable commands for the actual stack (Vitest, Playwright, vue-tsc, Docker)
- Code reviews use TypeScript/JavaScript terminology (`empty array`, `Number.MAX_SAFE_INTEGER`, `Uncaught throw on valid input`) instead of Rust terms
- The coordinator can scope agent spawning to the right domain, reducing wasted context and cross-contamination
- Frontend-only and backend-only tasks get specialized engineers with domain-appropriate test environment pragmas
- UI work gets a structured design-first phase with Penpot before implementation begins
- New sessions start with structured bootstrap (auto-load skills, choose SDLC vs Direct Assist)
- Roles are self-contained and testable in isolation — each can be reasoned about by its inputs and outputs alone
- Adding or removing roles requires no changes to other role files — only the Coordinator's routing table changes

What becomes harder:
- Coordinator decision logic is more complex (dynamic role selection table, design iteration trigger conditions, routing)
- Design sessions require running a 6-service docker-compose stack
- Three engineer roles (plus designer) means more role files to maintain
- The Coordinator must maintain full awareness of role capabilities to route blocked requests correctly

Follow-ups for later:
- Penpot MCP server configuration is a local environment concern (out of scope)
- The `decisions.md` Rust-style config path was fixed, but deeper decisions template review deferred
- CI integration for the Penpot stack is not addressed

## Decision History

1. Penpot MCP chosen as primary design tool over Figma (read-only or paid) and Pencil.dev (no self-host). Chrome MCP retained as fallback.
2. Dynamic coordinator with file-path-based role selection replaces the static "spawn all roles" approach.
3. Three engineer roles created: frontend-engineer, backend-engineer, implementer (fallback).
4. Frontend designer is coordinator-gated, not self-activating. Max 5 iterations per design element.
5. AGENTS.md gets "Your Purpose", "Startup Proposal", "The Project" sections matching the AGR companion project.
6. `settings.local.json` updated locally (gitignored) — removed `docs.rs`, added `vitejs.dev`, `vitest.dev`, `hono.dev`, `vuejs.org`.
7. Decisions template config path changed from Rust convention to TypeScript convention.
8. All changes confined to `agents/`, `.claude/`, `.state/`, `AGENTS.md`, and `docker-compose.yml`. Zero `src/` modifications.
9. Role isolation principle adopted: roles define inputs/outputs and scope boundaries only. Blocked requests describe what is needed, not who answers. Coordinator owns all inter-role routing.
