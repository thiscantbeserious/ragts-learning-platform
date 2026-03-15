---
tags: vision, backlog
---

# Visionbook

> Ideas and concepts for Erika. Each entry is a standalone vision seed — when ready, reference it in a cycle kickoff.

## Git-Native Project Integration

> [!info] Status: Draft

**Core idea:** Erika ships a git plugin that does a lightweight checkout of external projects and keeps them in sync. It reads agent session data from those repos and writes back — updating `AGENTS.md`, skills, and other agent config files. Git is both the transport and the sync mechanism.

**The flow:**

1. User connects a project repo to Erika (via the git plugin)
2. Erika does a lightweight/sparse checkout — only the paths it cares about (`.agents/`, `.state/`, session recordings, etc.)
3. Erika continuously syncs: pulls new session data, indexes it, makes it browsable and searchable
4. Erika writes back to the source repo — updating `AGENTS.md` with learned patterns, pushing new skills, improving agent configs
5. Write-backs go through PRs — reviewable, deniable, familiar

**Why git as the sync layer:**

- Every project already has it — zero new infrastructure
- Built-in history, diffing, authorship tracking
- Sparse checkout keeps it lightweight — no need to clone entire repos
- PRs as the feedback mechanism — the project team reviews what Erika suggests
- Works with GitHub, GitLab, Bitbucket, self-hosted — anywhere git runs

**Open questions:**

- Sparse checkout paths — what does Erika need from a project? Just `.agents/` and session files, or more?
- Conflict resolution — if the project and Erika both modify `AGENTS.md`, who wins?
- How does this relate to AGR (the recording service)? Does git-sync replace AGR's upload path or complement it?
- Auth model — PATs? Deploy keys? OAuth app installation?
- Write-back frequency — real-time PRs or batched insights?

**Connections:** This turns Erika from a passive session viewer into an active participant in a project's agent ecosystem. It learns from your sessions, improves your agent configs, and pushes those improvements back — all through git, the tool you already use.

## Cross-Session Intelligence (GraphRAG)

> [!info] Status: Backlog

**Core idea:** Sessions and sections are connected — the same tools, commands, error patterns, and workflows appear across different sessions. Erika should discover and surface these connections automatically, turning a flat session list into a knowledge graph you can explore.

**Architecture (two phases):**

Phase 1 — **SQLite closure tables** for explicit cross-links between sections. Zero new dependencies, recursive CTEs for multi-hop queries. Relationship types: `similar_commands`, `same_project`, `same_error`, `follows`.

Phase 2 — **LanceDB + Transformers.js** for semantic similarity. Embed section content locally (no GPU, no API calls) using `all-MiniLM-L6-v2` (22MB model). Store vectors in LanceDB (embedded, Apache 2.0). Query: "find sections with similar error patterns" via vector ANN search. Hybrid retrieval merges explicit links (SQLite) with semantic matches (LanceDB).

**What it enables:**

- "Show me all sessions where this error appeared" — vector search across section content
- "What tools does this project use most?" — graph traversal over extracted entities
- "Sessions related to this one" — hybrid: explicit links + semantic similarity
- Pattern discovery: "Agent X struggles with Y" emerges from cross-session analysis

**Self-hosted constraints:**

- Everything runs embedded (no external server process)
- Transformers.js generates embeddings locally on CPU
- LanceDB stores vectors on disk (Parquet/Arrow format)
- Works on Raspberry Pi 4 (4GB RAM) for 10K+ sections
- No cloud APIs required

**Open questions:**

- Entity extraction: LLM-powered (expensive, accurate) vs regex/heuristic (cheap, fragile)?
- When to embed: on upload (pipeline stage) or lazily on first search?
- Graph engine: **LadybugDB** (MIT, Kuzu fork, `npm install @ladybug/core`) is the leading embedded graph option. Active as of March 2026, Cypher queries, vector indices built in. Alternative: **FalkorDBLite** (`npm install falkordblite`, MIT) bundles Redis internally — if Redis is already planned for caching/pub-sub, FalkorDB becomes the natural graph layer on top of it. Also watch: sqlite-graph (alpha, Cypher on SQLite).
- UI: how to visualize cross-session connections? Force-directed graph? Timeline overlay?

**Research:** See `.research/graphrag-architecture.md` for full technical analysis.

## Redis Cache Layer

> [!info] Status: Planned

**Core idea:** Add Redis as the caching and real-time messaging layer. SQLite handles persistence, Redis handles speed — session list caching, SSE pub/sub fan-out, rate limiting, and eventually FalkorDB graph queries.

**Use cases:**

- **Session list cache** — avoid hitting SQLite on every sidebar render. Invalidate on upload/delete.
- **SSE pub/sub** — replace per-connection polling with Redis pub/sub. Multiple browser tabs, multiple users, one event source.
- **Pipeline job queue** — BullMQ on Redis replaces the current SQLite-based job table. Retry, backoff, priority, concurrency — all built in.
- **Rate limiting** — upload throttling, API rate limits via sliding window counters.
- **FalkorDB** — graph database module runs inside Redis. If Redis is already there, FalkorDB is just a module load away — no separate process.

**Self-hosted:**

- Redis is a single binary, runs everywhere (Pi, NAS, Docker)
- Docker Compose: add `redis:7-alpine` service (~5MB image)
- For single-user self-hosted: Redis is optional, SQLite-only mode still works
- For multi-user / production: Redis becomes required

**Open questions:**

- Optional vs required? Keep SQLite-only mode for zero-dependency self-hosting?
- Redis Stack vs plain Redis? Stack includes FalkorDB, RedisJSON, RediSearch out of the box.
- Session storage: keep in SQLite or move hot data to Redis?

## SSE Connection Priority Queue

> [!info] Status: Backlog

**Core idea:** When multiple sessions are processing simultaneously, the currently viewed session should always get a real-time SSE connection — even if all 3 budget slots are taken by background sessions.

**Current behavior:** First-come-first-served. Whichever `SessionCard` components mount first grab the SSE slots. If 3 background sessions are processing and the user clicks a 4th, it falls back to 10s polling instead of real-time updates.

**Proposed behavior:** Priority queue with eviction. When the user selects a session that's processing:
1. If a slot is free, use it
2. If all slots are taken, evict the least-important connection (oldest background session) and give the slot to the selected session
3. The evicted session falls back to polling

**Priority order:** Selected session > most recently uploaded > oldest upload

**Why deferred:** Requires 4+ sessions processing simultaneously, which is rare in typical usage (1-2 uploads at a time). The 3-slot budget handles normal load without priority logic.

**When to implement:** When Erika supports batch uploads, CI integration, or multi-user scenarios where many sessions process at once.

## Storage Layer Visualization

> [!info] Status: Backlog

**Core idea:** The platform's storage architecture (SQLite, LanceDB, LadybugDB, filesystem) should be tracked visually in `VISION.svg` — a living architecture diagram that shows how data flows between storage layers and what each layer is responsible for.

**What to visualize:**

- SQLite: sessions, sections, metadata, job queue, event log
- Filesystem: raw .cast files, processed session data
- LanceDB (future): vector embeddings for semantic search
- LadybugDB (future): graph relationships between sessions/sections
- Closure tables (future): explicit cross-links in SQLite

**Why a visual:**

- Storage decisions compound — each new layer adds complexity
- A single diagram prevents "where does X live?" questions
- Shows data flow: upload → SQLite → pipeline → sections → embeddings → graph
- Helps new contributors understand the persistence model at a glance

**Format:** SVG so it renders in GitHub, editable in any vector tool or as raw XML. Lives at root as `VISION.svg`, referenced from `ARCHITECTURE.md`.

**Open questions:**

- Generate from code (Mermaid → SVG) or hand-crafted?
- Include query patterns (which layer answers which API endpoint)?
- Version it — does the diagram evolve per branch or only on main?

## Detection Confidence Scoring

> [!info] Status: Backlog

**Core idea:** Rather than binary "sections or no sections," the section detector could emit a confidence level per boundary. Sessions with low-confidence boundaries could show sections with a subtle "approximate boundaries" indicator, giving the user useful structure without false precision.

**What it enables:**

- Users see section boundaries but know they're approximate
- Future ML-based detection can express uncertainty naturally
- UI can offer "refine these boundaries" when confidence is low

**Open questions:**

- Confidence per-boundary or per-session?
- UI treatment: subtle label? different fold styling? tooltip?
- Threshold: below what confidence do we fall back to unsectioned view?

## Manual Section Marking

> [!info] Status: Backlog

**Core idea:** When a user sees an unsectioned session (or one with bad boundaries), they are looking at the content and naturally forming opinions about where sections should be. A "mark section here" interaction would let users define their own boundaries.

**What it enables:**

- Users fix what the detector missed
- Training signal for future detection improvements
- Works naturally with the continuous document view (from the empty session fix)

**Open questions:**

- Persist where? Separate table? Inline in sections table with a `source: 'manual'` flag?
- Can manual marks override detected ones?
- Collaborative: if multiple users mark the same session, merge or per-user?
