# Plan: Virtual Scrolling and Section Navigation

References: ADR.md

## Open Questions

Implementation challenges to solve (architect identifies, engineers resolve):

1. **Height measurement for placeholder sections.** When a section is virtualized (DOM removed), its placeholder must preserve scroll height. The virtualizer needs to measure actual rendered height before removing DOM. How to handle sections that have never been rendered (no measured height yet)? Likely use `lineCount * LINE_HEIGHT_PX` as an estimate.
2. **Sticky header interaction with virtualization.** `SectionHeader` uses `position: sticky`. When a section is virtualized and replaced with a placeholder, the sticky header disappears. Should the virtualizer keep the header in the DOM even when content is removed? This would mean virtualizing content separately from headers.
3. **OverlayScrollbar compatibility.** The current scroll container is `<OverlayScrollbar>`. The virtualizer's IntersectionObserver needs a root element. Verify that OverlayScrollbar exposes its scroll container element for IO root binding.
4. **CLI sections vs TUI sections content delivery.** CLI sections reference `startLine/endLine` into the session-level snapshot. With per-section content endpoints, each CLI section's content must be extracted server-side (slice the session snapshot lines) rather than sending the full session snapshot. TUI sections already have their own snapshot. The server must handle both cases in the content endpoint.

## Stages

### Stage 1: Shared Types and API Contract

Goal: Define the new API response types and shared constants used by both server and client.

Owner: backend-engineer

- [ ] Define `SessionMetadataResponse` type in `src/shared/types/api.ts` -- session metadata + section metadata array (no snapshot content)
- [ ] Define `SectionMetadata` type (id, type, label, startEvent, endEvent, startLine, endLine, lineCount) -- no snapshot field
- [ ] Define `SectionContentResponse` type (sectionId, content: TerminalSnapshot, lineCount, contentHash)
- [ ] Define `SMALL_SESSION_THRESHOLD = 5` constant in `src/shared/constants.ts`
- [ ] Add `totalLines` computed field to session metadata type
- [ ] Write unit tests for type guards / validation of new response shapes

Files:
- `src/shared/types/api.ts`
- `src/shared/types/section.ts`
- `src/shared/constants.ts` (new)

Depends on: none

Considerations:
- `SectionMetadata` must include all fields needed by the navigator aside (label, type, lineCount) so the client can render the full navigator from the metadata response alone.
- `contentHash` in `SectionContentResponse` is used as ETag value -- derive from section snapshot content.
- Preserve the existing `Section` type and `SessionDetailResponse` type for backward compatibility during migration. New types are additive.

---

### Stage 2: Server -- Section Content Endpoint

Goal: Add `GET /api/sessions/:id/sections/:sectionId/content` endpoint with ETag caching.

Owner: backend-engineer

- [ ] Add `findById(id: string)` method to `SectionAdapter` interface and `SqliteSectionImpl`
- [ ] Create `SectionContentService` (or extend `SessionService`) with `getSectionContent(sessionId, sectionId)` method
- [ ] For CLI sections: load session snapshot, slice `lines[startLine..endLine]`, wrap in `TerminalSnapshot`
- [ ] For TUI sections: return the section's own snapshot directly
- [ ] Compute content hash (SHA-256 of JSON-stringified snapshot, truncated to 16 hex chars) for ETag
- [ ] Return `ETag` header and support `If-None-Match` for 304 responses
- [ ] Add `Cache-Control: private, max-age=0, must-revalidate` header
- [ ] Register route in session routes file
- [ ] Write integration tests: fetch content, ETag caching (304), section not found (404), session not found (404)

Files:
- `src/server/db/section_adapter.ts` (add `findById` to interface)
- `src/server/db/sqlite/sqlite_section_impl.ts` (implement `findById`)
- `src/server/services/session_service.ts` (add `getSectionContent` method)
- `src/server/routes/sessions.ts` (add route handler)

Depends on: Stage 1

Considerations:
- Edge case: CLI section where session snapshot is null (processing incomplete). Return 404 or empty content with appropriate status.
- The `findById` method already exists as a private prepared statement in `SqliteSectionImpl` -- promote it to the interface.
- Content hash must be stable across server restarts (deterministic JSON serialization). Use `JSON.stringify` which is deterministic for the TerminalSnapshot structure (no Maps, no undefined values in arrays).
- Do NOT load the full `.cast` file for content requests -- only load the session snapshot from DB.

---

### Stage 3: Server -- Metadata-Only Session Endpoint

Goal: Modify `GET /api/sessions/:id` to return metadata without snapshot content.

Owner: backend-engineer

- [ ] Modify `SessionService.getSession()` to return `SessionMetadataResponse` shape
- [ ] Omit session-level `snapshot` from response (this is the multi-MB field)
- [ ] Omit section-level `snapshot` from each section in the response
- [ ] Add `lineCount` to each section in the metadata response (computed from `endLine - startLine` or snapshot line count)
- [ ] Add `totalLines` to session metadata (sum of section line counts)
- [ ] Add `sectionCount` to session metadata
- [ ] Do NOT load the `.cast` file or session snapshot for metadata-only requests
- [ ] Update Typia validation for new response shape
- [ ] Update existing tests for the changed response shape
- [ ] Verify no other client code depends on the old response shape (search for `SessionDetailResponse` usage)

Files:
- `src/server/services/session_service.ts`
- `src/server/routes/sessions.ts`
- `src/shared/types/api.ts` (update `SessionDetailResponse` or replace)

Depends on: Stage 1

Considerations:
- This is a **breaking change** to the session detail endpoint. The client must be updated simultaneously (Stage 5).
- The `.cast` file read and `parseAsciicast` call in `getSession()` currently happen for every request. Removing them for the metadata path is a significant performance win even before any client changes.
- Watch out for: the `content: { header, markers }` field currently derived from `.cast` parsing. Markers are used by the client. Consider: should marker data be part of metadata or a separate endpoint? For now, markers are small and can remain in metadata.

---

### Stage 4: Client -- Section Cache Composable

Goal: Build `useSectionCache` composable for in-memory section content caching with LRU eviction.

Owner: frontend-engineer

- [ ] Create `useSectionCache.ts` composable
- [ ] Cache structure: `Map<string, { content: TerminalSnapshot; sizeEstimate: number; lastAccess: number }>`
- [ ] `get(sectionId)` -- returns cached content or null, updates lastAccess
- [ ] `set(sectionId, content)` -- stores content, estimates size, triggers eviction if over ceiling
- [ ] `has(sectionId)` -- check without updating lastAccess
- [ ] `evict()` -- remove least-recently-accessed entries until under ceiling
- [ ] `clear()` -- flush all cached content
- [ ] Size estimation: `lineCount * ESTIMATED_BYTES_PER_LINE` (configurable, default ~200 bytes/line for typical ANSI content)
- [ ] Memory ceiling: configurable, default 100 MB
- [ ] Singleton pattern -- one cache instance shared across the app
- [ ] Write unit tests: set/get, LRU eviction order, ceiling enforcement, clear

Files:
- `src/client/composables/useSectionCache.ts` (new)
- `src/client/composables/useSectionCache.test.ts` (new)

Depends on: Stage 1

Considerations:
- Cache key is `sectionId` (nanoid, globally unique) -- no need to include sessionId in the key since section IDs are unique across sessions.
- Must NOT evict section metadata -- only snapshot content. Metadata is tracked separately (in `useSession`).
- The cache must be usable outside Vue component setup (for prefetch from event handlers). Use `createSectionCache()` factory + module-level singleton, similar to `createScheduler()` pattern.

---

### Stage 5: Client -- Refactor useSession for Lazy Loading

Goal: Refactor `useSession` composable to use metadata-only fetch + per-section content loading.

Owner: frontend-engineer

- [ ] Modify `fetchSession()` to call metadata-only endpoint
- [ ] Remove session-level `snapshot` ref (no longer received from server)
- [ ] Add `fetchSectionContent(sectionId)` method that calls the per-section content endpoint
- [ ] Integrate with `useSectionCache` -- check cache before network, store after fetch
- [ ] Support ETag-based conditional requests (store ETag per section, send `If-None-Match`)
- [ ] Add `sectionContent: Ref<Map<string, TerminalSnapshot>>` reactive map for currently-loaded content
- [ ] Add `loadingSections: Ref<Set<string>>` for loading state per section
- [ ] For small sessions (sectionCount <= threshold): eagerly fetch all section content in parallel after metadata
- [ ] Preserve SSE integration for pipeline status updates
- [ ] Update existing tests

Files:
- `src/client/composables/useSession.ts`
- `src/client/composables/useSession.test.ts`
- `src/client/composables/useSession.branches.test.ts`
- `src/client/composables/useSession.sse.test.ts`

Depends on: Stage 3, Stage 4

Considerations:
- The small session passthrough must be invisible to consuming components. `SessionContent.vue` should not need to know whether content was loaded eagerly or lazily.
- ETag storage can be a simple `Map<string, string>` alongside the content cache.
- Watch for race conditions: user navigates away while section content is loading. Use AbortController per fetch.

---

### Stage 6: Client -- Active Section Composable (Scrollspy)

Goal: Build `useActiveSection` composable that tracks which section is currently visible using IntersectionObserver.

Owner: frontend-engineer

- [ ] Create `useActiveSection.ts` composable
- [ ] Accept: ordered section ID list, scroll container ref
- [ ] `observe(sectionId, element)` -- register a section header element for observation
- [ ] `unobserve(sectionId)` -- remove an observed element
- [ ] `activeSectionId: Ref<string | null>` -- currently visible section
- [ ] `activeSectionIndex: Ref<number>` -- index in ordered list
- [ ] `scrollToSection(sectionId)` -- smooth scroll to section, respects `prefers-reduced-motion`
- [ ] IntersectionObserver with `rootMargin: '-10% 0px -85% 0px'` for top-biased activation
- [ ] Cleanup: disconnect observer on scope dispose
- [ ] Write unit tests using mock IntersectionObserver

Files:
- `src/client/composables/useActiveSection.ts` (new)
- `src/client/composables/useActiveSection.test.ts` (new)

Depends on: none (pure composable, no server dependency)

Considerations:
- The scroll container for IO root must be the OverlayScrollbar's viewport element, not `document`. Check how OverlayScrollbar exposes this.
- `scrollToSection` must handle the case where the target section is virtualized (not in DOM). It should: (1) trigger content load, (2) wait for DOM insertion, (3) then scroll. This creates a dependency on the virtualizer (Stage 8) but the API can be defined now and wired later.
- This composable is the shared state bridge between SessionContent and SectionNavigator (VISIONBOOK items 1, 3).

---

### Stage 7: Client -- Section Navigator Aside

Goal: Build the section navigator aside with pill grid, expand panel, and scrollspy integration.

Owner: frontend-engineer

- [ ] Create `SectionNavigatorAside.vue` -- layout shell with responsive show/hide (hidden below threshold)
- [ ] Create `SectionPillGrid.vue` -- compact grid of section pills
- [ ] Create `SectionExpandPanel.vue` -- expanded panel with full section labels, triggered by pill click
- [ ] Pills show truncated label or section number
- [ ] Active pill highlighted via `useActiveSection.activeSectionId`
- [ ] Click pill: expand panel with full labels OR scroll to section (design decision in implementation)
- [ ] Hover pill: trigger prefetch of section content via `useSession.fetchSectionContent`
- [ ] Prefetch uses `useScheduler.after(150ms)` to debounce rapid hover sweeps
- [ ] Keyboard navigation: arrow keys within pill grid, Enter to navigate
- [ ] ARIA: `role="navigation"`, `aria-label="Section navigator"`, `aria-current` on active pill
- [ ] `prefers-reduced-motion` check for scroll animation
- [ ] Write component tests: pill rendering, active state, click navigation, keyboard nav, ARIA attributes

Files:
- `src/client/components/SectionNavigatorAside.vue` (new)
- `src/client/components/SectionPillGrid.vue` (new)
- `src/client/components/SectionExpandPanel.vue` (new)

Depends on: Stage 6

Considerations:
- Pill grid layout: CSS Grid with `auto-fill` columns. Column count adapts to aside width. Target: 4-6 columns for a 200px-wide aside.
- Expand panel animates leftward from the aside. Use CSS transform for animation. The panel overlaps the main content area (absolute positioned relative to aside).
- The aside consumes screen width. On screens < 1024px, the aside should be hidden or collapsed to an icon. Use `useLayout` breakpoints if available.
- Pills must be data-driven (receive `SectionMetadata` props: type, label, lineCount) to support future density encoding (VISIONBOOK item 6).

---

### Stage 8: Client -- Section Virtualizer Composable

Goal: Build `useSectionVirtualizer` composable that manages DOM virtualization of sections based on viewport proximity.

Owner: frontend-engineer

- [ ] Create `useSectionVirtualizer.ts` composable
- [ ] Accept: ordered section list, scroll container ref, content loaded state per section
- [ ] Track measured heights per section (`Map<string, number>`)
- [ ] `measureSection(sectionId, element)` -- record actual rendered height
- [ ] `estimateHeight(sectionId, lineCount)` -- fallback estimate (lineCount * LINE_HEIGHT + HEADER_HEIGHT)
- [ ] IntersectionObserver (separate from scrollspy) with generous rootMargin (e.g., `200% 0px`) to detect sections approaching viewport
- [ ] `virtualizedSections: Ref<Set<string>>` -- sections whose content should be replaced with placeholders
- [ ] Sections entering the extended viewport: trigger content load (if not cached) + un-virtualize
- [ ] Sections leaving the extended viewport (far from view): virtualize (replace content with height placeholder)
- [ ] Keep section headers always in DOM (only virtualize content, not headers) -- solves sticky header problem
- [ ] CSS `content-visibility: auto` applied to all section content containers as layer 1
- [ ] Write unit tests: virtualization state transitions, height estimation, measured height caching

Files:
- `src/client/composables/useSectionVirtualizer.ts` (new)
- `src/client/composables/useSectionVirtualizer.test.ts` (new)

Depends on: Stage 4, Stage 5

Considerations:
- **Critical design choice:** Keep headers always in DOM, only virtualize content. This preserves sticky header behavior and provides scroll position anchors. A virtualized section renders as: `<SectionHeader /> + <div class="section-placeholder" style="height: Xpx" />`. An active section renders as: `<SectionHeader /> + <div class="section-content" style="content-visibility: auto; contain-intrinsic-size: auto Xpx"> ... lines ... </div>`.
- The virtualizer must coordinate with `useSession.fetchSectionContent` -- when a section enters the viewport zone, content must be loaded before it can be rendered. Show a skeleton/shimmer while loading.
- Rapid scrolling: sections may flash through the viewport zone faster than content loads. Use a loading queue with priority (closest to viewport first). Cancel loads for sections that left the zone before completing.
- For small sessions (below threshold): the virtualizer is a no-op (all sections active, none virtualized).

---

### Stage 9: Client -- Integrate into SessionContent.vue

Goal: Wire all composables and components into `SessionContent.vue` to produce the final experience.

Owner: frontend-engineer

- [ ] Refactor `SessionContent.vue` to use `useSectionVirtualizer` for section rendering
- [ ] Replace eager section rendering loop with virtualization-aware loop
- [ ] Render section content from `useSession.sectionContent` map (not from inline snapshot slicing)
- [ ] Show skeleton/shimmer placeholder for sections that are loading content
- [ ] Show height-preserving empty div for virtualized sections
- [ ] Add `<SectionNavigatorAside>` adjacent to the scroll container for large sessions
- [ ] Layout: flexbox row with content area + aside. Aside only rendered when sectionCount > threshold.
- [ ] Wire `useActiveSection` to both content sections and navigator aside
- [ ] Wire prefetch on pill hover to `useSession.fetchSectionContent`
- [ ] Preserve all existing behavior: fold state, preamble lines, error banners, empty states
- [ ] Preserve small session passthrough: below threshold, render exactly as today (no aside, no skeletons)
- [ ] Update snapshot tests
- [ ] Manual testing: 3-section session (unchanged), 50-section session (virtualized + navigator)

Files:
- `src/client/components/SessionContent.vue`
- `src/client/views/SessionView.vue` (if layout changes needed at view level)

Depends on: Stage 5, Stage 6, Stage 7, Stage 8

Considerations:
- The preamble lines (before first section) are a special case. They should always be rendered and never virtualized.
- `TerminalSnapshot` component receives `lines` prop -- no change needed to this component.
- The `foldState` (collapse/expand) must interact with virtualization: a collapsed section has a known fixed height (header only), so the virtualizer should use that instead of the measured content height.
- Test the interaction between collapse and virtualization: collapsing a virtualized section should update the placeholder height to header-only height.

---

### Stage 10: Server -- Database Migration for Metadata Fields

Goal: Add computed metadata columns to support efficient metadata-only queries.

Owner: backend-engineer

- [ ] Create migration `005_section_metadata.ts`
- [ ] Add `line_count INTEGER` column to `sections` table (nullable, computed on insert/update)
- [ ] Add `content_hash TEXT` column to `sections` table (nullable, computed on insert/update)
- [ ] Backfill existing sections: compute `line_count` from `end_line - start_line` or snapshot line count
- [ ] Backfill `content_hash` from existing snapshot content
- [ ] Update `SectionAdapter` interface with new fields in `SectionRow`
- [ ] Update `completeProcessing` in session adapter to compute and store these fields during pipeline
- [ ] Write migration tests

Files:
- `src/server/db/sqlite/migrations/005_section_metadata.ts` (new)
- `src/server/db/section_adapter.ts`
- `src/server/db/sqlite/sqlite_section_impl.ts`
- `src/server/db/sqlite/sqlite_session_impl.ts` (update `completeProcessing`)

Depends on: none (can run in parallel with client stages)

Considerations:
- `content_hash` precomputation avoids recomputing SHA-256 on every content request. The hash is computed once during pipeline processing and stored.
- `line_count` precomputation avoids loading snapshot JSON just to count lines for the metadata response.
- Migration must be idempotent (check column existence before ALTER).
- For sections with `snapshot` = null (empty sections), `content_hash` should be a known sentinel value.

---

### Stage 11: End-to-End Performance Validation

Goal: Validate acceptance criteria against a large test session.

Owner: both (backend-engineer + frontend-engineer)

- [ ] Create or generate a test fixture: 50-section, 50,000-line session
- [ ] Measure: time to first section structure visible (target: < 300ms)
- [ ] Measure: time to first terminal content visible (target: < 1 second)
- [ ] Measure: peak DOM node count during navigation (target: < 10,000)
- [ ] Measure: client memory usage (target: < 150 MB)
- [ ] Measure: 304 Not Modified on second section content fetch
- [ ] Test: 3-section session shows no navigator, no skeletons
- [ ] Test: pill click navigates to correct section, content appears within 500ms
- [ ] Test: hover prefetch works (content appears instantly after click)
- [ ] Test: keyboard navigation of pill grid
- [ ] Test: `prefers-reduced-motion` respected in scroll animation
- [ ] Document performance results

Files:
- `fixtures/large-session.cast` (new test fixture, or generated)
- Performance measurement scripts / Playwright tests

Depends on: Stage 9, Stage 10

Considerations:
- Generating a 50k-line .cast fixture may require a script. The existing sample.cast is small.
- DOM node counting: use `document.querySelectorAll('*').length` in a Playwright test.
- Memory measurement: use `performance.memory` (Chrome-only) or Playwright's CDP protocol.

## Dependencies

What must be done before what:

```
Stage 1 (shared types) -----> Stage 2 (section content endpoint)
                       \----> Stage 3 (metadata endpoint)
                        \---> Stage 4 (section cache composable)

Stage 3 + Stage 4 ---------> Stage 5 (refactor useSession)

Stage 6 (activeSection) ---> Stage 7 (navigator aside)

Stage 4 + Stage 5 ---------> Stage 8 (virtualizer composable)

Stage 5 + 6 + 7 + 8 -------> Stage 9 (integration)

Stage 10 (migration) -------> runs parallel to Stages 4-9

Stage 9 + Stage 10 ---------> Stage 11 (validation)
```

Parallelizable pairs (no file overlap):
- Stage 2 and Stage 4 (server endpoint vs client cache)
- Stage 2 and Stage 6 (server endpoint vs client scrollspy)
- Stage 3 and Stage 4 (server metadata vs client cache)
- Stage 6 and Stage 8 (scrollspy vs virtualizer -- different composables, but Stage 8 depends on Stage 4/5)
- Stage 10 (migration) runs parallel to all client stages (4-9)

## Progress

Updated by engineers as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 1 | pending | Shared types and constants |
| 2 | pending | Section content endpoint |
| 3 | pending | Metadata-only session endpoint |
| 4 | pending | Section cache composable |
| 5 | pending | Refactor useSession |
| 6 | pending | Active section composable |
| 7 | pending | Navigator aside components |
| 8 | pending | Virtualizer composable |
| 9 | pending | SessionContent integration |
| 10 | pending | Database migration |
| 11 | pending | E2E performance validation |
