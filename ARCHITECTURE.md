# Architecture

Architectural baseline for the RAGTS platform. This document frames the problem space, identifies the forces at play, and surfaces the decisions that will shape the system.

**This document is the input for the first SDLC cycle.** Nothing here is decided - it's the context an Architect and Product Owner need to make real decisions. Start here.

## 1. Context

### What We're Building
A multi-user, self-hostable web platform where teams browse agent terminal sessions vertically, curate meaningful segments, and generate retrieval context that agents can learn from. The human stays in control.

### Who It's For
- **Teams and organizations** running AI agents at scale
- **Platform operators** who self-host and need to integrate with existing infrastructure
- **Agents** that consume curated session context as long-term memory

### Key Relationships
- **AGR (Agent Session Recorder)** is the upstream recording and transformation engine. RAGTS does not record - it serves, browses, and curates what AGR captures.
- **Identity providers** (Authelia, Authentik, Keycloak, Microsoft Entra ID, Okta, etc.) handle authentication. RAGTS delegates, never reinvents.
- **Agent ecosystems** (MCP, REST APIs, custom integrations) consume curated context from RAGTS.

### Starting Point: MCP First
The most immediate value RAGTS can deliver is an **MCP server** that exposes curated session context to agents. Before the full web platform exists, an MCP interface gives agents access to session memory. This should be the first thing we build - it validates the retrieval domain, forces us to think about data modeling, and delivers value immediately. The web UI and curation features build on top of this foundation.

## 2. Quality Attributes

These are the non-functional requirements that drive architectural decisions. When trade-offs arise, this is the priority order:

| Priority | Attribute | What It Means for RAGTS |
|----------|-----------|------------------------|
| 1 | **Security** | Sessions contain sensitive terminal output. Auth, authorization, tenant isolation, and data protection are non-negotiable. |
| 2 | **Self-hostability** | Operators must be able to run this on their own infrastructure with minimal dependencies. Complex setups kill adoption. |
| 3 | **Multi-tenancy** | Multiple users, teams, and workspaces from day one. Not bolted on later. |
| 4 | **Extensibility** | Integration with diverse auth providers, retrieval mechanisms, and agent ecosystems. The platform can't assume a single stack. |
| 5 | **Performance** | Sessions can be massive. Rendering, search, and retrieval must handle scale without degrading UX. |
| 6 | **Operability** | Upgrades, backups, monitoring, and configuration must be straightforward for self-hosters. |

## 3. Domain Model

### Bounded Contexts

The platform decomposes into five bounded contexts. Each represents a distinct area of responsibility with its own data, rules, and interfaces.

```
+-------------+     +-------------+     +--------------+
|  Identity   |     |   Session   |     |  Retrieval   |
|             |     |             |     |              |
| Auth        |     | Ingestion   |     | Search       |
| Roles       |     | Storage     |     | Indexing     |
| Workspaces  |     | Browsing    |     | Agent API    |
| Tokens      |     | Curation    |     | MCP Server   |
+------+------+     +------+------+     +------+-------+
       |                   |                   |
       +-------------------+-------------------+
                           |
                    +------+------+     +-------------+
                    |  Transform  |     |    Cache     |
                    |             |     |              |
                    | AGR Service |     | Sessions     |
                    | Optimization|     | Search state |
                    +-------------+     | Job queues   |
                                        +-------------+
```

### Context Relationships

- **Identity <-> Session** - Every session operation requires an authenticated, authorized user. Sessions belong to workspaces. Workspaces have members with roles.
- **Identity <-> Retrieval** - Agent API tokens and MCP credentials are scoped to workspaces. Retrieval respects tenant boundaries.
- **Session <-> Retrieval** - Curated session segments feed the retrieval index. Retrieval queries reference sessions by workspace scope.
- **Session <-> Transform** - Raw sessions are submitted for background transformation. Transformed sessions replace or augment originals.
- **Cache <-> All** - Hot session data, search results, job state, and auth tokens are cached for performance. The cache is ephemeral - the database is the source of truth.

### Core Entities

These need deeper modeling in the SDLC cycle, but the initial thinking:

- **Workspace** - Tenant boundary. Owns sessions, members, and agent tokens. The fundamental isolation unit.
- **User** - External identity mapped to internal roles per workspace. A user can belong to multiple workspaces.
- **Session** - An asciicast v3 recording with metadata, markers, and curation state. The central artifact.
- **Marker** - Structural fold anchor within a session. Can be original (from recording) or curated (added by humans). Markers define the session's browsable hierarchy.
- **Curated Segment** - A human-annotated slice of a session, tagged and indexed for retrieval. This is what agents actually consume.
- **Agent Token** - Scoped credential for agent retrieval access. Tied to a workspace and permission set.

### Domain Questions to Explore

The domain model above is a starting point. The SDLC cycle needs to dig deeper:

- **Workspace hierarchy** - Are workspaces flat or nested? Can an organization have sub-workspaces for teams/projects? How does this affect access control?
- **Session lifecycle** - What states does a session go through? (ingested, processing, ready, archived, deleted?) Who can transition between states?
- **Curation workflow** - Is curation a single action or a multi-step review process? Can multiple curators collaborate on the same session? Conflict resolution?
- **Marker ownership** - Who can create/modify/delete markers? Are there system-generated markers (from AGR analysis) vs human markers? How do they interact?
- **Segment granularity** - What defines a segment boundary? A marker range? A time range? A line range? Can segments overlap?
- **Versioning** - When a session is transformed (silence removed, optimized), is the original preserved? Can you compare versions?
- **Cross-workspace sharing** - Can a session or segment be shared across workspaces? What are the security implications?
- **Retention and lifecycle** - How long are sessions kept? Auto-archival? Storage quotas per workspace?

## 4. Architectural Views

### Logical View - How domains interact

The five bounded contexts communicate through well-defined interfaces. Whether they're deployed as separate services or modules in a monolith is a deployment decision - the logical boundaries stay the same.

Key interaction patterns:
- **Synchronous** - Auth checks, session CRUD, search queries, MCP tool calls
- **Asynchronous** - Transform jobs, re-indexing after curation, bulk operations
- **Event-driven** - Session ingested, curation completed, transform finished (enables loose coupling between contexts)
- **Cached** - Frequently accessed data (hot sessions, auth tokens, search results) served from cache, written through to DB

### Data View - What lives where

Everything goes through a database abstraction layer. No raw filesystem assumptions.

| Data | Characteristics | Notes |
|------|----------------|-------|
| Sessions (.cast files) | Large, immutable after ingestion, read-heavy | Stored in DB. Cached for frequent access. |
| Session metadata | Small, structured, queried frequently | Relational. ACID. |
| Auth data (users, roles, tokens, workspaces) | Small, critical, write-sensitive | Relational. ACID mandatory. |
| Search index | Derived from sessions + curated segments | Rebuildable from source. Eventual consistency acceptable. |
| Curated segments | Human-created annotations + tags | Relational, linked to sessions and workspaces. |
| Transform state | Job status, progress, history | Ephemeral. Cache-backed with DB persistence. |

**Database abstraction layer** - Needed from day one so the concrete DB choice can evolve without rewriting application logic. Repository pattern or similar.

**Cache layer (Redis or similar)** - Session data is read-heavy and potentially large. A memory cache sits between the application and the database for:
- Hot session content (avoid repeated DB reads for popular sessions)
- Search result caching (expensive queries served from cache)
- Transform job queues and state (ephemeral, high-throughput)
- Auth token/session caching (reduce DB pressure on every request)
- Rate limiting state (agent API abuse prevention)

The cache is always ephemeral - the database remains the single source of truth. Cache invalidation strategy is a key design decision.

### Integration View - How RAGTS connects to the outside

| Integration Point | Direction | Options to Explore |
|-------------------|-----------|-------------------|
| Authentication | Inbound | Reverse proxy headers, OIDC/OAuth2, SAML |
| Session ingestion | Inbound | File upload API, AGR direct push, bulk import |
| Agent retrieval | Outbound (served) | **MCP server (first priority)**, REST API, GraphQL |
| AGR transforms | Internal | Sidecar binary, REST wrapper, message queue |
| Notifications | Outbound | Webhooks, email (stretch) |

### Deployment View - How it runs

The architecture needs to support a spectrum from simple to scaled, all from the same codebase:

**Single container (default):**
Everything in one Docker image - application, embedded DB, embedded cache. Minimal config, works behind an existing reverse proxy. This is what most self-hosters will run.

**Docker Compose (team scale):**
When the single container hits limits, operators split concerns:

```
docker-compose.yml
  - ragts-app        (application server + web UI)
  - ragts-db         (PostgreSQL or similar)
  - ragts-cache      (Redis or similar)
  - ragts-transform  (AGR service worker)
```

This is the natural scaling step - same application, externalized dependencies.

**Orchestrated (organization scale):**
Kubernetes, Nomad, or similar. Horizontal scaling of app instances, managed database, managed cache. The bounded contexts could be split into separate deployable units at this stage if needed.

The key constraint: **the application code is the same at every scale**. Only the deployment topology changes. Configuration determines whether the DB is embedded or external, whether the cache is in-process or Redis, whether transforms run in-process or as workers.

## 5. Architectural Tensions

These are the forces pulling in different directions. The SDLC cycle needs to navigate them.

### Simplicity vs Multi-tenancy
Single container says "minimal config." Multi-tenancy says "isolation, RBAC, workspace boundaries." A DB abstraction layer helps bridge this - embedded DB for simple deployments, external DB when scale demands it. But the multi-tenancy model itself (workspace isolation, cross-workspace rules) adds application complexity regardless of DB choice.

### Security vs Developer Experience
Delegating auth to external providers is secure but adds deployment complexity. Operators need Authelia/Keycloak/etc. running. A built-in basic auth mode for development/small teams might be practical as a stepping stone, even if production deployments should use proper IdP integration.

### MCP First vs Web First
Starting with MCP delivers value to agents immediately but skips the human curation UX. Starting with the web UI serves humans but doesn't validate the retrieval domain. The MCP-first approach is recommended because it forces the data model and retrieval interfaces to be solid before layering UX on top.

### AGR Integration Depth
AGR is Rust. The platform's language is TBD. Tight integration (FFI) gives performance but couples technologies. Loose integration (CLI sidecar) is flexible but adds latency and error surface. This cascades into deployment and operational complexity.

### Monolith vs Services
Domain boundaries are clear, but starting with microservices adds enormous operational overhead. A modular monolith that can be split later respects both domain boundaries and deployment simplicity. The Docker Compose topology already provides natural splitting points.

### Embedded vs External Infrastructure
Embedding the DB and cache in a single container is simple. But embedded SQLite has concurrency limits, and in-process caching doesn't survive restarts. The abstraction layers need to make the transition to external infrastructure seamless.

### Session Scale
Sessions can be megabytes of terminal output. Rendering, searching, and indexing at scale requires different strategies than small-document platforms. Lazy loading, streaming, pagination, and caching are likely necessary.

## 6. Open Decisions

Grouped by dependency order (foundation decisions unlock everything else):

### Foundation
- Backend language/framework?
- DB abstraction approach? (ORM, query builder, repository pattern?)
- Embedded DB for single-container mode? (SQLite, embedded Postgres, ?)
- Cache technology? (Redis, in-process with Redis upgrade path, ?)
- How are .cast files stored? (DB BLOBs, chunked, content-addressed, ?)

### Security
- Which auth integration patterns first? (OIDC? Proxy headers? Both?)
- Built-in basic auth for development/small teams?
- First-run / bootstrap experience?
- Concrete internal role model?
- Workspace creation and management?

### Retrieval (MCP First)
- MCP server implementation - what tools does it expose?
- What can agents query? (Sessions, segments, markers, metadata?)
- Search model for retrieval? (Full-text, semantic, hybrid?)
- Index technology? (Built-in, Meilisearch, vector DB, ?)
- How does curated vs raw content affect retrieval?

### Application
- Frontend framework?
- How to render large sessions performantly?
- Curation UX - what does it look like concretely?
- Fold/unfold - how do markers translate to browser interaction?
- White-label theming depth?

### Integration
- AGR integration model? (Sidecar, wrapper, FFI, queue?)
- Session ingestion API design?
- Deployment artifact structure? (Single image, compose, helm?)

## 7. Data Flow (Rough)

Directional, not prescriptive:

**Ingestion:** `.cast file --> Auth --> Validation --> DB --> Cache --> Index`

**Browsing:** `User --> Auth --> Cache/DB --> Vertical render + folds`

**Curation:** `Curator --> Annotate/tag --> DB --> Invalidate cache --> Re-index`

**Agent retrieval (MCP):** `Agent --> MCP --> Auth + scope --> Cache/Index --> Curated segments`

**Transformation:** `Session --> Queue --> AGR worker --> DB --> Invalidate cache --> Re-index`

## 8. Next Steps

This document is the architectural baseline for the first SDLC cycle.

**Recommended approach:**
1. Read `MEMORY.md` for project context and decisions made so far
2. Use this document as input for the Product Owner and Architect roles
3. Start with the **MCP server** as the first deliverable - it validates the data model, retrieval domain, and forces early decisions on foundation and security
4. Build the web UI and curation features on top of the foundation the MCP work establishes

The MCP-first approach means agents get value immediately, and the architectural decisions it forces (data model, auth, retrieval) are the same ones the web platform needs.
