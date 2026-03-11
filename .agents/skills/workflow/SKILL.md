---
name: workflow
description: SDLC workflow variants and shared agent protocols. Defines workflow selection, git contracts, delegation principles, blocked request handling, and cross-consultation rules. Loaded by all agents.
---

# Workflow

## 1. Workflow Selection

The coordinator classifies each task and selects a workflow variant from `variants/`. Read the selected variant to get the phase sequence and git contract.

| Task touches | Variant | Read |
|---|---|---|
| `src/client/`, `src/shared/`, `design/` only | Frontend | `variants/frontend.md` |
| `src/server/`, `packages/` only | Backend | `variants/backend.md` |
| Both client and server | Full-stack | `variants/full-stack.md` |
| Design/mockups only, no code | Design | `variants/design.md` |
| Config, docs, deps, CI, agents | Chore | `variants/chore.md` |

When in doubt, use full-stack. The coordinator reads the variant file once at cycle start and follows its phases and git contract.

## 2. Git Contract Enforcement

Every workflow variant defines a git contract (branch prefix, commit scopes, allowed paths). This is binding:

- **Branch name** must match the variant's prefix
- **Commit messages** must use a scope from the variant's allowed scopes
- **Changed files** must be within the variant's allowed paths
- **PR title** must follow the variant's format

If an agent needs to touch files outside its variant's allowed paths, it must stop and escalate to the coordinator. The coordinator may switch to a broader variant (e.g. frontend → full-stack) with user confirmation.

Enforcement: `.husky/commit-msg` validates commit scopes at commit time. Scopes are derived dynamically from `src/*/` directories and variant git contract tables.

## 3. Access Pattern

If no agent is explicitly assigned, default to the coordinator agent.

Startup policy:
1. If user intent is explicit, skip menu and execute directly
2. If simple greeting → respond naturally, then offer SDLC workflow or Direct Assist
3. For unclear non-trivial requests → offer the two paths naturally

Direct Assist: lightweight coordination for smaller tasks. Always delegate -- the main agent coordinates and talks to the user, never reads code or writes code inline.

Direct Assist mandatory phases (never skipped unless the selected variant explicitly omits them):
- **Vision** — vision-drafter always runs. Even small tasks need a clear "why."
- **Architect** — architect always runs. Even small tasks need a plan.

Delegation in Direct Assist:
- Classify the task scope and read the matching variant from `variants/`.
- Run: vision-drafter → architect → engineer(s) → reviewer. Skip story-writer, product-owner, and maintainer.
- Pure exploration ("how does X work"): spawn researcher directly -- no variant needed.

SDLC Workflow runs all phases from the variant in order. No phases are skipped.

When an agent is assigned, you ARE that agent. Follow its instructions immediately.

## 4. Delegation

Your context window is finite and shared with the user. Protect it by delegating work that would consume context without advancing your primary task.

**Delegate when:**
- You need to understand unfamiliar code → spawn `Task(researcher, "...")`
- You need to read more than 3 files beyond Required Reading to assess a task
- You're about to search or read across multiple files to answer a background question
- The result might be large, noisy, or uncertain — let a sub-agent filter it
- The work is outside your agent's scope — use the appropriate specialized agent

**Do it yourself when:**
- You're reading a file listed in your Required Files section
- You already know exactly which file and line to check
- It's a single targeted grep for a known symbol
- The answer is one Read call away

When you have multiple independent questions, spawn multiple researchers in parallel — don't wait for one to finish before asking the next.

Every file you read inline stays in your context forever. A sub-agent runs in isolated context — only its summary comes back. This applies to every agent, including Direct Assist.

## 5. Restriction

Only operate as one agent at a time.

## 6. Blocked Request Protocol

When blocked, describe **what** you need — not who should answer. Route all requests through the Coordinator.

Request format:
- `Need:` what information or decision you require
- `Question:` specific question
- `Context:` why you need it, what you've tried
- `Evidence:` file:line and/or command output
- `Needed by:` phase/stage
- `Decision impact:` what changes depending on the answer

Response format:
- `Answer:` / `Confidence:` high|medium|low / `Evidence:` / `Impact:` / `Open risk:`

Limits: one active request per agent, max 2 follow-ups, then escalate to user.

## 7. Verification

- Check files exist before claiming to read them
- Check checkboxes are `[x]` before claiming stages complete
- Evidence = file path, line number, or command output
- If unclear → ask other agents first, user last

## 8. Cross-Consultation Protocol

The Coordinator may spawn a secondary agent as a short-lived consultant during the phases listed below.

Triggers: lead agent requests it, coordinator judges it prevents rework, user asks, or architect introduces new abstraction boundaries (auto-trigger — coordinator must spawn PO consultation before finalizing ADR).

Limits: max 3 per phase, max 2 follow-ups per question, lead agent owns their artifact.

| Phase | Lead | Can consult | For |
|---|---|---|---|
| Vision | Vision Drafter | UX Researcher, Researcher | Patterns, current state |
| Stories | Story Writer | Platform User, Researcher | Perspectives, codebase context |
| Requirements | Product Owner | Architect | Feasibility, scope |
| Design | Architect | Product Owner | Intent, alignment |

## 9. Reviewer Agents

Two reviewer agents with distinct roles:

- **pair-reviewer:** Collaborative incremental review during implementation (per stage). Questions and flags, no severity classification.
- **reviewer:** Adversarial post-implementation review. Severity-classified findings, optional triage of external inputs (pair review observations, CodeRabbit, SonarCloud).
