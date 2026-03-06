# Frontend Workflow

For tasks scoped to client-side code.

```mermaid
graph TD
    PO1[product-owner] --> Arch[architect]
    Arch --> Des{Visual work?}
    Des -->|yes| FD[frontend-designer]
    Des -->|no| FE
    FD --> FE[frontend-engineer + pair-reviewer]
    FE -->|all stages done| Rev[reviewer]
    Rev -->|pass| PO2[product-owner]
    Rev -->|blocking| FE
    PO2 --> M[maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off |
| 2 | `architect` | ADR.md + PLAN.md approved |
| 3 | `frontend-designer` | Mockups approved (if visual work) |
| 4 | `frontend-engineer` + `pair-reviewer` | Per stage: implement → pair review → fix blocking → next stage. All stages complete. |
| 5 | `reviewer` | No blocking findings (includes triage of CodeRabbit/external findings when available) |
| 6 | `product-owner` | Validates against REQUIREMENTS.md |
| 7 | `maintainer` | CI green, all approvals |

Phase 3 is skipped when the task has no visual/UX changes.

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `feat/client-` or `fix/client-` |
| Commit scopes | `client`, `shared`, `design` |
| Allowed paths | `src/client/**`, `src/shared/**`, `design/**` |
| PR title | `feat(client): <description>` or `fix(client): <description>` |

Commits touching files outside allowed paths violate this contract. Stop and escalate to coordinator.
