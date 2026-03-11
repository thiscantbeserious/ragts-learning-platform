# Vision: The Spatial Foundation

> Transform Erika from a page-based prototype into a spatial application where sessions are always present, the system is always alive, and the user never feels lost.

**Companion research:**
- `.state/feat/client-design-bootstrap/UX_RESEARCH.md` — Full UX research report: competitor analysis, accessibility requirements, panel architecture patterns, and all source URLs.
- `.state/feat/client-design-bootstrap/UX_RESEARCH_BASELINE.md` — Supplemental research validating the 18px/36px baseline grid against the current design system, Gemini prototype screenshots, and industry patterns. Recommends Path C adoption.
- `.state/feat/client-design-bootstrap/references/` — Gemini prototype screenshots (session detail + start page).

## Core Intent

Erika is not getting a sidebar. Erika is getting its skeleton -- the spatial architecture that determines what the product can become over the next two years. The decisions made in this cycle are load-bearing: where panels live, how they compose, what the grid allows, and what it forecloses.

The user's immediate need is spatial permanence -- sessions always visible, always one glance away. But the deeper need is a flexible container system that grows with the product. A right panel for annotations. A bottom panel for logs or terminal replay. Side-by-side session comparison. These are not in scope now, but they must be structurally possible without a layout rewrite.

This vision addresses both: the immediate experience (persistent sidebar, cognitive start page, upload flow, live status, mobile responsiveness) and the structural foundation beneath it (a CSS Grid shell with named areas for every future panel, density-aware spacing, critical CSS that paints before JavaScript hydrates).

This is not a layout task. It is the moment Erika becomes a product.

## Research Findings

### Application Shell Patterns in Developer Tools

The best developer tools converge on a common spatial model: a multi-region grid with independently collapsible panels.

**VS Code** uses a five-region layout: Activity Bar (icon rail, ~48px), Side Bar (explorer/search, ~250-300px, resizable), Editor Group (main content, fills remaining), Side Panel (right, optional, for chat/outline), and Panel (bottom, for terminal/output/debug). All regions except the editor are collapsible. The layout uses CSS Grid with `grid-template-columns` and `grid-template-rows` that recalculate when panels toggle. Panel state persists across sessions via their Custom Layout feature (2023+). The activity bar acts as both navigation and panel toggle -- clicking an already-active icon collapses its associated panel.

**Figma** uses a three-column layout: Left Sidebar (layers/assets, ~240px), Canvas (center, fills), Right Sidebar (properties/design/prototype, ~240px). Both sidebars are independently collapsible. The right sidebar is contextual -- its contents change based on selection. This pattern is directly relevant to Erika: a future right panel for session annotations or curation would behave identically. The tab system within the left panel (Layers vs. Assets) maps to Erika's potential future of "Sessions vs. Projects" in the sidebar.

**Linear** uses a two-column layout with a narrow left sidebar (~220px) containing navigation, team switcher, and quick filters. The main area handles all content. Linear avoids multi-panel complexity in favor of slide-over panels that overlay content rather than restructuring the grid. This is a simpler model but limits simultaneous information density -- you cannot see both a list and a detail panel side-by-side. This is Linear's intentional choice (focus over density), but it is the wrong choice for Erika, where simultaneous session list + session content is the core interaction.

**Chrome DevTools** uses a two-region split (top/bottom or left/right, user-configurable) with tabs within each region. The key pattern: the split ratio is user-resizable via a drag handle, and the orientation toggles between horizontal and vertical based on available space. This adaptive split is relevant for Erika's future bottom panel (log viewer, terminal replay).

**Cursor IDE** inherited VS Code's five-region architecture and added a persistent right panel for AI chat. Community feedback (2025) reveals tension around sidebar icon orientation changes -- users noticed immediately, indicating how sensitive spatial affordances are. Users build muscle memory around panel positions; the initial layout decisions matter enormously.

**Common patterns across all:**
- Sidebar widths cluster between 220-300px for content-bearing panels (not icon rails)
- Resizable panels with drag handles and min/max constraints
- Panel visibility toggled via controls in a persistent chrome (header bar or activity bar)
- Panel state (open/closed, width) persists across page loads via localStorage
- Transitions are fast (120-200ms) and use ease-out curves -- panels slide or resize, they do not fade

### Multi-Panel Expansion Architecture

The critical insight from studying these tools: **the grid must define all possible regions from day one, even if most start empty.** Adding a region later means restructuring the grid, which cascades into every component that references grid areas.

**CSS Grid named areas** is the dominant pattern. VS Code's layout (simplified) maps to:

```
"sidebar  main    aside"
"sidebar  bottom  aside"
```

When the bottom panel is closed, its row collapses to `0fr`. When the right panel is closed, its column collapses to `0fr`. The grid recalculates, and `main` expands to fill. No component inside `main` needs to know about adjacent panels -- it just fills its grid area.

CSS now supports interpolation of `grid-template-columns` and `grid-template-rows`, enabling panels to animate open and closed by transitioning between `0fr` and a target value. The `0fr` state collapses the panel while keeping the grid area declared -- a missing grid area cannot be transitioned into existence. This is supported in Chrome, Firefox, and Safari as of 2023-2024. Caveat: grid transitions trigger layout recalculation on every frame, which is mid-cost rendering. For panels that open rarely (not every frame), this is acceptable. Keep transition duration at 150-200ms. Do not use `repeat()` functions in animated grid templates -- set column widths individually to avoid interpolation bugs.

**The alternative -- nested flexbox** -- is what Linear and simpler tools use. It works for two-panel layouts but creates nesting complexity when adding a third or fourth panel. Each new panel requires restructuring the flex container hierarchy.

**Mantine AppShell** (open-source React component) formally models the five-region layout: Header, Navbar (left), Aside (right), Footer (bottom), Main. Dimensions accept responsive breakpoint objects. Collapse state is tracked separately for mobile vs. desktop. This validates the architectural decision to define all regions up front and manage mobile/desktop collapse independently.

**Recommendation for Erika:** CSS Grid with named template areas. Define the full grid (left sidebar, main content, right panel, bottom panel) from day one. Start with only the left sidebar and main content populated. Right and bottom panels are grid areas that exist in the template but render nothing and collapse to zero. When future features need them, they slot into pre-existing areas without touching the shell layout.

### Skeleton and App Shell Loading

Google's App Shell model and modern implementations converge on a principle: **the layout skeleton should be the first thing painted, and it should exactly match the final layout structure.**

**The pattern:**
1. The HTML document includes a minimal shell (header, sidebar placeholder, main placeholder) styled by critical CSS inlined in `<head>` or loaded as a blocking stylesheet
2. Vue hydrates into this shell, replacing placeholders with reactive components
3. Skeleton loaders within each grid area pulse in place until data arrives
4. Content replaces skeletons without layout shift because the grid areas are pre-defined

**Key insight:** If the skeleton and the final layout use different grid structures, content will "jump" when JavaScript hydrates. The CSS Grid template must be identical in the skeleton and the hydrated state. Research measured a 92% CLS (Cumulative Layout Shift) reduction from this approach.

For Erika, this means the grid template belongs in `design/styles/layout.css` (or a dedicated `shell.css`) as pure CSS -- no JavaScript dependency. Vue components mount *into* pre-existing grid areas rather than creating them. Skeleton loaders use `--bg-elevated` as base with a shimmer animation using `--accent-primary-subtle` as the highlight color to stay on-palette.

Two skeleton states are needed: (1) sidebar skeleton (3-5 shimmer cards at session-card height) and (2) main content skeleton (breadcrumb placeholder, section header placeholders, terminal output shimmer). Both must use the same spacing tokens and component heights as the real content they replace.

### Typography and Baseline Grid Analysis

This is where the vision challenges an existing design decision.

**The current Erika system:** 14px base font, 1.5 line-height = 21px baseline, 21px vertical rhythm unit. Minor third (1.2) type scale. All vertical spacing, component heights, and line-heights resolve to multiples of 21px.

**What developer tools actually use:**

| Product | Base font | Line height | Baseline | Spacing grid |
|---------|-----------|-------------|----------|-------------|
| VS Code | 13px | 18-22px (variable) | None (4px grid) | 4px |
| GitHub | 14px | 1.5 (21px) | None (8px grid) | 8px (Primer) |
| Linear | 13px | 1.5 (~20px) | None (4px grid) | 4px |
| Figma UI | 11-12px | ~16-18px | None | 4px/8px |
| Vercel Dashboard | 14px | 1.5 (21px) | None (8px grid) | 8px (Geist) |
| Notion | 16px | 1.5 (24px) | None | 8px |
| Raycast | 13px | 1.4 (~18px) | None | 4px |

**Key findings:**

1. **No major developer tool uses a strict baseline grid.** Baseline grids come from print typography. On screen, they create more problems than they solve -- component internal padding, icon alignment, and variable content heights constantly fight the baseline. Every tool studied uses a spatial grid (4px or 8px) for spacing instead.

2. **14px is a valid base for reading-heavy tools.** GitHub and Vercel use 14px. But tools optimized for information density (VS Code, Linear, Figma, Raycast) use 12-13px. Erika is both a reading tool (terminal session output) and a navigation tool (session list, filters). The sidebar benefits from density; the main reading area benefits from comfort.

3. **The 21px baseline creates generous but inflexible vertical rhythm.** Button heights, input heights, list item heights -- all must be multiples of 21px. This works for reading but creates problems in dense UI regions. A session list item that needs name + metadata + vitals strip at 21px increments becomes 63px minimum -- larger than most sidebar list items in comparable tools (Linear: ~40px, VS Code: ~22px for tree items, Figma: ~32px for layer items).

4. **An 8px spatial grid is more forgiving than a baseline grid.** Instead of 21px increments, an 8px grid allows 24px (3 units), 32px (4 units), 40px (5 units), 48px (6 units). This provides finer granularity for dense components while still maintaining visual consistency. A 4px sub-grid handles micro-adjustments (padding, icon gaps).

**Three paths forward:**

- **Path A (Conservative):** Keep the 21px baseline as the primary system everywhere. Accept that sidebar components will be taller than in comparable tools. The trade-off is visual generosity at the cost of density. Session cards at 63px minimum. No token system changes required.

- **Path B (Adaptive dual-rhythm):** Keep the 21px baseline for the main content area (terminal output, section headers, reading surfaces). Adopt an 8px spatial grid for sidebar and chrome components. A CSS custom property override on the sidebar region (`--density: compact`) switches spacing tokens. This is how VS Code works -- the editor area has its own type scale separate from the UI chrome. Session cards at 32-48px, comparable to Linear and Figma. Requires adding density-scoped token overrides to the design system.

- **Path C (Tighter universal baseline -- user-tested):** Adopt an 18px baseline with a 36px grid. At 14px base font, 18px line-height gives a ~1.286 ratio -- tighter than 1.5 but still readable. This produces more granular increments than 21px while maintaining a consistent vertical rhythm system: 36px (2x), 54px (3x), 72px (4x). A session card at 2x baseline = 36px, close to comparable tools. **Key structural advantage: 36px and 18px are divisible by 4** (36/4 = 9, 18/4 = 4.5 at base but 36/4 = 9 clean), enabling alignment with a 4px sub-grid. The current 21px/42px baseline does NOT divide evenly by 4 or 8 (21/4 = 5.25, 42/4 = 10.5, 21/8 = 2.625, 42/8 = 5.25) — so Path C actually achieves better sub-grid alignment than Path A. The LCM of 18 and 4 is 36, meaning both grids sync at every 36px boundary. This path has been **visually tested by the user** against the existing design system mockups with acceptable results. It preserves the philosophy of baseline rhythm without the density penalty of 21px, and avoids the complexity of maintaining two spacing systems. Per the baseline research (see UX_RESEARCH_BASELINE.md), adoption requires updating only `--baseline` in `layout.css` -- all 16 derived tokens recalculate automatically via `calc()`. Requires updating `--baseline`, `--lh-*`, and `--rhythm-*` tokens in `layout.css`.

The frontend-designer must evaluate all three paths through mockup iteration. The grid architecture works regardless of which baseline ships -- this decision affects component sizing within panels, not the panel structure itself. The baseline research (UX_RESEARCH_BASELINE.md) strongly recommends **Path C** based on: user visual testing, 4px sub-grid alignment advantage, one-token migration cost, and prototype screenshot analysis showing the Gemini prototype already uses spacing closer to 18px than 21px.

## Current State

**What exists:**
- Backend APIs: session list, session detail, upload (`POST /api/upload`), delete, re-detect, health check
- SSE endpoint for live processing status updates (merged in PR #66)
- Vue 3 frontend with basic page-based routing: session list page, session detail page
- Terminal rendering via avt WASM: sections, sticky headers, monospace output
- Design system: Midnight Neon palette (cyan #00d4ff primary, neon pink #ff4d6a secondary), Geist fonts, 21px baseline rhythm grid, 66 BEM component classes, animation primitives
- Design tokens in `design/styles/layout.css` (single source of truth)

**The gap:**
- No persistent navigation -- viewing a session detail loses the session list
- No spatial architecture -- no CSS Grid shell that future panels can slot into
- No upload affordance inside the app flow -- upload is a separate concern
- No loading states -- the app feels broken during network latency
- No empty state -- a blank void greets new users
- No feedback mechanism -- uploads and processing events happen silently
- No mobile consideration -- the layout assumes desktop width
- No sense of aliveness -- the app does not communicate background activity
- No foundation for future panels (right sidebar, bottom panel) -- adding them later would require a layout rewrite

## Design Direction

### The Grid Architecture

The application shell is a CSS Grid with named template areas defining six regions. This is the single most important structural decision of this cycle -- every other pattern is downstream of it.

| Region | Purpose (this cycle) | Purpose (future) |
|--------|---------------------|-------------------|
| `brand` | Product mark, sidebar header | Workspace switcher, user avatar |
| `header` | Breadcrumb, global actions | Search, notifications, panel toggles, user menu |
| `sidebar` | Session list, search, filters, upload | Navigation tree, workspace nav |
| `main` | Session detail, cognitive start page | Any primary content view |
| `aside` | *Collapsed (0fr)* | Annotations, properties, curation panel, second session |
| `bottom` | *Collapsed (0fr)* | Log viewer, terminal replay, debug output |

The grid template, fully expressed:

```
"brand   header  header  header"
"sidebar main    aside   aside"
"sidebar bottom  bottom  bottom"
```

Collapsed state (this cycle, only sidebar and main populated):

```
aside column = 0fr
bottom row = 0fr
```

The `aside` and `bottom` regions exist in the CSS template but render nothing and collapse to zero. When future features activate them, they transition from `0fr` to their target size using CSS `grid-template-columns` / `grid-template-rows` transitions. This is the `0fr` collapse pattern -- it keeps the grid area declared while removing it visually, enabling smooth animated expansion later without restructuring the template.

**Critical CSS requirement.** The grid template must be defined in pure CSS (`design/styles/layout.css` or a dedicated `shell.css`) and loaded as a blocking stylesheet in `<head>`. Vue components mount *into* pre-existing grid areas rather than creating them. This prevents layout shift during hydration -- the spatial structure exists at first paint, before any JavaScript executes. Skeleton loaders then pulse inside pre-positioned areas, and when real content arrives there is zero layout shift.

**Panel state persistence.** Sidebar open/closed state and width persist in localStorage and restore silently on reload. Transitions are suppressed during the initial hydration frame to prevent flash.

Column and row sizing:
- `brand`: matches sidebar width
- `sidebar`: `var(--sidebar-width)` -- open design question for the frontend-designer; research indicates 220-300px for content-bearing sidebars, default ~260px recommended, resizable via drag handle with min 220px / max 360px constraints (resize handle implementation deferred unless naturally included in mockups)
- `main`: `1fr` (fills remaining space)
- `aside`: `0fr` this cycle, expands to a token width when activated
- `header`: auto height
- `bottom`: `0fr` this cycle, expands to a token height when activated

Panel open/close transitions: 150-200ms using the design system's `--duration-fast` (150ms) or `--duration-normal` (250ms), ease-out. Do not use `repeat()` functions in animated grid templates -- set column widths individually to avoid interpolation bugs in some browsers.

### Spacing and Density

The Research Findings section above documents the typography analysis in detail. The key takeaway: the 21px baseline is under review. Three paths (A, B, C) are identified. The frontend-designer evaluates through mockup iteration. The grid architecture works regardless of which baseline ships.

Under Path B (dual-rhythm) or Path C (18px baseline), session cards in the sidebar target ~36-40px height for the base state -- comparable to Linear and Figma. Under Path A (21px baseline), cards would be 63px minimum. The designer should produce mockups at multiple densities and compare.

### Visual Language

The Midnight Neon design system is the foundation. Deep dark backgrounds (#1a1a2e page, #212136 surface, #28283e elevated) create depth without pure-black claustrophobia. Cyan (#00d4ff) is the primary interactive color: links, focus states, active indicators, the heartbeat of the interface. Neon pink (#ff4d6a) is reserved for secondary emphasis and status accents.

Panel hierarchy through elevation:
- `sidebar`: `--bg-surface` (#212136) -- one step above page, creating a clear but soft boundary
- `main`: `--bg-page` (#1a1a2e) -- the deepest surface, maximum breathing room for content
- `aside` (future): `--bg-surface` -- same elevation as sidebar, framing the main content
- `bottom` (future): `--bg-elevated` (#28283e) -- highest elevation, distinguishing it as auxiliary
- `header`: transparent or `--bg-surface` with a subtle bottom border

Panel boundaries use `--border-default` (#323349) -- a single-pixel line that separates without dividing. No heavy dividers, no shadows between adjacent panels.

### Interaction Model

**Spatial, not navigational.** Clicking a session does not navigate -- it selects. The sidebar stays. The main content responds. The URL updates for shareability, but the mental model is selection within a persistent space, not page transitions.

**Panels as tools, not pages.** When future panels arrive (right sidebar for annotations, bottom panel for logs), they open alongside the current content. The grid redistributes space rather than swapping views. Every component in `main` must be responsive to width changes -- it will get narrower when the right panel opens.

**Progressive disclosure through panel state.** The application starts minimal: sidebar + main. As the product grows, panels activate. Each panel has a toggle in the header bar. Panel state persists across sessions. The user builds their workspace over time.

**Ambient awareness.** The SSE connection creates a live channel between the backend and the sidebar. Status indicators must pair color with motion pattern to be accessible: pulsing = actively processing, steady = complete, error color + no animation = failed. Color alone is insufficient.

### Emotional Tone

**Oriented, not overwhelmed.** The user always knows: where am I, what can I do, what is happening.

**Crafted, not decorated.** Every animation serves a purpose. State changes are communicated through motion. Nothing moves for aesthetics alone.

**Alive, not static.** The SSE connection, the processing indicators, the smooth panel transitions -- together they communicate that Erika is a running system, not a document viewer.

**Dense where it navigates, spacious where it reads.** The sidebar is compact and information-rich. The main content area is generous and comfortable. These are different zones with different density needs.

## Key Interactions

### 1. First Launch: The Flexible Landing Surface

The user opens Erika for the first time. The sidebar is empty -- no sessions yet. The main content area fills with a purposeful empty state that follows three principles: communicate system status (nothing here yet, not broken), teach the product's value, and provide a direct path to the first meaningful action.

The core elements are a file drop zone and a clear call to action. These are non-negotiable -- they are the lowest-friction path to the first upload. Surrounding them, the start page is a flexible surface for communicating Erika's product philosophy. One expression is an animated pipeline visualization (Record, Detect, Curate, Validate, Replay) orbiting gently as a background element. Other expressions are possible -- the vision does not bind to a specific visual. What matters is that the animation (if present) is secondary to the drop zone and CTA, loops gently at low opacity, and respects `@media (prefers-reduced-motion: reduce)` by falling back to a static graphic.

The start page also serves as the "no selection" state -- when the user deselects or closes a session, they return here rather than facing a blank void. It is both welcome screen and home base.

Three distinct empty state types exist: first-use, no-results (after filtering), and error. Each needs different content. The first-use state teaches and invites. The no-results state after filtering needs a clear path to clear filters ("No sessions match -- clear filters"). The error state needs a retry action. The start page handles the first; the sidebar handles the second; toast and inline error states handle the third.

### 2. Uploading a Session: The System Responds

The user drops a `.cast` file onto the drop zone, or clicks "+ New Session" in the sidebar, or drags a file anywhere over the application window. On drag-over, the entire viewport enters a receiving state: a subtle border glow and centered overlay confirm "Drop to upload." The transition into the receiving state is fast (~100ms) to feel instantaneous rather than delayed. The dashed border convention signals "receive here" without requiring text.

Upon drop, the upload begins immediately. A new entry appears in the sidebar session list with a processing indicator. The backend processes asynchronously. The SSE channel pushes status updates. The sidebar entry transitions through states: uploading (directional arrow animation), processing (pulsing cyan dot), ready (steady green dot with brief glow burst on transition), or failed (pink/red dot, no animation). Each transition animates smoothly.

A toast notification confirms the outcome, using `role="status"` for screen reader announcement. The toast appears briefly and self-dismisses.

The emotional goal: confidence. The system received the file, is actively working, and will report when done. No need to refresh, no need to watch.

### 3. Browsing Sessions: Spatial Selection

The sidebar contains the session list. Each entry shows the session name, metadata (section count, age), and status indicator. The session card anatomy targets ~36-40px height for the base state (depending on which baseline path ships), with an optional vitals strip adding 8-12px:

- Row 1: session name (truncated with ellipsis), status dot right-aligned
- Row 2: metadata in muted text at small size -- section count, age
- Optional row 3: vitals strip (thin bar with proportional section segments)

Selected state: left border in `--accent-primary` (2px), background shift to `--accent-primary-subtle`. Not full background fill -- that reduces text contrast.

The user clicks a session. The main content area transitions to the session detail: breadcrumb, collapsible sections with line numbers, terminal output in monospace. The sidebar stays exactly where it was -- scroll position preserved, selected session highlighted. Focus remains in the sidebar after selection (per WCAG 2.4.3 -- do not auto-move focus to main content, which disorients users navigating the list).

Clicking another session swaps the main content. The sidebar selection moves. No page reload, no loss of context. The URL updates for direct linking.

The emotional goal: fluency. Switching sessions feels like switching files in an editor.

### 4. Searching and Filtering: Sculpting the View

The user types in the sidebar search bar. The list filters in real time. Filter pills below the search bar (All / Processing / Ready / Failed) further narrow the view. Both compose: searching "refactor" while filtering to "Failed" shows only failed sessions matching both.

Filter pills use `role="group"` with a label ("Filter by status") and `aria-pressed` on each pill button to communicate selection state to screen readers.

Filtering feels instant and reversible. Clearing the search restores the full list. The user explores and retreats freely.

The emotional goal: control. The user sculpts the view, not queries a database.

### 5. Mobile: The Sidebar Yields

On narrow viewports (below 768px), the sidebar collapses behind a menu toggle. The main content takes full width. Tapping the toggle reveals the sidebar as an overlay: `translateX(-100%)` to `translateX(0)`, backdrop dim, 150-200ms transition. The overlay uses `aria-modal="true"` and a focus trap -- Tab cycles through sidebar controls only while open, Escape closes and returns focus to the toggle button.

Selecting a session closes the overlay and shows the detail. A persistent header bar keeps the menu toggle and current session name visible.

The emotional goal: intentional, not compromised. The overlay animation creates a clear spatial relationship -- the sidebar lives to the left, slides in and out, the user understands where it went.

## Opportunities

### 1. Session Vitals Strip

Each session card could include a compressed vitals strip: a thin horizontal bar visualizing the session's internal structure. Section count as tick marks, relative sizes as proportional segment widths, detected vs marker sections as color-coded regions (cyan for detected, pink for markers). This transforms the session list from a text directory into a visual map.

Grounded: section data already exists in the API response. Rendering is pure CSS (flexbox segments with proportional widths). Under an 8px or 18px grid, the strip adds one compact row to the session card.

### 2. Panel Architecture as Product Differentiator

By building the multi-panel grid from day one, Erika positions itself for experiences that competitors with single-panel layouts cannot easily retrofit:

- **Side-by-side session comparison.** The `aside` panel shows a second session while `main` shows the first -- diff-style review of two agent runs.
- **Annotation-while-reading.** The `aside` panel holds curation notes that stay open while scrolling terminal output in `main` -- simultaneous reading and writing.
- **Live terminal alongside session review.** The `bottom` panel runs a terminal replay while `main` shows the structured section view -- two perspectives on the same session.

None of these are in scope now. But the grid makes them possible without a rewrite. Cursor's experience confirms this: adding an AI chat panel to VS Code's existing grid worked because the grid had room. Community feedback showed users are extremely sensitive to spatial changes when panels must be retrofitted.

### 3. Session Presence Indicator (Multi-User Anticipation)

The sidebar card layout could reserve space for a presence indicator (small avatar dot or ring). Multi-user is out of scope, but designing the card with this in mind prevents a layout-breaking retrofit later. Zero-cost layout consideration.

### 4. Contextual Upload Intelligence

Upload feedback toasts could carry richer information than "Upload complete." High section counts, processing duration, or one-line error reasons turn notifications into micro-conversations. Requires the SSE payload to carry richer metadata -- if available, this is free; if not, it is a small backend enhancement the vision invites rather than requires.

### 5. Density Modes as a User Preference

If a dual-rhythm or tighter baseline system ships, it could be extended into an explicit density preference: "comfortable" vs "compact." Developer tools like Gmail and VS Code offer exactly this. It respects that different users and different tasks have different density needs.

## Accessibility Requirements

The UX research identified specific WCAG 2.2 requirements for the application shell (see UX_RESEARCH.md for the full accessibility section with WCAG criterion references). The key requirements that must be addressed in implementation:

- **Skip link (WCAG 2.4.1).** A visually-hidden "Skip to main content" link as the first focusable element in the DOM. Reveals on focus. Essential for a sidebar + main layout.
- **ARIA live regions (WCAG 4.1.3).** SSE-driven status updates (processing, upload complete) must be announced to screen readers. Use `role="status"` (polite) for processing updates and toast notifications. Use `role="alert"` (assertive) for errors.
- **Focus management (WCAG 2.4.3).** On session selection, focus stays in the sidebar. On mobile overlay open, focus traps to sidebar. On overlay close, focus returns to the trigger.
- **Reduced motion (prefers-reduced-motion).** All decorative animations (pipeline visualization, processing pulse, panel transitions) must respect the preference. State-change animations become instant or fade rather than slide/pulse.
- **Color contrast.** Cyan on `--bg-surface` is ~7:1 (AAA). Neon pink on dark backgrounds is ~4.1:1 (AA for large text -- verify for body text). `--text-muted` on `--bg-surface` is ~4.2:1 (marginal AA -- use only for supplementary information).
- **Status indicators.** Color must be paired with motion pattern or iconography. No status communicated by color alone.

## Constraints

| Constraint | Impact |
|---|---|
| **Backend is frozen.** All APIs exist: session CRUD, upload, SSE status, re-detect. No backend changes this cycle. | Frontend works entirely with existing endpoints and payloads. |
| **Design system is authoritative.** `design/styles/layout.css` and `design/styles/components.css` are the token source of truth. | All new UI consumes these tokens. No ad-hoc values. Token additions (grid area tokens, density overrides, baseline changes) follow existing naming conventions. |
| **Midnight Neon palette.** Cyan #00d4ff primary, neon pink #ff4d6a secondary, deep backgrounds (#1a1a2e / #212136 / #28283e). | All visual decisions work within this palette. |
| **Vue 3 + Composition API.** No Pinia at current scale. Composables for state. | Panel state (open/closed, width) managed by a layout composable wrapping localStorage. |
| **Vite dev server proxies `/api` to Hono backend on port 3000.** | No CORS concerns. Same-origin API. |
| **Geist + Geist Mono fonts.** | Typography stays within the Geist family. |
| **Baseline grid under evaluation.** Three paths identified (A: 21px, B: dual-rhythm 21px/8px, C: 18px/36px user-tested). | The grid architecture does not depend on which baseline ships. This affects component sizing within panels, not panel structure. Frontend-designer decides through mockup iteration. |
| **66 existing BEM component classes.** | Prefer extending existing components. New components follow BEM conventions. |
| **Sidebar width is an open design question.** Research recommends default ~260px, resizable, min 220px, max 360px. | Frontend-designer validates through iteration. |

## Out of Scope

- Session curation UI (annotations, tagging, segment marking) -- separate future feature
- Multi-user features, workspaces, team sharing, authentication, authorization
- Dashboard analytics or metrics beyond the cognitive start page
- Virtual scrolling for the session list (incremental addition when needed)
- Backend changes of any kind
- Terminal rendering improvements (scrollback dedup, VT processing)
- Server-side search indexing -- this cycle uses client-side filtering
- Right panel (`aside`) implementation -- the grid area is defined but nothing populates it
- Bottom panel (`bottom`) implementation -- the grid area is defined but nothing populates it
- Drag-handle resize for the sidebar -- deferred unless the frontend-designer naturally includes it (UX research ranked it low priority for the initial shell)

## Success Criteria

1. **The grid defines all six regions.** The CSS Grid template includes named areas for `brand`, `header`, `sidebar`, `main`, `aside`, and `bottom`. The `aside` column and `bottom` row collapse to `0fr`. Future features slot in without restructuring the layout.

2. **The shell layout is pure CSS, independent of Vue.** The grid template loads as critical CSS before JavaScript hydrates. Vue components mount into pre-existing grid areas. No layout shift on hydration.

3. **The sidebar never disappears on desktop.** Viewing session detail, uploading, filtering -- the sidebar persists through every interaction on viewports above 768px.

4. **A new user knows what to do within 5 seconds.** The start page communicates what Erika is and what action to take, without documentation.

5. **An uploaded session appears in the sidebar before the user wonders where it went.** The upload-to-sidebar pipeline is fast and visible enough that the user never questions whether it worked.

6. **Processing status is ambient, not polled.** SSE-driven updates arrive and animate into the sidebar without user action. Status indicators pair color with motion. No refresh needed.

7. **Switching sessions feels like switching files, not navigating pages.** Fast transition, stable sidebar, URL updates, mental model intact.

8. **The mobile experience is intentional.** Collapsible sidebar with overlay animation, focus trap, backdrop dim -- designed for the viewport, not crammed into it.

9. **Every new UI element uses design system tokens.** No hardcoded colors, font sizes, spacing, or radii.

10. **Accessibility baseline is met.** Skip link, ARIA live regions for SSE updates, focus management on selection and overlay, reduced motion support, color contrast validation.

11. **The baseline question has an answer.** The frontend-designer has evaluated all three paths (A: 21px, B: dual-rhythm, C: 18px/36px) through mockup comparison and documented the decision before component implementation begins.

---
**Sign-off:** Pending
