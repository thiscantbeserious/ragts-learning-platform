# Plan: Virtual Scrolling and Section Navigation

References: ADR.md

## Open Questions

Implementation challenges to solve (architect identifies, engineers resolve):

1. **TanStack Virtual + sticky headers.** TanStack Virtual uses absolute positioning for virtual items. `position: sticky` inside an absolutely-positioned element may not behave as expected. The engineer must verify whether sticky headers work within TanStack Virtual items, or whether the header must be positioned separately (e.g., rendered outside the virtualizer as an overlay synced to scroll position). The UX Research notes this as a known complexity.
2. **OverlayScrollbar as TanStack Virtual scroll container.** TanStack Virtual's `useVirtualizer` needs a `scrollElement` ref. `OverlayScrollbar.vue` has an internal `viewportRef` (line 67) but does NOT `defineExpose` it. Stage 10 must add `defineExpose({ viewport: viewportRef })` to OverlayScrollbar so the virtualizer can bind to the scroll element.
3. **OverlayScrollbar MutationObserver + TanStack Virtual layout thrashing.** `OverlayScrollbar.vue` has a `MutationObserver` (line 233) watching `{ childList: true, subtree: true }` on the viewport. TanStack Virtual constantly adds/removes virtual item DOM nodes, triggering the MutationObserver on every render cycle. This causes `recalculate()` to fire excessively, risking layout thrashing. Stage 10 must address this: either debounce the observer callback with `requestAnimationFrame`, or disconnect the MutationObserver when TanStack Virtual is active and instead recalculate on virtualizer scroll events only.
4. **Pagination cache key design.** With paginated section content, cache keys must include `offset` and `limit` to avoid serving stale chunks. ETag must also incorporate the chunk range. Design the cache key scheme so that a "full content" request (`limit=all`) has a distinct key from paginated chunks.

## Stages

### Stage 1: Shared Types and API Contract

Goal: Define the new API response types, pagination types, and shared constants used by both server and client.

Owner: backend-engineer

- [ ] Define `SessionMetadataResponse` type in `src/shared/types/api.ts` -- session metadata + section metadata array (no snapshot content)
- [ ] Define `SectionMetadata` type (id, type, label, startEvent, endEvent, startLine, endLine, lineCount, preview) -- no snapshot field. `preview` is `string | null`.
- [ ] Define `SectionContentPage` type (`{ sectionId, lines: SnapshotLine[], totalLines, offset, limit, hasMore, contentHash }`)
- [ ] Define `BulkSectionContentResponse` type (`{ sections: Record<string, SectionContentPage> }`)
- [ ] Define `SMALL_SESSION_THRESHOLD = 5` constant in `src/shared/constants.ts`
- [ ] Define `DEFAULT_SECTION_PAGE_LIMIT = 500` constant
- [ ] Define `BULK_MAX_SECTIONS = 200` constant (hard cap for bulk endpoint)
- [ ] Add `totalLines` and `sectionCount` fields to session metadata type
- [ ] Write unit tests for type guards / validation of new response shapes

Files:
- `src/shared/types/api.ts`
- `src/shared/types/section.ts`
- `src/shared/constants.ts` (new)

Depends on: none

Considerations:
- `SectionMetadata` must include all fields needed by the navigator (label, type, lineCount) so the client can render the full navigator from the metadata response alone.
- `contentHash` in `SectionContentPage` is used as part of ETag value -- derive from section snapshot content (hash of full content, not per-chunk).
- Preserve the existing `Section` type and `SessionDetailResponse` type for backward compatibility during migration. New types are additive.
- `SnapshotLine` is imported from `#vt-wasm/types` -- the pagination response returns raw lines, not a full `TerminalSnapshot` wrapper. The client reconstructs `TerminalSnapshot` if needed.
- `limit` accepts numbers or the string `"all"` to request full content. Document this in the type definition.

---

### Stage 2: Database Migration + Pipeline Denormalization

Goal: Add metadata columns to the `sections` table, add the `preview` column (VISIONBOOK item 5), and denormalize CLI section content into `sections.snapshot` during pipeline processing.

Owner: backend-engineer

**This is a prerequisite for content endpoints.** The migration adds columns that Stages 3-5 depend on (`line_count`, `content_hash`). The pipeline change (denormalization) must be done here so content endpoints can read per-section snapshots directly without parsing the session-level snapshot.

- [ ] Create migration `005_section_metadata.ts`
- [ ] Add `line_count INTEGER` column to `sections` table (nullable)
- [ ] Add `content_hash TEXT` column to `sections` table (nullable)
- [ ] Add `preview TEXT` column to `sections` table (nullable) -- VISIONBOOK item 5, costs nothing
- [ ] Migration is idempotent (check column existence before ALTER TABLE)
- [ ] Backfill existing sections: compute `line_count` from `end_line - start_line` or snapshot line count
- [ ] Backfill existing CLI sections: load session snapshot, slice `lines[start_line..end_line]`, write result into `sections.snapshot` as JSON
- [ ] Backfill `content_hash` from section snapshot content (SHA-256, truncated to 16 hex chars)
- [ ] For sections with `snapshot` = null (empty sections), set `content_hash` to a known sentinel (hash of empty array)
- [ ] Update `SectionRow` in `SectionAdapter` interface with new fields (`line_count`, `content_hash`, `preview`)
- [ ] Update `CreateSectionInput` to accept `lineCount`, `contentHash`, and `preview`
- [ ] **Update `completeProcessing` in `SqliteSessionImpl`** -- this is the critical pipeline change:
  - For CLI sections: slice session snapshot `lines[startLine..endLine]`, JSON-stringify, and store in `sections.snapshot`
  - For TUI sections: keep existing behavior (snapshot already populated)
  - Compute and store `line_count` and `content_hash` for every section
  - Update the `insertSectionStmt` prepared statement to include the new columns
- [ ] Update the `insertSectionStmt` SQL in `SqliteSessionImpl` constructor (currently line 78-80) to include `line_count, content_hash, preview` columns
- [ ] Write migration tests (idempotency, backfill correctness, CLI snapshot denormalization)
- [ ] Write unit tests for `completeProcessing` verifying CLI sections get denormalized snapshots

Files:
- `src/server/db/sqlite/migrations/005_section_metadata.ts` (new)
- `src/server/db/section_adapter.ts` (update `SectionRow`, `CreateSectionInput`)
- `src/server/db/sqlite/sqlite_section_impl.ts` (update `insertStmt`)
- `src/server/db/sqlite/sqlite_session_impl.ts` (update `completeProcessingTxn`, `insertSectionStmt`)

Depends on: none

Considerations:
- The `completeProcessingTxn` transaction in `sqlite_session_impl.ts` (lines 108-130) is where section rows are inserted. This is the single place to add denormalization logic. The session snapshot (`session.snapshot`) is already available in the transaction as a JSON string -- parse it once, slice per CLI section.
- Backfill for existing data: the migration must handle existing databases where CLI sections have `snapshot = NULL`. Load each session's snapshot, slice per CLI section, and populate the column. This is a one-time data migration.
- `content_hash` precomputation avoids recomputing SHA-256 on every content request. Computed once during pipeline processing and stored.
- `line_count` precomputation avoids loading snapshot JSON just to count lines for the metadata response.

---

### Stage 3: Server -- Per-Section Content Endpoint with Pagination

Goal: Add `GET /api/sessions/:id/sections/:sectionId/content` endpoint with pagination and ETag caching.

Owner: backend-engineer

- [ ] Add `findById(id: string)` method to `SectionAdapter` interface and `SqliteSectionImpl`
- [ ] Add `getSectionContent(sessionId, sectionId, offset?, limit?)` method to `SessionService`
- [ ] Read section row, parse `snapshot` JSON (now always populated for both CLI and TUI sections thanks to Stage 2 denormalization)
- [ ] Slice lines by `offset` and `limit`. Default `limit` = `DEFAULT_SECTION_PAGE_LIMIT`. `limit=all` returns all lines.
- [ ] Handle out-of-range offset: return `{ lines: [], totalLines, offset, limit, hasMore: false }` (not 400)
- [ ] Use `content_hash` from the section row for ETag (no recomputation needed)
- [ ] Return `ETag` header: `"${contentHash}-${offset}-${limit}"`
- [ ] Support `If-None-Match` for 304 responses
- [ ] Add `Cache-Control: private, max-age=0, must-revalidate` header
- [ ] Register route in session routes file (AFTER the bulk route -- see Stage 4)
- [ ] Write integration tests: fetch content, pagination (offset/limit), `limit=all`, ETag caching (304), section not found (404), session not found (404), out-of-range offset returns empty

Files:
- `src/server/db/section_adapter.ts` (add `findById` to interface)
- `src/server/db/sqlite/sqlite_section_impl.ts` (implement `findById` -- promote existing private stmt)
- `src/server/services/session_service.ts` (add `getSectionContent` method)
- `src/server/routes/sessions.ts` (add route handler)

Depends on: Stage 1, Stage 2

Considerations:
- The `findById` prepared statement already exists privately in `SqliteSectionImpl` (line 38) -- promote it to the interface.
- With denormalization (Stage 2), every section row has a `snapshot` column. The content endpoint parses ONE section's snapshot JSON, NOT the session-level snapshot. This is O(section size), not O(session size).
- Edge case: section where `snapshot` is still null (pipeline incomplete, or legacy data before backfill). Return 404 with message "Section content not yet available."

---

### Stage 4: Server -- Bulk Content Endpoint

Goal: Add `GET /api/sessions/:id/sections/content` endpoint that returns content for all sections in one response.

Owner: backend-engineer

- [ ] Add `getAllSectionContent(sessionId, limit?)` method to `SessionService`
- [ ] For each section, parse section-level `snapshot` and slice by limit (reuses Stage 3 logic)
- [ ] Apply default pagination per section: each section returns at most `limit` lines (default: `DEFAULT_SECTION_PAGE_LIMIT`). Sections under the limit return all their content.
- [ ] **Hard cap: if `sectionCount > BULK_MAX_SECTIONS` (200), return 400** with message "Too many sections for bulk endpoint. Use per-section endpoint." This prevents unbounded response sizes.
- [ ] Response shape: `{ sections: { [sectionId]: SectionContentPage } }`
- [ ] Support `?limit=` query parameter to override per-section page size (e.g., `?limit=all` for full content)
- [ ] Include per-section `contentHash`, `totalLines`, `hasMore` in each entry
- [ ] **Register route BEFORE the per-section route** to avoid `:sectionId` matching "content". Add a comment in the route file explaining the ordering requirement.
- [ ] Write integration tests: bulk fetch, per-section pagination within bulk, empty session, section count over cap returns 400

Files:
- `src/server/services/session_service.ts` (add `getAllSectionContent` method)
- `src/server/routes/sessions.ts` (add route handler)

Depends on: Stage 3 (reuses the per-section content extraction logic)

Considerations:
- Route registration order matters and must have a code comment. Example: `// IMPORTANT: Register bulk route before per-section route — Hono matches "content" as :sectionId otherwise`
- The hard cap (200 sections) prevents pathological cases. Sessions with 200+ sections should use per-section lazy loading exclusively.
- No ETag on the bulk response itself (it aggregates multiple sections). Individual section content hashes are included per-entry for client cache population.

---

### Stage 5: Server -- Metadata-Only Session Endpoint

Goal: Modify `GET /api/sessions/:id` to return metadata without snapshot content.

Owner: backend-engineer

- [ ] Modify `SessionService.getSession()` to return `SessionMetadataResponse` shape
- [ ] Omit session-level `snapshot` from response (this is the multi-MB field)
- [ ] Omit section-level `snapshot` from each section in the response
- [ ] Read `line_count` and `content_hash` from section rows (populated by Stage 2) -- no JSON parsing needed
- [ ] If `line_count` is null (legacy data before backfill), fall back to computing from `end_line - start_line`
- [ ] Add `totalLines` to session metadata (sum of section line counts)
- [ ] Add `sectionCount` to session metadata
- [ ] Keep `content: { header, markers }` in metadata (small, used by client)
- [ ] Update Typia validation for new response shape
- [ ] Update existing tests for the changed response shape
- [ ] Verify no other client code depends on the old response shape (search for `SessionDetailResponse` usage)

Files:
- `src/server/services/session_service.ts`
- `src/server/routes/sessions.ts`
- `src/shared/types/api.ts` (update `SessionDetailResponse` or replace)

Depends on: Stage 1, Stage 2

Considerations:
- This is a **breaking change** to the session detail endpoint. The client must be updated simultaneously (Stage 7).
- The `.cast` file read and `parseAsciicast` call in `getSession()` currently happen for every request. However, `content: { header, markers }` still requires the `.cast` file. Pragmatic choice: keep the `.cast` read for now but do NOT load the session snapshot. The header is small and fast to extract. Longer-term: move header/markers to DB columns.
- Metadata response must handle both post-migration data (has `line_count`, `content_hash`) and pre-migration data (nulls). Graceful fallback required.

---

### Stage 6: Client -- Section Cache Composable

Goal: Build `SectionCache` interface and in-memory LRU implementation for section content caching.

Owner: frontend-engineer

- [ ] Define `SectionCache` interface in `src/client/composables/useSectionCache.ts`:
  - `get(key: string): CachedPage | null` -- returns cached page or null, updates lastAccess
  - `set(key: string, page: SectionContentPage): void` -- stores page, estimates size, triggers eviction if over ceiling
  - `has(key: string): boolean` -- check without updating lastAccess
  - `evict(): void` -- remove least-recently-accessed entries until under ceiling
  - `clear(): void` -- flush all cached content
  - `stats(): { totalSize: number; entryCount: number; ceiling: number }` -- for debugging/monitoring
- [ ] Define `cacheKey(sectionId, offset, limit)` helper function for consistent key generation
- [ ] Implement `InMemoryLruCache` class implementing `SectionCache`
- [ ] Cache key: `${sectionId}:${offset}:${limit}` for paginated chunks. Full content uses `${sectionId}:0:all`.
- [ ] Size estimation: `lineCount * ESTIMATED_BYTES_PER_LINE` (configurable, default ~200 bytes/line)
- [ ] Memory ceiling: configurable via `createSectionCache({ ceilingBytes })`, default 100 MB
- [ ] LRU eviction: track `lastAccess` timestamp per entry, evict oldest when over ceiling
- [ ] Factory function: `createSectionCache(options?)` returns `SectionCache` -- module-level singleton
- [ ] Composable wrapper: `useSectionCache()` returns the singleton (Vue lifecycle cleanup)
- [ ] Write unit tests: set/get, LRU eviction order, ceiling enforcement, clear, stats, paginated key scheme, `limit=all` key distinction

Files:
- `src/client/composables/useSectionCache.ts` (new)
- `src/client/composables/useSectionCache.test.ts` (new)

Depends on: Stage 1

Considerations:
- Cache key includes offset/limit because paginated chunks are distinct cache entries. A full content entry (`limit=all`) has a distinct key from paginated chunks.
- Must NOT evict section metadata -- only snapshot content. Metadata is tracked separately (in `useSession`).
- The `SectionCache` interface is the pluggable contract. Future IndexedDB or service worker implementations conform to this interface. Consumers never reference the `InMemoryLruCache` class directly.
- The cache must be usable outside Vue component setup (for prefetch from event handlers). Use `createSectionCache()` factory + module-level singleton, similar to `createScheduler()` pattern in the codebase.

---

### Stage 7: Client -- Refactor useSession for Lazy Loading

Goal: Refactor `useSession` composable to use metadata-only fetch + per-section content loading with pagination support.

Owner: frontend-engineer

- [ ] Modify `fetchSession()` to call metadata-only endpoint (`GET /api/sessions/:id`)
- [ ] Remove session-level `snapshot` ref (no longer received from server)
- [ ] Add `fetchSectionContent(sectionId, offset?, limit?)` method -- calls per-section endpoint, integrates with cache
- [ ] Add `fetchAllSectionContent(limit?)` method -- calls bulk endpoint, populates cache per section
- [ ] Integrate with `useSectionCache` -- check cache before network, store after fetch
- [ ] Support ETag-based conditional requests (store ETag per section+chunk, send `If-None-Match`)
- [ ] Add `sectionContent: Ref<Map<string, SnapshotLine[]>>` reactive map for currently-loaded lines per section
- [ ] Add `loadingSections: Ref<Set<string>>` for loading state per section
- [ ] For small sessions (sectionCount <= threshold): call `fetchAllSectionContent('all')` (full content) after metadata
- [ ] For large sessions: fetch visible sections' first pages after metadata
- [ ] Add `fetchNextPage(sectionId)` for progressive loading within large sections
- [ ] Preserve SSE integration for pipeline status updates
- [ ] Update existing tests

Files:
- `src/client/composables/useSession.ts`
- `src/client/composables/useSession.test.ts`
- `src/client/composables/useSession.branches.test.ts`
- `src/client/composables/useSession.sse.test.ts`

Depends on: Stage 5, Stage 6

Considerations:
- The small session passthrough must be invisible to consuming components. `SessionContent.vue` should not need to know whether content was loaded eagerly or lazily.
- ETag storage can be a simple `Map<string, string>` keyed by cache key (same key as `SectionCache`).
- Watch for race conditions: user navigates away while section content is loading. Use AbortController per fetch.
- Pagination state per section: track `{ loadedLines: number, totalLines: number, hasMore: boolean }` to know when to fetch next page.

---

### Stage 8: Client -- Active Section Composable (Scrollspy)

Goal: Build `useActiveSection` composable that tracks which section is currently visible using IntersectionObserver.

Owner: frontend-engineer

- [ ] Create `useActiveSection.ts` composable
- [ ] Accept: ordered section ID list, scroll container ref
- [ ] `observe(sectionId, element)` -- register a section element for observation
- [ ] `unobserve(sectionId)` -- remove an observed element
- [ ] `activeSectionId: Ref<string | null>` -- currently visible section
- [ ] `activeSectionIndex: Ref<number>` -- index in ordered list
- [ ] `scrollToSection(sectionId)` -- smooth scroll to section, respects `prefers-reduced-motion`
- [ ] IntersectionObserver with `rootMargin: '-10% 0px -85% 0px'` for top-biased activation
- [ ] `scrollToSection` must work with TanStack Virtual: use `virtualizer.scrollToIndex()` to bring the target item into range, then fine-tune with `element.scrollIntoView()`
- [ ] Cleanup: disconnect observer on scope dispose
- [ ] Write unit tests using mock IntersectionObserver

Files:
- `src/client/composables/useActiveSection.ts` (new)
- `src/client/composables/useActiveSection.test.ts` (new)

Depends on: none (pure composable, no server dependency)

Considerations:
- The scroll container for IO root must be the OverlayScrollbar's viewport element (exposed via `defineExpose` in Stage 10). Verify OverlayScrollbar exposes this.
- `scrollToSection` must handle virtualized sections (not yet in DOM): use TanStack Virtual's `scrollToIndex()` first, which will cause the item to render, then observe it for scrollspy. The composable needs a reference to the virtualizer instance (injected or passed as parameter).
- This composable is the shared state bridge between SessionContent and SectionNavigator (VISIONBOOK items 1, 3).
- Designed for future keyboard navigation: `nextSection()` and `prevSection()` methods can be added without interface changes.

---

### Stage 9: Client -- Section Navigator Component

Goal: Build the `SectionNavigator.vue` component implementing the approved design with scrollspy integration.

Owner: frontend-engineer

**Visual design reference:** Extract all styles, DOM structure, and visual behavior from `.state/feat-virtual-scrolling/references/approved-design.html`. The approved design defines the navigator's layout, pill styling, popover cards, trace line, active pointer, and scroll behavior. Do not invent visual design -- implement what the file specifies.

- [ ] Create `SectionNavigator.vue` -- monolithic component implementing the approved design:
  - Section count header
  - Vertical pill list with numbered pills (one per section)
  - Vertical trace line connecting pill centers
  - Active pill pointer (tracks `useActiveSection.activeSectionId`)
  - Popover card on pill hover showing section title, type badge, metadata, terminal preview area, and extensibility slots
  - Its own `<OverlayScrollbar>` instance wrapping the pill list
- [ ] Click pill: scroll content view to that section via `useActiveSection.scrollToSection()`
- [ ] Prefetch on pill hover: trigger `useSession.fetchSectionContent` via `useScheduler.after(150ms)` debounce
- [ ] Keyboard navigation: arrow keys to move between pills, Enter to navigate to section
- [ ] ARIA: `role="navigation"`, `aria-label="Section navigator"`, `aria-current` on active pill
- [ ] `prefers-reduced-motion` check for scroll animation
- [ ] Responsive: hidden when the approved design's aside column is collapsed (follows shell layout breakpoints)
- [ ] Pills are data-driven: receive `SectionMetadata` (type, label, lineCount) to support future density encoding (VISIONBOOK item 6)
- [ ] **Extraction trigger:** If `<script>` section exceeds 300 lines, extract sub-components before marking stage complete.
- [ ] Write component tests: pill rendering, active state tracking, click-to-navigate, keyboard nav, ARIA attributes, hover prefetch, popover display

Files:
- `src/client/components/SectionNavigator.vue` (new)

Depends on: Stage 8

Considerations:
- The approved design places the navigator in the shell's aside column. Coordinate with the existing `spatial-shell` layout classes.
- The popover card appears to the left of the hovered pill. It must not clip against the viewport edge. Position logic may need to account for pills near the top or bottom of the list.
- The approved design includes a custom OverlayScrollbar theme for the navigator (narrower track, left-aligned). Extract these overrides from the design file.
- Component receives sections metadata array + `useActiveSection` composable state as props/inject.

---

### Stage 10: Client -- TanStack Virtual Integration

Goal: Integrate `@tanstack/vue-virtual` into the session content rendering with section-level virtualization.

Owner: frontend-engineer

- [ ] Install `@tanstack/vue-virtual` dependency
- [ ] **Update `OverlayScrollbar.vue`**: add `defineExpose({ viewport: viewportRef })` so the virtualizer can access the scroll element
- [ ] **Address OverlayScrollbar MutationObserver thrashing**: the existing `MutationObserver` (line 233) watches `{ childList: true, subtree: true }`. TanStack Virtual constantly mutates the DOM. Either:
  - (a) Wrap the observer callback in `requestAnimationFrame` to debounce (preferred -- simpler, keeps existing behavior for non-virtualized use)
  - (b) Accept a prop `disableMutationObserver` and disconnect when TanStack Virtual is active
  - Document the chosen approach.
- [ ] Create `useSectionVirtualizer.ts` composable wrapping TanStack Virtual's `useVirtualizer`
- [ ] Configure virtualizer:
  - `count`: number of sections
  - `getScrollElement`: OverlayScrollbar viewport element (via exposed ref)
  - `estimateSize`: `(index) => sections[index].lineCount * LINE_HEIGHT_PX + HEADER_HEIGHT_PX`
  - `overscan`: 3 sections
  - `measureElement`: enable dynamic height measurement after render
- [ ] Each virtual item = one section (SectionHeader + section content or placeholder)
- [ ] CSS `content-visibility: auto` + `contain-intrinsic-size` on section content within rendered items
- [ ] Coordinate with `useSession.fetchSectionContent` -- when a virtual item renders, trigger content load if not cached
- [ ] Show skeleton/shimmer placeholder while section content is loading
- [ ] Show height-preserving placeholder for virtualized (off-screen) sections
- [ ] For small sessions (below threshold): skip virtualizer, render all sections in normal flow
- [ ] Wire scroll events to `useActiveSection` -- observe rendered section headers
- [ ] Write unit tests: virtualizer setup, section rendering/removal, content loading triggers

Files:
- `src/client/composables/useSectionVirtualizer.ts` (new)
- `src/client/composables/useSectionVirtualizer.test.ts` (new)
- `src/client/components/OverlayScrollbar.vue` (add `defineExpose`, address MutationObserver)

Depends on: Stage 6, Stage 7

Considerations:
- **Sticky header strategy:** Each virtual item includes both header and content. The header uses `position: sticky; top: 0` within the item wrapper. Since TanStack Virtual uses `position: absolute` + `transform` for item positioning, sticky headers work within each item's bounds (the item acts as the sticky container). z-index must be managed so headers appear above adjacent items' content.
- **Upward scroll stutter mitigation:** (1) Overestimate `estimateSize` per section using actual `lineCount`. (2) Section-level granularity (50-100 items) dramatically reduces measurement errors vs line-level (thousands). (3) Use `shouldAdjustScrollPositionOnItemSizeChange` only for downward scroll.
- **Collapsed sections:** A collapsed section has a known fixed height (header only, ~48px). The virtualizer's `estimateSize` must check fold state and return header height for collapsed sections.
- `measureElement` callback should use `ResizeObserver` (TanStack Virtual does this internally) to update measured heights when sections expand/collapse.
- **MutationObserver fix must not break non-virtualized mode.** The rAF debounce approach is preferred because it works for both cases: virtualized (high mutation frequency, batched) and non-virtualized (low mutation frequency, no perceptible delay).

---

### Stage 11: Client -- Integrate into SessionContent.vue

Goal: Wire all composables and components into `SessionContent.vue` to produce the final experience.

Owner: frontend-engineer

- [ ] Refactor `SessionContent.vue` to use `useSectionVirtualizer` for section rendering
- [ ] Replace eager section rendering loop with TanStack Virtual's virtual item loop
- [ ] Render section content from `useSession.sectionContent` map (not from inline snapshot slicing)
- [ ] For large sections with pagination: render loaded lines, show "loading more..." indicator at bottom when `hasMore`
- [ ] Trigger `fetchNextPage(sectionId)` when user scrolls near bottom of a paginated section
- [ ] Show skeleton/shimmer placeholder for sections that are loading initial content
- [ ] Add `<SectionNavigator>` in the shell's aside column for large sessions
- [ ] Wire `useActiveSection` to both content sections and navigator
- [ ] Wire prefetch on navigator pill hover to `useSession.fetchSectionContent`
- [ ] Preserve all existing behavior: fold state, preamble lines, error banners, empty states
- [ ] Preserve small session passthrough: below threshold, render exactly as today (no navigator, no skeletons, no virtualizer)
- [ ] Update snapshot tests
- [ ] Manual testing: 3-section session (unchanged), 50-section session (virtualized + navigator)

Files:
- `src/client/components/SessionContent.vue`
- `src/client/views/SessionView.vue` (if layout changes needed at view level)

Depends on: Stage 7, Stage 8, Stage 9, Stage 10

Considerations:
- The preamble lines (before first section) are a special case. They should always be rendered and never virtualized. Render them above the virtualizer container.
- `TerminalSnapshot` component receives `lines` prop -- no change needed to this component.
- The `foldState` (collapse/expand) must interact with TanStack Virtual: collapsed sections have fixed height. Notify the virtualizer to re-measure when fold state changes (`virtualizer.measure()`).
- Test the interaction between collapse and virtualization: collapsing/expanding a section should trigger height re-measurement.
- Progressive rendering within large sections: when a section has `hasMore`, show the loaded lines immediately and append new pages as they load. Use an IntersectionObserver sentinel element near the bottom of the section to trigger next-page fetch.
- The navigator occupies the shell aside column. Activation/deactivation of the aside column must coordinate with the shell layout (the approved design overrides the aside column width from `0fr` to `48px`).

---

### Stage 12: End-to-End Performance Validation

Goal: Validate acceptance criteria against a large test session.

Owner: both (backend-engineer + frontend-engineer)

- [ ] Create or generate a test fixture: 50-section, 50,000-line session
- [ ] Measure: time to first section structure visible (target: < 300ms)
- [ ] Measure: time to first terminal content visible (target: < 1 second)
- [ ] Measure: peak DOM node count during navigation (target: < 10,000)
- [ ] Measure: client memory usage (target: < 150 MB)
- [ ] Measure: 304 Not Modified on second section content fetch
- [ ] Test: 3-section session shows no navigator, no skeletons
- [ ] Test: clicking a navigator pill scrolls to the correct section, content appears within 500ms
- [ ] Test: hover prefetch works (content appears instantly after click)
- [ ] Test: keyboard navigation within navigator pills
- [ ] Test: `prefers-reduced-motion` respected in scroll animation
- [ ] Test: pagination -- scrolling into a 5000-line section progressively loads pages
- [ ] Test: bulk endpoint returns first page per section, respects hard cap
- [ ] Test: route registration order (bulk before per-section)
- [ ] Document performance results

Files:
- `fixtures/large-session.cast` (new test fixture, or generated)
- Performance measurement scripts / Playwright tests

Depends on: Stage 11, Stage 2

Considerations:
- Generating a 50k-line .cast fixture may require a script. The existing sample.cast is small.
- DOM node counting: use `document.querySelectorAll('*').length` in a Playwright test.
- Memory measurement: use `performance.memory` (Chrome-only) or Playwright's CDP protocol.

## Dependencies

What must be done before what:

```
Stage 1 (shared types) -----> Stage 3 (per-section endpoint)
                        |---> Stage 5 (metadata endpoint)
                        \---> Stage 6 (section cache)

Stage 2 (migration+denorm) -> Stage 3 (per-section endpoint)
                        |---> Stage 5 (metadata endpoint)

Stage 3 --------------------> Stage 4 (bulk endpoint)

Stage 5 + Stage 6 ----------> Stage 7 (refactor useSession)

Stage 8 (activeSection) ----> Stage 9 (navigator component)

Stage 6 + Stage 7 ----------> Stage 10 (TanStack Virtual integration)

Stage 7 + 8 + 9 + 10 ------> Stage 11 (SessionContent integration)

Stage 11 + Stage 2 ---------> Stage 12 (validation)
```

Parallelizable work (no file overlap):
- Stage 1 and Stage 2 (shared types vs DB migration -- Stage 2 does not depend on Stage 1 for DB schema, only for types used in service code, so they can overlap)
- Stage 6 and Stage 3 (client cache vs server endpoint -- no shared files)
- Stage 6 and Stage 8 (cache composable vs scrollspy composable)
- Stage 8 and Stage 3 (scrollspy vs server endpoint)

Stages that must be sequential:
- Stage 2 before Stages 3, 4, 5 (migration adds columns + denormalization that endpoints depend on)
- Stage 3 before Stage 4 (bulk reuses per-section logic)
- Stage 5 before Stage 7 (client needs metadata endpoint)
- All client stages (7-10) before Stage 11 (integration)

## Progress

Updated by engineers as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | pending | Shared types and constants |
| 2 | pending | DB migration + pipeline denormalization |
| 3 | pending | Per-section content endpoint |
| 4 | pending | Bulk content endpoint |
| 5 | pending | Metadata-only session endpoint |
| 6 | pending | Section cache composable |
| 7 | pending | Refactor useSession |
| 8 | pending | Active section composable |
| 9 | pending | Navigator component |
| 10 | pending | TanStack Virtual integration |
| 11 | pending | SessionContent integration |
| 12 | pending | E2E performance validation |
