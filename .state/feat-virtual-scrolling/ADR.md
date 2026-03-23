# ADR: Virtual Scrolling and Section Navigation

## Status
Proposed

## Context

Opening a large agent session (50,000+ lines across 50+ sections) currently transfers the entire session payload in a single `GET /api/sessions/:id` response, blocks the main thread during JSON parsing, and creates 250,000+ DOM nodes -- enough to freeze or crash the browser tab. There is no spatial orientation: no overview, no jump-to capability, and an unusable scrollbar.

The codebase state:
- `SessionService.getSession()` reads the full `.cast` file from disk, parses it, fetches all sections, and JSON-serializes everything (session snapshot + all section snapshots) into one response. For a 50k-line session, this is 10-50 MB of JSON.
- `SessionContent.vue` renders every section eagerly inside a single `<OverlayScrollbar>` container -- no virtualization, no lazy loading, no content-visibility.
- CLI sections reference `startLine/endLine` into a session-level `TerminalSnapshot.lines[]` array. TUI sections carry their own per-section `snapshot`.
- The `sections` table already stores sections independently with nanoid primary keys, indexed by `session_id`. The data model supports per-section delivery without schema rework.
- `SectionHeader.vue` already has sticky positioning with collapse/expand.

### Forces

- **Performance at scale:** 50k lines = 250k+ DOM nodes. CSS containment alone does not solve the memory problem -- it only skips rendering. True DOM reduction requires section-level virtualization.
- **Payload size:** Shipping 10-50 MB of JSON in one response blocks both server serialization and client parsing. Content must be split.
- **Spatial orientation:** Users need a persistent map of session structure. The compressed scrollbar is useless at 1M+ pixel heights.
- **Small session regression risk:** A 3-section session must feel identical to today. No skeleton states, no waterfalls.
- **VISIONBOOK compatibility:** 9 deferred items must remain architecturally feasible (see VISIONBOOK Compatibility section below).
- **Cmd+F tradeoff:** Section-level virtualization removes DOM nodes, breaking browser find-in-page for unloaded sections. This is an accepted tradeoff (see Decision 6).

---

## Options Considered

### Decision 1: API Design -- How to Split the Monolithic Endpoint

#### Option A: Two endpoints (metadata + per-section content)

Split `GET /api/sessions/:id` into:
1. `GET /api/sessions/:id` -- returns session metadata + section metadata (labels, types, line counts, IDs) WITHOUT terminal snapshot content. Small response (~5-20 KB for 50 sections).
2. `GET /api/sessions/:id/sections/:sectionId/content` -- returns terminal snapshot content for a single section. Cacheable with ETag.

- Pros: Clean separation. Each section independently cacheable. Per-section endpoint is the natural primitive for lazy loading, prefetch, and future search indexing.
- Cons: N+1 request pattern for initial load. New endpoint to build and maintain.

#### Option B: Metadata + bulk GET + per-section GET (three-endpoint design)

1. `GET /api/sessions/:id` -- metadata only (same as Option A).
2. `GET /api/sessions/:id/sections/content` -- returns content for ALL sections in one GET response. Keyed by section ID in the response body.
3. `GET /api/sessions/:id/sections/:sectionId/content` -- single section content (same as Option A).

- Pros: Best of both worlds. Bulk GET eliminates N+1 for initial load and small sessions. Per-section GET enables lazy load, prefetch, and individual caching. Both are pure GET with standard HTTP semantics.
- Cons: Two content endpoints to maintain. Bulk response is large for huge sessions (but the client chooses when to use it).

#### Option C: Single endpoint with query parameter to control depth

`GET /api/sessions/:id?depth=metadata|full` -- the current endpoint gains a parameter that controls whether snapshot content is included.

- Pros: Minimal API surface change. Backward-compatible if `depth=full` is default.
- Cons: All-or-nothing for content -- you either get zero sections' content or all of them. No per-section caching. Doesn't solve the payload problem for large sessions.

**Chosen: Option B.** The three-endpoint design gives the client full flexibility: bulk GET for initial load and small sessions (one round-trip), per-section GET for lazy load, prefetch, and HTTP caching. Both are standard GET routes with clean semantics.

**Route registration constraint:** The bulk route (`GET /api/sessions/:id/sections/content`) must be registered in Hono BEFORE the per-section route (`GET /api/sessions/:id/sections/:sectionId/content`), otherwise Hono matches the literal path segment "content" as a `:sectionId` parameter. This is a Hono-specific ordering concern that must be documented in the route file with a comment.

### Decision 2: Per-Section Content Endpoint Shape -- Large Section Chunking

#### Option A: Return full section content, no chunking

`GET /api/sessions/:id/sections/:sectionId/content` returns the complete `TerminalSnapshot` (or line array) for the section. For a 5,000-line section, this is a single ~500 KB response.

- Pros: Simplest implementation. One request, one response. Client gets everything it needs.
- Cons: A single 5,000-line section is still a large payload. For truly extreme sections (10k+ lines), the response itself becomes a performance concern.

#### Option B: Pagination within sections via query parameters

`GET /api/sessions/:id/sections/:sectionId/content?offset=0&limit=200` returns a slice of lines with metadata about total count. Without parameters, returns the first page (default limit).

- Pros: Bounded response size. Client can progressively render large sections. Composable with scrolling -- fetch next chunk as user scrolls into section. Server memory is bounded per request.
- Cons: More complex client logic. Pagination state management. Cache key per chunk. Scroll position restoration requires care.

#### Option C: Full content with chunked transfer encoding (HTTP streaming)

Same endpoint, but the server streams the JSON array using chunked transfer encoding so the client can begin parsing before the full response arrives.

- Pros: Single URL, single cache key. Client sees first data quickly. No pagination state.
- Cons: JSON streaming is awkward (partial parsing). Hono's streaming support is basic. Browser `fetch()` requires `ReadableStream` parsing which is complex. ETags don't work with streaming (you don't know the hash until you've sent everything).

**Chosen: Option B.** Server-side pagination bounds response size for extreme sections and gives the client progressive rendering control.

**Pagination design:**
- `offset` (default: 0) -- line index to start from (relative to section, not session)
- `limit` (default: 500) -- max lines to return. Omitting `limit` returns the default page size. To request all lines, pass `limit=all` (string sentinel). This avoids the confusing `limit=0` convention where 0 means "unlimited."
- Response includes: `{ sectionId, lines: SnapshotLine[], totalLines, offset, limit, hasMore, contentHash }`
- ETag is per-chunk: based on `contentHash + offset + limit`
- **Out-of-range offset:** If `offset >= totalLines`, the endpoint returns `{ lines: [], totalLines, offset, limit, hasMore: false }` (not a 400 error). This is consistent with standard pagination behavior and simplifies client logic.

### Decision 3: Client Virtualization Strategy

#### Option A: TanStack Virtual (section-level)

Use `@tanstack/vue-virtual` with each section (header + content) as a virtual item. Overscan of 2-3 sections. Dynamic height measurement after render.

- Pros: Battle-tested library. Handles scroll position restoration, dynamic heights, overscan. UX research confirms it as the community standard for Vue 3. Section-level granularity (50-100 items) avoids the complexity of line-level virtualization.
- Cons: New dependency (~15 KB). Known upward-scroll stutter with highly variable heights (mitigated by overestimating `estimateSize`). Sticky headers within virtualized items require careful z-index management.

#### Option B: Custom IntersectionObserver-based section virtualization

Build a custom virtualizer using `IntersectionObserver` to detect which sections are near the viewport. Sections outside a buffer zone have their content replaced with height-preserving placeholder divs.

- Pros: No dependency. Full control over behavior. Simpler mental model than a full virtualizer. Works naturally with sticky headers since sections remain in normal document flow.
- Cons: Must implement height measurement, scroll restoration, and overscan manually. Edge cases around rapid scrolling, scroll-to-section, and browser back/forward. More code to maintain. Easy to underestimate the edge cases.

#### Option C: CSS `content-visibility: auto` only (no true virtualization)

Apply `content-visibility: auto` + `contain-intrinsic-size` to every section's content container. No DOM removal, just rendering optimization.

- Pros: Zero JavaScript. Preserves Cmd+F across entire session. Preserves screen reader access to all content. Simplest implementation.
- Cons: Does NOT reduce DOM node count or memory usage -- 250k nodes still exist in the DOM tree. At 50k lines, memory pressure alone (50+ MB of parsed JSON heap objects + DOM node memory) is the problem, not rendering cost. Insufficient for the stated acceptance criteria (<10,000 DOM nodes).

**Chosen: Option A (TanStack Virtual) with Option C (CSS containment) as the first layer.** TanStack Virtual is the established solution for this problem. Reinventing it with a custom IntersectionObserver approach risks underestimating edge cases (scroll restoration, rapid direction changes, programmatic scroll-to). The known upward-scroll stutter is mitigated by:
1. Operating at section granularity (50-100 items, not thousands)
2. Overestimating `estimateSize` (use `lineCount * LINE_HEIGHT_PX + HEADER_HEIGHT` per section)
3. Using `measureElement` for actual heights after first render
4. Setting overscan to 3 sections for smooth scrolling buffer

CSS `content-visibility: auto` is applied as layer 1 to section content containers within rendered sections, providing additional rendering optimization for free.

**Sticky header strategy:** Each virtual item includes both header and content. Headers use `position: sticky` within the virtual item wrapper. TanStack Virtual's absolute positioning of items requires z-index management: ensure headers have `z-index` above adjacent items' content.

### Decision 4: Section Navigator -- Component Architecture

The approved visual design is defined in `.state/feat-virtual-scrolling/references/approved-design.html`. Engineers extract all styles, DOM structure, and visual behavior directly from that file. This ADR does not describe visual design in text.

#### Option A: Monolithic component

A single `SectionNavigator.vue` component handles all navigator rendering and interaction. The shared `useActiveSection` composable lives outside the component for VISIONBOOK compatibility.

- Pros: Simple component tree. All navigator rendering state is local. One file to read and understand. Easier to refactor later if the design evolves.
- Cons: Large component file. Harder to test sub-features in isolation.

#### Option B: Composed components with shared composable

Multiple sub-components + shared composable.

- Pros: Each component is testable in isolation.
- Cons: More files. Over-engineered for a feature whose design may evolve. Component boundaries are premature until the design stabilizes.

**Chosen: Option A -- monolithic `SectionNavigator.vue` + shared `useActiveSection` composable.** The navigator is a single cohesive UI surface. The `useActiveSection` composable remains a separate file because it is shared state consumed by both `SessionContent.vue` and `SectionNavigator.vue` -- this is a VISIONBOOK hard requirement (items 1, 3).

**Extraction trigger:** If `SectionNavigator.vue` exceeds 300 lines of `<script>` (not counting `<template>` and `<style>`), sub-components must be extracted before the stage is marked complete. This is a hard rule, not a suggestion.

### Decision 5: Client Cache Design

#### Option A: Composable with Map-based cache + memory ceiling

A `useSectionCache.ts` composable wraps a `Map<string, CachedSection>` where each entry tracks the section content, byte size estimate, and last-access timestamp. When total estimated size exceeds a configurable ceiling (e.g., 100 MB), LRU eviction removes the least-recently-accessed entries. Section metadata is stored separately and never evicted.

- Pros: Simple, predictable. LRU is well-understood. Memory ceiling is tunable.
- Cons: Byte size estimation for JavaScript objects is approximate. Must estimate based on line count * average bytes per line.

#### Option B: Cache-API (browser) or IndexedDB backing store

Persist section content to the Cache API or IndexedDB so it survives page reloads and can be promoted to service worker caching later.

- Pros: Survives navigation. Natural path to offline support.
- Cons: Async read/write adds latency to cache hits. Serialization cost. IndexedDB has poor ergonomics. Premature optimization -- the VISIONBOOK says offline support is deferred.

#### Option C: HTTP cache only (rely on browser cache + ETags)

Don't build a client-side application cache. Rely on browser HTTP cache with `Cache-Control` and `ETag` headers from the server.

- Pros: Zero client code. Browser manages memory. Standards-based.
- Cons: Browser cache behavior is unpredictable across browsers. No guaranteed in-memory retention for instant re-rendering. No way to enforce memory ceiling or LRU policy.

**Chosen: Hybrid of Option A + Option C.** In-memory Map cache for hot data (instant re-rendering) + HTTP ETag headers for warm data (304 Not Modified on cache miss). Two-layer hot/warm strategy.

**Pluggable interface requirement:** The cache must expose a clean `SectionCache` interface (`get`, `set`, `has`, `evict`, `clear`, `stats`) so the LRU Map implementation can be swapped for a more sophisticated backend (IndexedDB, service worker) later without changing any consumer code. The interface is the stable contract; the implementation is replaceable. This addresses the user's scalability concern directly -- the `createSectionCache(options)` factory accepts a strategy, defaulting to the in-memory LRU.

### Decision 6: Cmd+F Tradeoff

Section-level virtualization removes DOM nodes for sections outside the active window. Browser Cmd+F cannot find text in removed sections. This is an **accepted tradeoff** at the 50k-line scale because:

1. Keeping 250k+ nodes in the DOM to support Cmd+F defeats the performance purpose entirely.
2. Cmd+F still works within the currently loaded sections -- a generous window (active section +/- 3 sections of overscan) typically covers the user's immediate reading context.
3. The VISIONBOOK (item 2) explicitly identifies custom in-app search as a future feature. The per-section content endpoint introduced here is the data access layer that search will use.
4. For small sessions (below the threshold), no virtualization occurs -- Cmd+F works across the entire session because all content is in the DOM.

### Decision 7: Small Session Passthrough

Sessions with `sectionCount` below a threshold (default: 5 sections) skip the heavyweight layers:
- The metadata endpoint still returns the same shape (for consistency), but the client detects `sectionCount <= threshold` and uses the bulk GET endpoint to fetch all content in one request.
- No section navigator is rendered.
- TanStack Virtual is not activated (sections render in normal document flow).
- CSS `content-visibility: auto` is still applied (harmless, zero-cost for small sessions).
- The experience is identical to today: one fast load, all content visible, no skeleton states.

The threshold is a configuration constant in the client, not a server concern.

### Decision 8: CLI Section Content Denormalization

**Problem:** CLI sections currently store only `startLine/endLine` references into the session-level snapshot. The session snapshot is a single multi-MB JSON column. Every per-section content request for a CLI section requires: (1) loading the full session snapshot from DB, (2) `JSON.parse()` on the entire blob, (3) slicing the relevant lines. For a session with 50 CLI sections, this means parsing the same multi-MB JSON string 50 times during bulk or sequential content requests.

**Decision:** Denormalize CLI section content into the `sections.snapshot` column during pipeline processing. When `completeProcessing` runs, CLI sections get their `snapshot` column populated with a `TerminalSnapshot` containing only their sliced lines (the same `lines[startLine..endLine]` slice the client previously computed). After denormalization:
- Every section (CLI and TUI) has its own self-contained `snapshot` column
- The per-section content endpoint reads ONE section row, not the session-level snapshot
- The session-level `snapshot` column on the `sessions` table is retained for backward compatibility and future use (e.g., global search, line-level addressing across sections) but is NOT read on content requests
- The `startLine`/`endLine` columns are retained as metadata (useful for navigator display, deep linking) but no longer used for content slicing at request time

This eliminates the N-times-parsing problem and aligns the data model with the per-section content delivery pattern. The cost is increased storage (section snapshots duplicate lines from the session snapshot), which is acceptable because SQLite storage is cheap relative to the CPU cost of repeated multi-MB JSON parsing.

---

## Decision

Adopt all eight decisions:

1. **API: Three endpoints** -- metadata-only `GET /api/sessions/:id` (breaking change) + bulk content `GET /api/sessions/:id/sections/content` + per-section content `GET /api/sessions/:id/sections/:sectionId/content`. Bulk route registered before per-section route in Hono.
2. **Section content: Server-side pagination** -- `?offset=0&limit=500` for large sections. `limit=all` for full content. Out-of-range offsets return empty lines, not errors.
3. **Virtualization: TanStack Virtual + CSS containment** -- `@tanstack/vue-virtual` at section level with CSS `content-visibility: auto` as layer 1 within rendered sections.
4. **Navigator: Monolithic `SectionNavigator.vue` + shared `useActiveSection` composable.** Approved visual design: `.state/feat-virtual-scrolling/references/approved-design.html`. Extract sub-components if script exceeds 300 lines.
5. **Cache: Pluggable in-memory LRU Map + HTTP ETag headers** -- `SectionCache` interface with replaceable implementation. Default: in-memory LRU with configurable ceiling.
6. **Cmd+F: Accepted tradeoff** -- works within loaded sections; full-session search is a future feature.
7. **Small sessions: Client-side threshold** -- sessions below 5 sections use bulk GET and skip virtualization/navigator.
8. **CLI section denormalization** -- populate `sections.snapshot` for CLI sections during pipeline processing. Content endpoints read per-section rows only, never the session-level snapshot.

### Trade-offs Accepted

- Cmd+F does not work across unloaded sections in large sessions.
- TanStack Virtual adds a dependency (~15 KB) and has known upward-scroll stutter with extreme height variance (mitigated by section-level granularity and generous `estimateSize`).
- Server-side pagination adds complexity to both server and client for large sections.
- CLI section denormalization increases storage size (duplicate line data in section rows alongside session snapshot). Acceptable trade for eliminating per-request multi-MB JSON parsing.
- In-memory cache size estimation is approximate, not exact.
- Breaking change to `GET /api/sessions/:id` response shape.

---

## VISIONBOOK Compatibility

How each of the 9 deferred items is accommodated by this design:

### 1. Section-Level Deep Linking (`#section-12`)

**Accommodated.** Section IDs are nanoid strings (already URL-safe). The `useActiveSection` composable tracks the active section by ID. A future `onMounted` hook can parse `window.location.hash`, resolve it to a section ID, and call `scrollToSection(id)` -- the same function the navigator uses on click. TanStack Virtual's `scrollToIndex` API supports programmatic scrolling to any virtual item. No architectural change needed.

### 2. Custom In-App Search

**Accommodated.** The per-section content endpoint (`GET /api/sessions/:id/sections/:sectionId/content`) with pagination is the data access layer. A search feature can use server-side FTS5 indexing against section content and map results back to `sectionId + lineOffset`. The paginated content format preserves line-level addressability (`SnapshotLine[]` array), so search results can highlight specific lines. The `useActiveSection.scrollToSection()` API navigates to the matching section. The bulk content endpoint can also serve as a client-side search data source.

### 3. Keyboard Navigation (`j`/`k`)

**Accommodated.** `useActiveSection` exposes `activeSectionId`, `activeSectionIndex`, `sections` (ordered list), and `scrollToSection(id)`. A future `useKeyboardNavigation` composable can compute next/previous section from the ordered list and call `scrollToSection`. TanStack Virtual's `scrollToIndex` provides the underlying scroll primitive. No shared state refactoring needed.

### 4. Session Size Indicators in Session List

**Accommodated.** The `GET /api/sessions/:id` metadata response includes `sectionCount` and `totalLines`. The list endpoint `GET /api/sessions` already returns metadata -- adding these fields to the list response is a one-column addition with no architectural dependency on this feature's work.

### 5. Progressive Section Summaries (Preview Field)

**Accommodated.** The `preview` nullable TEXT column is added to the `sections` table in the migration stage (005). It is nullable and initially empty, costing nothing. A future pipeline step can populate it with the first non-empty line or marker text. The metadata endpoint includes `preview` in `SectionMetadata` when present. The approved navigator design includes a popover card with a terminal preview area -- this slot is ready to display the `preview` field when populated.

### 6. Section Density Encoding in Pills

**Accommodated.** Pills receive section metadata as props (`type`, `lineCount`, `label`). Pill appearance is data-driven by design -- the component renders based on these props. The approved design differentiates pill styling by section type (marker vs detected). A future enhancement can further encode line count into visual weight without refactoring the component structure.

### 7. Streaming / Real-Time Session Support

**Accommodated.** The per-section content endpoint assumes immutable content (ETag caching). A future live-session mode can: (a) add a `live: boolean` flag to session metadata, (b) skip ETag caching for live sessions, (c) use SSE or WebSocket to push section updates. The pluggable cache interface supports a `skipCache` option or a different cache strategy for live sessions. The design does not assume all sections are immutable at the protocol level.

### 8. Offline Support / Service Worker Caching

**Accommodated.** Cache keys are stable URLs: `/api/sessions/${sessionId}/sections/${sectionId}/content`. ETag headers on per-section responses are service-worker-compatible. The pluggable `SectionCache` interface is designed so a future IndexedDB or service worker backing store can replace the in-memory LRU without changing consumer code. The bulk content endpoint also provides a natural "cache warm" primitive for offline pre-loading.

### 9. Line-Level Virtual Scrolling for Extreme Sections

**Accommodated.** Section content is delivered as paginated `SnapshotLine[]` -- an array of individually addressable line records, not an opaque HTML blob. The pagination format (`offset`, `limit`, `totalLines`) maps directly to a future line-level virtualizer's data needs. A future line-level virtualizer within a section can use the same pagination endpoint to fetch visible line ranges on demand. The `TerminalSnapshot` component already renders from a `lines` prop -- replacing it with a virtualizing variant that only renders visible lines requires no upstream data format changes.

---

## Consequences

### What becomes easier
- Opening large sessions -- sub-second structure visibility, bounded DOM, bounded payload
- Navigating sessions -- one-click jump to any section via navigator
- Re-visiting sessions -- cached section content avoids redundant fetches
- Initial load optimization -- bulk GET eliminates N+1 for the common case
- Per-section content serving -- denormalized snapshots mean O(1) DB read per section, no session-level JSON parsing
- Future features -- deep linking, search, keyboard nav, density encoding, offline all have clean extension points
- Cache evolution -- pluggable interface means LRU can be swapped for IndexedDB/SW later

### What becomes harder
- Cmd+F across unloaded sections -- deliberately traded off
- Server complexity -- three content endpoints + pagination logic
- Client complexity -- pagination state management for large sections
- Storage size -- CLI section denormalization duplicates line data (section snapshots + session snapshot)
- Testing -- must test virtualization edge cases (scroll restoration, rapid scrolling, section collapse during virtualization)
- Session detail API consumers -- breaking change to response shape requires client update
- Route registration order -- Hono requires bulk route before per-section route; must be documented and tested

### Follow-ups to scope for later
- Custom in-app search (VISIONBOOK item 2)
- Keyboard navigation (VISIONBOOK item 3)
- IndexedDB or service worker cache backend (VISIONBOOK item 8)
- Line-level virtual scrolling for extreme sections (VISIONBOOK item 9)
- Drop session-level `snapshot` column once all consumers use per-section content (requires migration)

---

## Decision History

Decisions made with user during design:

1. Three-endpoint API (metadata + bulk GET + per-section GET) -- bulk GET eliminates N+1 without sacrificing per-section caching. "It's not rocket science" -- just add a bulk GET alongside the per-section route.
2. Server-side pagination for large sections -- `?offset=&limit=` bounds response size and enables progressive rendering from the server side.
3. TanStack Virtual over custom IntersectionObserver -- "Why reinvent the wheel especially when it gets complicated easily?" Battle-tested library avoids underestimating edge cases.
4. Monolithic `SectionNavigator.vue` over composed sub-components -- simpler component tree, `useActiveSection` composable still shared for VISIONBOOK compatibility.
5. Pluggable cache interface with in-memory LRU default + HTTP ETags -- "make sure the LRU is properly scalable and multi-user available and doesn't require a ton of work later."
6. Cmd+F tradeoff accepted -- works within loaded sections; custom search is a deferred feature.
7. Small session threshold at 5 sections -- client-side constant, uses bulk GET for one-shot content load.
8. CLI section denormalization -- reviewer finding: per-request parsing of multi-MB session snapshot is N-times redundant. Denormalize during pipeline processing.
