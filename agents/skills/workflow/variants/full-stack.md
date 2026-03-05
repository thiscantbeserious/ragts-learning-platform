# Full-Stack Workflow

For tasks spanning both client and server code.

```mermaid
graph TD
    PO1[product-owner] --> Arch[architect]
    Arch --> Des{Visual work?}
    Des -->|yes| FD[frontend-designer]
    Des -->|no| Impl
    FD --> Impl[frontend-engineer + backend-engineer + reviewer-pair]
    Impl -->|all stages done| IR[reviewer-internal]
    IR -->|pass| CR[reviewer-coderabbit]
    IR -->|blocking| Impl
    CR -->|pass| PO2[product-owner]
    CR -->|fixes needed| Impl
    PO2 --> M[maintainer]
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off |
| 2 | `architect` | ADR.md + PLAN.md approved |
| 3 | `frontend-designer` | Mockups approved (if visual work) |
| 4 | `frontend-engineer` + `backend-engineer` + `reviewer-pair` | Per stage: implement → pair review → fix blocking → next stage. All stages complete. |
| 5 | `reviewer-internal` | No blocking findings |
| 6 | `reviewer-coderabbit` | Valid findings fixed |
| 7 | `product-owner` | Validates against REQUIREMENTS.md |
| 8 | `maintainer` | CI green, all approvals |

Phase 3 is skipped when the task has no visual/UX changes.
Phase 4 engineers may run in parallel when PLAN stages have non-overlapping files and no dependencies. Max 2 parallel agents.

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `feat/` or `fix/` |
| Commit scopes | `client`, `server`, `shared`, `db`, `wasm` |
| Allowed paths | `src/**`, `packages/**` |
| PR title | `feat: <description>` or `fix: <description>` |
