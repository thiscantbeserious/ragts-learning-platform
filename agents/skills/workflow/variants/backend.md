# Backend Workflow

For tasks scoped to server-side code.

```mermaid
graph TD
    PO1[Product Owner] --> Arch[Architect]
    Arch --> BE[BE: implement stage]
    BE --> PR[Pair Review]
    PR -->|blocking| BE
    PR -->|next stage| BE
    PR -->|all stages done| IR[Internal Review]
    IR -->|blocking| BE
    IR -->|pass| Ready[PR Ready]
    Ready --> CR[CodeRabbit]
    CR -->|fixes needed| BE
    CR -->|pass| PO2[Product Owner]
    PO2 --> M[Maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off |
| 2 | `architect` | ADR.md + PLAN.md approved |
| 3 | `backend-engineer` + `reviewer-pair` | Per stage: implement → pair review → fix blocking → next stage. All stages complete. |
| 4 | `reviewer-internal` | No blocking findings |
| 5 | `reviewer-coderabbit` | Valid findings fixed |
| 6 | `product-owner` | Validates against REQUIREMENTS.md |
| 7 | `maintainer` | CI green, all approvals |

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `feat/server-` or `fix/server-` |
| Commit scopes | `server`, `db`, `wasm` |
| Allowed paths | `src/server/**`, `packages/**` |
| PR title | `feat(server): <description>` or `fix(server): <description>` |

Commits touching files outside allowed paths violate this contract. Stop and escalate to coordinator.
