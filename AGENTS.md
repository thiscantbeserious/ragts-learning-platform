# RAGTS - Agent Instructions

Reinforced Human Learning Platform. A self-hostable, white-label web platform for browsing, exploring, and learning from AI agent terminal sessions. Powered by [AGR](https://github.com/thiscantbeserious/agent-session-recorder) as the recording and transformation service.

## Directory Rename (2026-03-11)

`agents/` was renamed to `.agents/`. The symlinks `.claude`, `.codex`, and `.gemini` all point to `.agents/`. Historical `.state/` files may still reference the old `agents/` path — those are not updated and should be read as `.agents/`.

## Your Purpose

You are an AI agent working on the RAGTS codebase. On startup:

1. Auto-load the `workflow` skill — this gives you access to SDLC workflow variants and shared agent protocols
2. Auto-load the `instructions` skill — this gives you project-specific development instructions
3. Follow the user's file read requests from Required Reading below

## Startup Proposal

When a user arrives, assess context and offer two paths:

- **SDLC Workflow** — Full orchestrated cycle: Product Owner → Architect → [Designer] → Engineer(s) → Reviewer → Maintainer
- **Direct Assist** — Skip the process, work directly on questions or small tasks

If user intent is explicit, skip the menu and execute directly.

## Development Rules

The `instructions` skill contains mandatory workflow rules — git branching, coding principles, TDD, verification, and more. Load it before starting any task that touches the codebase or repository.

## The Project

Read `README.md` for the project vision and public-facing description.

## Required Reading

Before starting any task, read these files in order:
1. `MEMORY.md` - Full project context, decisions made, decisions open, and project state
2. `README.md` - Project vision and public-facing description
3. `ARCHITECTURE.md` - System design baseline

## Frontend Work — Role Delegation

Frontend work is split across two specialized roles. **Do not attempt to handle both yourself** — delegate to the correct role:

- **Designer** (`.agents/agents/designer.md`) — Design system, CSS, HTML mockups, visual design, responsive fixes, anything under `design/`. Uses Playwright MCP for visual verification.
- **Frontend Engineer** (`.agents/agents/frontend-engineer.md`) — Vue 3 application code, components under `src/client/`, shared types, Vite config. Implements designs produced by the designer.

When a task involves visual/CSS/design work, spawn or defer to the **Designer**. When it involves application logic/Vue components, spawn or defer to the **Frontend Engineer**.

## Snapshot Tests

**NEVER run `--update` on snapshot tests without explicit user approval.** Snapshot baselines (`.snap` files, `__screenshots__/`) are locked intentionally. If a snapshot test fails:

1. **Investigate why** — the failure likely means source code changed behavior
2. **Report the diff** to the user with the old vs new output
3. **Only update** after the user confirms the new output is correct
4. Commits with snapshot changes require `[snapshot-update]` in the commit message (enforced by git hook)

## Research

Iterative architecture and competitive research lives in `.research/`. See `.research/AGENTS.md` for how to trigger re-evaluation of findings across steps.

## License

This project is licensed under AGPL-3.0. Be aware of its implications when contributing or integrating.

## Cursor Cloud specific instructions

### Services

| Service | Command | Port | Notes |
|---------|---------|------|-------|
| Backend (Hono + SQLite) | `npm run dev:server` | 3000 | Auto-creates `data/ragts.db` and `data/sessions/` |
| Frontend (Vite + Vue 3) | `npm run dev:client` | 5173 | Proxies `/api` to backend on port 3000 |
| Both (combined) | `npm run dev` | 3000 + 5173 | Uses `concurrently` |

No external databases, Redis, or Docker containers are needed for development. The project targets Node 24 LTS (see `.nvmrc` and `engines` in `package.json`); Node 22.12+ also supported; the update script runs `nvm install` to match.

### Testing

- `npx vitest run` — full unit/snapshot test suite
- `npx playwright test` — visual regression tests (requires Playwright browsers: `npx playwright install`)
- See `README.md` "Testing" section for additional commands

### Linting

- `npm run lint` — run ESLint (flat config: `eslint.config.js`)
- `npm run lint:fix` — auto-fix fixable issues

### Gotchas

- `npx tsc --noEmit` reports pre-existing TS errors in test files (strict `noUncheckedIndexedAccess` null checks on test assertions). These are separate from ESLint.
- The commit-msg hook (`.husky/commit-msg`) validates commit scopes against `.agents/skills/workflow/variants/*.md` and blocks snapshot file changes without `[snapshot-update]` in the message.
- The WASM package (`packages/vt-wasm/pkg/`) is pre-built and committed; no Rust toolchain needed for development.
- Upload endpoint is `POST /api/upload` (not `/api/sessions`). A sample `.cast` file is at `fixtures/sample.cast`.
