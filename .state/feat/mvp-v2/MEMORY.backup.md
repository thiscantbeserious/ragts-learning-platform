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
| Header normalization | normalizeHeader() at parse time | v3 `term.cols`/`term.rows` → `width`/`height` so all downstream code works unchanged |
| File size limit | 250MB default | Real AGR sessions from Claude Code can be 36MB+; 50MB was too conservative |
| Unified console | Single terminal-chrome wrapper | Sections render inside one dark background with fold dividers, not separate cards |
| Preamble sections | Marker-based sessions only | Content before first marker gets a "Preamble" section; not for auto-detected boundaries |
| Unified document model | Hybrid: CLI line ranges + TUI viewport snapshots | CLI sessions produce scrollback documents; TUI sessions produce ephemeral screen states. One model can't serve both. |
| Alt-screen tracking | Scan for \x1b[?1049h/l during replay | Distinguishes CLI (getAllLines) from TUI (getView) sections at boundary capture time |
| Session-level snapshot | Full getAllLines() stored on session | CLI sections reference line ranges into this document; enables one-document rendering |
| Sticky section headers | CSS position: sticky in one scrollable container | Sections fold/unfold within a single terminal chrome, not separate cards |

### Known Bugs & Lessons Learned

**TUI session rendering — RESOLVED (2026-02-17)**

Previous approaches failed for TUI sessions:

1. **Fresh VT per section**: Each section created its own VT instance and replayed only that section's events. This worked for CLI sessions (linear scrollback) but **failed completely for TUI apps** like Claude Code because terminal state (alt screen mode, cursor position) was lost between sections.
2. **All sections looked identical**: Claude Code redraws the entire screen on each render cycle. Without prior state context, each section's fresh VT produced similar-looking output because the TUI escape sequences assumed terminal state from prior events.
3. **Delta approach**: The previous delta approach (`nextSnapshot.lines.slice(currentSnapshot.lines.length)`) broke when scrollback hit the 10,000-line limit — both snapshots had the same line count, delta was empty (0 lines).
4. **Cumulative getView()**: Replaying through all boundaries and capturing `getView()` at each boundary produced repeated content for CLI sessions — Section 2 showed Section 1's content plus its own.

**The resolution**: Implement a **hybrid document model**:
- Single VT instance replays all events once
- Track alt-screen state during replay (scan for `\x1b[?1049h`/`\x1b[?1049l`)
- At CLI boundaries (not in alt-screen): record line count from `getAllLines()` for range calculation
- At TUI boundaries (during alt-screen): capture `getView()` as section viewport snapshot
- At end: capture `getAllLines()` as full session document
- Store: `session.snapshot` (full document) + sections with line ranges (CLI) OR viewport snapshots (TUI)
- Client renders ONE scrollable terminal with sticky section headers using CSS `position: sticky`

This hybrid model serves both CLI (scrollback documents) and TUI (ephemeral screen states) correctly within a unified rendering architecture.

**Other lessons from this session:**
- `word-break: break-all` destroys terminal output; use `white-space: pre` with `overflow-x: auto`
- asciicast v3 uses `term.cols`/`term.rows` not top-level `width`/`height` — real AGR files were being rejected
- Resize events in v3 use string format `"COLSxROWS"` not array `[number, number]`
- Section detector finds only 3 boundaries in 30K-event TUI sessions — may need tuning for large files

### Codebase Structure
```
src/
  client/              # Vue frontend
    components/        # Terminal rendering components
      SectionHeader.vue         # Sticky fold divider (replaces SectionPanel.vue)
      SessionContent.vue        # Unified terminal document renderer
      TerminalSnapshot.vue      # Line-level ANSI renderer
  server/
    db/                # Database layer (repositories, migrations)
    processing/        # Session pipeline (detector, VT bridge, NDJSON stream)
      session-pipeline.ts       # Hybrid snapshot capture with alt-screen tracking
    routes/            # Hono routes (sessions, upload, sections)
    scripts/           # CLI tools (migrate-v2)
  shared/              # Shared types (asciicast, session, section)
packages/
  vt-wasm/             # Rust WASM module for VT100 processing
tests/                 # Integration tests
```

**Key architectural components:**
- **session-pipeline.ts**: Replays events through single VT instance, tracks alt-screen state, stores session-level snapshot + section line ranges/viewport snapshots
- **SectionHeader.vue**: Sticky fold divider using CSS `position: sticky` within scrollable container
- **SessionContent.vue**: One terminal chrome with sticky section headers; CLI sections render line ranges from session snapshot, TUI sections render inline viewport snapshots
- **TerminalSnapshot.vue**: Accepts `lines` prop instead of full snapshot; renders ANSI color spans

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
