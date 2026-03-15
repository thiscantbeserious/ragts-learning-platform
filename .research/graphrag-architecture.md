# GraphRAG Architecture Research

## Status: Backlog

## Context

Erika needs cross-linking between sessions and sections — "this section is related to that section" based on similar commands, error patterns, tools used, or semantic similarity. This is inherently a graph + vector problem.

## Recommended Architecture

```
SQLite (existing) ── structured data, transactions, metadata
       │
       ├── Closure tables ── explicit cross-links (Phase 1)
       │
LanceDB (embedded) ── vector embeddings, semantic similarity search
       │
       ├── Transformers.js ── local embeddings, no GPU, no API
       │
LadybugDB (Kuzu fork) ── embedded graph, Cypher queries, vector indices (Phase 3)
```

## Phases

### Phase 1: SQLite Closure Tables (MVP v3)
- Zero new dependencies
- `section_relationships` table with `section_a_id`, `section_b_id`, `relationship_type`, `depth`
- Recursive CTEs for multi-hop queries
- Sufficient for 1K-100K sessions

### Phase 2: LanceDB + Transformers.js (Semantic Search)
- Add `@lancedb/lancedb` (embedded, Apache 2.0)
- Generate embeddings with `Transformers.js` using `all-MiniLM-L6-v2` (384d, 22MB)
- Store section content embeddings in LanceDB
- Query: "find sections with similar error patterns" via vector ANN search
- Hybrid retrieval: explicit links (SQLite) + semantic similarity (LanceDB)
- Runs on Raspberry Pi, no GPU needed

### Phase 3: LadybugDB Graph Engine (When Graph Traversal Needed)
- Kuzu was acquired by Apple Oct 2025 and archived — but community forked it
- **LadybugDB** (`npm install @ladybug/core`) — MIT, active (v0.15.1, Mar 2026), 600 stars
  - Full Kuzu replacement: embedded, Cypher queries, vector indices, ACID
  - Node.js support via npm package
  - Drop-in for Kuzu API — migration guides available
- Alternatives: FalkorDBLite (bundles Redis), sqlite-graph (alpha, watch for maturity)
- Add when: closure tables become limiting for multi-hop traversals or complex pattern matching

## Why Not DuckDB?
- OLAP focus, not graph-native
- DuckPGQ extension is community/research stage
- Adds 20MB+ bundle for marginal benefit over SQLite + closure tables
- Better to go directly to Kuzu if graph queries are needed

## Self-Hosted Feasibility
- All three tools are embedded (no external server process)
- All run on ARM/x86, no GPU required
- Minimum: Raspberry Pi 4 (4GB RAM) handles 10K+ sections with embeddings
- All licenses AGPL-3.0 compatible (public domain, Apache 2.0, MIT)

## Use Cases
- "Find sessions with similar error patterns" (vector search)
- "Link sections that use the same tools/commands" (graph edges)
- "Discover related workflows across sessions" (graph traversal)
- "What sessions are related to this one?" (hybrid: graph + vector)

## Sources
- [LanceDB](https://lancedb.com/) — embedded vector DB
- [Kuzu + LanceDB GraphRAG Workshop](https://github.com/kuzudb/graph-rag-workshop)
- [Transformers.js](https://huggingface.co/docs/transformers.js) — local embeddings
- [Closure Table Pattern](https://balevdev.medium.com/the-closure-table-pattern)
- [Microsoft GraphRAG](https://microsoft.github.io/graphrag/)
