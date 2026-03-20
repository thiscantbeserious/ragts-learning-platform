# UX Research: Virtual Scrolling and Section Navigation for Terminal Session Viewer

> Research for selecting a virtual scrolling strategy and designing section navigation for Erika's terminal session detail view, which must handle 50+ sections and thousands of lines of terminal output.

---

## Research Brief

**Asked by:** Vision-drafter (via coordinator)
**Branch:** `main`
**Date:** 2026-03-20

Erika's session detail view renders terminal output grouped into sections (Marker, Detected, auto-generated). Sessions from real agent runs can have 50+ sections with thousands of lines of ANSI-styled monospace output. The current design (`design/drafts/session-detail.html`) shows sections with sticky headers and inline content — a full DOM render approach that will not scale. Research is needed on:

1. Virtual scrolling libraries for Vue 3 — state of the art
2. Section navigation patterns for content-heavy apps
3. Terminal-specific rendering challenges (variable height, ANSI)
4. CSS performance patterns (`content-visibility`, lazy rendering, chunked rendering)
5. Navigation usability when 50+ sections are present

---

## Patterns Found

### 1. Three-Tier Rendering Strategy (CSS-First, Virtual-Second, Chunked-Third)

- **Description:** Best-in-class long-document viewers use a layered performance strategy rather than relying on a single technique. First line of defense: `content-visibility: auto` (CSS containment that skips off-screen rendering entirely). Second line: virtual scrolling (only render DOM nodes for visible items). Third line: chunked rendering with `requestIdleCallback` (spread large render operations across idle browser frames).
- **Examples:** VS Code's editor (virtual DOM rows + skip offscreen), Warp terminal (block-based chunked rendering), Google Docs (virtual rendering of document sections)
- **Assessment:** For Erika, the choice between these tiers depends on content type. Terminal sections with known-at-load HTML content are strong candidates for `content-visibility: auto`. Sections with thousands of individual line nodes need virtual scrolling within the section. The two strategies can be combined: virtualize across sections, use `content-visibility` within each rendered section's content.

### 2. `content-visibility: auto` — CSS Containment as a Performance Primitive

- **Description:** `content-visibility: auto` tells the browser to skip rendering (layout + paint) for elements not currently in the viewport. It became Baseline Newly Available in September 2024, now supported across all modern browsers. Must be paired with `contain-intrinsic-size` (or `contain-intrinsic-size: auto`) to give the browser a placeholder height for scroll position calculation, preventing scrollbar jumps.
- **Examples:** web.dev documented 7x rendering performance boost on initial load in a real-world test (232ms → 30ms). Nolan Lawson's 2024 article confirmed meaningful INP improvements.
- **Assessment:** Highly relevant for Erika's section model. Each `<section>` block wrapping terminal content can receive `content-visibility: auto` and `contain-intrinsic-size: auto 300px` (the `auto` keyword causes the browser to cache actual measured height after first render, eliminating the estimate problem). This approach keeps the full DOM intact (important for Cmd+F find-in-page, screen readers, and Erika's own text search) while dramatically reducing initial render cost. **This is the first line of defense and requires zero JavaScript.**
- **Critical caveat:** `content-visibility: auto` does NOT help when sections are already visible. For sessions with only 10–20 sections, all may be on-screen simultaneously — CSS containment provides no benefit there. It shines most when the full session is many screenfulls tall.

### 3. Virtual Scrolling — `@tanstack/vue-virtual` as the State-of-the-Art

- **Description:** True virtual scrolling renders only DOM nodes for items currently in the viewport (plus a buffer). All other items are replaced by invisible spacer elements that maintain scroll position. TanStack Virtual is the headless, composable approach: it provides the math (which indices to render, where to position them) without prescribing markup or styles.
- **Key features (2024–2025):** `useVirtualizer` composable, dynamic height measurement via `measureElement`, `estimateSize` for initial estimates, `shouldAdjustScrollPositionOnItemSizeChange` for scroll jump correction, overscan buffer for smooth scrolling.
- **Assessment:** The leading choice for Vue 3 in 2025. VueUse explicitly recommends it over their own `useVirtualList`. The headless approach fits Erika's design system — no third-party styles to override. Supports variable heights via post-render measurement.
- **Known limitation — the upward scroll stutter problem:** Multiple open GitHub issues (#659, #832, #622) document that scrolling upward through dynamically-measured items causes jumps and stutter. Root cause: when an item's actual height differs from `estimateSize`, the virtualizer adjusts scroll position, which feels like a jump. Mitigation: overestimate `estimateSize` (use the largest likely height), call `shouldAdjustScrollPositionOnItemSizeChange` only at specific positions. This is an inherent limitation of dynamic-height virtual scrolling, not specific to TanStack.
- **For terminal sections specifically:** Each "item" in the virtualizer should be a whole section (header + content), not individual lines. This reduces the item count to 50–100 items and makes height estimation far more accurate than virtualizing thousands of individual lines.

### 4. `vue-virtual-scroller` (Akryum) — The Vue-Native Alternative

- **Description:** Older, Vue-specific library with two components: `RecycleScroller` (fixed or pre-known heights) and `DynamicScroller` + `DynamicScrollerItem` (variable heights, auto-measured). Uses a component-wrapping approach rather than a composable.
- **Assessment:** Actively maintained but showing its age compared to TanStack Virtual. `DynamicScroller` discovers item dimensions as it renders, but does not automatically detect size changes — you must declare `size-dependencies` to trigger re-measurement when content changes. For Erika's read-only terminal content (sections don't change height after render), this is acceptable. However, the component-wrapping API has more boilerplate than TanStack's composable approach, and VueUse's recommendation of TanStack reflects the community consensus.
- **When to prefer it:** If avoiding headless setup complexity is a priority, `DynamicScroller` works well for read-only content. The Vue integration is tighter and less setup is required.

### 5. `vue-virtual-scroll-list` — Superseded, Not Recommended

- **Description:** An older library that has seen minimal updates since 2022. No TypeScript-first design. Fewer GitHub stars than TanStack Virtual.
- **Assessment:** Do not use for new development. Superseded by both TanStack Virtual and vue-virtual-scroller.

### 6. Rolling Your Own with IntersectionObserver — The Lightweight Hybrid

- **Description:** Use IntersectionObserver to track which sections enter/leave the viewport. Sections that leave the viewport have their content replaced with a spacer `<div>` of the measured height. Sections entering the viewport have their content restored. This is a simplified virtual scroller at section granularity (not line granularity).
- **Assessment:** Viable for Erika's specific use case because sections (not lines) are the unit of virtualization. With 50–100 sections, this is manageable complexity. No third-party dependency. Precise control over what "rendering" means for each section (could render a skeleton, the collapsed header, or nothing). Downside: you must manage measured heights, scroll restoration, and edge cases yourself. TanStack Virtual does all of this already.

### 7. Sticky Section Headers — Current Design Pattern

- **Description:** The current `session-detail.html` already uses `position: sticky; top: 0; z-index: 5` on section headers. This is the correct pattern. As users scroll through a section, the header remains visible, providing persistent context about what they're reading.
- **Examples:** MDN documentation (sticky heading while scrolling API reference), GitHub commit history (sticky date groups), VS Code's breadcrumb bar (sticky file path while scrolling).
- **Assessment:** The existing sticky header design is sound. The issue is that with virtual scrolling, `position: sticky` requires careful z-index management and the sticky element must be within the scrollable container, not the virtualizer wrapper. This is a known complexity with TanStack Virtual + sticky elements — the section header must be rendered as part of the virtualizer's item, not as a separate sticky overlay.

### 8. Scrollspy with Active Section Highlight — The Section Navigation Pattern

- **Description:** A fixed or sticky sidebar lists all sections. As the user scrolls, the IntersectionObserver updates which section is "active" — the currently-visible one gets a highlight in the navigation list. Clicking a section in the nav jumps to it.
- **Examples:** MDN Web Docs (right sidebar TOC with active highlight), Stripe documentation (left TOC, active section highlighted), GitHub README rendering (floating TOC on long READMEs), Next.js docs (right sidebar TOC).
- **How it works:** Observe each section's header element. When it intersects the viewport (using `rootMargin: "-10% 0px -85% 0px"` to trigger near the top of the viewport), mark it as active. The -85% bottom margin ensures only the topmost visible section is marked active.
- **Assessment:** The right pattern for Erika's section navigation panel. The session detail view's existing design has a "23 sections" count in the terminal chrome header — this should expand into a navigable section list. Scrollspy is preferable to scroll event polling because it's asynchronous and performant.

### 9. Collapsible Sections — The Accordion Approach

- **Description:** Each section can be individually collapsed (header shown, content hidden). The existing design has chevron toggles. Mass-collapse ("Collapse all") and mass-expand controls allow quick overview.
- **NNGroup verdict (2024):** Accordions on desktop are justified when content is too long and users need selective access. However, NNGroup explicitly warns against accordions when "lots of sections require expansion" — in that case, full sequential scrolling is better.
- **Assessment:** For Erika, the hybrid is right: collapse by default as an opt-in (users start with sections expanded, then collapse noise sections), not as a mandatory pattern. The "fold/unfold with markers" feature described in the README suggests this is already the intended UX. Collapsed sections dramatically reduce virtual scroll complexity — a collapsed section has a fixed, known height (the header height), making virtual scrolling trivial.

### 10. Section Navigation with 50+ Items — Usability Patterns

- **Description:** When there are more sections than fit in a visible list (~15–20 items), additional navigation mechanisms are needed.
- **Patterns found:**
  - **Grouped/hierarchical navigation:** Marker sections form top-level groups; detected/auto sections collapse under their parent marker. Reduces visible items from 50 to 10–15.
  - **Fuzzy search/filter within navigation:** A text input filters the section list in real time. Matches highlighted. Raycast-style keyboard navigation (arrow keys, Enter to jump).
  - **Command palette invocation:** Press `/` or `Cmd+K` within the session viewer to open a command palette listing all sections with fuzzy search. VS Code pattern mapped to session navigation.
  - **Section counter with "Jump to" affordance:** "23 sections — Jump to..." dropdown that shows section names in a popover. Used by GitHub's README TOC and many documentation sites.
  - **Truncated list with expand:** Show first 10 sections, "Show 43 more" button reveals the rest. Reduces initial cognitive load.
- **Assessment:** For Erika, the grouping approach (Marker sections as parents, auto-detected as children) is the most coherent because it maps to the recording structure. This reduces 50+ items to a manageable primary-level list of 10–20 Marker sections. Search/filter within the section panel is the escape valve for power users.

### 11. Warp Terminal's Block-Based Navigation — Direct Competitor Reference

- **Description:** Warp is the most directly comparable product to Erika's session viewer UX. Every command+output becomes a "block" — a collapsible, copyable, rerunnable unit. Blocks can be navigated with keyboard shortcuts. Users can select, share, or collapse individual blocks. The block header persists when collapsed.
- **URL:** https://docs.warp.dev/terminal/blocks/block-basics
- **Assessment:** Warp's "blocks" are exactly Erika's "sections." The key UX lessons: (1) block navigation is keyboard-first (Ctrl+Up/Down to move between blocks in Warp's case), (2) collapsed blocks show the command that created them, (3) the block header acts as a summary of the block's content — Erika's section-header design already does this correctly with the label, badge, and line range. Where Erika diverges: Warp is a live terminal; Erika is a pre-recorded viewer. Erika can therefore invest in richer navigation (timeline, search) that Warp cannot offer.

### 12. VS Code Minimap — Section Overview Alternative

- **Description:** VS Code's minimap provides a pixel-dense overview of the full file on the right edge. Users can click the minimap to jump to any position. Recent VS Code updates (2024) added section header labels to the minimap, so named `// #region` blocks show their names.
- **URL:** https://www.stefanjudis.com/blog/vs-code-minimap-section-headers/
- **Assessment:** A minimap for terminal output would be extremely dense and unreadable (terminal output is not code with visual structure). Not recommended. The scrollspy section list is a better fit. However, a progress bar or position indicator (thin bar on the right edge showing scroll position relative to total height, with section markers as colored tick marks) is a minimap-inspired lightweight alternative worth considering.

### 13. requestIdleCallback for Chunked Rendering

- **Description:** When the entire session HTML is available upfront (server-rendered or loaded), rendering it all at once blocks the main thread. `requestIdleCallback` allows spreading the render across idle frames — render N sections per idle callback until complete.
- **Assessment:** Most useful during the initial load transition. When Erika fetches session data and begins rendering, it should render visible sections immediately (synchronous), then queue remaining sections via `requestIdleCallback`. This prevents a "render cliff" where thousands of DOM nodes materialize at once. Combine with `content-visibility: auto` on the rendered nodes for double benefit.

---

## Competitor Analysis

### Warp Terminal (Block Navigation)

- **URL:** https://docs.warp.dev/terminal/blocks
- **How it handles this:** Every command and its output is a "Block." Blocks can be collapsed (header only), copied as text, rerun, or shared via a permalink. Keyboard navigation: `Cmd+Up`/`Cmd+Down` moves between blocks. Block headers show the command, exit code, and timing. The block model transforms a raw terminal stream into structured, navigable units.
- **Strengths:** Block-per-command granularity is the right mental model. Keyboard navigation is essential for power users. Copy/share actions per-block increase utility.
- **Weaknesses:** Warp is a live terminal, not a viewer — it cannot offer timeline-level navigation or cross-session search. Erika's pre-recorded model unlocks UX that Warp cannot build.

### asciinema Player

- **URL:** https://github.com/asciinema/asciinema-player
- **How it handles this:** Time-based playback with a timeline scrubber. No concept of "sections" — navigation is purely temporal. Users jump to a timestamp, not to a semantic marker.
- **Strengths:** Extremely lightweight, handles ANSI/VT100 precisely via a WASM-based VT emulator.
- **Weaknesses:** No section-based navigation, no content search, no collapsible blocks. Users must watch the recording to understand it — Erika's section viewer is fundamentally superior for comprehension.

### MDN Web Docs (Scrollspy TOC)

- **URL:** https://developer.mozilla.org/
- **How it handles this:** Fixed right sidebar with a list of all sections (h2/h3 headings). Scrollspy highlights the active section using IntersectionObserver. Clicking a section link scrolls to it smoothly. On mobile, the TOC collapses into a sticky dropdown above the content.
- **Strengths:** Canonical scrollspy implementation. The progressive disclosure (right sidebar on desktop, dropdown on mobile) is the correct responsive pattern.
- **Weaknesses:** TOC sections are homogeneous (all headings of similar importance). Erika has heterogeneous sections (Marker vs. Detected vs. auto-split) requiring visual differentiation in the nav.

### Stripe Documentation

- **URL:** https://stripe.com/docs
- **How it handles this:** Left sidebar with hierarchical navigation. Active section highlighted with a left border accent. Scrollspy watches all `h2`/`h3` elements in the content. Deep linking — each section has an anchor.
- **Strengths:** The left-border active indicator (rather than full background fill) preserves readability of section labels. Erika's design system already uses this pattern (`--accent-primary` left border) for selected states.
- **Weaknesses:** Documentation sections are user-written, predictable length. Terminal sessions have wildly varying section lengths (1 line to 500 lines), which breaks scrollspy assumptions about which section is "active" when two are simultaneously visible.

### GitHub Code File View

- **URL:** https://github.com/
- **How it handles this:** For very large files, GitHub uses `content-visibility: auto` on code blocks, and shows a "Load more" button for files exceeding a line threshold. Symbol navigation (jump to function) via the breadcrumb function selector. No virtual scrolling for the code viewer itself.
- **Strengths:** Pragmatic performance approach — CSS containment + pagination for extreme cases. Symbol navigation maps to Erika's section navigation concept.
- **Weaknesses:** GitHub's code viewer is for static reference, not reading comprehension. Erika's learning focus requires richer section context.

### Linear (Issue Detail with Long Descriptions)

- **URL:** https://linear.app
- **How it handles this:** Long issue descriptions are full-DOM rendered but use CSS containment for performance. No virtual scrolling. Navigation is not a concern at issue level — single scroll.
- **Assessment:** Not directly applicable. Erika's session viewer is fundamentally a long-document problem, not a single-item detail problem.

---

## Best Practices

- **Virtual scrolling at section granularity, not line granularity.** Virtualizing individual terminal lines requires managing thousands of items with variable heights. Virtualizing sections (50–100 items) is far more tractable. The section header is always fixed-height (~48px); only the content area has variable height. This hybrid — fixed-height headers, variable-height content — is the sweet spot for TanStack Virtual.

- **Use `content-visibility: auto` as the first performance layer.** Apply it to each section's content container. Pair with `contain-intrinsic-size: auto 200px`. This requires zero JavaScript, works today in all browsers, and immediately reduces rendering cost for sessions with 20+ sections. The `auto` keyword caches actual heights after first render.

- **Overestimate `estimateSize` in TanStack Virtual.** The most reliable fix for upward scroll jumps is providing a conservatively large estimate. For terminal content, a section with 50 lines at ~21px each = ~1050px. For sections with 200 lines = ~4200px. A safe default estimate of 1200px prevents most jump artifacts at the cost of a slightly inaccurate scrollbar initially.

- **Render collapsed sections as fixed-height items.** When a section is collapsed (content hidden), it has exactly one fixed-height item (the header, ~48px). This eliminates the variable-height measurement problem for collapsed sections. Encourage users to collapse heavy sections after reading them.

- **Scrollspy: use `rootMargin: "-10% 0px -85% 0px"` for accurate active detection.** This causes a section to become "active" when its header enters the top 15% of the viewport. Without this offset, sections activate too late (only when the header is at the very top), creating confusing lag between scrolling and the nav highlight.

- **Section navigation panel: group by Marker sections.** Marker sections (user-defined) are the semantic anchors. Detected and auto-split sections are sub-items under their parent Marker. This creates a two-level hierarchy that reduces 50+ items to a manageable primary list.

- **Keyboard navigation between sections is required.** `j`/`k` (Vim-style) or `Ctrl+Down`/`Ctrl+Up` to jump between section headers. Following Warp's precedent, this is the power user navigation path. Implement via `data-section-index` attributes and a central `useSessionNavigation` composable.

- **Section labels must be readable in the navigation panel.** Labels come from recording markers. They may be long (`"Refactoring the authentication middleware to use JWT with refresh tokens"`). Truncate with ellipsis in the nav list, show full label on hover in a tooltip. Keep the nav list at 12–13px with tight line height.

- **Fuzzy search over section names for 30+ sections.** When there are more sections than fit the nav panel (~20–25), add a text input at the top of the section panel. Filter in real time. Match anywhere in the label (not just prefix). Highlight the match substring. Clear with `Escape`.

- **Shallow vs. deep linking to sections.** Each section should have a URL anchor (`#section-3`, `#section-initial-setup`). Erika can generate these from the section label. This enables cross-session referencing, Slack sharing of specific sections, and bookmarking. This is a product differentiator vs. asciinema (time-only) and Warp (no permalinks for sections).

---

## Terminal-Specific Considerations

### ANSI Color Codes in Pre-Rendered HTML

The existing design renders terminal output as pre-rendered HTML with ANSI codes converted to `<span>` elements with CSS classes. This is the correct approach for a viewer (not a live terminal). The WASM package at `packages/vt-wasm/pkg/` handles this transformation server-side.

For virtual scrolling, this means each "line" in the virtual DOM is a `<div>` with pre-rendered HTML content — not raw text. The rendering cost per line is therefore the DOM cost of `<span>` children, not text parsing. For lines with heavy ANSI styling (many color changes), each line may have 10–30 child `<span>` elements. This increases DOM complexity compared to plain text lines.

**Implication:** Virtualizing at the individual line level creates many complex DOM nodes. Virtualizing at the section level (50 nodes instead of 10,000) is strongly preferred.

### Variable Section Heights — The Core Challenge

Terminal sessions have extreme height variance:
- A short section might be a single `$ ls` command with 3 lines of output (height: ~80px)
- A long section might be a full `git diff` with 500 lines (height: ~10,500px)
- A running test suite output might have 2,000 lines (height: ~42,000px)

This 500x height variance is the primary challenge for virtual scrolling. TanStack Virtual's measurement approach handles it, but the upward scroll jump problem is worst with extreme variance. The mitigation strategy: section-level virtualization (not line-level), plus strong encouragement of section collapsing in the UX to normalize heights.

### Sequential Reading vs. Jump Navigation

Terminal sessions are written sequentially by the agent and read sequentially for comprehension. But users also need jump navigation (finding specific tool calls, error sections, specific file edits). These are conflicting access patterns:

- **Sequential reading:** Full scroll, sticky section headers, comfortable line spacing, no virtual scrolling interruptions
- **Jump navigation:** Section TOC, keyboard shortcuts, section search, deep linking

The UX must serve both. The right answer: sequential scroll is the primary mode (no pagination, no forced expansion), with section navigation as an always-visible side panel that does not interrupt the reading flow.

### Find-in-Page Compatibility

`content-visibility: auto` keeps off-screen elements in the DOM and accessibility tree, so browser Cmd+F search works. Virtual scrolling removes off-screen elements from the DOM entirely — browser Cmd+F will not find content in virtualized (not-yet-rendered) sections.

**This is a critical tradeoff.** Erika must provide its own search if virtual scrolling is used. If Erika's use case leans toward "read it once, comprehend the flow," the investment in custom search may be acceptable. If users frequently need to search terminal output, `content-visibility: auto` (which preserves DOM) is safer than true virtual scrolling.

---

## Accessibility Considerations

### WCAG-Relevant Patterns

- **2.1.1 Keyboard:** Keyboard navigation between sections is required. Section nav list items must be focusable. Arrow keys navigate the section list. `Enter`/`Space` jumps to the selected section in the viewer. `j`/`k` within the viewer moves between sections without requiring focus on the nav panel.

- **2.4.1 Bypass Blocks:** The sticky section header serves as a semantic anchor (`<h2>` or `<h3>` level), enabling screen reader navigation by heading. Each section header should render as a semantic heading element, not just a styled `<div>`.

- **2.4.5 Multiple Ways:** Section navigation panel (visual), keyboard shortcuts, and URL anchors provide multiple independent paths to any section.

- **Screen reader + virtual scrolling:** Screen readers read the DOM. If content is virtualized (removed from DOM), screen readers cannot access it. For accessibility, `content-visibility: auto` is strongly preferred over virtual scrolling — it keeps all content in the accessibility tree. If virtual scrolling is used, ARIA live regions must announce section navigation.

- **Reduce motion:** Section-to-section scroll animation should be `scroll-behavior: smooth` by default, but `@media (prefers-reduced-motion: reduce)` should use `scroll-behavior: auto` (instant jump). The section nav active highlight transition (color change) is acceptable even in reduced motion.

- **Collapsed sections:** Collapsed content must have `aria-hidden="true"` on the content container and `aria-expanded="false"` on the toggle button, so screen readers skip hidden content and understand the control's state.

### Color and Contrast in the Section Navigator

Section type badges (Marker, Detected) use color to convey type. These must not rely on color alone. The badge label text (already present in the design) is the accessible fallback.

---

## Recommendations

### Priority 1 — `content-visibility: auto` as the First Optimization (Strongly Recommended, Low Risk)

Before investing in virtual scrolling library integration, apply `content-visibility: auto` + `contain-intrinsic-size: auto 300px` to all section content containers. This is a CSS-only change with no JavaScript risk, preserves browser find-in-page, works with screen readers, and has documented 5–7x rendering improvement for long pages.

Measure performance impact with and without before deciding whether virtual scrolling is additionally needed. For sessions with under 30 short sections, CSS containment alone may be sufficient.

**Erika-specific implementation guidance:**
- Apply to `.session-viewer__content` (the content container inside each section)
- Not to `.section-header` (sticky headers must remain visible at all times)
- Set `contain-intrinsic-size: auto 400px` as a starting estimate (40–50 terminal lines per section at ~21px each)

### Priority 2 — Section-Level Virtual Scrolling with TanStack Virtual (Recommended for Large Sessions)

Use `@tanstack/vue-virtual` to virtualize at section granularity (50–100 items, not 10,000 lines). Key implementation decisions:

- Each virtual item = one section (header + content together, or header + content as a sub-list)
- `estimateSize`: provide a generous overestimate (e.g., 800px) to minimize scroll jumps
- `measureElement`: measure after first render to capture actual heights
- `overscan: 3`: render 3 extra sections above/below viewport for smooth scrolling
- Collapsed sections use a fixed height (header height only, ~48px) — no measurement needed

**Section-level virtualization item count context:**
- 50 sections × ~1000px average height = ~50,000px total scroll height
- Browser max scroll height limit is ~33 million pixels (not a concern)
- Item measurement accuracy is much better at 50 items than 10,000 lines

**Known issue mitigation:** Overestimate `estimateSize`, use `shouldAdjustScrollPositionOnItemSizeChange` only for downward scroll direction.

### Priority 3 — Scrollspy Section Navigation Panel (Recommended as Specified)

Build a sticky section navigation panel (right aside, or as a collapsible overlay drawer on mobile) using IntersectionObserver:

1. Observe each section's `.section-header` element
2. On intersection, update the active section index
3. The navigation panel highlights the active section with a left border in `--accent-primary`
4. Clicking a nav item scrolls to the section (`element.scrollIntoView({ behavior: 'smooth' })`)
5. Use `rootMargin: '-10% 0px -80% 0px'` to trigger activation near the viewport top

**Navigation panel layout for 50+ sections:**
- Group by Marker section (top-level) with detected/auto sub-items collapsed by default
- Show max 20 items before "Show N more" expansion
- Text filter input at top (IntersectionObserver does not need to be interrupted — filter is purely a visual list filter)
- Active section auto-scrolls within the nav list to stay visible

### Priority 4 — Keyboard Navigation Between Sections (Required)

Implement a `useSessionNavigation` composable that:
- Tracks the ordered list of section elements
- `nextSection()` / `prevSection()` scroll to adjacent sections
- Keyboard shortcut bindings: `j`/`k` (Vim), `Ctrl+]`/`Ctrl+[`, or `F6`/`Shift+F6`
- The active section index is shared state between the viewer and the navigation panel

### Priority 5 — Command Palette for Section Jump (Recommended for Power Users)

When 50+ sections are present, add a command palette invocation (press `/` within the session viewer or `Cmd+K` globally) that opens a floating search panel listing all sections. Fuzzy match on section label. Arrow keys to navigate results, `Enter` to jump. This is the Raycast/Linear mental model applied to session navigation.

Rank this lower than scrollspy but higher than section search in the nav sidebar, because the command palette handles the "I know what I'm looking for" case more efficiently than scrolling a 50-item list.

### Priority 6 — Chunked Initial Render with `requestIdleCallback` (Recommended for Heavy Sessions)

When Erika loads session data, render the first screenful synchronously, then queue remaining sections via `requestIdleCallback`. Render 5–10 sections per idle callback. Show a subtle loading indicator at the bottom of the rendered content (a faint shimmer line) until all sections are queued.

This prevents the initial render blocking the main thread when loading a session with hundreds of sections.

### Summary: Pattern Ranking by Fit for Erika's Terminal Session Viewer

| Rank | Pattern | Fit | Rationale |
|------|---------|-----|-----------|
| 1 | `content-visibility: auto` on section content | Essential | Zero JS, preserves find-in-page, 5–7x performance boost |
| 2 | Section-level virtual scrolling (TanStack Virtual) | High | Necessary for sessions >30 heavy sections |
| 3 | Scrollspy section navigation panel (IntersectionObserver) | High | Core navigation for 50+ sections |
| 4 | Sticky section headers (existing design) | Essential | Already implemented; preserve in virtual scroll setup |
| 5 | Collapsible sections (accordion, opt-in) | High | Normalizes section heights; user-controlled content density |
| 6 | Keyboard j/k section navigation | High | Developer tool audience expects keyboard-first navigation |
| 7 | Section grouping by Marker type in nav panel | High | Reduces 50+ nav items to manageable hierarchy |
| 8 | Command palette for section jump | Medium | Power user escape valve for dense sessions |
| 9 | `requestIdleCallback` chunked initial render | Medium | Initial load UX polish for heavy sessions |
| 10 | Fuzzy search within section nav panel | Medium | Progressive disclosure for sessions >30 sections |
| 11 | Virtual scrolling at line granularity | Low | Complexity without proportionate benefit; CSS containment preferred |
| 12 | Minimap-style overview | Low | Terminal output too dense; section tick markers on scrollbar are sufficient |

---

## Sources

- **TanStack Virtual — Introduction** — https://tanstack.com/virtual/latest/docs/introduction
- **TanStack Virtual — Vue Variable Example** — https://tanstack.com/virtual/v3/docs/framework/vue/examples/variable
- **TanStack Virtual — Virtualizer API** — https://tanstack.com/virtual/latest/docs/api/virtualizer
- **TanStack Virtual upward scroll stutter issue #659** — https://github.com/TanStack/virtual/issues/659
- **TanStack Virtual scroll jump issue #832** — https://github.com/TanStack/virtual/issues/832
- **TanStack Virtual shouldAdjustScrollPositionOnItemSizeChange discussion #1013** — https://github.com/TanStack/virtual/discussions/1013
- **vue-virtual-scroller (Akryum) — DynamicScroller** — https://github.com/Akryum/vue-virtual-scroller
- **VueUse useVirtualList** — https://vueuse.org/core/usevirtuallist/
- **7 Best Vue.js Components For Virtual Scrolling (2025)** — https://www.vuescript.com/best-virtual-scrolling/
- **content-visibility: the new CSS property (web.dev)** — https://web.dev/articles/content-visibility
- **CSS content-visibility is now Baseline Newly Available (web.dev, 2024)** — https://web.dev/blog/css-content-visibility-baseline
- **Improving rendering performance with CSS content-visibility (Nolan Lawson, 2024)** — https://nolanlawson.com/2024/09/18/improving-rendering-performance-with-css-content-visibility/
- **content-visibility — 12 Days of Web (2024)** — https://12daysofweb.dev/2024/css-content-visibility/
- **content-visibility MDN** — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility
- **contain-intrinsic-size MDN** — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/contain-intrinsic-size
- **Faster Rendering with content-visibility (DebugBear)** — https://www.debugbear.com/blog/content-visibility-api
- **Sticky Table of Contents with Scrolling Active States (CSS-Tricks)** — https://css-tricks.com/sticky-table-of-contents-with-scrolling-active-states/
- **Scrollspy demystified (Maxime Heckel)** — https://blog.maximeheckel.com/posts/scrollspy-demystified/
- **Creating a Scroll-Spy Menu with Nuxt 3 and IntersectionObserver (DEV)** — https://dev.to/cn-2k/creating-a-scroll-spy-menu-with-nuxt-3-and-intersection-observer-api-3394
- **Lazy Rendering Vue to Improve Performance (Vue.js Developers)** — https://medium.com/js-dojo/lazy-rendering-in-vue-to-improve-performance-dcccd445d5f
- **Lazy Rendering Web UIs with IntersectionObserver (DraftKings)** — https://medium.com/draftkings-engineering/lazy-rendering-web-uis-with-intersectionobserver-api-bc69a4b61325
- **Accordions on Desktop: When and How to Use (NNGroup)** — https://www.nngroup.com/articles/accordions-on-desktop/
- **Warp Terminal Block Basics** — https://docs.warp.dev/terminal/blocks/block-basics
- **Warp Terminal Modern UX** — https://www.warp.dev/modern-terminal
- **VS Code Minimap Section Headers (Stefan Judis, 2024)** — https://www.stefanjudis.com/blog/vs-code-minimap-section-headers/
- **VS Code User Interface** — https://code.visualstudio.com/docs/getstarted/userinterface
- **Command Palette UX Patterns (Medium/Bootcamp)** — https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1
- **Optimizing Large Datasets with Virtualized Lists (Eva Matova, Medium)** — https://medium.com/@eva.matova6/optimizing-large-datasets-with-virtualized-lists-70920e10da54
- **Mastering Virtualization in Modern Web Development (Medium)** — https://medium.com/@pddadson/mastering-virtualization-in-modern-web-development-a-complete-guide-to-virtual-scrolling-and-140cc2afcc95
- **Virtual Scrolling Beyond the Browser's Limit (DEV)** — https://dev.to/kohii/how-to-implement-virtual-scrolling-beyond-the-browsers-limit-16ol
- **Filter UX Design Patterns (Pencil & Paper)** — https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-filtering
