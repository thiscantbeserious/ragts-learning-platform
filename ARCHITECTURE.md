# Architecture

Architectural baseline for the RAGTS platform. This document frames the problem space, identifies the forces at play, and surfaces the decisions that will shape the system. Nothing is decided - this is the starting point for the first SDLC cycle.

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

```
+-------------+     +-------------+     +--------------+
|  Identity   |     |   Session   |     |  Retrieval   |
|             |     |             |     |              |
| Auth        |     | Ingestion   |     | Search       |
| Roles       |     | Storage     |     | Indexing     |
| Workspaces  |     | Browsing    |     | Agent API    |
| Tokens      |     | Curation    |     | MCP          |
+-------------+     +------+------+     +--------------+
                           |
                    +------+------+
                    |  Transform  |
                    |             |
                    | AGR Service |
                    | Optimization|
                    +-------------+
```

### Context Relationships

- **Identity <-> Session** - Every session operation requires an authenticated, authorized user. Sessions belong to workspaces. Workspaces have members with roles.
- **Session <-> Retrieval** - Curated session segments feed the retrieval index. Retrieval queries reference sessions by workspace scope.
- **Session <-> Transform** - Raw sessions are submitted for background transformation (optimization, silence removal). Transformed sessions replace or augment originals.
- **Identity <-> Retrieval** - Agent API tokens are scoped to workspaces. Retrieval respects tenant boundaries.

### Core Entities (Initial Thinking)

- **Workspace** - Tenant boundary. Owns sessions, members, and agent tokens.
- **User** - External identity mapped to internal roles per workspace.
- **Session** - An asciicast v3 recording with metadata, markers, and curation state.
- **Marker** - Structural fold anchor within a session. Can be original (from recording) or curated (added by humans).
- **Curated Segment** - A human-annotated slice of a session, tagged and indexed for retrieval.
- **Agent Token** - Scoped credential for agent retrieval access.

## 4. Architectural Views

### Logical View - How domains interact

The four bounded contexts communicate through well-defined interfaces. Whether they're deployed as separate services, modules in a monolith, or something hybrid is a deployment decision - the logical boundaries stay the same.

Key interaction patterns:
- **Synchronous** - Auth checks, session CRUD, search queries
- **Asynchronous** - Transform jobs, re-indexing after curation, bulk operations
- **Event-driven** - Session ingested, curation completed, transform finished (potential future pattern)

### Data View - What lives where

Everything goes through a database abstraction layer. The platform targets a single-container deployment - no filesystem assumptions, no external storage dependencies.

| Data | Characteristics | Notes |
|------|----------------|-------|
| Sessions (.cast files) | Large, immutable after ingestion, read-heavy | Stored in DB (as BLOBs or via DB-managed storage). Not raw filesystem. |
| Session metadata | Small, structured, queried frequently | Relational. ACID. |
| Auth data (users, roles, tokens, workspaces) | Small, critical, write-sensitive | Relational. ACID mandatory. |
| Search index | Derived from sessions + curated segments | Rebuildable from source. Eventual consistency acceptable. |
| Curated segments | Human-created annotations + tags | Relational, linked to sessions and workspaces. |
| Transform state | Job status, progress, history | Relational or key-value. Ephemeral. |

A database abstraction layer is needed early so the concrete DB choice (SQLite, PostgreSQL, etc.) can be swapped without rewriting application logic.

### Integration View - How RAGTS connects to the outside

| Integration Point | Direction | Options to Explore |
|-------------------|-----------|-------------------|
| Authentication | Inbound | Reverse proxy headers, OIDC/OAuth2, SAML |
| Session ingestion | Inbound | File upload API, AGR direct push, bulk import |
| Agent retrieval | Outbound (served) | REST API, MCP server, GraphQL |
| AGR transforms | Internal | Sidecar binary, REST wrapper, message queue |
| Notifications | Outbound | Webhooks, email (stretch) |

### Deployment View - How it runs

The primary deployment target is a **single Docker container** - everything in one image, minimal configuration, works behind an existing reverse proxy. This is the baseline that must always work.

Scaling beyond that is a future concern:

| Scenario | Expectation |
|----------|-------------|
| Default | Single container, embedded DB, works behind reverse proxy |
| Scaled | External database, horizontal scaling, container orchestration |

The architecture should not prevent scaling, but the single-container experience comes first.

## 5. Architectural Tensions

These are the forces pulling in different directions. The first SDLC cycle needs to navigate them.

### Simplicity vs Multi-tenancy
Self-hosting simplicity says "single container, minimal config." Multi-tenancy says "isolation, RBAC, workspace boundaries." These are in tension. A DB abstraction layer helps - start with embedded SQLite for simple deployments, swap to PostgreSQL when scale demands it.

### Security vs Developer Experience
Delegating auth to external providers is secure but adds deployment complexity (operators need Authelia/Keycloak/etc. running). A built-in basic auth would be simpler for getting started but violates "don't reinvent auth."

### AGR Integration Depth
AGR is Rust. The platform's language is TBD. Tight integration (FFI) gives performance but couples technologies. Loose integration (CLI sidecar) is flexible but adds latency and error surface. This decision cascades into deployment and operational complexity.

### Monolith vs Services
Domain boundaries are clear, but starting with microservices adds enormous operational overhead for self-hosters. A modular monolith that can be split later respects both domain boundaries and deployment simplicity.

### Session Scale
A session can be megabytes of terminal output. Rendering, searching, and indexing at scale requires different strategies than small-document platforms. Lazy loading, streaming, and pagination are likely necessary but add frontend and API complexity.

## 6. Open Decisions

Grouped by the order they likely need to be made (dependencies flow downward):

### Foundation Layer
- What language/framework for the backend?
- Modular monolith in a single container as the starting point?
- What database for the central data layer? (SQLite embedded vs PostgreSQL external vs ?)
- What does the DB abstraction layer look like? (ORM? Query builder? Repository pattern?)
- How are .cast files stored in the database? (BLOBs? Chunked? Referenced?)

### Security Layer
- Which auth integration patterns do we support first? (OIDC? Proxy headers? Both?)
- How does the first-run / bootstrap experience work?
- What does the internal role model look like concretely?
- How are workspaces created and managed?

### Application Layer
- What frontend framework?
- How do we render large sessions performantly in the browser?
- What does the curation UX look like concretely?
- How does fold/unfold translate from markers to browser interaction?

### Retrieval Layer
- What retrieval interface do agents use? (REST? MCP? Both?)
- Full-text search, semantic search, or hybrid?
- What search/index technology? (Built-in, Meilisearch, vector DB, ?)
- How does embedding generation work if we go semantic?

### Integration Layer
- How does AGR integrate? (Sidecar, REST wrapper, FFI, message queue?)
- How do sessions get ingested? (Upload API, AGR push, bulk import?)
- What does the deployment artifact look like? (Container, binary, compose, helm?)

## 7. Data Flow (Rough)

These are directional, not prescriptive:

**Ingestion:** `.cast file --> Auth --> Validation --> Storage --> Index`

**Browsing:** `User --> Auth --> Session API --> Vertical render + folds`

**Curation:** `Curator --> Annotate/tag segments --> Store --> Re-index`

**Agent retrieval:** `Agent + token --> Auth + scope --> Retrieval --> Curated segments`

**Transformation:** `Session --> AGR service --> Optimized session --> Re-index`

## 8. Next Steps

This document is the brainstorming baseline. A fresh SDLC session should:
1. Read `MEMORY.md` for full project context and decisions made so far
2. Read this document to understand the architectural landscape
3. Start a full SDLC cycle - beginning with the foundation layer decisions, as everything else depends on them
