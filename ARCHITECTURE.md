# Architecture

Brainstorming baseline for the RAGTS platform. This document captures the thinking so far - questions, options, and directions to explore in the first SDLC cycle. Nothing here is decided.

## Guiding Principles

These are the lenses we want to evaluate every decision through:

- **Security first** - Sessions contain sensitive terminal output. Every design choice should assume hostile input, require authentication, and enforce authorization. Security is the foundation, not a bolt-on.
- **Human first** - The human curates, the human controls what agents learn. Automation serves the human.
- **Multi-user by default** - This is a platform for teams and organizations, not a single-user tool. Multi-tenancy, workspaces, and access control are first-class concerns from day one.
- **Self-hosting simplicity** - Every dependency makes self-hosting harder. Minimize moving parts without sacrificing the multi-user experience.
- **AGR is the engine** - Don't reimplement what AGR already does. The platform serves, browses, and curates. AGR records and transforms.
- **Sessions are experiences** - Not logs, not videos. Rich context artifacts that capture what happened, what worked, and what failed.

## Core Concepts

**Sessions** - Terminal session recordings in asciicast v3 format. Commands, responses, errors, timing.

**Markers as fold anchors** - Asciicast v3 markers become structural boundaries. Collapsible sections for quick navigation. This is the key UX primitive.

**Vertical browsing** - Sessions render as scrollable documents with fold/unfold at marker boundaries. Progressive disclosure, noise reduction.

**Curated agent memory** - Humans curate what gets indexed. Agents retrieve from experiences, not just documents. This is the reinforcement loop.

## Domain Boundaries

The platform decomposes into bounded contexts. Whether these become microservices, modules, or something in between is an open question. The domains should drive the architecture, not the other way around.

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

**Session** - The core domain. Ingesting, storing, browsing, and curating terminal sessions. Vertical browsing and fold/unfold UX.

**Retrieval** - How agents and humans find relevant context. Search, indexing, retrieval API/MCP.

**Transform** - Background processing powered by AGR. Silence removal, memory optimization, re-indexing.

## Open Questions

Everything below needs to be explored and decided in the first SDLC cycle. Grouped by theme, not priority.

### Authentication & Identity

How do users authenticate? The platform shouldn't reinvent auth - it should delegate to what operators already run.

- **Self-hosted providers:** Authelia, Authentik, Keycloak
- **Cloud/Enterprise:** Microsoft Entra ID, Google Workspace, Okta
- **Standards:** OIDC, OAuth2, SAML - which do we support and how?
- **Integration pattern:** Reverse proxy headers? Direct OIDC? SAML? All of the above?
- **First-run experience:** How does the first admin get created? Seed user? Setup wizard?
- **Identity mapping:** How do external identities map to internal users, roles, and workspaces?

### Authorization & Access Control

Once authenticated, what can users do? This is a multi-user platform - access control is not optional.

- **Role model:** Flat roles (viewer/curator/admin) or something more granular? RBAC? ABAC?
- **Scope:** Per-workspace? Per-session? Per-organization? Hierarchical?
- **Workspaces:** What is a workspace exactly? A team? A project? An org? How do they relate?
- **Session visibility:** Private, workspace-scoped, public? Who decides?
- **Cross-workspace access:** Can users belong to multiple workspaces? How does that work?

### Agent Access & Retrieval

How do agents authenticate and retrieve curated context?

- **Agent authentication:** API tokens? OAuth2 client credentials? MCP-level auth?
- **Retrieval interface:** REST API? MCP server? GraphQL? Multiple?
- **Search model:** Full-text? Semantic/vector? Hybrid? What do agents actually need?
- **Indexing:** What gets indexed? Raw sessions? Curated segments? Both?
- **Embedding generation:** Who generates embeddings? When? What model?
- **Rate limiting and audit:** How do we prevent abuse and track agent access?

### Storage & Data

Where do sessions, metadata, indexes, and auth data live?

- **Session storage:** Filesystem? Object storage? Database BLOBs?
- **Metadata & auth:** SQLite? PostgreSQL? What needs ACID guarantees?
- **Search index:** Built-in full-text? Dedicated search engine (Meilisearch, Elasticsearch)? Vector DB?
- **Encryption at rest:** Filesystem-level? Application-level? Both?
- **Backup & portability:** How easy is it to export/import everything?
- **Scale:** What's the expected load? Hundreds of sessions? Millions?

### Frontend & UX

How do users interact with the platform?

- **Framework:** Next.js, SvelteKit, Astro, Vite+React, or something else?
- **Terminal rendering:** How do we render potentially massive session output performantly?
- **Fold/unfold UX:** How do markers translate to collapsible sections in the browser?
- **Curation UX:** How do curators annotate, tag, and control what gets indexed?
- **White-label theming:** How deep does customization go? CSS variables? Full theme engine?
- **Real-time vs static:** Are sessions rendered once or streamed/updated live?

### AGR Integration

How does the platform invoke AGR for background transformations?

- **Integration model:** Sidecar binary? REST wrapper? FFI? Message queue?
- **Long-running transforms:** How do we handle progress, cancellation, failure?
- **AGR is Rust, platform is TBD:** What's the cleanest bridge?
- **Deployment:** How does this work in a containerized setup? Docker compose? Kubernetes?

### Platform & Infrastructure

How does the whole thing run?

- **Deployment model:** Single container? Docker compose? Helm chart? All of the above?
- **Configuration:** Environment variables? Config file? Admin UI? Mix?
- **Monitoring & observability:** Logging, metrics, health checks?
- **Update strategy:** How do self-hosters upgrade without data loss?

## Data Flow (Rough)

These flows will evolve as decisions are made. Current thinking:

**Ingestion:** `.cast file --> Auth --> Validation --> Storage --> Index`

**Browsing:** `User --> Auth --> Session API --> Vertical render + folds`

**Curation:** `Curator --> Annotate/tag --> Curated context --> Re-index`

**Agent retrieval:** `Agent + token --> Auth --> Retrieval layer --> Curated segments`

**Transformation:** `Session --> AGR service --> Optimized session --> Re-index`

## Next Steps

This document is the starting point for the first SDLC cycle. A fresh session should:
1. Read `MEMORY.md` for full project context
2. Read this document for the architectural baseline
3. Start a full SDLC cycle to make the first real decisions and begin implementation
