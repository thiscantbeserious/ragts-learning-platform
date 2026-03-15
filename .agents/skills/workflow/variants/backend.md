# Backend Workflow

For tasks scoped to server-side code.

```mermaid
graph TD
    VD[vision-drafter] --> SW[story-writer]
    SW --> PO1[product-owner]
    PO1 --> Arch[architect]
    Arch --> BE[backend-engineer]
    BE -->|per stage| Rev[reviewer]
    Rev -->|blocking| BE
    Rev -->|all stages done| PO2[product-owner]
    PO2 --> M[maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 0 | `vision-drafter` | User approves VISION_STEP.md |
| 1 | `story-writer` | User approves or modifies stories |
| 2 | `product-owner` | REQUIREMENTS.md signed off |
| 3 | `architect` | ADR.md + PLAN.md approved |
| 4 | `backend-engineer` + `reviewer` | Per stage: implement → review → fix blocking → next stage. All stages complete. |
| 5 | `reviewer` | Final review — no blocking findings (includes triage of CodeRabbit/external findings when available) |
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
