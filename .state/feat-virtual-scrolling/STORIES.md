# Stories: Virtual Scrolling and Section Navigation

> Add per-section lazy loading, section-level DOM virtualization, a scrollspy navigator aside, and client-side section caching so that large agent sessions (50,000+ lines) load in under 1 second and feel navigable at any scale.

## Stories

### Platform User (daily session reviewer)

As a platform user reviewing 50-section agent sessions, I want the session to show me its structure and first content within one second of opening so that I can start reading without waiting for megabytes of terminal output to parse and render.

Acceptance signal: A 50-section, 50k-line session renders the section navigator aside and first visible terminal content within 1 second on a standard desktop connection, with no browser tab freeze.

---

As a platform user browsing a large session, I want a persistent section navigator on the right side that always shows my current position in the session so that I never feel lost in a wall of terminal output and can instantly see how much of the session I have covered.

Acceptance signal: The aside is visible during session viewing, its active pill updates as the user scrolls, and the active section label is readable at a glance without hovering.

---

As a platform user who wants to jump to a specific part of a session, I want to click any section pill in the navigator aside and land on that section within 500ms so that reviewing a specific agent action does not require scrolling through unrelated output.

Acceptance signal: Clicking a pill scrolls the viewport to the correct section; content appears immediately for previously visited sections and within 500ms for unvisited ones.

---

As a platform user revisiting a session I already read, I want the session to reload instantly from the client cache so that returning to review a section I already opened does not cost another network round-trip.

Acceptance signal: Re-opening a session after navigating away shows previously-loaded section content without a visible network request for that section's content.

---

As a platform user browsing small sessions (under 5 sections), I want the viewing experience to be identical to today with no new UI surfaces or loading waterfalls so that the performance investment does not introduce overhead for simple sessions.

Acceptance signal: A 3-section session shows no section navigator aside, no skeleton states, and loads in a single request exactly as it does today.

### Self-Hosting Developer (deploying Erika to review their own agent output)

As a self-hosting developer who generates agent sessions with 50,000+ lines, I want the server to deliver section metadata first and section content on demand so that the initial API response is small and fast regardless of how large the underlying session is.

Acceptance signal: `GET /api/sessions/:id` returns only metadata (section labels, line counts, types) — the full terminal snapshot payloads are served by per-section endpoints and never bundled into the session response.

---

As a self-hosting developer, I want per-section API responses to include cache headers (ETags or content hashes) so that my browser and any reverse proxy cache section content and avoid redundant fetches when I re-open sessions.

Acceptance signal: Per-section responses include a stable `ETag` or `Cache-Control` header; a second request for the same unchanged section content returns 304 Not Modified.

---

As a self-hosting developer running Erika on a low-memory server, I want section content to be fetched and cached only when needed and evicted under memory pressure so that a large session does not exhaust the server's or client's memory budget.

Acceptance signal: The client cache has a documented memory ceiling; the least-recently-used section content is evicted when that ceiling is approached, and evicted sections re-fetch transparently on next scroll.

### Team Lead (sharing session links with teammates for review)

As a team lead sharing a session link with a teammate, I want the session to load fast for teammates regardless of total session size so that they are not blocked waiting for a multi-megabyte payload before they can even begin reading.

Acceptance signal: A teammate following a shared session link sees the section navigator and first section content within 1 second on a standard broadband connection.

---

As a team lead directing a teammate to a specific section, I want to be able to point them to a section by name using the navigator so that they can navigate directly without me describing "scroll down past the git diff section" in a message.

Acceptance signal: The section navigator aside lists all section labels; clicking any label scrolls to that section; the interaction requires one click from the aside, not scrolling.

### Developer Extending the Platform

As a developer extending Erika, I want section content virtualization and the client cache to live in composables with clear interfaces (`useSessionVirtualizer`, `useSectionCache`) so that the virtualization strategy can be swapped or tuned without rewriting the session viewer component.

Acceptance signal: The virtual scrolling behavior and section cache are encapsulated in composables that `SessionContent.vue` consumes; their internals are not spread across the component template.

---

As a developer extending Erika, I want the per-section endpoint shape and cache key scheme to be designed so that section-level deep linking, streaming sections, and future search can be layered on top without breaking changes so that the architecture of this cycle does not block the next cycle's capabilities.

Acceptance signal: The architect's ADR explicitly documents how the endpoint design accommodates future deep links and streaming without requiring a breaking API change.

## Out of Scope

- Custom in-app search replacing browser Cmd+F for virtualized content
- Section-level URL deep linking (`#section-12` fragments)
- Keyboard navigation between sections (`j`/`k` keys)
- Session size indicators in the session list
- Progressive section summaries from metadata (first command preview in pills)
- Streaming or real-time session support
- Offline support and service worker caching
- Line-level virtual scrolling within individual sections
- Section density encoding in pills (color or size by section type or line count)

---
**Sign-off:** Pending
