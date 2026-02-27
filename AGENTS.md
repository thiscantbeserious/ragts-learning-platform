# RAGTS - Agent Instructions

Reinforced Human Learning Platform. A self-hostable, white-label web platform for browsing, exploring, and learning from AI agent terminal sessions. Powered by [AGR](https://github.com/thiscantbeserious/agent-session-recorder) as the recording and transformation service.

## Required Reading

Before starting any task, read these files in order:
1. `MEMORY.md` - Full project context, decisions made, decisions open, and project state
2. `README.md` - Project vision and public-facing description
3. `ARCHITECTURE.md` - System design baseline

## Snapshot Tests

**NEVER run `--update` on snapshot tests without explicit user approval.** Snapshot baselines (`.snap` files, `__screenshots__/`) are locked intentionally. If a snapshot test fails:

1. **Investigate why** — the failure likely means source code changed behavior
2. **Report the diff** to the user with the old vs new output
3. **Only update** after the user confirms the new output is correct
4. Commits with snapshot changes require `[snapshot-update]` in the commit message (enforced by git hook)

## License

This project is licensed under AGPL-3.0. Be aware of its implications when contributing or integrating.
