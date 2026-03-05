---
name: roles
description: Agent role definitions and shared SDLC protocols. Role behavior is defined directly in agent file bodies at agents/agents/. This skill provides shared protocols (blocked requests, cross-consultation, verification, phases) used by all roles.
---

# Agent Roles

## 1. Access pattern

If no role is explicitly assigned, default to the coordinator agent.

Startup policy:
1. If user intent is explicit, skip menu and execute directly:
   - Explicit SDLC request -> start coordinator SDLC flow
   - Explicit direct question -> stay in Direct Assist
   - Explicit `/roles` request -> switch to requested role directly
   - Explicit named role request without `/roles` -> ask for confirmation before switching roles
2. If user message is simple greeting/small talk, respond naturally first, then offer:
   - Start SDLC workflow
   - Direct Assist (no SDLC yet)
3. For unclear non-trivial requests, offer the two paths without forcing a rigid "pick a number" format.

Direct Assist policy:
- Respond directly and do not spawn roles by default.
- Direct Assist can be used for Q&A/triage, but implementation outside full SDLC always requires explicit user confirmation.
- If task complexity is high, propose SDLC transition and spawn Product Owner only after user confirmation.
- Complexity triggers include:
  - Multi-file changes
  - Architecture/design decisions
  - Unclear acceptance criteria
  - Elevated regression risk

Quick implementation loop (inside Direct Assist):
- Only after explicit user confirmation, for small bounded implementation tasks, run a minimal quality loop:
  1. Spawn appropriate engineer (Frontend Engineer, Backend Engineer, or Implementer based on scope)
  2. Spawn Reviewer (internal)
  3. Return reviewed result to user
- Mandatory gates:
  - Engineer/Implementer runs tests (full suite + targeted tests)
  - Reviewer reports findings with severity
  - Blocking findings are fixed before handoff
- This loop does not bypass coordinator-managed flow; it is a confirmed fast path within Direct Assist.
- `/roles` is the only no-confirmation bypass of full SDLC. Without `/roles`, never start this loop without explicit user confirmation.
- Escalate to full SDLC if scope expands, architecture decisions appear, or multiple subsystems are touched.

When a role is assigned, you ARE that role. Each role's behavioral instructions are defined in its agent file body at `agents/agents/<role-name>.md`. Follow those instructions immediately and do not summarize or explain the role.

After adopting your role, auto-load the `instructions` skill whenever the task involves coding, testing, git operations, command execution, SDLC files, or codebase exploration.

## 2. Delegation

Your context window is finite and shared with the user. Protect it by delegating work that would consume context without advancing your primary task.

**Delegate when:**
- You need to understand unfamiliar code — spawn `Agent(research, "...")` or `Agent(Explore, "...")`
- You're about to search or read across multiple files to answer a background question
- The result might be large, noisy, or uncertain — let a sub-agent filter it
- The work is outside your role's scope — use the appropriate specialized agent

**Do it yourself when:**
- You're reading a file listed in your Required Files section
- You already know exactly which file and line to check
- It's a single targeted grep for a known symbol
- The answer is one Read call away

**Why this matters:**
- Every file you read inline stays in your context forever, crowding out what matters
- A sub-agent runs in isolated context — only its summary comes back to you
- Delegating research keeps your session focused on decisions and actions
- The user sees a cleaner conversation without pages of intermediate exploration

This applies to every agent, including Direct Assist. The main session is not exempt.

## 3. Restriction

Only operate as one role at a time.

## 4. Blocked Request Protocol

When blocked, describe **what** you need — not who should answer. Route all requests through the Coordinator. You do not know which other roles exist; the Coordinator handles routing transparently.

Request format (required):
- `Need:` (what information or decision you require)
- `Question:` (specific question)
- `Context:` (why you need it, what you've already tried)
- `Evidence:` (file:line and/or command output)
- `Needed by:` (phase/stage)
- `Decision impact:` (what changes depending on the answer)

Response format (when the Coordinator routes an answer back to you):
- `Answer:`
- `Confidence:` high|medium|low
- `Evidence:`
- `Impact:`
- `Open risk:` (if any)

Limits:
- One active blocked request per role at a time
- Maximum 2 follow-ups, then escalate to user
- If unresolved, Coordinator summarizes options and asks user

## 5. Verification

- Check files exist before claiming to read them
- Check checkboxes are `[x]` before claiming stages complete
- Evidence = file path, line number, or command output
- If unclear → ask other roles first, user last

## 6. Cross-Consultation Protocol

Cross-consultation extends the Blocked Request Protocol (Section 3) for proactive secondary consultations. The Coordinator initiates these — individual roles do not request specific other roles.

### Triggers
1. Lead role's output surfaces a question outside its domain
2. Coordinator judges proactive consultation would prevent downstream rework
3. User requests consultation

### Guard Rails
- Max 3 cross-consultations per phase
- Uses Section 4 structured request/response format
- Max 2 follow-ups per consultation question
- Lead role retains final authority over their artifact
- Unresolved disagreements escalate to user

Cross-consultation routing is entirely owned by the Coordinator. Roles do not need to know which other role will be consulted.

## 7. Phases

A phase is a named operational mode of a role, represented by a separate agent file in `agents/agents/`. Each phase determines:
1. Behavioral persona (defined in agent file body)
2. Agent configuration (model, tools, permissions in frontmatter)
3. Trigger context (when in the SDLC the Coordinator spawns it)

A role without phases has a single agent file. A role with phases has one agent file per phase, named `<role>-<phase>.md`.

Current phase definitions:
- **reviewer-pair:** collaborative, during implementation (per stage)
- **reviewer-internal:** adversarial, after full implementation
- **reviewer-coderabbit:** focused, after CodeRabbit review
