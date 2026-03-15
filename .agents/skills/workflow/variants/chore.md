# Chore Workflow

For maintenance, config, docs, dependency updates, CI changes.

```mermaid
graph TD
    VD[vision-drafter] --> SW[story-writer]
    SW --> PO1[product-owner]
    PO1 --> Arch[architect]
    Arch --> Eng[engineer - coordinator picks]
    Eng --> Rev[reviewer]
    Rev -->|pass| M[maintainer]
    Rev -->|blocking| Eng
```

## Phases

| # | Agent | Gate |
|---|-------|------|
| 0 | `vision-drafter` | User approves VISION_STEP.md |
| 1 | `story-writer` | User approves or modifies stories |
| 2 | `product-owner` | REQUIREMENTS.md signed off (can be lightweight) |
| 3 | `architect` | ADR.md + PLAN.md approved (can be minimal) |
| 4 | Engineer (coordinator picks based on files) | All PLAN stages complete |
| 5 | `reviewer` | No blocking findings (includes triage of CodeRabbit/external findings when available) |
| 6 | `maintainer` | CI green, all approvals |

Phase 4 engineer selection: `backend-engineer` for server/package changes, `frontend-engineer` for client/design changes, coordinator handles config/docs/CI directly.

## Git Contract

| Rule | Value |
|------|-------|
| Branch prefix | `chore/` |
| Commit scopes | `deps`, `config`, `docs`, `ci`, `agents` |
| Allowed paths | task-specific (defined in PLAN.md) |
| PR title | `chore: <description>` |
