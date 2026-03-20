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
- Cons: N+1 request pattern for initial load (mitigated by only fetching visible sections). New endpoint to build and maintain.

#### Option B: Metadata endpoint + bulk content endpoint with section IDs

1. `GET /api/sessions/:id` -- metadata only (same as Option A).
2. `POST /api/sessions/:id/sections/batch` -- accepts `{ sectionIds: string[] }` and returns content for multiple sections in one response.

- Pros: Fewer round-trips for initial load. Can batch prefetches.
- Cons: POST for a read operation is awkward. Response is not individually cacheable per section. Complicates cache headers. Doesn't compose well with HTTP caching or service workers.

#### Option C: Single endpoint with query parameter to control depth

`GET /api/sessions/:id?depth=metadata|full` -- the current endpoint gains a parameter that controls whether snapshot content is included.

- Pros: Minimal API surface change. Backward-compatible if `depth=full` is default.
- Cons: All-or-nothing for content -- you either get zero sections' content or all of them. No per-section caching. Doesn't solve the payload problem for large sessions.

**Recommended: Option A.** The per-section content endpoint is the fundamental primitive that all other features (lazy loading, prefetch on hover, client cache, future search, future streaming) build on. Option B's batch approach can be added later as an optimization if N+1 becomes a measurable bottleneck, but the per-section endpoint must exist regardless.

### Decision 2: Per-Section Content Endpoint Shape -- Large Section Chunking

#### Option A: Return full section content, no chunking

`GET /api/sessions/:id/sections/:sectionId/content` returns the complete `TerminalSnapshot` (or line array) for the section. For a 5,000-line section, this is a single ~500 KB response.

- Pros: Simplest implementation. One request, one response. Client gets everything it needs.
- Cons: A single 5,000-line section is still a large payload. For truly extreme sections (10k+ lines), the response itself becomes a performance concern.

#### Option B: Pagination within sections via query parameters

`GET /api/sessions/:id/sections/:sectionId/content?offset=0&limit=200` returns a slice of lines with metadata about total count.

- Pros: Bounded response size. Client can progressively render large sections. Composable with scrolling -- fetch next chunk as user scrolls into section.
- Cons: More complex client logic. Pagination state management. Cache key per chunk. Scroll position restoration becomes harder.

#### Option C: Full content with chunked transfer encoding (HTTP streaming)

Same endpoint, but the server streams the JSON array using chunked transfer encoding so the client can begin parsing before the full response arrives.

- Pros: Single URL, single cache key. Client sees first data quickly. No pagination state.
- Cons: JSON streaming is awkward (partial parsing). Hono's streaming support is basic. Browser `fetch()` requires `ReadableStream` parsing which is complex. ETags don't work with streaming (you don't know the hash until you've sent everything).

**Recommended: Option A for now, with Option B as a future enhancement.** The vast majority of sections are under 1,000 lines (~100 KB). The vision calls for progressive rendering within large sections, but this can be done client-side (render the first N lines immediately, queue the rest via `requestIdleCallback`). The endpoint returns the full section content; the client controls rendering pace. Option B can be added later for sections exceeding a line threshold (5,000+) without changing the client's cache key scheme -- just add query parameters to the same URL pattern.

### Decision 3: Client Virtualization Strategy

#### Option A: TanStack Virtual (section-level)

Use `@tanstack/vue-virtual` with each section (header + content) as a virtual item. Overscan of 2-3 sections. Dynamic height measurement after render.

- Pros: Battle-tested library. Handles scroll position restoration, dynamic heights, overscan. UX research confirms it as the community standard for Vue 3. Section-level granularity (50-100 items) avoids the complexity of line-level virtualization.
- Cons: New dependency (~15 KB). Known upward-scroll stutter with highly variable heights (mitigated by overestimating `estimateSize`). Sticky headers within virtualized items require careful z-index management.

#### Option B: Custom IntersectionObserver-based section virtualization

Build a custom virtualizer using `IntersectionObserver` to detect which sections are near the viewport. Sections outside a buffer zone have their content replaced with height-preserving placeholder divs.

- Pros: No dependency. Full control over behavior. Simpler mental model than a full virtualizer. Works naturally with sticky headers since sections remain in normal document flow.
- Cons: Must implement height measurement, scroll restoration, and overscan manually. Edge cases around rapid scrolling, scroll-to-section, and browser back/forward. More code to maintain.

#### Option C: CSS `content-visibility: auto` only (no true virtualization)

Apply `content-visibility: auto` + `contain-intrinsic-size` to every section's content container. No DOM removal, just rendering optimization.

- Pros: Zero JavaScript. Preserves Cmd+F across entire session. Preserves screen reader access to all content. Simplest implementation.
- Cons: Does NOT reduce DOM node count or memory usage -- 250k nodes still exist in the DOM tree. At 50k lines, memory pressure alone (50+ MB of parsed JSON heap objects + DOM node memory) is the problem, not rendering cost. Insufficient for the stated acceptance criteria (<10,000 DOM nodes).

**Recommended: Option B (custom IntersectionObserver) with Option C (CSS containment) as the first layer.** Rationale: Section-level virtualization with 50-100 items is simple enough that a custom approach avoids the dependency and the known TanStack stutter issues with extreme height variance. The custom approach also works naturally with the existing `OverlayScrollbar` container and sticky `SectionHeader` elements without the z-index gymnastics that TanStack's absolute positioning requires. CSS `content-visibility: auto` is applied to all section content containers as layer 1, handling sections that are in the DOM but off-screen. The IntersectionObserver virtualizer handles sections far from the viewport by removing their DOM entirely.

If the custom approach proves insufficient during implementation (scroll restoration issues, edge cases), TanStack Virtual remains a viable fallback with the same composable interface.

### Decision 4: Section Navigator Aside -- Component Architecture

#### Option A: Monolithic aside component

A single `SectionNavigator.vue` component handles the pill grid, expand panel, scrollspy, and click navigation.

- Pros: Simple component tree. All navigator state is local.
- Cons: Large component file. Hard to test individual pieces. Expand panel animation is tightly coupled to pill grid layout.

#### Option B: Composed components with shared composable

- `SectionNavigatorAside.vue` -- layout shell (aside element, responsive show/hide)
- `SectionPillGrid.vue` -- renders the compact pill grid
- `SectionExpandPanel.vue` -- the expanded panel with full labels
- `useActiveSection.ts` -- composable that owns scrollspy state (active section ID, observed sections)
- Both `SessionContent.vue` and `SectionNavigatorAside.vue` consume `useActiveSection`

- Pros: Each component is testable in isolation. `useActiveSection` is the shared state bridge between content and navigator. Expand panel can be lazy-loaded. Clear separation of concerns.
- Cons: More files. Requires careful prop/event design for the composable integration.

#### Option C: Composable-heavy, minimal components

Put most logic in composables (`useActiveSection`, `useSectionNavigator`, `usePillGrid`). Components are thin wrappers.

- Pros: Maximum composable reuse. Thin components.
- Cons: Too many composables for the complexity. The pill grid layout is inherently visual -- it belongs in a component, not a composable.

**Recommended: Option B.** The composed approach gives testable components with a clean shared-state bridge. The `useActiveSection` composable is the critical shared state that the VISIONBOOK requires for future keyboard navigation (item 3) -- it must not be component-local.

### Decision 5: Client Cache Design

#### Option A: Composable with Map-based cache + memory ceiling

A `useSectionCache.ts` composable wraps a `Map<string, CachedSection>` where each entry tracks the section content, byte size estimate, and last-access timestamp. When total estimated size exceeds a configurable ceiling (e.g., 100 MB), LRU eviction removes the least-recently-accessed entries. Section metadata is stored separately and never evicted.

- Pros: Simple, predictable. LRU is well-understood. Memory ceiling is tunable. Map iteration order is insertion-order, making LRU scan straightforward with access-time tracking.
- Cons: Byte size estimation for JavaScript objects is approximate (not exact like `performance.measureUserAgentSpecificMemory()`). Must estimate based on line count * average bytes per line.

#### Option B: Cache-API (browser) or IndexedDB backing store

Persist section content to the Cache API or IndexedDB so it survives page reloads and can be promoted to service worker caching later.

- Pros: Survives navigation. Natural path to offline support.
- Cons: Async read/write adds latency to cache hits. Serialization cost. IndexedDB has poor ergonomics. Premature optimization -- the VISIONBOOK says offline support is deferred.

#### Option C: HTTP cache only (rely on browser cache + ETags)

Don't build a client-side application cache. Rely on browser HTTP cache with `Cache-Control` and `ETag` headers from the server.

- Pros: Zero client code. Browser manages memory. Standards-based.
- Cons: Browser cache behavior is unpredictable across browsers. No guaranteed in-memory retention for instant re-rendering. No way to enforce memory ceiling or LRU policy. Cache eviction is browser-heuristic, not application-controlled.

**Recommended: Option A (in-memory Map cache) combined with Option C (HTTP cache headers).** The in-memory cache provides instant re-rendering for sections visited within the current browsing session. HTTP cache headers (ETag + `Cache-Control: private, max-age=0, must-revalidate`) provide 304 Not Modified responses when the in-memory cache misses but content hasn't changed. This is a two-layer approach: hot cache (in-memory, instant) + warm cache (HTTP, one round-trip for 304).

### Decision 6: Cmd+F Tradeoff

Section-level virtualization removes DOM nodes for sections outside the active window. Browser Cmd+F cannot find text in removed sections. This is an **accepted tradeoff** at the 50k-line scale because:

1. Keeping 250k+ nodes in the DOM to support Cmd+F defeats the performance purpose entirely.
2. Cmd+F still works within the currently loaded sections -- a generous window (active section +/- 2-3 sections of overscan) typically covers the user's immediate reading context.
3. The VISIONBOOK (item 2) explicitly identifies custom in-app search as a future feature. The per-section content endpoint introduced here is the data access layer that search will use.
4. For small sessions (below the threshold), no virtualization occurs -- Cmd+F works across the entire session because all content is in the DOM.

### Decision 7: Small Session Passthrough

Sessions with `sectionCount` below a threshold (default: 5 sections) skip the heavyweight layers:
- The metadata endpoint still returns the same shape (for consistency), but the client detects `sectionCount <= threshold` and fetches all section content eagerly in parallel.
- No section navigator aside is rendered.
- No IntersectionObserver virtualization is activated.
- CSS `content-visibility: auto` is still applied (harmless, zero-cost for small sessions).
- The experience is identical to today: one fast load, all content visible, no skeleton states.

The threshold is a configuration constant in the client, not a server concern.

---

## Decision

Adopt all seven recommendations above:

1. **API: Two endpoints** -- metadata-only `GET /api/sessions/:id` (breaking change) + per-section content `GET /api/sessions/:id/sections/:sectionId/content`.
2. **Section content: Full delivery** -- no chunking in V1. Client controls rendering pace for large sections.
3. **Virtualization: Custom IntersectionObserver + CSS containment** -- two-layer approach. CSS `content-visibility: auto` as layer 1, custom section-level DOM virtualization as layer 2.
4. **Navigator: Composed components + `useActiveSection` composable** -- shared scrollspy state consumed by both content view and navigator.
5. **Cache: In-memory Map with LRU eviction + HTTP ETag headers** -- two-layer hot/warm cache.
6. **Cmd+F: Accepted tradeoff** -- works within loaded sections; full-session search is a future feature.
7. **Small sessions: Client-side threshold** -- sessions below 5 sections skip virtualization and navigator.

### Trade-offs Accepted

- Cmd+F does not work across unloaded sections in large sessions.
- Custom IntersectionObserver virtualizer is more code to maintain than TanStack Virtual, but avoids the dependency and known stutter issues.
- In-memory cache size estimation is approximate, not exact.
- Breaking change to `GET /api/sessions/:id` response shape.

---

## VISIONBOOK Compatibility

How each of the 9 deferred items is accommodated by this design:

### 1. Section-Level Deep Linking (`#section-12`)

**Accommodated.** Section IDs are nanoid strings (already URL-safe). The `useActiveSection` composable tracks the active section by ID. A future `onMounted` hook can parse `window.location.hash`, resolve it to a section ID, and call `scrollToSection(id)` -- the same function the navigator's pill click uses. No architectural change needed.

### 2. Custom In-App Search

**Accommodated.** The per-section content endpoint (`GET /api/sessions/:id/sections/:sectionId/content`) is the data access layer. A search feature can fetch all sections' content (or use server-side FTS5 indexing) and map results back to `sectionId + lineIndex`. The content format preserves line-level addressability (`TerminalSnapshot.lines[]` array with per-line spans), so search results can highlight specific lines. The `useActiveSection.scrollToSection()` API navigates to the matching section.

### 3. Keyboard Navigation (`j`/`k`)

**Accommodated.** `useActiveSection` exposes `activeSectionId`, `sections` (ordered list), and `scrollToSection(id)`. A future `useKeyboardNavigation` composable can compute next/previous section from the ordered list and call `scrollToSection`. No shared state refactoring needed -- the composable interface is designed for this.

### 4. Session Size Indicators in Session List

**Accommodated.** The `GET /api/sessions/:id` metadata response includes `sectionCount` and `totalLines` (added in this feature). The list endpoint `GET /api/sessions` already returns metadata -- adding these fields to the list response is a one-column addition with no architectural dependency on this feature's work.

### 5. Progressive Section Summaries (Preview Field)

**Accommodated.** The section metadata shape includes all current fields. A future `preview` nullable column can be added to the `sections` table and included in the metadata response without breaking the endpoint contract. The navigator pill component receives section metadata as props, so adding a `preview` prop for tooltip display requires no component refactoring.

### 6. Section Density Encoding in Pills

**Accommodated.** Pills receive section metadata as props (`type`, `lineCount`, `label`). Pill appearance is data-driven by design -- the component renders based on these props. A future enhancement can compute relative weight (line count / max section line count) and map it to visual encoding (brightness, size) without refactoring the component structure.

### 7. Streaming / Real-Time Session Support

**Accommodated.** The per-section content endpoint assumes immutable content (ETag caching). A future live-session mode can: (a) add a `live: boolean` flag to session metadata, (b) skip ETag caching for live sessions, (c) use SSE or WebSocket to push section updates. The client cache composable already handles cache invalidation (eviction) -- live sections can bypass the cache entirely via a `skipCache` option. The design does not assume all sections are immutable at the protocol level.

### 8. Offline Support / Service Worker Caching

**Accommodated.** Cache keys are stable: `sessions/${sessionId}/sections/${sectionId}/content`. ETag headers on per-section responses are service-worker-compatible. The in-memory cache and the HTTP cache use the same URL scheme, so a service worker can intercept the same requests and serve from its own cache. Cache key design is explicitly compatible.

### 9. Line-Level Virtual Scrolling for Extreme Sections

**Accommodated.** Section content is delivered as `TerminalSnapshot` with `lines: SnapshotLine[]` -- an array of individually addressable line records, not an opaque HTML blob. A future line-level virtualizer within a section can operate on this array directly. The `TerminalSnapshot` component already renders from a `lines` prop -- replacing it with a virtualizing variant that only renders visible lines requires no upstream data format changes.

---

## Consequences

### What becomes easier
- Opening large sessions -- sub-second structure visibility, bounded DOM, bounded payload
- Navigating sessions -- one-click jump to any section via aside
- Re-visiting sessions -- cached section content avoids redundant fetches
- Future features -- deep linking, search, keyboard nav, density encoding all have clean extension points

### What becomes harder
- Cmd+F across unloaded sections -- deliberately traded off
- Testing -- must test virtualization edge cases (scroll restoration, rapid scrolling, section collapse during virtualization)
- Session detail API consumers -- breaking change to response shape requires client update

### Follow-ups to scope for later
- Chunked content delivery for 5,000+ line sections (Option B from Decision 2)
- Batch section content endpoint for initial load optimization
- Custom in-app search (VISIONBOOK item 2)
- Keyboard navigation (VISIONBOOK item 3)

---

## Decision History

Decisions made with user during design:

1. Per-section content endpoint over batch endpoint -- HTTP caching and service worker compatibility outweigh the N+1 concern.
2. Custom IntersectionObserver over TanStack Virtual -- avoids dependency and known stutter with extreme height variance; TanStack remains fallback.
3. In-memory Map + HTTP ETags over browser-only cache -- application-controlled memory ceiling with two-layer hot/warm strategy.
4. Composed components with shared `useActiveSection` composable -- testable components with VISIONBOOK-compatible shared state.
5. Full section content delivery without chunking in V1 -- client controls rendering pace; server chunking deferred.
6. Cmd+F tradeoff accepted -- works within loaded sections; custom search is a deferred feature.
7. Small session threshold at 5 sections -- client-side constant, no server involvement.
