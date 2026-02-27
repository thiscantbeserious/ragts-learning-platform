# SDLC Process

The Software Development Life Cycle using orchestrated roles. Each cycle delivers incremental value. Product Owner may trigger new cycles for split-out work.

## Roles

| Role | Phase | Responsibility |
|------|-------|----------------|
| Coordinator | Orchestration | Assesses tasks, spawns roles dynamically, gates transitions |
| Product Owner | Requirements | Gathers requirements, validates final result |
| Architect | Design | Creates ADR + PLAN, proposes options |
| Frontend Designer | Visual Design | Creates mockups in Penpot, iterates with user |
| Frontend Engineer | Frontend Code | Implements client-side code to match approved designs |
| Backend Engineer | Backend Code | Implements server-side code, APIs, DB, WASM |
| Implementer | General Code | Full-stack fallback when scope crosses boundaries |
| Reviewer | Validation | Validates against plan (pair, internal, coderabbit phases) |
| Maintainer | Deploy | Merges PR, handles releases |

## Dynamic Role Selection

The Coordinator assesses each task and spawns only the roles needed. Not every cycle uses every role.

| Task Type | Typical Roles |
|-----------|--------------|
| UI feature | PO → Architect → Designer → Frontend Engineer → Reviewer → Maintainer |
| API/backend feature | PO → Architect → Backend Engineer → Reviewer → Maintainer |
| Full-stack feature | PO → Architect → (Designer if UI) → Frontend + Backend Engineers → Reviewer → Maintainer |
| Config/docs/chore | PO → Architect → Implementer → Reviewer → Maintainer |
| Bug fix | PO → Implementer or specialized engineer → Reviewer → Maintainer |

## Flow

```text
1. Requirements → Product Owner gathers requirements
2. Design       → Architect creates .state/<branch>/ADR.md + PLAN.md
3. Visual Design→ [Optional] Frontend Designer creates mockups (when UI work present)
4. Code         → Engineer(s) or Implementer follow plan
5. Test         → Reviewer validates (pair → internal → coderabbit)
6. Feedback     → Product Owner reviews spec compliance
7. Deploy       → Maintainer merges after approvals
```

## Iterative Cycle

```text
Requirements → Design → [Visual Design] → Code → Test → Feedback → Deploy
     ^                                                                |
     +----------------------------------------------------------------+
```

Product Owner decides when to ship vs iterate.
