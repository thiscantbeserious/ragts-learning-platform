# Vision: Session Performance and Section Navigation

> Transform session viewing from a brute-force document dump into a responsive, navigable experience -- where sessions with 50,000+ lines feel as fast and oriented as sessions with 50.

## Core Intent

The user is solving two problems that look separate but are deeply entangled: **rendering performance** and **spatial orientation**.

A session with 50 sections and 50,000+ terminal lines is not just slow to load -- it is disorienting. The user scrolls through a wall of output with no sense of position, no overview, and no way to jump. The performance problem makes the orientation problem worse (everything renders, so the scroll bar is meaningless), and the orientation problem makes the performance problem worse (without navigation, users scroll through everything, touching all those DOM nodes).

The real goal is not "make it faster" or "add a sidebar." It is: **make large sessions feel manageable.** The user should never feel lost, never wait for content, and never wonder "where am I in this session?"

### The Scale Problem

The original framing assumed sessions of "thousands of lines." Real-world agent sessions routinely exceed **50,000 lines**. At this scale, the problem is qualitatively different:

- **DOM pressure:** 50,000 lines with ~5 styled spans per line = **250,000+ DOM nodes**. Even with CSS `content-visibility: auto` skipping paint, those nodes still exist in the DOM tree, consuming memory and making page load, style recalculation, and DOM queries expensive. CSS containment reduces rendering cost but does not reduce memory cost.
- **Payload size:** The JSON response for a 50k-line session is **10-50 MB**. Serializing this on the server, transmitting it over the wire, and parsing it in the client are each independently slow. A single `JSON.parse()` call on a 30 MB string blocks the main thread for hundreds of milliseconds.
- **Memory budget:** 50 MB of parsed JSON objects in the client's heap is significant -- on mobile devices with 3-4 GB total RAM and per-tab memory limits, this approaches dangerous territory. Multiple tabs or sessions compound the problem.
- **Scrollbar fidelity:** A 50,000-line session at ~21px per line is over 1 million pixels of virtual height. The scrollbar thumb becomes a thin sliver, making positional scrolling imprecise and disorienting.

CSS `content-visibility: auto` alone does not solve this. It is a rendering optimization, not a memory optimization. At 50k lines, the vision must embrace **true virtualization** -- removing DOM nodes entirely when they are not near the viewport -- combined with **server-side content delivery changes** that avoid sending the entire session in one payload.

## Current State

**What exists:**
- `SessionContent.vue` renders all sections inside a single `<OverlayScrollbar>` container
- `TerminalSnapshot.vue` creates per-line divs with styled spans (ANSI colors pre-rendered via WASM)
- `SectionHeader.vue` already has sticky positioning with collapse/expand
- Sections have structural metadata (`startLine/endLine` for CLI, per-section `snapshot` for TUI)
- Backend stores sections in a separate `sections` table indexed on `session_id` -- the schema already supports lazy fetching

**The gap:**
- `GET /api/sessions/:id` returns everything in one response (10-50 MB JSON for extreme sessions). No per-section endpoints, no streaming, no pagination within sections, no cache headers
- Every line in every section is mounted to the DOM eagerly. A 50k-line session creates 250,000+ DOM nodes on first paint -- enough to freeze the browser tab for multiple seconds or crash it entirely
- No virtualization, no `content-visibility`, no intersection observers
- Section navigation is limited to sticky headers while scrolling -- no overview, no jump-to capability
- No client-side caching -- navigating away and back refetches the entire multi-megabyte payload
- No awareness of session size before loading -- a 3-section session and a 500-section session both trigger the same monolithic fetch

## Design Direction

**Visual language:** The existing TRON/cyberpunk aesthetic -- dark backgrounds, neon accent glows, sharp geometry -- should extend to the new navigation surface. Section pills should feel like nodes on a circuit board, not buttons on a form.

**Interaction tone:** The section navigator should feel like a **heads-up display** -- a persistent spatial map that the user glances at for orientation, not a menu they open to make a choice. It should convey "you are here" at all times.

**Emotional target:** The user should feel **oriented and in control.** Even a 50,000-line session should feel like a space they can survey and traverse, not a document they are trapped inside of. The session should feel finite, structured, and navigable -- never endless.

**Progressive disclosure:** Small sessions (3-5 sections, under 500 lines) should feel unchanged -- no new UI overhead. The section navigator earns its screen real estate only as session complexity grows. The performance optimizations should be invisible -- the session just feels fast.

**Layered performance strategy:** The performance approach is not one technique but a cascade of four layers, each addressing a different scale threshold:

1. **CSS containment** (`content-visibility: auto`) -- for sections that are in the DOM but off-screen. Eliminates rendering cost. Effective for sessions up to ~5,000 lines where DOM node count is tolerable.
2. **Section-level virtualization** -- sections far from the viewport have their DOM nodes removed entirely, replaced by height placeholders. Keeps the working DOM to a bounded size regardless of session length. Effective for sessions with many sections of moderate size.
3. **Line-level chunking within large sections** -- a single section with 5,000+ lines is itself a performance problem. Such sections need their content delivered and rendered in chunks (e.g., 200 lines at a time), with the remainder loaded on demand as the user scrolls into the section. This is not line-level virtual scrolling (which would break Cmd+F) -- it is progressive rendering of section content.
4. **Server-side content delivery** -- the server must not serialize the entire session into one JSON blob. Section metadata (labels, line counts, types) is delivered upfront. Section content is fetched on demand, streamed for large sections, and cacheable per-section with ETags or content hashes.

These layers compose: a session loads metadata first (layer 4), renders only nearby sections (layer 2), skips paint for off-screen content within rendered sections (layer 1), and progressively fills in oversized sections as the user scrolls into them (layer 3).

## Key Interactions

### 1. Arriving at a Large Session

The user opens a session with 50,000+ lines across 40+ sections. The experience unfolds in stages, but each stage is fast enough that the user perceives one smooth load:

**First (instant):** The page shows the session header, the section navigator aside (populated from metadata), and skeleton placeholders for content. The user sees the session's structure immediately -- "this session has 47 sections" -- before any terminal content has loaded. The scroll bar is visible and reflects the estimated full session height.

**Second (within 500ms):** The first few visible sections' content loads and renders. Terminal output appears. The user can begin reading. Above and below the visible sections, placeholder blocks hold space for content not yet loaded.

**Third (in the background):** As the user reads or scrolls, nearby sections prefetch their content. Sections far from the viewport remain as lightweight placeholders -- no DOM nodes for their terminal lines exist at all.

The scroll bar at this scale is inherently imprecise (the thumb is tiny for a million-pixel document), but the section navigator aside compensates: the dense pill grid provides the spatial overview that the scroll bar cannot. The pills convey not just position but density -- sections with thousands of lines occupy proportionally more visual weight in the grid, giving the user an intuitive feel for where the "heavy" parts of the session live.

### 2. Surveying the Session (The Aside)

The right-side aside shows section pills in a dense grid -- say 5 columns by 10 rows for a 50-section session, adapting to available vertical space. Each pill is small but distinct, perhaps showing a truncated label or just a number. The currently visible section(s) are highlighted.

For sessions with very many sections (100+), the pill grid becomes its own navigable surface -- compact enough to show the full session shape without scrolling, but with visual encoding (color, brightness, or size) that communicates section type and relative size. A section with 5,000 lines looks different from a section with 10 lines, even at pill scale.

Clicking any pill expands the aside leftward as an overflow panel -- not a dropdown, not a modal, but a beautiful extension that reveals full section labels. The panel feels like the pills are unfolding to show their contents. From here, the user clicks a section label and the content scrolls smoothly to that section.

### 3. Hovering to Prefetch

As the user hovers over a section pill (or expanded label), the client begins prefetching that section's content from the server. By the time the user clicks and the viewport scrolls to that section, the data is already cached and the terminal output renders instantly. The user never sees a loading spinner when navigating via the aside.

For very large sections (5,000+ lines), the prefetch loads the first chunk (e.g., 500 lines) immediately. The remaining content streams in as the section scrolls into view. The user sees content appear top-down within the section, but the initial chunk is large enough that they never "catch up" to the loading edge during normal reading speed.

### 4. Scrolling Through Content

As the user scrolls naturally through the session, several things happen in concert:

- The section pills in the aside track the current position -- the active pill shifts, giving constant spatial awareness (scrollspy behavior via IntersectionObserver)
- Sections entering the viewport have their content loaded and rendered (if not already cached)
- Sections leaving the viewport eventually have their DOM nodes removed and replaced with height placeholders (section-level virtualization), freeing memory
- Within large sections, content ahead of the scroll position is progressively rendered in chunks, staying ahead of the user's reading pace
- CSS `content-visibility: auto` handles the fine-grained rendering of sections that are in the DOM but not yet scrolled to their exact position

The user never notices any of this. Scrolling just feels smooth, and the aside always tells them where they are.

**Cmd+F compatibility:** True virtualization removes DOM nodes, which breaks browser-native find-in-page for content not currently in the DOM. This is an accepted tradeoff at the 50k-line scale -- keeping all 250,000 nodes in the DOM to support Cmd+F defeats the purpose. The vision accepts that Cmd+F works within the currently loaded sections (a generous window around the viewport) but not across the entire session. For full-session search, a future custom search feature (out of scope for this cycle) is the proper solution.

### 5. Re-visiting a Session

The user navigates away and comes back to the same session. Instead of a full refetch, cached section metadata and previously-fetched section content serve the session instantly. The client remembers which sections were loaded, and the per-section cache (keyed by section ID and content hash) avoids redundant fetches.

**Memory-aware caching:** The cache has a memory budget. When the total cached content exceeds a threshold, least-recently-accessed sections are evicted. The metadata (section labels, line counts, types) is always retained -- it is small. Only the heavyweight terminal content is subject to eviction. When the user scrolls back to an evicted section, it refetches transparently.

## Opportunities

**1. Section-level deep linking.** If every section has a stable URL fragment (e.g., `#section-12`), users can share links to specific parts of a session. This is especially valuable for team review of agent sessions -- "look at what happened in section 23." This falls naturally out of the scroll-to-section interaction.

**2. Section density as a signal.** The pill grid inherently communicates session shape -- a session with 5 pills looks different from one with 50. This could be extended: pills could encode section type (CLI vs TUI), line count, or error presence through color, brightness, or size. The aside becomes not just navigation but a session fingerprint. At 50k-line scale, this fingerprint is especially valuable -- it gives the user a bird's-eye view of a session that would take 30+ minutes to scroll through.

**3. Keyboard navigation.** Once sections are individually addressable, adding `j/k` or arrow-key navigation between sections is trivial and high-value for power users reviewing many sessions.

**4. Session size awareness in the session list.** Before the user even opens a session, the session list could communicate "this is a large session" through a subtle visual indicator (a density bar, a line count badge). This sets expectations and lets users choose when to engage with heavy sessions versus quick ones.

**5. Progressive section summaries.** For sections that are not yet loaded, the metadata could include a one-line summary or the first command line, giving the user a preview of what each section contains without loading its full content. This turns the section navigator from a positional tool into a comprehension tool.

## Constraints

- **Existing design system:** TRON/cyberpunk tokens, color palette, and component patterns must be respected. The aside and pills are new surfaces but must feel native.
- **Existing backend schema:** Sections are already in a separate table indexed by `session_id`. New endpoints can be added but the data model is fixed.
- **WASM pre-rendering:** Terminal output is pre-rendered to styled spans via the `vt-wasm` package. This pipeline is not changing -- the vision works with its output, not around it.
- **Mobile is secondary:** The aside navigator is a desktop-first surface. On mobile, the performance improvements (lazy loading, virtualization) still apply, but the aside may collapse or simplify.
- **Small sessions must not regress:** A 3-section session should feel identical to today. No new UI clutter, no loading waterfalls, no visible skeleton states for content that would have loaded instantly anyway. The layered strategy must be adaptive -- small sessions skip the heavyweight layers.

## Out of Scope

- **Custom in-app search** -- browser Cmd+F works within the loaded viewport window. Full-session search with highlighting and filtering is a separate feature that becomes more important as a consequence of virtualization (since Cmd+F no longer covers unloaded sections). The architecture should facilitate adding this later.
- **Streaming/real-time sessions** -- this vision addresses recorded, complete sessions. Live-updating sessions are a separate problem.
- **Section reordering or editing** -- sections are read-only playback.
- **Offline support** -- caching improves re-navigation speed but full offline capability is deferred.
- **Line-level virtual scrolling** -- the vision calls for progressive chunked rendering within large sections, not true line-by-line virtualization. The distinction matters: chunked rendering loads content in blocks and keeps it in the DOM once loaded (supporting Cmd+F within the section), while line-level virtualization would constantly add/remove individual line nodes. The latter's complexity and Cmd+F impact are not justified when section-level virtualization already bounds the global DOM node count.

## Success Criteria

- **A 50-section, 50k+ line session loads its first visible content in under 1 second**, regardless of total session size. The user sees session structure (section navigator, headers) within 300ms and terminal content within 1 second. The full 10-50 MB payload is never transferred as a single request.
- **Peak DOM node count stays under 10,000 at any point during navigation**, even for sessions with 50k+ lines. This represents roughly 5-8 sections worth of terminal content in the DOM at once (compared to 250,000+ today). Sections outside this window are replaced by placeholder nodes.
- **The user can identify their current position in a large session at a glance**, without scrolling, via the aside navigator. The aside communicates both position and session density.
- **Navigating to any section in a 50-section session takes one click** from the aside. Content appears within 500ms for sections not yet cached. For prefetched sections (hovered first), content appears instantly.
- **Client memory usage for a 50k-line session stays under 150 MB** (DOM + parsed data + cache). The memory-aware cache evicts section content when pressure is high. Opening a 50k-line session does not risk crashing the tab.
- **Re-visiting a previously viewed session shows structure instantly** (from cached metadata) and previously-viewed section content loads from cache without refetch.
- **A 3-section session looks and behaves identically to today** -- no new UI surfaces appear, no loading waterfalls, no performance overhead is introduced. The layered strategy detects small sessions and stays dormant.
- **Scrolling at normal reading speed through a 50k-line session never stutters or shows blank content.** Content loads ahead of the scroll position. The user never "outruns" the progressive renderer during normal reading. Fast flick-scrolling may briefly show placeholders, which is acceptable.

---
**Sign-off:** Pending
