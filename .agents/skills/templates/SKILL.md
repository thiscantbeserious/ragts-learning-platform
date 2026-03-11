---
name: templates
description: Project file templates. Load this skill to know which templates are available and how to use them.
---

## Access pattern

Templates are in `references/`. When you need to create a file (e.g., `STORIES.md`, `ADR.md`, `REQUIREMENTS.md`), a template with the same name must exist at `references/<filename>`. Read it before creating your output. If the matching template is missing, stop and escalate to the coordinator rather than inventing the file structure.

## Usage

1. Read the matching template from `references/`
2. Copy it to the target location (typically `.state/<branch-name>/`)
3. Fill in the placeholders
