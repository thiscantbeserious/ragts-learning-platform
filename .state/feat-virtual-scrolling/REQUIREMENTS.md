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

- [ ] Opening a 50-section, 50,000-line session shows the section navigator and first visible terminal content within 1 second on a standard desktop broadband connection, with no browser tab freeze.
- [ ] The session structure (navigator populated with section labels) is visible within 300 ms, before any terminal content has rendered.
- [ ] At any point during navigation of a large session, the total DOM node count stays below 10,000. Sections outside the active render window are replaced by height-preserving placeholders.
- [ ] Client memory for a 50,000-line session stays below 150 MB (DOM + parsed data + cache) under normal navigation.
- [ ] Terminal snapshot content for a large session is never transferred as a single monolithic payload. The initial session load does not include terminal snapshot data.
- [ ] Requesting an unchanged section's content a second time does not transfer the section body over the network (the server confirms unchanged content without re-sending it).
- [ ] The section navigator aside is visible during session viewing for large sessions and absent for small sessions below the threshold.
- [ ] The active pill in the aside updates as the user scrolls, always reflecting the currently visible section.
- [ ] Clicking any pill navigates to the correct section. Content appears within 500 ms for uncached sections and immediately for prefetched sections.
- [ ] Re-opening a previously viewed session shows previously-loaded section content without new network requests for that content.
- [ ] A session with 3 sections shows no navigator aside, no skeleton states, and no loading waterfall. Behavior is indistinguishable from the current implementation.
- [ ] Virtualization and caching logic is encapsulated; active section state is shared between the content view and the navigator rather than duplicated.
- [ ] Navigator pills and expanded labels are keyboard-navigable. The active pill has a programmatic active indicator readable by assistive technology. Scroll animation respects prefers-reduced-motion.
- [ ] All existing API endpoints other than the session detail route retain their current contract. No existing database columns are removed or renamed.

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
