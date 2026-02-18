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
- **Resize events**: v3 uses `[timestamp, "r", "COLSxROWS"]` string format (NOT array)
- **Header normalization**: v3 uses `term.cols`/`term.rows` (not top-level `width`/`height`)

### Architecture
See `ARCHITECTURE.md` for the full architectural baseline. Key points:
- **6 bounded contexts** - Identity, Session, Retrieval, Index, Transform, Cache
- **Quality attributes** ranked by priority (security > self-hostability > multi-tenancy > extensibility > performance > operability)
- **Deployment topology** - Single container (default) → Docker Compose (team) → Orchestrated (org)
- **DB abstraction layer** from day one (swap SQLite ↔ PostgreSQL without rewriting)
- **MVP-driven** - each SDLC cycle defines the next scope increment

### Tech Stack (Decided)
- **Backend:** Hono (Node.js)
- **Frontend:** Vue 3 + Vite
- **Database:** SQLite with better-sqlite3 (abstraction layer ready for PostgreSQL)
- **Terminal processing:** avt WASM (Rust → WASM via wasm-pack, containerized build)
- **Testing:** Vitest
- **Note:** The "TS" in RAGTS does NOT stand for TypeScript - it stands for "Terminal Sessions"

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License | AGPL-3.0 | Prevents closed-source forks, protects platform value |
| AGR license | MIT (unchanged) | Maximize adoption of the recording tool |
| AGR role | Service, not just CLI | Powers background transforms within the platform |
| Browsing model | Vertical scrolling | Sessions are text, text reads vertically |
| Markers | Structural fold anchors | Elevates annotation to navigation/hierarchy |
| Human curation | Core differentiator | Humans control what gets curated into agent memory |
| Terminal rendering | avt WASM bridge | Native VT100 parsing in Rust, better performance than JS libraries |
| Section detection | Multi-signal heuristics | Timing gaps + screen clears + alt screen + volume bursts for robust boundaries |
| Snapshot storage | Viewport JSON in SQLite | Hybrid approach: metadata in SQL, viewport content as JSON blob |
| File processing | Single-pass streaming | NdjsonStream reads .cast once, feeds VT + detector simultaneously |
| Async processing | setImmediate after upload | Upload responds fast, processing happens in background |
| DB abstraction | Repository pattern | SqliteSessionRepository/SqliteSectionRepository, swappable for PostgreSQL |
| Unified document model | Hybrid: CLI line ranges + TUI scrollback dedup | CLI sessions produce scrollback documents; TUI sessions get scrollback dedup to remove redraw duplication |
| Alt-screen tracking | Scan for \x1b[?1049h/l during replay | Distinguishes CLI (getAllLines) from TUI (getView) sections at boundary capture time |
| Session-level snapshot | Full getAllLines() stored on session | The single unified document; sections reference line ranges into it |
| Scrollback dedup | Contiguous block matching with epoch awareness | 92%+ reduction for TUI sessions (42K raw → 3K clean) |
| VT resize support | resize() exposed in WASM + pipeline handles 'r' events | Required for correct rendering when terminal dimensions change mid-session |
| Sticky section headers | CSS position: sticky in one scrollable container | Sections fold/unfold within a single terminal chrome |

## Project State

As of 2026-02-18, **MVP v2 is complete and ready to merge to main**.

### MVP v2 — Completed (branch: feat/mvp-v2)

#### Features Delivered
- **Session ingestion pipeline** — Upload .cast files via API, store in SQLite with metadata
- **Section detection** — Multi-signal boundary detection (timing gaps, screen clears, alt screen, volume bursts)
- **Terminal rendering** — avt WASM bridge for VT100 processing with resize support
- **Scrollback deduplication** — Contiguous block matching removes TUI redraw duplication (92%+ reduction)
- **Hybrid rendering model** — Unified document with line ranges; TUI sessions get deduped scrollback
- **VT resize support** — Pipeline handles asciicast v3 resize events, VT engine resizes dynamically
- **Async processing** — Upload returns immediately, section detection + snapshot generation runs in background
- **Migration CLI** — `npm run migrate:v2` for existing sessions, idempotent
- **REST API** — Session CRUD, section listing, re-detection endpoint
- **Frontend** — Vue-based session browser with unified terminal document, sticky section headers
- **Testing** — Vitest test suite: 21 dedup tests, 16 pipeline tests, section detector tests, DB tests

#### Scrollback Deduplication — Deep Technical Context

**The problem:** TUI apps (Claude Code, Gemini CLI) use clear-screen + redraw cycles on the primary buffer (NOT alt-screen). Each redraw pushes all previous content into scrollback. A real Claude Code session produced 42,839 raw lines from `getAllLines()` but only ~3,200 were unique content.

**How it works:**
1. During VT replay, clear-screen events (`\x1b[2J` + `\x1b[3J`) are recorded as "epoch boundaries" with their raw line count
2. After replay, `buildCleanDocument()` processes all raw lines:
   - Hash index maps line text → positions in the clean document for O(1) lookups
   - For each line, find the longest contiguous block matching consecutive lines already in the clean document
   - Blocks >= 3 (MIN_MATCH) consecutive matches are re-renders → mapped to existing clean positions
   - Non-matching lines → appended as new content and immediately indexed
   - Stutter detection removes partial TUI renders (transient animation frames)
3. `rawLineCountToClean()` remaps section line ranges from raw coordinates to clean coordinates
4. The clean snapshot replaces the raw snapshot on the session

**Key files:**
- `src/server/processing/scrollback-dedup.ts` — The dedup algorithm
- `src/server/processing/scrollback-dedup.test.ts` — 21 tests covering all cases
- `src/server/processing/session-pipeline.ts` — Orchestrates VT replay, epoch recording, dedup, and storage

**Results on reference session (lennart-working-session-result-1.cast):**
- Raw: 42,839 lines, 91 Claude Code headers
- Clean: ~3,159 lines, 4 headers (startup screen at 255 cols + first render at 363 cols)
- Terminal resizes from 255x18 → 363x18 → 363x32 during session

**Known limitation — epoch boundary splitting:**
TUI redraws start at the END of one epoch (header line) and continue at the START of the next epoch (conversation history). The current per-epoch algorithm can't match blocks that span epoch boundaries. A continuous stream approach (in stash `continuous-stream-dedup-rewrite`) solved this further (reducing from 37 → 4 headers) but was stashed pending snapshot tests. The per-epoch version is what shipped.

**Stashed but not merged:** `git stash list` contains `continuous-stream-dedup-rewrite` — processes ALL raw lines as one stream ignoring epoch boundaries. Reduces headers further but needs proper regression testing before adoption.

#### Lessons Learned (Hard-Won)

**Terminal rendering failures (in order of discovery):**
1. Fresh VT per section → lost terminal state between sections
2. All sections looked identical → TUI redraws assumed prior state
3. Delta approach (`slice(previousLength)`) → broke at scrollback limit (both equal)
4. Cumulative getView() → repeated content for CLI sessions
5. **Resolution:** Hybrid document model with single VT instance + alt-screen tracking

**Scrollback dedup failures (in order of discovery):**
1. Consecutive-epoch position-aligned comparison → epochs too small, re-renders at arbitrary positions
2. Pre-computed block matching per epoch → missed within-epoch duplicates (L2537-2541 vs L2543-2547)
3. Per-epoch processing with headers at epoch boundaries → blocks can't span boundaries (all headers had bestBlock=1 because they sit at the LAST position in each epoch)
4. **Resolution:** On-the-fly block matching within epochs + stutter detection

**Other hard-won lessons:**
- `word-break: break-all` destroys terminal output; use `white-space: pre` with `overflow-x: auto`
- asciicast v3 uses `term.cols`/`term.rows` not top-level `width`/`height`
- VT engine MUST handle resize events or text wraps at wrong column width, producing garbled output
- Different terminal widths produce different line text (padding), breaking text-based matching
- Claude Code pattern: 108 clear-screen events, never enters alt-screen, operates on primary buffer
- Section detector finds ~50 boundaries per session with current tuning

### Codebase Structure
```
src/
  client/              # Vue frontend
    components/        # Terminal rendering components
      SectionHeader.vue         # Sticky fold divider
      SessionContent.vue        # Unified terminal document renderer
      TerminalSnapshot.vue      # Line-level ANSI renderer
  server/
    db/                # Database layer (repositories, migrations)
    processing/        # Session pipeline
      session-pipeline.ts       # VT replay, epoch recording, dedup, storage
      scrollback-dedup.ts       # Contiguous block matching dedup algorithm
      scrollback-dedup.test.ts  # 21 tests
      section-detector.ts       # Multi-signal boundary detection
      ndjson-stream.ts          # Streaming .cast file parser
    routes/            # Hono routes (sessions, upload, sections)
    scripts/           # CLI tools (migrate-v2)
  shared/              # Shared types (asciicast, session, section)
packages/
  vt-wasm/             # Rust WASM module for VT100 processing
    src/lib.rs         # Wrapper: create, feed, get_view, get_all_lines, resize, get_cursor, get_size
    index.ts           # TypeScript typed API
    pkg/               # Committed WASM binary (platform-independent)
    build.sh           # Containerized build (podman/docker)
scripts/               # Diagnostic scripts (compare-lines, dedup-debug, dedup-trace, frame-diag)
tests/                 # Integration tests
.state/                # SDLC state files (requirements, ADR, plans per branch)
```

### What's NOT Yet Implemented
From ARCHITECTURE.md's vision, these are deferred:
- **Identity/Auth** — No authentication yet (built-in or OIDC)
- **Multi-tenancy** — No workspaces/teams/RBAC
- **Curation** — No human annotation/tagging of segments
- **Retrieval** — No MCP server or agent API
- **Indexing** — No full-text or semantic search
- **AGR integration** — No transforms/optimization service
- **Cache layer** — No Redis (in-memory only)
- **White-label theming** — No customization yet
- **Snapshot regression tests** — Vitest snapshot tests for visual output (NEEDED for MVP v3)
- **Virtual scrolling** — @tanstack/vue-virtual for large sessions
- **Pagination** — Server-side event chunking
- **Search/filter** — Session list search and agent type filtering

### Next Steps — MVP v3

See `.state/feat/mvp-v3/REQUIREMENTS.md` for the full specification.

Priority order:
1. **Snapshot regression tests** — Vitest inline snapshots for dedup output to catch regressions before any algorithm changes
2. **Continuous stream dedup** — Merge the stashed approach after snapshot tests protect against regressions
3. **Virtual scrolling + pagination** — Scale handling for large sessions
4. **Agent type metadata + search/filter** — Session organization
5. **Edit session metadata** — PUT endpoint

## Voice and Tone

The README has personality. The hook paragraph is intentionally irreverent:
> "Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests."

Keep this voice. Don't sanitize it into corporate speak.
