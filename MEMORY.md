# Project Memory

Bootstrap session context for continuing work on RAGTS. Read this before starting any task.

## Project Identity

- **Full name:** RAGTS - Reinforced Human Learning Platform
- **Acronym meaning:** Real Agentic Terminal Sessions
- **Core thesis:** Reinforce the human part in the agentic loop. Up until now it was always about reinforcing agents - RAGTS reinforces the human.
- **Repo:** git@github.com:thiscantbeserious/ragts-learning-platform.git
- **License:** AGPL-3.0 (protects against closed-source commercial forks while staying genuinely open source)

## What RAGTS Is

A self-hostable, white-label web platform that transforms agent terminal session recordings into:
1. **Browsable documents** - Vertical scrolling through sessions (not horizontal video playback)
2. **Foldable views** - asciicast v3 markers become fold/unfold anchors to collapse noise
3. **Curated RAG retrieval** - On-the-fly generation of optimized context that humans curate and feed back to agents

The key differentiator: humans control what gets curated. Sessions become long-term memory that agents learn from, but the human decides what matters.

## Relationship to AGR

[Agent Session Recorder (AGR)](https://github.com/thiscantbeserious/agent-session-recorder) is not just a related CLI tool - it's the **recording and transformation engine** (service) behind RAGTS.

- **AGR captures** sessions via transparent shell recording
- **AGR transforms** sessions (silence removal, optimization, format processing)
- **AGR runs as a service** within the RAGTS platform for background processing tasks
- **AGR is MIT licensed** (permissive, maximize adoption) while RAGTS is AGPL-3.0 (protect the platform)

This is intentional: permissive on the tool → wide adoption → more sessions → more value in RAGTS.

The pipeline: Record (AGR) → Upload (RAGTS) → Humans: Curate + Agents: Retrieve

## Technical Context

### Format
- asciicast v3 is the native format
- Markers in asciicast v3 serve as fold anchors (structural, not just annotation)
- Sessions contain: commands, reasoning, output, errors, timing, markers

### Architecture
See `ARCHITECTURE.md` for the full architectural baseline. It covers:
- **6 bounded contexts** - Identity, Session, Retrieval, Index, Transform, Cache
- **Quality attributes** ranked by priority (security > self-hostability > multi-tenancy > extensibility > performance > operability)
- **Domain model** with core entities and deep open questions (workspace hierarchy, session lifecycle, curation workflow, etc.)
- **4 architectural views** - Logical, Data (DB abstraction + cache layer), Integration, Deployment
- **Deployment topology** - Single container (default) → Docker Compose (team) → Orchestrated (org). Same codebase at every scale.
- **Cache layer** - Redis or similar for hot sessions, search results, job queues, auth tokens, rate limiting
- **Architectural tensions** - The real trade-offs that need navigating
- **Open decisions** layered by dependency

Key framing:
- **Multi-user platform** for teams and organizations from day one
- **Security-first** perspective throughout
- **DB abstraction layer** from day one (swap SQLite ↔ PostgreSQL without rewriting)
- **MVP-driven** - first SDLC cycle defines the minimum viable product scope

### Tech Stack
Not yet decided. The "TS" in RAGTS does NOT stand for TypeScript - it stands for "Terminal Sessions". All tech stack choices are open for the first SDLC cycle.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License | AGPL-3.0 | Prevents closed-source forks, protects platform value |
| AGR license | MIT (unchanged) | Maximize adoption of the recording tool |
| AGR role | Service, not just CLI | Powers background transforms within the platform |
| Browsing model | Vertical scrolling | Sessions are text, text reads vertically |
| Markers | Structural fold anchors | Elevates annotation to navigation/hierarchy |
| Human curation | Core differentiator | Humans control what gets curated into agent memory |
| Skills infrastructure | Not copied from AGR | Bare minimum for now, add when needed |
| Agent instructions | AGENTS.md with symlinks | CLAUDE.md and GEMINI.md symlink to AGENTS.md |
| MVP-driven | First SDLC defines MVP scope | Smallest vertical slice that delivers real value |

## Decisions NOT Yet Made

See `ARCHITECTURE.md` "Open Decisions" for the full list. Everything is open - MVP scope, auth, storage, frontend, retrieval, AGR integration, deployment, and more.

## Project State

As of 2026-02-17, the project has completed **MVP v2** implementation:

### Completed Features
- **Session ingestion pipeline** - Upload .cast files via API, store in SQLite with metadata
- **Section detection** - Multi-signal boundary detection (timing gaps, screen clears, alt screen, volume bursts)
- **Terminal rendering** - avt WASM bridge for VT100 processing (replaces anser)
- **Hybrid rendering model** - Viewport-only snapshots stored as JSON in SQLite (not full terminal state)
- **Async processing** - Upload returns immediately, section detection runs via setImmediate
- **Migration CLI** - Migrate existing v1 sessions to v2 with sections (`npm run migrate:v2`)
- **REST API** - Session CRUD, section listing, re-detection endpoint
- **Frontend** - Vue-based session browser with sections navigation
- **Testing** - Comprehensive test coverage including edge cases (empty sessions, Unicode content)

### Tech Stack Decisions
- **Backend:** Hono (Node.js)
- **Frontend:** Vue 3 + Vite
- **Database:** SQLite with better-sqlite3 (abstraction layer ready for PostgreSQL)
- **Terminal processing:** avt WASM (Rust → WASM via wasm-pack)
- **Testing:** Vitest

### Key Architectural Decisions Made During MVP v2

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Terminal rendering | avt WASM bridge | Native VT100 parsing in Rust, better performance than JS libraries |
| Section detection | Multi-signal heuristics | Timing gaps + screen clears + alt screen + volume bursts for robust boundaries |
| Snapshot storage | Viewport JSON in SQLite | Hybrid approach: metadata in SQL, viewport content as JSON blob |
| File processing | Single-pass streaming | NdjsonStream reads .cast once, feeds VT + detector simultaneously |
| Async processing | setImmediate after upload | Upload responds fast, processing happens in background |
| DB abstraction | Repository pattern | SqliteSessionRepository/SqliteSectionRepository, swappable for PostgreSQL |
| Migration path | CLI script | `npm run migrate:v2` for existing sessions, idempotent |

### Codebase Structure
```
src/
  client/              # Vue frontend
    components/        # TerminalSnapshot, SessionView, etc.
  server/
    db/                # Database layer (repositories, migrations)
    processing/        # Session pipeline (detector, VT bridge, NDJSON stream)
    routes/            # Hono routes (sessions, upload, sections)
    scripts/           # CLI tools (migrate-v2)
  shared/              # Shared types (asciicast, session, section)
packages/
  vt-wasm/             # Rust WASM module for VT100 processing
tests/                 # Integration tests
```

### What's NOT Yet Implemented
From ARCHITECTURE.md's vision, these are deferred post-MVP:
- **Identity/Auth** - No authentication yet (built-in or OIDC)
- **Multi-tenancy** - No workspaces/teams/RBAC
- **Curation** - No human annotation/tagging of segments
- **Retrieval** - No MCP server or agent API
- **Indexing** - No full-text or semantic search
- **AGR integration** - No transforms/optimization service
- **Cache layer** - No Redis (in-memory only)
- **White-label theming** - No customization yet

### Next Steps
The foundation is in place. Next SDLC cycle should focus on:
1. **Authentication** - Built-in auth + OIDC integration (see ARCHITECTURE.md section 5)
2. **Curation UX** - Human annotation workflow for segments
3. **Retrieval API** - MCP server for agent memory
4. Or pivot to operational concerns: deployment artifacts, monitoring, backups

## Voice and Tone

The README has personality. The hook paragraph is intentionally irreverent:
> "Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests."

Keep this voice. Don't sanitize it into corporate speak.
