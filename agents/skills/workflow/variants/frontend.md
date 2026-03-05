# Frontend Workflow

For tasks scoped to client-side code.

```mermaid
graph TD
    PO1[Product Owner] --> Arch[Architect]
    Arch --> Des{Visual work?}
    Des -->|yes| FD[Frontend Designer]
    Des -->|no| FE
    FD --> FE[FE: implement stage]
    FE --> PR[Pair Review]
    PR -->|blocking| FE
    PR -->|next stage| FE
    PR -->|all stages done| IR[Internal Review]
    IR -->|blocking| FE
    IR -->|pass| Ready[PR Ready]
    Ready --> CR[CodeRabbit]
    CR -->|fixes needed| FE
    CR -->|pass| PO2[Product Owner]
    PO2 --> M[Maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off |
| 2 | `architect` | ADR.md + PLAN.md approved |
| 3 | `frontend-designer` | Mockups approved (if visual work) |
| 4 | `frontend-engineer` + `reviewer-pair` | Per stage: implement → pair review → fix blocking → next stage. All stages complete. |
| 5 | `reviewer-internal` | No blocking findings |
| 6 | `reviewer-coderabbit` | Valid findings fixed |
| 7 | `product-owner` | Validates against REQUIREMENTS.md |
| 8 | `maintainer` | CI green, all approvals |

Phase 3 is skipped when the task has no visual/UX changes.

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `feat/client-` or `fix/client-` |
| Commit scopes | `client`, `shared`, `design` |
| Allowed paths | `src/client/**`, `src/shared/**`, `design/**` |
| PR title | `feat(client): <description>` or `fix(client): <description>` |

Commits touching files outside allowed paths violate this contract. Stop and escalate to coordinator.
