# Current Phase: [N] - [PHASE_NAME]

## Goal

[What this phase aims to achieve]

## Tasks

| Task | Status | PR |
|------|--------|-----|
| [Task 1] | PENDING | - |
| [Task 2] | PENDING | - |
| [Task 3] | PENDING | - |

## Quick Start

```bash
# Verify environment (see verification.md for project-specific commands)

# Check state
gh pr list
gh pr list --state merged -L 10
```

## Git Workflow

```bash
# Create feature branch
git checkout main && git pull
git checkout -b feature/[phase]-[task-name]

# Work with TDD, run verification checks
# Commit and push
git add -A
git commit -m "feat(scope): description"
git push -u origin feature/[phase]-[task-name]

# Create PR
gh pr create --title "feat(scope): description"
```

## Definition of Done

- [ ] All tasks complete
- [ ] All verification checks pass (see `verification.md`)
- [ ] PR reviewed (CodeRabbit + verification)
- [ ] PR merged
- [ ] PR metadata reflects final state

## Notes

[Any relevant notes for this phase]
