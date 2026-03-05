# Chore Workflow

For maintenance, config, docs, dependency updates, CI changes.

```mermaid
graph TD
    PO1[product-owner] --> Arch[architect]
    Arch --> Impl[implementer]
    Impl --> IR[reviewer-internal]
    IR -->|pass| CR[reviewer-coderabbit]
    IR -->|blocking| Impl
    CR -->|pass| M[maintainer]
    CR -->|fixes needed| Impl
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 1 | `product-owner` | REQUIREMENTS.md signed off (can be lightweight) |
| 2 | `architect` | ADR.md + PLAN.md approved (can be minimal) |
| 3 | `implementer` | All PLAN stages complete |
| 4 | `reviewer-internal` | No blocking findings |
| 5 | `reviewer-coderabbit` | Valid findings fixed |
| 6 | `maintainer` | CI green, all approvals |

No pair review — chore tasks are typically small and don't benefit from incremental stage review.

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `chore/` |
| Commit scopes | `deps`, `config`, `docs`, `ci`, `agents` |
| Allowed paths | task-specific (defined in PLAN.md) |
| PR title | `chore: <description>` |
