# Workflow

SDLC workflow variants and shared agent protocols.

## Purpose

Agents separate concerns across the SDLC. Each agent has a distinct responsibility and fresh context, preventing one agent from doing everything and accumulating bias.

## Architecture

Each agent is defined as a single agent file in `agents/agents/`. The agent file contains:

1. **YAML frontmatter** — configuration (model, tools, permissions, skills, maxTurns)
2. **Markdown body** — agent-specific behavioral instructions, workflow, and output format

The Coordinator spawns agents by name via `Task(agent-name, "prompt with context")`. Each spawned agent:
- Starts with its behavioral instructions from its agent file body
- Preloads shared protocols via the `skills: [workflow, instructions]` field
- Has independent model/tool/permission configuration

Shared protocols (blocked request protocol, cross-consultation, verification, phases) are defined in `SKILL.md` and loaded by all agents via the `skills` field.

## Flow

```
User Request
     │
     ▼
┌─────────────┐
│ Coordinator │  Assesses task, spawns agents dynamically
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│  Story Writer   │  Translates technical request into
│                 │  user stories (multiple perspectives)
└────────┬────────┘
         │  User approves/modifies
         ▼
┌─────────────────┐
│  Product Owner  │  Requirements interview
│                 │  ◄── cross-consult: Architect (feasibility)
└────────┬────────┘
         │
         ▼
   ┌──────────────┐
   │REQUIREMENTS.md│  What needs to be built
   └───────┬──────┘
           │
           ▼
   ┌─────────────┐     ┌─────────┐
   │  Architect  │────▶│ ADR.md  │◀──────────────────────┐
   │             │     └─────────┘                       │
   │ ◄── cross-  │    Decision record (immutable)       │
   │  consult:PO │                                      │
   └──────┬──────┘                                      │
          │            ┌──────────┐                     │
          └───────────▶│ PLAN.md  │◀────────────┐       │
                       └────┬─────┘             │       │
                       Execution (mutable)      │       │
                            │                   │       │
                            ▼                   │       │
               ┌────────────────────────┐       │       │
               │ [Frontend Designer]    │       │       │
               │ (optional, if UI work) │       │       │
               └───────────┬────────────┘       │       │
                           │                    │       │
                           ▼                    │       │
              ┌──────────────────────┐          │       │
              │ Frontend Engineer /  │  Works ──┘       │
              │ Backend Engineer /   │  from PLAN       │
              │ Implementer          │                  │
              └──────────┬───────────┘                  │
                         │                              │
                   ┌─────┴──────┐                       │
                   │ Per-stage: │                       │
                   │ Pair Review│ questions/flags       │
                   └─────┬──────┘                       │
                         │                              │
                         ▼                              │
                   [Draft PR]                           │
                         │                              │
                         ▼                              │
                ┌─────────────────┐                     │
                │ Reviewer        │ Adversarial review  │
                │                 │ + triage external   │
                └────────┬────────┘ findings if any     │
                         │                              │
                    ┌────┴────┐                         │
                    │  Gate   │ Mark PR ready only      │
                    └────┬────┘ after review pass       │
                         │                              │
                         ▼                              │
                ┌─────────────────┐  Validates ─────────┘
                │  Product Owner  │  against REQUIREMENTS
                └────────┬────────┘
                         │
                         ▼
                ┌─────────────────┐
                │   Maintainer    │  Merges, updates ADR Status
                └─────────────────┘
```

## Design Documents

### ADR.md (Architecture Decision Record)

Immutable after approval. The contract everyone works against.

| Section | Purpose |
|---------|---------|
| Status | Proposed → Accepted → (Rejected/Superseded) |
| Context | Problem being solved, forces at play |
| Options | 2-3 approaches with pros/cons |
| Decision | Chosen option and why |
| Consequences | What becomes easier/harder, follow-ups |
| Decision History | Numbered log of decisions made with user |

Modified only by: Architect (with Product Owner approval in a formal loop)

### PLAN.md (Execution Plan)

Mutable during implementation. Detailed work tracking.

| Section | Purpose |
|---------|---------|
| Open Questions | Implementation challenges for implementer to solve |
| Stages | Tasks with goals, files, considerations |
| Dependencies | What must complete before what |
| Progress | Status tracking updated by implementer |

Modified by: Implementer/Engineer (progress), Architect (scope changes via ADR loop)

## Agents

### Coordinator
- Coordinates the SDLC flow
- Never writes code
- Assesses each task and dynamically selects which agents to spawn
- Spawns other agents with fresh context
- Gates transitions between phases
- Orchestrates cross-consultation between PO and Architect
- Manages pair review lifecycle during implementation

### Story Writer
- Translates requests into user stories from multiple stakeholder perspectives
- Always runs first in both SDLC and Direct Assist flows
- Consults `platform-user` for end-user reaction, `researcher` for codebase context, and optionally other agents
- User approves or modifies stories before proceeding

### Platform User
- Role-plays as an end-user of the platform (non-technical)
- Consulted by the story-writer to surface user-facing impact
- Reacts to proposed changes from a daily-workflow perspective
- Does NOT read code or access the codebase

### Product Owner
- Appears twice: requirements gathering (start) and validation (end)
- Conducts requirements interviews or drafts directly when clear
- Verifies ADR Context problem is solved
- Checks for scope creep
- Proposes splitting out-of-scope work

### Architect
- Creates ADR.md and PLAN.md
- Proposes 2-3 options, asks for user input
- Focuses on decisions, not implementation details
- Hands off only after explicit approval
- Can be consulted during PO phase for feasibility checks

### Frontend Designer
- Creates visual mockups and designs as HTML + CSS files, verified via browser MCP
- Iterates with user (max 5 iterations per design element)
- Hands off approved designs with screenshots and notes (via Coordinator)
- Does NOT write application code

### Frontend Engineer
- Specialized implementer scoped to client-side code (`src/client/`, `src/shared/`)
- Implements UI to match approved designer mockups
- Works from PLAN.md stages
- Creates PR when done

### Backend Engineer
- Specialized implementer scoped to server-side code (`src/server/`, `packages/`)
- Handles Hono routes, DB layer, WASM packages
- Works from PLAN.md stages
- Creates PR when done

### Implementer
- General-purpose implementation agent (full-stack fallback)
- Used when scope crosses both frontend and backend, or when the specialized split is unnecessary
- Works from PLAN.md stages
- Creates PR when done

### Pair Reviewer
- Collaborative incremental review during implementation (per PLAN stage). Asks questions, makes observations, flags potential issues. Not adversarial.

### Reviewer
- Adversarial post-implementation review. Performs thorough code analysis, security review, and ADR compliance check. Optionally triages external findings (CodeRabbit, SonarCloud, pair review observations) when provided by the coordinator.

### Maintainer
- Merges PR after approvals
- Updates ADR Status to Accepted
- Handles releases
- Monitors CI and manages PR lifecycle

## Git Contract Enforcement

Each workflow variant in `variants/*.md` defines a git contract with allowed commit scopes. The `.husky/commit-msg` hook enforces this at commit time by dynamically parsing the `| Commit scopes |` row from every variant file.

**Adding a scope:** Add it to the relevant variant's git contract table — the hook picks it up automatically, no hardcoded lists to maintain.

**How it works:** The hook extracts backtick-wrapped scopes from the `Commit scopes` row of each variant, deduplicates them, and validates any `type(scope): message` commit against the union. Commits without a scope (e.g. `chore: description`) are allowed.

To see current scopes per variant, trigger the hook with an invalid scope:

```bash
echo 'feat(invalid): test' | bash .husky/commit-msg /dev/stdin
```

## Key Principles

1. Fresh context - each agent starts clean, no accumulated bias
2. ADR is the contract - implementation verified against it
3. PLAN is mutable - progress tracked without touching ADR
4. Scope discipline - out-of-scope work becomes new ADR cycle
5. Explicit approval - no phase transitions without sign-off
6. Agent files as configuration - each agent has its model, tools, and permissions defined in YAML frontmatter
7. Skills as shared protocols - cross-cutting concerns (collaboration protocol, verification rules, coding principles) loaded via the skills field
8. Dynamic agent selection - Coordinator picks only the agents needed per task
9. Agent isolation - each agent is a standalone black box with defined inputs and outputs; agents never address other agents directly; the Coordinator is the only component aware of the full topology and acts as a transparent routing layer

## Reviewer Agents

Two reviewer agents with distinct roles, each a standalone agent file in `agents/agents/`.

- **pair-reviewer:** Collaborative review during implementation (per stage). Uses questions/observations/flags format. Spawned by Coordinator after each PLAN stage completion.
- **reviewer:** Adversarial review after full implementation. Uses severity-classified findings. Optionally triages external inputs (pair review observations, CodeRabbit, SonarCloud) when coordinator provides them. Spawned before PR is marked ready.
