# Visionbook: Virtual Scrolling and Section Navigation

> Deferred-but-important work for the virtual scrolling and section navigation feature. The architect should read this before finalizing the ADR to ensure design decisions do not foreclose these capabilities.

---

## Purpose

This file captures work that is explicitly out of scope for the current cycle but architecturally significant. Each item is something the current implementation must not accidentally prevent. Where relevant, notes describe what the architecture needs to leave open.

---

## Prioritized Backlog

### 1. Section-Level Deep Linking (`#section-12` URL Fragments)

**What:** Stable URL fragments pointing to individual sections, e.g. `#section-12` or `#section-initial-setup` derived from the section label.

**Why it matters:** Team leads want to share links to specific parts of a session. Today, a teammate following a shared link lands at the top of the session and must scroll to find the referenced section. Deep links make section sharing a one-click action. This is a product differentiator over asciinema (time-only scrubbing) and Warp (no cross-session section permalinks).

**Architectural dependency:** The per-section endpoint design and the section identifier scheme must be stable and URL-safe. Section IDs from the database should map cleanly to fragment identifiers without encoding gymnastics. The scroll-to-section interaction introduced in this cycle is the exact primitive that deep link resolution will reuse — the architecture must not make section IDs ephemeral or position-relative.

---

### 2. Custom In-App Search (Replacing Cmd+F for Virtualized Content)

**What:** A session-scoped search panel (invoked with `/` or `Cmd+F` override) that searches across all section content, including sections not currently in the DOM, and highlights and paginates results.

**Why it matters:** Section-level DOM virtualization removes nodes from the DOM. Browser Cmd+F cannot find content in unloaded sections. This is an accepted tradeoff in this cycle, but it creates a gap for users who habitually use Cmd+F to find specific tool calls, error messages, or command names. Until custom search exists, this gap is real and affects power users who review detailed agent behavior.

**Architectural dependency:** The per-section content endpoints introduced in this cycle are the data access layer that a search feature needs. The search index (whether SQLite FTS5 or client-side) needs to know about section content and map results back to section IDs and line positions. The endpoint design must not make this mapping awkward (e.g., avoid opaque blobs that obscure line structure).

---

### 3. Keyboard Navigation Between Sections (`j`/`k` Keys)

**What:** Vim-style `j`/`k` (or `Ctrl+Down`/`Ctrl+Up`) keyboard shortcuts to jump between section headers within the session viewer.

**Why it matters:** The audience for Erika is developers who review agent sessions -- a group highly comfortable with keyboard-first workflows. Warp terminal established `Cmd+Up`/`Cmd+Down` as the expected pattern for block navigation. Keyboard navigation between sections dramatically reduces the time to review a 50-section session by eliminating the need to aim at the aside and click.

**Architectural dependency:** A `useSessionNavigation` composable is the natural home for this. The composable needs an ordered list of section DOM references and a concept of "active section index" shared with the aside scrollspy. The scrollspy IntersectionObserver introduced in this cycle should emit to shared state that keyboard navigation can consume, not to component-local state.

---

### 4. Session Size Indicators in the Session List

**What:** Visual indicators on session list cards communicating "this is a large session" before the user opens it -- a line count badge, a density bar, or a section count indicator.

**Why it matters:** Users who have experienced a slow-loading session learn to avoid opening large sessions at inconvenient moments (limited bandwidth, shared screen). Setting expectations before opening reduces friction and frustration. It also makes the performance improvements in this cycle visible at the session list level, not just inside the viewer.

**Architectural dependency:** The session list endpoint (`GET /api/sessions`) currently returns metadata. Line count and section count are already available from the database. Adding these fields to the list response is low-cost. The list response should include at minimum `sectionCount` and `totalLines` so the front end can make an informed density judgment without a separate request.

---

### 5. Progressive Section Summaries from Metadata

**What:** For sections not yet loaded, show a one-line preview in the section navigator aside -- the first command line or a marker label summary -- so the user can understand what each section contains before scrolling to it.

**Why it matters:** The section navigator today shows labels, which are useful when labels are descriptive. But many auto-detected sections have generic labels ("Section 12", "Detected block"). A first-command preview turns the aside from a positional tool into a comprehension tool: "I can see that Section 23 starts with `npm test` -- that is where the test failure happened."

**Architectural dependency:** Section metadata returned by the initial session load should include an optional `preview` field (first non-empty line or marker text). The server-side section model and the metadata endpoint introduced in this cycle are the right place to include this without additional requests. Schema decisions made in this cycle should treat `preview` as a planned nullable column, not an afterthought.

---

### 6. Section Density Encoding in Pills (Color or Size by Type or Line Count)

**What:** Pills in the section navigator aside encode section characteristics visually -- color by section type (Marker vs Detected vs auto-split), size or brightness proportional to line count, or a small bar indicating relative weight within the session.

**Why it matters:** At 50+ sections, the pill grid is not just navigation -- it is a session fingerprint. A user glancing at the grid should be able to see at a glance where the "heavy" sections are (large output dumps), where Marker sections anchor the structure, and which sections are trivially small. This transforms the aside from a list into a spatial data visualization.

**Architectural dependency:** Pill rendering must be data-driven, not static. The metadata endpoint must deliver `sectionType`, `lineCount`, and ideally relative weight per section. Component design should treat pill appearance as a function of data, not hardcoded styling, so density encoding can be added as a data layer without refactoring the pill component.

---

### 7. Streaming and Real-Time Session Support

**What:** Live-updating sessions where content is actively being recorded and the viewer reflects new sections and lines as they arrive.

**Why it matters:** Erika currently handles recorded, complete sessions. As agent orchestration becomes more common, watching a session in real time -- seeing sections appear as the agent works -- becomes a compelling monitoring use case. This is especially relevant for long-running agent tasks where the user wants to check on progress without waiting for completion.

**Architectural dependency:** The per-section endpoint introduced in this cycle assumes sections are complete and immutable (ETags, content hashes, cache headers). Streaming support will require a different endpoint contract -- either server-sent events or WebSocket streaming for in-progress sections. The architecture must not assume all sections are final and must leave room for a "live" flag on sessions that bypasses caching and virtualization assumptions about stable content.

---

### 8. Offline Support and Service Worker Caching

**What:** Full or partial offline capability -- previously loaded sessions are accessible without a network connection via service worker caching.

**Why it matters:** Self-hosting operators who review sessions on a laptop may lose connectivity (travel, unstable network). Losing access to a session mid-review because the network dropped is disruptive. The per-section cache introduced in this cycle is in-memory; a service worker cache would persist across reloads and network interruptions.

**Architectural dependency:** Service worker caching works cleanly when API responses are cache-friendly: stable URLs, strong ETags, explicit `Cache-Control` headers. The per-section endpoint design in this cycle should treat cacheability as a first-class property, not an afterthought. Cache key design (section ID + content hash) should be compatible with both in-memory eviction in this cycle and service worker caching in a future cycle.

---

### 9. Line-Level Virtual Scrolling for Extreme Sections

**What:** Within a single section that contains 5,000+ lines, virtualize at the individual line level -- removing line DOM nodes that are far above or below the visible area within that section, not just sections that are off-screen.

**Why it matters:** Section-level virtualization keeps the working DOM to a bounded size globally, but a single section with 5,000 lines still creates 5,000 DOM nodes when it is in the active window. For sessions dominated by one or two huge sections (e.g., a full `git diff` or a long test run), section-level virtualization does not fully solve the DOM pressure problem.

**Architectural dependency:** Line-level virtualization requires the section content component to operate in a "virtualizer mode" when line count exceeds a threshold. This is compatible with the chunked rendering approach in this cycle only if section content is structured as individually addressable line records, not a single pre-rendered HTML blob. The content delivery format introduced in this cycle should not treat section content as an opaque HTML string if line-level virtualization is a future goal.

---

**Last updated:** 2026-03-20
