# Architecture

System design for the RAGTS platform. Living document - refine as decisions are made.

## Core Concepts

### Sessions
Terminal session recordings in asciicast v3 format. Each session captures the full terminal output of an AI agent interaction - commands, responses, errors, and timing.

### Markers as Structure
Asciicast v3 markers were designed for annotation. RAGTS elevates them to **fold anchors** - structural boundaries that define collapsible sections. This is the key UX primitive: markers become the hierarchy of a session.

### Vertical Browsing
Sessions render as scrollable documents, not timelines. Terminal output is laid out vertically with fold/unfold at marker boundaries. Quick peeks, progressive disclosure, noise reduction.

### Curated Agent Memory
Sessions contain rich context: what was attempted, what worked, what failed, and why. Traditional RAG retrieves from documents. RAGTS retrieves from **experiences** - and the human curates what gets indexed. This is the reinforcement loop.

## System Components

```
┌─────────────────────────────────────────────────────┐
│                   RAGTS Platform                     │
│                                                      │
│  ┌─────────────┐  ┌──────────────┐  ┌────────────┐ │
│  │  Web UI      │  │  API Server  │  │  Storage   │ │
│  │             │  │              │  │            │ │
│  │ - Vertical  │  │ - Session    │  │ - .cast    │ │
│  │   browser   │  │   CRUD       │  │   files    │ │
│  │ - Fold/     │  │ - Search     │  │ - Index    │ │
│  │   unfold    │  │ - Retrieval  │  │ - Metadata │ │
│  │ - Curation  │  │   API / MCP  │  │            │ │
│  │ - Theming   │  │              │  │            │ │
│  └──────┬──────┘  └──────┬───────┘  └─────┬──────┘ │
│         │                │                │        │
│         └────────────────┼────────────────┘        │
│                          │                          │
│                  ┌───────┴────────┐                  │
│                  │ AGR Service    │                  │
│                  │                │                  │
│                  │ - Transforms   │                  │
│                  │ - Silence      │                  │
│                  │   removal      │                  │
│                  │ - Memory       │                  │
│                  │   optimization │                  │
│                  │ - Indexing     │                  │
│                  └────────────────┘                  │
└─────────────────────────────────────────────────────┘
```

## Data Flow

### Ingestion
```
.cast file → Validation → Storage → Index → Available for browsing
```

### Browsing & Curation
```
User request → API (session + markers) → Web UI (vertical render + folds)
                                              │
                                              ▼
                                     Human curates sections
                                              │
                                              ▼
                                     Curated context → Index
```

### Agent Retrieval
```
Agent query → Retrieval layer → Relevant curated segments → Context for agent
```

### Transformation
```
Raw session → AGR service (optimize) → Transformed session → Re-index
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

**Context:** Need to store .cast files, search index, metadata, and curated retrieval context.

**Options to evaluate:**
- Filesystem + SQLite (simple, self-contained)
- Filesystem + PostgreSQL (relational, full-text search built-in)
- Object storage + dedicated search (S3 + Elasticsearch/Meilisearch)

**Considerations:**
- Self-hosting ease (fewer dependencies = better)
- Scale expectations (single user? team? organization?)
- Full-text search requirements
- Backup and portability

### ADR-005: Authentication & Multi-tenancy
**Status:** Open

**Context:** White-label platform needs user management, potentially multi-tenant.

**Considerations:**
- Single-user self-host vs multi-user vs multi-tenant
- OAuth / SSO integration
- Session-level access control (who can see which recordings?)
- API key management for agent retrieval

## Design Principles

### Human First
Every technical decision should reinforce human control. The human curates, the human decides what agents learn. Automation serves the human, not the other way around.

### Self-Hosting Simplicity
Every added dependency makes self-hosting harder. Prefer fewer moving parts. A single binary + SQLite is better than a distributed system for v1.

### AGR is the Engine
Don't reimplement what AGR already does. The platform focuses on serving, browsing, and curation. AGR handles recording and transformation.

### Sessions are Experiences
Not logs, not videos, not documents - experiences. Design the UX around exploring what happened, not just reading output.
