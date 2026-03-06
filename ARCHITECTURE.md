# Architecture

System architecture for Erika. For the vision and motivation, see [VISION.md](VISION.md). Decision history lives in `.state/` as ADRs per feature branch.

## 1. System Overview

Erika is a multi-user, self-hostable web platform where teams browse agent terminal sessions, curate meaningful segments, and generate retrieval context that agents can learn from.

### Key Relationships

- **AGR (Agent Session Recorder)** -- upstream recording and transformation engine. Erika does not record; it serves, browses, and curates what AGR captures.
- **Identity providers** (Authelia, Authentik, Keycloak, Entra ID, Okta) -- planned external auth delegation via OIDC/SSO. Built-in auth first.
- **Agent ecosystems** (MCP, REST APIs) -- planned retrieval interface for curated context.

## 2. Tech Stack

Decided in [MVP v1 ADR](.state/feat/mvp-v1/ADR.md), evolved through MVP v2.

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Backend** | TypeScript + Hono | Unified language with frontend, shared types, web-standard middleware |
| **Frontend** | Vue 3 (Composition API) | Composables for state, no Pinia at current scale |
| **Database** | SQLite via `better-sqlite3` | Embedded, zero-config, WAL mode for concurrent reads |
| **Terminal rendering** | asciinema `avt` crate via WASM | Full VT parser, server-side processing, client renders structured spans |
| **IDs** | `nanoid` | URL-safe, 21 chars, cryptographically strong |
| **Build** | Vite | Frontend bundling, dev proxy to Hono backend |
| **Testing** | Vitest + Playwright | Snapshot tests + visual regression |

### Design System

Bootstrapped in [Design System ADR](.state/design-system-bootstrap/ADR.md). Direction "B Refined": Geist fonts, `#00ff9f` green, `#ff6b2b` orange. Live at [thiscantbeserious.github.io/erika](https://thiscantbeserious.github.io/erika/).

Dual license: application code = AGPL-3.0, design system = Elastic License 2.0 (ELv2).

## 3. Quality Attributes

Priority order when trade-offs arise:

| Priority | Attribute | What It Means |
|----------|-----------|---------------|
| 1 | **Security** | Sessions contain sensitive terminal output. Auth, authorization, tenant isolation are non-negotiable. |
| 2 | **Self-hostability** | Single container with minimal dependencies. Complex setups kill adoption. |
| 3 | **Multi-tenancy** | Multiple users, teams, and workspaces from day one. Not bolted on later. |
| 4 | **Extensibility** | Integration with diverse auth providers, retrieval mechanisms, and agent ecosystems. |
| 5 | **Performance** | Sessions can be massive. Rendering, search, and retrieval must handle scale. |
| 6 | **Operability** | Upgrades, backups, monitoring, and configuration must be straightforward. |

## 4. Current Architecture

### Data Flow

**Ingestion:**
```
Upload .cast -> Validate -> Save to disk -> Insert DB row
  -> Async pipeline: NDJSON stream -> section detection -> VT processing -> scrollback dedup
  -> Store sections + snapshots -> Update detection_status
```

**Browsing:**
```
GET /api/sessions/:id -> Session metadata + sections with pre-rendered snapshots
  -> Client renders TerminalSnapshot as styled <span> grid
```

**Section Detection** ([MVP v2 ADR](.state/feat/mvp-v2/ADR.md)):
- Co-primary signals: timing gaps (raw sessions) + screen clears (AGR-processed)
- Secondary: alternate screen buffer transitions
- Markers always take precedence over auto-detected boundaries

### Database Abstraction

Adapter pattern, fully implemented:

| Component | Interface | Implementation | Status |
|-----------|-----------|---------------|--------|
| Sessions | `SessionAdapter` | `SqliteSessionImpl` | Complete |
| Sections | `SectionAdapter` | `SqliteSectionImpl` | Complete |
| File storage | `StorageAdapter` | `FsStorageImpl` | Complete |
| DB init | `DatabaseAdapter` | `SqliteDatabaseImpl` | Complete |
| DB creation | -- | `DatabaseFactory` | Complete |

The application entry point obtains a `DatabaseAdapter` through `DatabaseFactory.create()`, which uses a dynamic require to avoid coupling `index.ts` to the concrete SQLite implementation. Adding a new backend (e.g. PostgreSQL) requires only a new `*DatabaseImpl` class and a new case in the factory — no changes to routes or processing code.

### API Surface

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| POST | `/api/upload` | Multipart .cast file upload |
| GET | `/api/sessions` | List sessions |
| GET | `/api/sessions/:id` | Session detail with sections and snapshots |
| DELETE | `/api/sessions/:id` | Delete session |
| POST | `/api/sessions/:id/redetect` | Re-run section detection (202 Accepted) |

## 5. Domain Model

### Core Entities (Implemented)

- **Session** -- An asciicast v3 recording with metadata and processing state. Central artifact.
- **Section** -- A structural fold point within a session. Either from markers (recording) or auto-detected (heuristic). Sections carry terminal viewport snapshots.

### Core Entities (Planned)

- **Workspace** -- Tenant boundary. Owns sessions, members, agent tokens.
- **User** -- External identity mapped to internal roles per workspace.
- **Curated Segment** -- Human-annotated slice of a session, tagged for retrieval. What agents consume.
- **Agent Token** -- Scoped credential for agent retrieval access, tied to workspace.

### Bounded Contexts

| Context | Status | What's There |
|---------|--------|-------------|
| **Session** | Partial | Ingestion, storage, browsing, section detection, scrollback dedup |
| **Transform** | Partial | VT processing via avt WASM, snapshot generation |
| **Identity** | Not started | Planned: built-in auth + OIDC delegation |
| **Retrieval** | Not started | Planned: MCP server + REST API for agents |
| **Index** | Not started | Planned: full-text + semantic search |
| **Cache** | Not started | Planned: Redis or in-process for hot sessions |

## 6. Deployment

### Current: Local Development

```bash
npm install && npm run dev
```

SQLite database at `data/ragts.db`. Session files at `data/sessions/`.

### Planned: Single Container (Default)

Everything in one Docker image. Works behind existing reverse proxy.

### Planned: Docker Compose (Team Scale)

```yaml
services:
  erika-app:        # Application server + web UI
  erika-db:         # PostgreSQL (when SQLite hits concurrency limits)
  erika-cache:      # Redis (session caching, job queues)
  erika-transform:  # AGR service worker
```

Same application code at every scale. Configuration determines embedded vs external infrastructure.

## 7. Open Decisions

### Immediate

- **Migration tooling** -- Evaluate whether a proper migration framework is needed as schema grows.

### Near-Term (Auth + Multi-Tenancy)

- Built-in auth model (email+password, invite-only, etc.)
- OIDC integration pattern (proxy headers vs direct OIDC)
- Workspace management and internal role model
- First-run bootstrap experience

### Medium-Term (Retrieval + Search)

- Retrieval interface (MCP server, REST API, or both)
- Search model (full-text, semantic, hybrid)
- Index technology (SQLite FTS5, Meilisearch, vector DB)

### Deferred

- AGR integration depth (sidecar vs FFI vs queue)
- Cache strategy (Redis vs in-process)
- Horizontal scaling
- Cross-workspace sharing
- Session retention policies

## 8. Decision History

| Branch | ADR | Key Decisions |
|--------|-----|---------------|
| `feat/mvp-v1` | [ADR](.state/feat/mvp-v1/ADR.md) | TypeScript+Hono, SQLite, repository pattern, Vue 3, nanoid |
| `feat/mvp-v2` | [ADR](.state/feat/mvp-v2/ADR.md) | avt WASM rendering, section detection, hybrid server/client rendering, scrollback dedup |
| `feat/snapshot-testing` | [ADR](.state/feat/snapshot-testing/ADR.md) | Vitest + Playwright snapshot and visual regression strategy |
| `design-system-bootstrap` | [ADR](.state/design-system-bootstrap/ADR.md) | Route map, navigation model, curation slide-over, design system scope |
| `chore/sdlc-overhaul` | [ADR](.state/chore/sdlc-overhaul/ADR.md) | Specialized roles, dynamic coordinator, role isolation |
| `refactor/db-adapter-pattern` | [ADR](.state/refactor/db-adapter-pattern/ADR.md) | DatabaseAdapter pattern, SectionAdapter interface, StorageAdapter/FsStorageImpl |

## 9. Previous Versions

| Version | Date | Notes |
|---------|------|-------|
| [v1 -- Initial baseline](.state/architecture-history/ARCHITECTURE-v1-initial.md) | 2026-02-16 | Pre-MVP brainstorm. Foundation decisions (tech stack, DB, rendering) resolved through ADRs above. Auth, retrieval, and multi-tenancy decisions remain open (Section 7). |
