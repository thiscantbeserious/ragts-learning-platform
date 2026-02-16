# Architecture

System design for the RAGTS platform. Living document - refine as decisions are made.

## Design Principles

### Security First
Security is not a feature - it's the foundation. Every component assumes hostile input, every endpoint requires authentication, every action is authorized. Sessions may contain sensitive terminal output (credentials, API keys, internal infrastructure). Treat all session data as potentially sensitive by default.

### Human First
Every technical decision should reinforce human control. The human curates, the human decides what agents learn. Automation serves the human, not the other way around.

### Self-Hosting Simplicity
Every added dependency makes self-hosting harder. Prefer fewer moving parts. A single binary + SQLite is better than a distributed system for v1.

### AGR is the Engine
Don't reimplement what AGR already does. The platform focuses on serving, browsing, and curation. AGR handles recording and transformation.

### Sessions are Experiences
Not logs, not videos, not documents - experiences. Design the UX around exploring what happened, not just reading output.

## Core Concepts

### Sessions
Terminal session recordings in asciicast v3 format. Each session captures the full terminal output of an AI agent interaction - commands, responses, errors, and timing.

### Markers as Structure
Asciicast v3 markers were designed for annotation. RAGTS elevates them to **fold anchors** - structural boundaries that define collapsible sections. This is the key UX primitive: markers become the hierarchy of a session.

### Vertical Browsing
Sessions render as scrollable documents, not timelines. Terminal output is laid out vertically with fold/unfold at marker boundaries. Quick peeks, progressive disclosure, noise reduction.

### Curated Agent Memory
Sessions contain rich context: what was attempted, what worked, what failed, and why. Traditional RAG retrieves from documents. RAGTS retrieves from **experiences** - and the human curates what gets indexed. This is the reinforcement loop.

## Security & Authentication

### Authentication: Delegate, Don't Reinvent

RAGTS should not implement its own authentication. Authentication should be delegated to external identity providers, keeping the platform simple and letting operators use whatever auth stack they already run.

**Possible providers:**
- **Self-hosted:** Authelia, Authentik, Keycloak
- **Cloud/Enterprise:** Microsoft Entra ID (Azure AD), Google Workspace, Okta
- **Standards-based:** Any OIDC/OAuth2/SAML compliant provider

**Possible integration patterns:**
- Reverse proxy headers (`Remote-User`, `X-Forwarded-User`) from Authelia/Authentik/Traefik
- OIDC/OAuth2 token verification directly in the application
- SAML for enterprise environments
- Combination of the above for different deployment scenarios

### Internal Access Levels

Once authenticated, the platform needs internal authorization. A simple, flat role model could work:

| Role | Permissions |
|------|------------|
| **Viewer** | Browse and read sessions, use folds, search |
| **Curator** | Viewer + curate/annotate sessions, manage markers, control what gets indexed for agent retrieval |
| **Admin** | Curator + manage users/roles, configure platform, manage AGR service, access all sessions |

Roles could be scoped per-workspace, where a workspace is an isolated boundary (team, project, organization) that owns a set of sessions. The exact model depends on whether RAGTS targets single-user, multi-user, or multi-tenant deployments.

### Agent Access

Agents need a way to authenticate for retrieval. Options include:
- API tokens scoped to a workspace (simple, stateless)
- OAuth2 client credentials (standards-based, fits enterprise)
- MCP-level authentication (if retrieval is exposed via MCP)

Regardless of mechanism, agent access should be:
- Read-only by default (agents consume, humans curate)
- Rate-limited to prevent abuse
- Auditable

### Session Sensitivity

Terminal sessions can contain anything - credentials, API keys, internal URLs, production data. Key considerations:
- Sessions should never be exposed to unauthenticated users
- Workspace boundaries must prevent cross-tenant leakage
- Session-level visibility (private, workspace, public) may be needed
- Sensitive content detection/flagging during ingestion is a stretch goal

### Data at Rest & In Transit

- **In transit:** TLS everywhere. Typically handled by the reverse proxy / ingress layer.
- **At rest:** Session files and index data should support encryption. Filesystem-level encryption (LUKS, encrypted volumes) is the simplest starting point. Application-level encryption is a future consideration.

## Domain Boundaries

The platform decomposes into bounded contexts. Whether these become microservices, modules within a monolith, or something in between is an open decision. This is the baseline - the domains should drive the architecture, not the other way around.

```
+-------------+     +-------------+     +--------------+
|   Identity  |     |   Session   |     |  Retrieval   |
|             |     |             |     |              |
| Auth        |     | Ingestion   |     | Search       |
| Roles       |     | Storage     |     | Indexing     |
| Workspaces  |     | Browsing    |     | Agent API    |
| Tokens      |     | Curation    |     | MCP          |
+-------------+     +------+------+     +--------------+
                           |
                    +------+------+
                    | Transform   |
                    |             |
                    | AGR Service |
                    | Optimization|
                    +-------------+
```

**Identity** - Who you are, what you can do. Delegates authentication externally, manages authorization internally.

**Session** - The core domain. Ingesting, storing, browsing, and curating terminal sessions. This is where the vertical browsing and fold/unfold UX lives.

**Retrieval** - How agents (and humans) find relevant context. Search, indexing, and the retrieval API/MCP layer.

**Transform** - Background processing powered by AGR. Silence removal, memory optimization, re-indexing.

## Data Flow

### Ingestion
```
.cast file --> Auth check --> Validation --> Storage --> Index --> Available
```

### Browsing & Curation
```
User request --> Auth + role check --> API (session + markers)
                                          |
                                          v
                                   Web UI (vertical render + folds)
                                          |
                                          v
                                   Human curates sections (Curator+)
                                          |
                                          v
                                   Curated context --> Index
```

### Agent Retrieval
```
Agent query + API token --> Auth + scope check --> Retrieval layer
                                                      |
                                                      v
                                               Curated segments --> Agent
```

### Transformation
```
Raw session --> AGR service (optimize) --> Transformed session --> Re-index
```

## Open Architecture Decisions

### ADR-001: Frontend Framework
**Status:** Open

**Context:** The platform needs a web UI for vertical session browsing, fold/unfold interaction, search, and white-label theming.

**Options to evaluate:**
- Next.js (React, SSR, large ecosystem)
- SvelteKit (lightweight, fast, good DX)
- Astro (content-focused, island architecture)
- Vite + React (simple SPA, no SSR overhead)

**Considerations:**
- Terminal rendering performance (potentially large sessions)
- White-label theming support
- Self-hosting simplicity
- Community and ecosystem

### ADR-002: Retrieval Mechanism
**Status:** Open

**Context:** Agents need to query past sessions as long-term memory. Humans curate what gets indexed. Need a retrieval layer that serves both structured queries and semantic search.

**Options to evaluate:**
- REST API with full-text search (simple, proven)
- MCP server (native agent integration)
- Vector DB (semantic search, embeddings)
- Graph DB (relationship-aware retrieval)
- Hybrid (API + vector search)

**Considerations:**
- How do agents connect? (API key, MCP, direct DB?)
- Semantic vs keyword search vs both
- Embedding generation (who, when, how)
- Self-hosting complexity (lightweight vs heavy infrastructure)

### ADR-003: AGR Integration Model
**Status:** Open

**Context:** AGR (Rust binary) needs to run as a service within the platform for background transformations. How does the web platform invoke AGR?

**Options to evaluate:**
- Sidecar binary (spawn AGR process, communicate via CLI/stdout)
- REST wrapper around AGR (thin API layer over the binary)
- FFI bindings (call AGR directly from the platform backend)
- Message queue (async job processing with AGR as worker)

**Considerations:**
- AGR is Rust, platform backend TBD
- Transforms can be long-running (large sessions)
- Error handling and progress reporting
- Deployment simplicity for self-hosting

### ADR-004: Storage Backend
**Status:** Open

**Context:** Need to store .cast files, search index, metadata, curated retrieval context, and authorization data (roles, tokens, workspaces).

**Options to evaluate:**
- Filesystem + SQLite (simple, self-contained, single file backup)
- Filesystem + PostgreSQL (relational, full-text search built-in, proven at scale)
- Object storage + dedicated search (S3 + Elasticsearch/Meilisearch)

**Considerations:**
- Self-hosting ease (fewer dependencies = better)
- Scale expectations (single user? team? organization?)
- Full-text search requirements
- Backup and portability
- Authorization data needs ACID guarantees (roles, tokens, workspace membership)

### ADR-005: Auth Integration Model
**Status:** Open

**Context:** RAGTS delegates authentication to external providers. Need to decide the integration pattern.

**Options to evaluate:**
- Reverse proxy headers only (simplest - trust `Remote-User` from Authelia/Authentik/Traefik)
- OIDC integration (platform verifies tokens directly, more portable)
- Both (headers for simple setups, OIDC for enterprise)

**Considerations:**
- Reverse proxy headers are simple but require trusted network between proxy and app
- OIDC is more robust but adds complexity to self-hosting
- Need to map external identity to internal roles/workspaces
- First-run experience (how does the first admin get created?)
