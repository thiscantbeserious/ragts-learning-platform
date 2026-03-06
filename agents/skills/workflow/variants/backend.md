# Backend Workflow

For tasks scoped to server-side code.

```mermaid
graph TD
    PO1[product-owner] --> Arch[architect]
    Arch --> BE[backend-engineer + pair-reviewer]
    BE -->|all stages done| Rev[reviewer]
    Rev -->|pass| PO2[product-owner]
    Rev -->|blocking| BE
    PO2 --> M[maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off |
| 2 | `architect` | ADR.md + PLAN.md approved |
| 3 | `backend-engineer` + `pair-reviewer` | Per stage: implement → pair review → fix blocking → next stage. All stages complete. |
| 4 | `reviewer` | No blocking findings (includes triage of CodeRabbit/external findings when available) |
| 5 | `product-owner` | Validates against REQUIREMENTS.md |
| 6 | `maintainer` | CI green, all approvals |

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `feat/server-` or `fix/server-` |
| Commit scopes | `server`, `db`, `wasm` |
| Allowed paths | `src/server/**`, `packages/**` |
| PR title | `feat(server): <description>` or `fix(server): <description>` |

Commits touching files outside allowed paths violate this contract. Stop and escalate to coordinator.
