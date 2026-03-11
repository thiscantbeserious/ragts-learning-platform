---
name: templates
description: Project file templates. Load this skill to know which templates are available and how to use them.
---

## Templates

Project file templates. Copy the relevant template to the target location when starting work.

| Template | Used by | Creates |
|----------|---------|---------|
| `STORIES.md` | Story Writer | `.state/feat/<name>/STORIES.md` |
| `REQUIREMENTS.md` | Product Owner | `.state/feat/<name>/REQUIREMENTS.md` |
| `ADR.md` | Architect | `.state/feat/<name>/ADR.md` |
| `PLAN.md` | Architect | `.state/feat/<name>/PLAN.md` |
| `REVIEW.md` | Reviewer | `.state/feat/<name>/REVIEW.md` |

## Usage

1. Read the template file from this skill directory
2. Copy it to `.state/feat/<branch-name>/`
3. Fill in the placeholders
