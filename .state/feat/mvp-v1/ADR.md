# ADR: RAGTS MVP v1 - Technical Architecture

## Status
Accepted

## Context

RAGTS is a greenfield project. No code exists. The MVP scope is defined in REQUIREMENTS.md: upload, store, browse, and fold/unfold asciicast v3 sessions. No auth, no curation, no retrieval API. Local-first, no Docker.

The forces at play:
- **Single developer** building the entire stack (backend + frontend)
- **Vue 3** is the chosen frontend framework (user preference)
- **SQLite** is the embedded database (user decision)
- **asciicast v3** is NDJSON format with relative timestamps and marker events (`"m"` type)
- **Future extensibility** toward multi-tenancy, OIDC, retrieval APIs, cache layers, and AGR integration
- The full ARCHITECTURE.md describes a system with 6 bounded contexts, DB abstraction, cache layers, and deployment topology from single-container to orchestrated. The MVP must lay a foundation that does not fight this trajectory.
- **Simplicity is paramount** for MVP. YAGNI applies aggressively.

## Options Considered

### Decision 1: Backend Language and Framework

#### Option A: TypeScript + Hono

- Pros:
  - Same language as frontend (Vue/TS). One mental model, shared types, shared tooling
  - Hono is lightweight, modern, and fast. Built on web standards (Request/Response). Works with Bun, Deno, Node, Cloudflare Workers
  - Excellent SQLite support via `better-sqlite3` (synchronous, fast, well-maintained)
  - TypeScript's type system catches errors at compile time without the overhead of Go/Rust
  - Vite serves both frontend and proxies to backend during development
  - Smallest operational surface: one runtime, one package manager, one `tsconfig`
  - Future: shares types between frontend and backend (API contracts, asciicast types)
  - Hono's middleware model is clean and composable (future: auth, rate limiting, CORS)

- Cons:
  - Node.js single-threaded model limits CPU-bound work (mitigated: MVP is I/O-bound)
  - Not as performant as Go/Rust for heavy processing (irrelevant for MVP; AGR handles transforms)

#### Option B: Go + standard library / Chi

- Pros:
  - Excellent performance, native concurrency
  - Single binary deployment, no runtime dependency
  - Strong SQLite support via `mattn/go-sqlite3` (CGO) or `modernc.org/sqlite` (pure Go)
  - Naturally suits the future container topology

- Cons:
  - Different language from frontend. Two mental models, no shared types
  - Go's type system is less expressive (no generics until recently, no union types, no mapped types)
  - Template/string handling for ANSI processing is more verbose
  - Slower iteration cycle compared to TypeScript hot-reload
  - Harder to share API contracts with Vue frontend without code generation

#### Option C: Python + FastAPI

- Pros:
  - Fast prototyping, large ecosystem
  - Good SQLite support

- Cons:
  - Performance concerns at scale
  - No type sharing with Vue frontend
  - Runtime dependency management (virtualenvs) adds friction for self-hosting
  - Weakest fit for the future architecture (containerization, single-binary deployment)

### Decision 2: ANSI Parser Library

#### Option A: ansi-to-html (npm)

- Pros: Purpose-built for the exact use case. Converts ANSI escape codes directly to HTML with inline styles. Well-maintained, handles 256-color and truecolor.
- Cons: Server-side only (generates HTML strings). Less control over output structure.

#### Option B: anser (npm)

- Pros: Lightweight, works in browser and Node. Returns structured JSON that can be mapped to Vue components or HTML. Supports 256-color palette.
- Cons: Slightly more work to integrate (need to map JSON output to Vue rendering).

#### Option C: xterm.js

- Pros: Full terminal emulator in the browser. Handles every escape sequence perfectly including cursor movement, scroll regions, alternate screen buffers.
- Cons: Massive overkill for vertical document browsing. Designed for interactive terminals, not static rendering. Heavy bundle size. Fighting against its design to make it scroll vertically.

### Decision 3: Virtual Scrolling Library

#### Option A: @tanstack/vue-virtual

- Pros: Battle-tested, framework-agnostic core with Vue adapter. Handles variable-height rows. Active maintenance by TanStack team.
- Cons: Adds a dependency.

#### Option B: Custom intersection observer

- Pros: No dependency. Uses native browser API.
- Cons: More code to write and maintain. Variable-height rows are tricky to get right.

### Decision 4: File ID Generation

#### Option A: nanoid

- Pros: URL-safe by default, shorter than UUID (21 chars vs 36), no hyphens, cryptographically strong, tiny (130 bytes). Perfect for URL paths like `/session/V1StGXR8_Z5jdHi6B-myT`.
- Cons: Not a standard format (not UUID).

#### Option B: UUID v4

- Pros: Universal standard, instantly recognizable. Built-in `crypto.randomUUID()` in Node 19+.
- Cons: Long (36 chars with hyphens), not URL-friendly without stripping hyphens.

### Decision 5: Monorepo Layout

#### Option A: Single package with colocated backend/frontend

```
ragts-learning-platform/
  src/
    server/        # Backend (Hono)
    client/        # Frontend (Vue)
    shared/        # Shared types
  package.json     # Single package
```

- Pros: Simplest possible setup. One `package.json`, one `node_modules`, one build pipeline. Shared types are just imports. No workspace configuration.
- Cons: Tighter coupling. Harder to split later if needed.

#### Option B: npm workspaces monorepo

```
ragts-learning-platform/
  packages/
    server/        # Backend package
    client/        # Frontend package
    shared/        # Shared types package
```

- Pros: Clear boundaries. Independent dependency management. Standard monorepo pattern.
- Cons: More configuration. Workspace linking complexity. Overkill for MVP.

### Decision 6: DB Abstraction Approach

#### Option A: Repository pattern with raw SQL (better-sqlite3)

- Pros: Full control over queries. No ORM overhead. `better-sqlite3` is synchronous and fast. Repository interface is the abstraction boundary -- swap implementation later for PostgreSQL.
- Cons: Manual SQL. No migration tooling built-in.

#### Option B: Drizzle ORM

- Pros: Type-safe SQL queries. Schema-as-code. Supports SQLite and PostgreSQL with same API. Built-in migration generation.
- Cons: Adds abstraction layer. Learning curve. May constrain complex queries later.

### Decision 7: Frontend State Management

#### Option A: Plain Vue 3 Composition API (ref/reactive + composables)

- Pros: No additional dependency. Composables (`useSessionList`, `useSessionDetail`) provide clean encapsulation. Sufficient for MVP's simple state (list of sessions, current session).
- Cons: No devtools for state inspection (Vue devtools still work for component state).

#### Option B: Pinia

- Pros: Official Vue state management. Devtools integration. Structured stores.
- Cons: Overkill for MVP. Two screens, no shared state that justifies a store.

### Decision 8: Error Handling UX

#### Option A: Inline errors + toast notifications

- Pros: Non-blocking. Upload errors show inline at the upload component. API errors show as brief toasts. Simple to implement with a composable.
- Cons: Toasts can be missed if user is not looking.

#### Option B: Modal dialogs

- Pros: Impossible to miss.
- Cons: Blocking. Annoying for frequent operations. Overkill for MVP.

## Decision

### Backend: TypeScript + Hono (Option A)

TypeScript is the strongest choice for a single-developer project with a Vue frontend. The shared language eliminates the cognitive overhead of context-switching between Go/Rust and TypeScript. Hono is the right framework because it is minimal, standards-based, and does not impose opinions about project structure (unlike Express middleware patterns or Fastify's plugin system). The `better-sqlite3` library is the gold standard for SQLite in Node.js -- synchronous API, excellent performance, well-maintained.

The future architecture benefits: when the platform grows to need PostgreSQL, the repository pattern makes the swap mechanical. When it needs a cache layer, Hono middleware composes naturally. When it needs auth, Hono's middleware chain supports it without framework contortion.

Rejecting Go: the type-sharing benefit of a unified TypeScript stack outweighs Go's performance advantage for this workload. The MVP is I/O-bound (file upload, DB reads, file reads). CPU-heavy transform work is handled by AGR (Rust), not the platform backend.

Rejecting Python: weakest fit for the deployment model and future architecture.

### ANSI Parser: anser (Option B)

`anser` returns structured data (spans with style information) rather than raw HTML strings. This is a better fit for Vue because we can map the structured output to Vue components or template elements with proper CSS classes. It keeps rendering logic in the Vue layer rather than injecting raw HTML via `v-html`. Supports the required 256-color palette and text styles (bold, dim, italic, underline).

Rejecting `ansi-to-html`: generates HTML strings that would require `v-html` (XSS risk surface, harder to style/theme). Rejecting `xterm.js`: designed for interactive terminal emulation, fundamentally wrong for vertical document browsing.

### Virtual Scrolling: @tanstack/vue-virtual (Option A)

Battle-tested, maintained, handles variable-height rows. The MVP needs this for sessions exceeding 50k lines (NFR-2). Writing a custom solution is unnecessary complexity.

### File ID: nanoid (Option A)

Shorter, URL-safe, cryptographically strong. Perfect for `/session/:id` routes. No reason to use the longer UUID format when the IDs never leave the local system.

### Project Layout: Single package (Option A)

One `package.json`, shared types via imports, no workspace configuration. The MVP has two developers: zero. It has two screens. Workspace boundaries add configuration overhead with no benefit at this scale. If the project grows to need separate packages, the `src/server` and `src/client` directories make the split straightforward.

### DB Abstraction: Repository pattern with raw SQL (Option A)

`better-sqlite3` with a thin repository interface. The repository defines the contract (`SessionRepository` interface), the implementation uses raw SQL against SQLite. When PostgreSQL is needed, a new implementation satisfies the same interface. No ORM overhead, no migration tooling complexity. For MVP, a simple `schema.sql` file applied on startup is sufficient.

Rejecting Drizzle: adds a dependency and abstraction layer that provides marginal benefit for a single-table MVP. The repository pattern gives us the abstraction boundary we need without the ORM.

### State Management: Plain Composition API (Option A)

Two screens. No complex shared state. Composables (`useUpload`, `useSessionList`, `useSession`) provide clean encapsulation. Adding Pinia for this scale would be over-engineering.

### Error Handling: Inline errors + toast (Option A)

Upload validation errors show inline at the upload component. API failures show as brief toasts. A simple `useToast` composable handles the toast lifecycle. No dependency needed -- a 20-line composable suffices.

### Session Deletion: Included

Adding `DELETE /api/sessions/:id` is trivial (one endpoint, one repository method, one filesystem delete) and significantly improves the UX for a local-first tool where the user is managing their own data. Not including it would be a surprising omission.

## Consequences

### What becomes easier
- Single language across the entire stack reduces context-switching and enables type sharing
- Repository pattern provides a clean seam for future PostgreSQL migration
- Hono's minimal footprint means less framework to learn and fight
- `anser` structured output gives full control over terminal rendering in Vue
- nanoid generates clean, short URLs for session routes

### What becomes harder
- No ORM means manual SQL for all queries (acceptable for MVP's simple schema)
- No built-in migration tooling (acceptable: one table, `schema.sql` on startup)
- `better-sqlite3` requires native compilation (handled by npm, but adds build complexity on some platforms)
- Single-package layout may need restructuring if the project grows significantly

### Follow-ups to scope for later
- PostgreSQL repository implementation (when multi-user/concurrency demands it)
- Drizzle or similar for migration management (when schema grows beyond 2-3 tables)
- Pinia state management (when curation workflow introduces complex shared state)
- SSR or streaming for very large sessions (if virtualization proves insufficient)
- Cache layer (Redis) for hot session data (when concurrent users appear)

## Decision History

1. TypeScript + Hono chosen over Go and Python for unified language stack, type sharing with Vue, and excellent SQLite support via `better-sqlite3`.
2. `anser` chosen over `ansi-to-html` and `xterm.js` for structured output that maps cleanly to Vue components without `v-html`.
3. `@tanstack/vue-virtual` chosen for virtual scrolling to handle large sessions (50k+ lines) per NFR-2.
4. `nanoid` chosen over UUID for shorter, URL-safe session IDs.
5. Single-package layout chosen over npm workspaces for minimal configuration at MVP scale.
6. Repository pattern with raw SQL chosen over Drizzle ORM for full control and minimal abstraction.
7. Plain Vue Composition API chosen over Pinia for state management at MVP scale.
8. Session deletion included in MVP scope as a low-cost, high-value addition.
9. Inline errors + toast chosen for error handling UX.
