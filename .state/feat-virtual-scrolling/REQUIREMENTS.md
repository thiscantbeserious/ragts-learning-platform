# Requirements: Virtual Scrolling and Section Navigation

## Problem Statement

Opening a large agent session (50,000+ lines across 50+ sections) transfers the entire session payload in a single response, blocks the main thread during parsing, and creates hundreds of thousands of DOM nodes — enough to freeze or crash the browser tab. Once loaded, there is no spatial orientation: no overview, no jump-to capability, and a scroll bar so compressed it is useless. Users are trapped in an undifferentiated wall of output with no sense of structure or position.

## Desired Outcome

Large agent sessions feel fast and navigable at any scale. The user sees session structure and first content within one second without waiting for the full payload. A persistent section navigator gives them a spatial map and lets them jump to any section in one click. Previously-viewed sections reload from cache without a network round-trip. Small sessions (under 5 sections) behave identically to today.

## Scope

### In Scope

**Server — content delivery**

- Session metadata (section labels, counts, types, line ranges) is available separately from terminal snapshot content. The two concerns are delivered independently.
- Terminal snapshot content is delivered per-section, on demand.
- Per-section responses are cacheable so that clients and reverse proxies can avoid redundant transfers when content has not changed.
- Sections with very large line counts deliver content progressively so the initial response is bounded in size regardless of section length.

**Client — rendering performance**

- Sections far outside the viewport do not contribute DOM nodes. The total DOM node count is bounded regardless of session length.
- For large sections, content renders progressively as the user scrolls into it. Normal reading speed does not outpace the render.

**Client — section navigator aside**

- A persistent right-side aside appears for sessions above a section-count threshold.
- The aside shows section pills in a compact grid. The currently visible section is always highlighted without user interaction.
- Clicking a pill scrolls the viewport to that section. Hovering over a pill prefetches its content so the subsequent click renders instantly.
- Clicking a pill expands a panel revealing full section labels for one-click navigation.
- The aside is keyboard-navigable and meets WCAG 2.1 AA requirements: appropriate ARIA roles, focus management, and active-state indicators that do not rely on color alone.
- Scroll-to-section animation respects the user's reduced-motion preference.
- On mobile, the performance improvements still apply; the aside may simplify or collapse.

**Client — caching**

- Section content fetched during a session view is retained in a client-side cache. Re-visiting the same session does not re-fetch already-loaded sections.
- The cache has a documented memory ceiling. When pressure is high, section content is evicted and re-fetches transparently on next access. Section metadata is never evicted.

**Small session passthrough**

- Sessions below the section-count threshold render with no new UI surfaces, no loading states, and no virtualization overhead. The experience is identical to today.

### Out of Scope

- Custom in-app search replacing browser Cmd+F for virtualized content
- Section-level URL deep linking — deferred; architecture must not prevent it
- Keyboard shortcuts to jump between sections — deferred; architecture must not prevent it
- Session size indicators in the session list — deferred
- Progressive section summaries in navigator pills — deferred; schema should accommodate a preview field
- Section density encoding in pills — deferred; pill appearance must be data-driven
- Streaming or real-time session support — deferred
- Offline support and service worker caching — deferred; cache key design must be compatible
- Line-level virtual scrolling within individual sections — deferred; content format must not prevent it
- Section grouping hierarchy, fuzzy search, or command palette in the navigator — deferred

## Acceptance Criteria

### Load Performance
- [ ] AC-1: First section header visible within 600ms of navigation (metadata-first load)
- [ ] AC-2: First terminal content visible within 700ms
- [ ] AC-3: Initial DOM node count under 2,500 on page load (before scrolling)
- [ ] AC-4: Metadata response under 50KB for a 50-section session (no snapshot content)

### Scroll Performance
- [ ] AC-5: Peak DOM node count stays under 10,000 at any scroll position
- [ ] AC-6: Average DOM node count during full scroll-through stays under 6,000
- [ ] AC-7: scrollHeight does not change by more than 1% during scroll at any point (no oscillation)
- [ ] AC-8: No scroll direction reversals caused by virtualizer remeasurement (0 direction changes in automated scroll test)
- [ ] AC-9: Rendered sections stay between 3-8 at any scroll position (overscan working)

### Memory
- [ ] AC-10: Heap memory stays under 80MB during full session navigation
- [ ] AC-11: Section cache evicts content when ceiling (32MB default) is exceeded

### Navigation
- [ ] AC-12: Clicking a pill scrolls to the correct section within 500ms for uncached, instantly for cached
- [ ] AC-13: Scrollspy active pill updates correctly through every section when scrolling (no skips except for sections smaller than one wheel-scroll increment)
- [ ] AC-14: Sticky header appears when real header scrolls above viewport, disappears when scrolling back
- [ ] AC-15: Sticky header does NOT cause scrollHeight changes (positioned outside scroll container)

### Network
- [ ] AC-16: Initial session load does not include terminal snapshot data
- [ ] AC-17: Second request for same section returns 304 Not Modified (ETag match)
- [ ] AC-18: Small sessions (< 5 sections) load in a single bulk request

### Behavioral
- [ ] AC-19: Navigator visible for large sessions (>= 5 sections), absent for small
- [ ] AC-20: Small sessions render identically to main (no navigator, no skeletons, no virtualizer)
- [ ] AC-21: 0-section sessions show fallback banners (error/info) with full snapshot if available
- [ ] AC-22: Line numbers continue from section position in session (not reset to 1 per section)

### Architecture
- [ ] AC-23: Virtualization and caching in composables, not spread across templates
- [ ] AC-24: Active section state shared between content and navigator
- [ ] AC-25: Navigator keyboard-navigable with ARIA roles
- [ ] AC-26: No existing API endpoints broken (except session detail route, intentional)

## Constraints

- **Full-stack scope.** Changes are within `src/client/`, `src/server/`, and `src/shared/`. The WASM package at `packages/vt-wasm/` is unchanged.
- **Design system.** New surfaces (aside, pills, expand panel, placeholders) use existing TRON/cyberpunk design tokens and visual language. No external component libraries that conflict with the design system.
- **No breaking schema changes.** Existing `sessions` and `sections` table columns are preserved. New nullable columns may be added via migration.
- **Database adapter pattern.** New queries go through the existing adapter interfaces.
- **Session detail route contract change.** Separating metadata from snapshot content is an intentional breaking change to `GET /api/sessions/:id`. All other existing routes are unchanged.

## Context

### Codebase State

- `SessionContent.vue` renders all sections in a single scrollable container with no virtualization today.
- `SectionHeader.vue` uses sticky positioning with collapse/expand — this behavior must be preserved.
- The `sections` table is already separate from `sessions` and indexed by `session_id`. The data model already supports per-section content delivery without schema rework.

### VISIONBOOK Compatibility (Hard Requirement)

The architect must ensure that endpoint design, content format, and component interfaces do not foreclose the nine deferred items documented in `.state/feat-virtual-scrolling/VISIONBOOK.md`. An ADR that closes off any of these items is not acceptable without explicit user sign-off. In particular:

- Section identifiers must be stable and URL-safe (deep linking depends on this).
- Per-section content format must preserve line-level addressability (search and future line-level virtualization depend on this).
- Active section state must be accessible to future composables without architectural rework (keyboard navigation depends on this).
- Cache key design must be compatible with a future service worker backing store.
- Caching and virtualization assumptions about immutable content must not be applied globally — a future live-session mode must be designable as a bypass.
- Pill appearance must be driven by data (section type, line count) so density encoding can be added without component refactoring.

---
**Sign-off:** Pending
