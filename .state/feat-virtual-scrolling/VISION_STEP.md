# Vision: Session Performance and Section Navigation

> Transform session viewing from a brute-force document dump into a responsive, navigable experience — where large sessions feel as fast and oriented as small ones.

## Core Intent

The user is solving two problems that look separate but are deeply entangled: **rendering performance** and **spatial orientation**.

A session with 50 sections and thousands of terminal lines is not just slow to load — it is disorienting. The user scrolls through a wall of output with no sense of position, no overview, and no way to jump. The performance problem makes the orientation problem worse (everything renders, so the scroll bar is meaningless), and the orientation problem makes the performance problem worse (without navigation, users scroll through everything, touching all those DOM nodes).

The real goal is not "make it faster" or "add a sidebar." It is: **make large sessions feel manageable.** The user should never feel lost, never wait for content, and never wonder "where am I in this session?"

## Current State

**What exists:**
- `SessionContent.vue` renders all sections inside a single `<OverlayScrollbar>` container
- `TerminalSnapshot.vue` creates per-line divs with styled spans (ANSI colors pre-rendered via WASM)
- `SectionHeader.vue` already has sticky positioning with collapse/expand
- Sections have structural metadata (`startLine/endLine` for CLI, per-section `snapshot` for TUI)
- Backend stores sections in a separate `sections` table indexed on `session_id` — the schema already supports lazy fetching

**The gap:**
- `GET /api/sessions/:id` returns everything in one response (1-5 MB JSON). No per-section endpoints, no pagination, no cache headers
- Every line in every section is mounted to the DOM eagerly. A 1000-line session creates 5000+ DOM nodes on first paint
- No virtualization, no `content-visibility`, no intersection observers
- Section navigation is limited to sticky headers while scrolling — no overview, no jump-to capability
- No client-side caching — navigating away and back refetches the entire payload

A session with 3 sections loads fine. A session with 50 sections and 5000 lines is sluggish, scroll-heavy, and spatially opaque.

## Design Direction

**Visual language:** The existing TRON/cyberpunk aesthetic — dark backgrounds, neon accent glows, sharp geometry — should extend to the new navigation surface. Section pills should feel like nodes on a circuit board, not buttons on a form.

**Interaction tone:** The section navigator should feel like a **heads-up display** — a persistent spatial map that the user glances at for orientation, not a menu they open to make a choice. It should convey "you are here" at all times.

**Emotional target:** The user should feel **oriented and in control.** Even a 50-section session should feel like a space they can survey and traverse, not a document they are trapped inside of.

**Progressive disclosure:** Small sessions (3-5 sections) should feel unchanged — no new UI overhead. The section navigator earns its screen real estate only as session complexity grows. The performance optimizations (lazy loading, containment) should be invisible — the session just feels fast.

## Key Interactions

### 1. Arriving at a Large Session

The user opens a session with 40+ sections. Instead of waiting for a multi-megabyte payload and thousands of DOM nodes, the page loads with session metadata and the first visible sections. Content appears almost immediately. The scroll bar reflects the full session length, but only the visible viewport has rendered DOM nodes. The user feels no delay.

On the right edge, a compact column of pill-shaped indicators appears — one per section, arranged in a batched grid that adapts to the viewport height. The pills provide an instant visual survey: "this session has ~45 sections, I am at the top."

### 2. Surveying the Session (The Aside)

The right-side aside shows section pills in a dense grid — say 5 columns by 10 rows for a 50-section session, adapting to available vertical space. Each pill is small but distinct, perhaps showing a truncated label or just a number. The currently visible section(s) are highlighted.

Clicking any pill expands the aside leftward as an overflow panel — not a dropdown, not a modal, but a beautiful extension that reveals full section labels. The panel feels like the pills are unfolding to show their contents. From here, the user clicks a section label and the content scrolls smoothly to that section.

### 3. Hovering to Prefetch

As the user hovers over a section pill (or expanded label), the client begins prefetching that section's content from the server. By the time the user clicks and the viewport scrolls to that section, the data is already cached and the terminal output renders instantly. The user never sees a loading spinner when navigating via the aside.

### 4. Scrolling Through Content

As the user scrolls naturally through the session, two things happen in concert:
- The section pills in the aside track the current position — the active pill shifts, giving constant spatial awareness (scrollspy behavior via IntersectionObserver)
- Sections outside the viewport are performance-managed: CSS `content-visibility: auto` keeps them in the DOM (preserving Cmd+F search) but skips their rendering cost. The browser does the heavy lifting with zero JavaScript

The user never notices any of this. Scrolling just feels smooth, and the aside always tells them where they are.

### 5. Re-visiting a Session

The user navigates away and comes back to the same session. Instead of a full refetch, cached data serves the session instantly. Section content that was previously fetched is still available. The experience is near-instant on return visits.

## Opportunities

**1. Section-level deep linking.** If every section has a stable URL fragment (e.g., `#section-12`), users can share links to specific parts of a session. This is especially valuable for team review of agent sessions — "look at what happened in section 23." This falls naturally out of the scroll-to-section interaction.

**2. Section density as a signal.** The pill grid inherently communicates session shape — a session with 5 pills looks different from one with 50. This could be extended: pills could encode section type (CLI vs TUI), duration, or error presence through color or shape. The aside becomes not just navigation but a session fingerprint.

**3. Keyboard navigation.** Once sections are individually addressable, adding `j/k` or arrow-key navigation between sections is trivial and high-value for power users reviewing many sessions.

## Constraints

- **Existing design system:** TRON/cyberpunk tokens, color palette, and component patterns must be respected. The aside and pills are new surfaces but must feel native.
- **Existing backend schema:** Sections are already in a separate table indexed by `session_id`. New endpoints can be added but the data model is fixed.
- **WASM pre-rendering:** Terminal output is pre-rendered to styled spans via the `vt-wasm` package. This pipeline is not changing — the vision works with its output, not around it.
- **Cmd+F compatibility:** Users expect browser-native find-in-page to work across the session. Any virtualization strategy must account for this — pure virtual scrolling that removes DOM nodes breaks Cmd+F. The CSS `content-visibility: auto` approach preserves it.
- **Mobile is secondary:** The aside navigator is a desktop-first surface. On mobile, the performance improvements (lazy loading, containment) still apply, but the aside may collapse or simplify.
- **Small sessions must not regress:** A 3-section session should feel identical to today. No new UI clutter, no loading waterfalls, no visible skeleton states for content that would have loaded instantly anyway.

## Out of Scope

- **Line-level virtualization** — virtualizing individual lines within a section introduces variable-height complexity and Cmd+F breakage. Section-level containment is sufficient for this cycle.
- **Streaming/real-time sessions** — this vision addresses recorded, complete sessions. Live-updating sessions are a separate problem.
- **Search within sessions** — while Cmd+F must not break, a custom in-app search (with highlighting, filtering) is a separate feature.
- **Section reordering or editing** — sections are read-only playback.
- **Offline support** — caching improves re-navigation speed but full offline capability is deferred.

## Success Criteria

- **A 50-section session loads its first visible content in under 1 second**, regardless of total session size. The user sees terminal output before the full payload has arrived.
- **DOM node count for a 50-section session stays under 2000 on initial render**, compared to 5000+ today. Nodes are created as sections enter the viewport.
- **The user can identify their current position in a large session at a glance**, without scrolling, via the aside navigator.
- **Navigating to any section in a 50-section session takes one click** from the aside, with no loading delay (prefetch on hover).
- **Cmd+F finds text across all sections**, even those outside the current viewport. Browser-native search is not broken.
- **Re-visiting a previously viewed session shows content instantly** from cache, with no full refetch.
- **A 3-section session looks and behaves identically to today** — no new UI surfaces appear, no performance overhead is introduced.

---
**Sign-off:** Pending
