# Project Overview

## Context

- RAGTS = Real Agentic Terminal Sessions
- Self-hostable, white-label web platform for browsing agent terminal sessions
- Vertical document-style browsing (not horizontal video-like playback)
- Markers as fold/unfold anchors for collapsible sections
- Sessions serve as curated long-term memory for humans and agents

## Tech Stack

- **Backend:** Hono (Node.js) with SQLite via better-sqlite3
- **Frontend:** Vue 3 + Vite
- **Terminal processing:** avt WASM (Rust compiled to WASM via wasm-pack)
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Type checking:** vue-tsc (TypeScript + Vue SFCs)

## Codebase Structure

| Directory | Purpose |
|-----------|---------|
| `src/server/` | Hono backend: routes, DB layer (repositories, migrations), processing pipeline |
| `src/client/` | Vue 3 frontend: components, pages, composables |
| `src/shared/` | Shared TypeScript types (asciicast, session, section) |
| `packages/vt-wasm/` | Rust WASM module for VT100 terminal processing |
| `tests/` | Integration tests and fixtures |
| `scripts/` | Diagnostic and utility scripts |
| `.state/` | SDLC state files (requirements, ADR, plans per branch) |

See `ARCHITECTURE.md` for the full architectural baseline.

## Related Projects

- **AGR (Agent Session Recorder)** - MIT-licensed CLI/service for recording agent terminal sessions using asciicast v3 format. RAGTS consumes recordings produced by AGR.

## References

- asciicast v3 spec: https://docs.asciinema.org/manual/asciicast/v3/
- AGR repository: https://github.com/thiscantbeserious/agent-session-recorder
- RAGTS repository: https://github.com/thiscantbeserious/ragts-learning-platform
