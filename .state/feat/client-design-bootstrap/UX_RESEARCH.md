# UX Research: Erika Application Shell — Spatial Multi-Panel Foundation

> Research for the spatial architecture and component patterns needed to transform Erika from a page-based prototype into a persistent multi-panel application shell, supporting sessions browsing, upload, filtering, and ambient live status.

---

## Research Brief

**Asked by:** Vision-drafter (via coordinator)
**Branch:** `feat/client-design-bootstrap`
**Date:** 2026-03-11

Erika is moving from a basic page-based Vue app (session list page, session detail page) to a spatial multi-panel shell. The vision requires: a persistent sidebar, a CSS Grid named-area architecture capable of hosting four regions (sidebar, main, aside, bottom), a cognitive start page / empty state, upload affordance, SSE-driven ambient status, and mobile responsiveness.

The research covers six areas:
1. Application shell patterns in developer tools (VS Code, Figma, Linear, Cursor, Raycast, Vercel, Notion)
2. Multi-panel expansion architecture and CSS Grid named areas
3. Skeleton/app shell loading and hydration stability
4. Typography and spacing grids for developer tools — challenging the 21px baseline
5. Empty state and first-launch experience patterns
6. Sidebar session/file list patterns

Design constraints already established: Midnight Neon palette (cyan `#00d4ff`, neon pink `#ff4d6a`, deep dark backgrounds), Geist + Geist Mono fonts, 14px base, current 21px baseline under review.

---

## Patterns Found

### 1. The Five-Region Shell (Activity Bar + Four Content Panels)

- **Description:** The dominant spatial model in mature developer tools. A narrow icon rail (activity bar, ~48px) anchors the left edge and toggles panels. The four content regions — left sidebar (~250px), main content (fills remaining), right aside (~280px), and bottom panel (100–250px tall) — are independently collapsible. All panels except main can go to zero width/height.
- **Examples:** VS Code (five regions), Figma (three columns), Cursor (inherited VS Code model with AI chat added as right panel), Chrome DevTools (configurable split orientation)
- **Assessment:** Directly relevant. Erika's vision maps onto this pattern almost exactly: sidebar (session list) + main (session detail/start page) now, with aside (annotations panel) and bottom (log/terminal replay) defined from day one but collapsed to zero. The activity bar is optional for Erika at this scale — the vision calls for panel toggles in the header bar instead, which is appropriate for a two-to-four panel app (vs. VS Code's eight-plus extensions).

### 2. CSS Grid Named Template Areas as the Shell Contract

- **Description:** The grid defines all content regions up front with `grid-template-areas`. Collapsing a panel sets its column/row to `0fr`, which causes the grid to absorb the space without any component needing to know about adjacent panels. The grid template is infrastructure — pure CSS, no JavaScript dependency.
- **Examples:** VS Code's workbench layout (documented in its custom-layout docs), Mantine AppShell component (open-source UI kit with explicit `Navbar`, `Aside`, `Header`, `Footer`, `Main` regions), the "Holy Grail" layout pattern generalized to four-region apps
- **Assessment:** This is the correct architecture for Erika. The alternative — nested flexbox — works for two panels but creates cascading restructuring when adding a third or fourth panel. Named grid areas eliminate this brittleness. Critical detail from the research: panels that will be added later must be declared in the grid template from the start. You cannot add a grid area without restructuring the template, so the full four-region template (`sidebar`, `main`, `aside`, `bottom`) must be defined now even though `aside` and `bottom` start at `0fr`.

### 3. Grid Column/Row Transition for Panel Animation

- **Description:** CSS now supports interpolation of `grid-template-columns` and `grid-template-rows`, enabling panels to animate open and closed by transitioning between `0fr` and a target value. The `0fr` state collapses the panel while keeping the grid area declared (required for the technique to work — a missing grid area cannot be transitioned into existence).
- **Examples:** CSS-Tricks documented this pattern; it's now supported in Chrome, Firefox, and Safari as of 2023–2024. Stefan Judis's snippet is the canonical minimal example for height animation. The Tailwind community discussion confirmed `0fr`→`1fr` for height as the modern alternative to `max-height` hacks.
- **Assessment:** Use this for Erika's panel open/close transitions. Caveat: grid transitions trigger layout recalculation on every frame, which is mid-pipeline rendering cost. For panels that open rarely (not every frame), this is acceptable. Keep transition duration at 150–200ms (Erika's `--duration-fast` at 150ms or `--duration-normal` at 250ms). Do not use `repeat()` functions in animated grid templates — set column widths individually to avoid interpolation bugs in some browsers.

### 4. Panel State Persistence via localStorage

- **Description:** Every mature panel-based tool stores panel visibility, width/height, and scroll position in `localStorage` and restores them on reload. VS Code persists layout state. Figma restores sidebar widths. Linear persists sidebar collapse state. This creates "workspace memory" — the app remembers the user's spatial preferences.
- **Examples:** VS Code (documented in Custom Layout docs), Figma (sidebar width restored between sessions), Mantine AppShell (collapse state persists with `useDisclosure` + custom persistence)
- **Assessment:** Erika should persist sidebar open/closed state and sidebar width (once resizable). A Vue composable wrapping `localStorage` read/write handles this cleanly. Panel state should restore silently on load — no visible transition during initial render (suppress transitions during hydration to prevent flash).

### 5. Critical CSS Shell — Layout Before JavaScript

- **Description:** The app shell CSS must define the grid template before Vue hydrates. If the grid is defined inside a Vue component's scoped styles or loaded as part of the Vue bundle, users will see a flash of un-gridded content (FOUC) or layout shift (CLS) as JavaScript hydrates. The correct pattern: the grid template CSS is inlined in `<head>` or loaded as a blocking stylesheet, so the spatial structure exists at first paint.
- **Examples:** Google's App Shell model (web.dev), GitHub's critical CSS approach, the broader CLS prevention literature. A measured case showed skeleton loading reduced layout shift by 92%.
- **Assessment:** For Erika, `design/styles/layout.css` (or a dedicated `shell.css`) should contain the grid template and be loaded as a blocking `<link>` in `index.html`. The shell grid areas exist at first paint. Vue components mount into pre-existing grid areas. Skeleton pulse animations play inside pre-positioned areas, so when real content arrives there is zero layout shift.

### 6. Skeleton Loaders Matching Final Layout Structure

- **Description:** Skeleton loaders that don't match the final layout cause a "double shift" — once when the skeleton appears, once when real content replaces it at different dimensions. The correct pattern: skeleton elements are sized identically to the content they represent, live in the same grid areas, and use the same spacing tokens.
- **Examples:** GitHub's file explorer skeleton, Linear's issue list skeleton, Facebook's content placeholders (the originator of the pattern)
- **Assessment:** Erika needs two skeleton states: (1) sidebar skeleton (3–5 shimmer cards at session-card height) and (2) main content skeleton (breadcrumb placeholder, section header placeholders, terminal output shimmer). Both should use `--bg-elevated` base with a shimmer animation using `--accent-primary-subtle` as the highlight color to stay on-palette.

### 7. Dual-Rhythm Density (Compact Chrome + Comfortable Content)

- **Description:** Developer tools routinely apply different density to navigation chrome vs. reading areas. The sidebar uses compact spacing (smaller text, tighter line heights, less padding) to show more items. The main content uses generous spacing for readability. This is not inconsistency — it is intentional density differentiation.
- **Examples:** VS Code uses 13px in the file explorer, 14px in the editor status bar, but the editor itself has configurable font sizes with generous line heights. Gmail offers Compact/Default/Comfortable density modes. Figma's layer panel uses ~11px text while the property panel uses ~12px and the canvas uses user-configured sizes. Raycast uses 13px through the command palette and list view.
- **Assessment:** The 21px baseline serves the main content area (terminal output, section headers) extremely well. It creates problems in the sidebar. A session card that needs: session name (one line) + metadata line (section count, age, status) + optional vitals strip = minimum 63px at 21px increments. Linear's equivalent card is ~40px. VS Code's tree items are ~22px. This is a meaningful density gap. The recommendation is a dual-rhythm approach: keep 21px as the content area baseline, adopt an 8px spatial grid for sidebar/chrome components. CSS custom property override on the sidebar region (`--density: compact`) switches relevant spacing tokens.

### 8. Empty State as Product Philosophy Communication

- **Description:** The best empty states do three things simultaneously: communicate system status (nothing here yet, not broken), teach the product's value proposition through the visual itself, and provide a direct path to the first meaningful action. For file/session-based tools, a drop zone is the natural "first action" element.
- **Examples:** Figma's blank canvas (shows grid + "Start designing"), Linear's empty team view (illustrates the product's value through a simple graphic + CTA), Notion's empty page (cursor blinks invitingly), Dropbox Paper's empty state (writing prompt in the content area itself)
- **Assessment:** Erika's vision calls for an animated pipeline visualization (Record → Detect → Curate → Validate → Replay) as the empty state's centerpiece. This is the right instinct. It communicates product philosophy through motion rather than text. The research confirms this approach (NNGroup: use empty states to teach features contextually). One addition: the animation should be subtle enough to not feel overwhelming on first load. A gentle continuous loop at low opacity, with the drop zone and CTA as the primary foreground elements, is the right hierarchy.

### 9. System-Wide Drop Zone Affordance

- **Description:** File-based tools increasingly use the entire viewport as a drop target rather than a single constrained zone. On `dragenter`, the viewport enters a "receiving state" with a border glow and centered overlay. This is more discoverable and more forgiving for users who drag files loosely.
- **Examples:** Figma (whole canvas accepts image drops), Bear (whole app accepts file drops), many Electron apps that handle file associations
- **Assessment:** The vision calls for this correctly. Implementation note from research: the dashed/dotted border convention is well-established for drop zones — it signals "receive here" without requiring text. An animated dashed border (marching ants pattern) is even more expressive. The research recommends a ~100ms transition into the receiving state to feel instantaneous rather than delayed.

### 10. Ambient Status — Live Sidebar as a Living Surface

- **Description:** When background processing is happening, the sidebar communicates it through subtle ambient animations rather than modal progress dialogs or toast chains. A pulsing indicator on the processing item, a shimmer on the session card, or a breathing opacity effect on a status dot all communicate "work is happening" without blocking or demanding attention.
- **Examples:** Vercel's deployment status (sidebar shows build progress with animated dots and state transitions), Linear's sync indicator (subtle spinner near title bar), GitHub Actions sidebar (live status dots update without page reload), Claude.ai's streaming response (animated text arrival)
- **Assessment:** Erika's SSE connection is the engine for this. Each processing session card should carry a status indicator that transitions through states: `uploading` (upload-direction arrow animation) → `processing` (pulsing cyan dot) → `ready` (steady green dot, brief glow burst on transition) → `failed` (pink/red dot, no animation). The research confirms that color alone is insufficient for status — pair color with motion pattern (pulsing = active, steady = done, no pulse = error).

---

## Competitor Analysis

### VS Code

- **URL:** https://code.visualstudio.com/docs/configure/custom-layout
- **How it handles this:** Five-region grid layout with activity bar, primary sidebar, editor group, secondary sidebar (right), and bottom panel. All panels independently collapsible. Panel widths and heights persist across sessions. Custom layout feature (2023+) lets users save and restore named layouts.
- **Strengths:** The most mature panel-based developer tool layout in existence. The "panels as tools, not pages" mental model is exactly what Erika needs. Activity bar provides discoverability without cluttering the main layout. Grid recalculates cleanly when panels toggle.
- **Weaknesses:** The activity bar adds a layer of indirection (click icon to see panel). For Erika at current scale (3–4 panels maximum), header-bar toggles are simpler and sufficient.

### Figma

- **URL:** https://www.figma.com/community/file/1260939392478898674/visual-studio-code-ui-design
- **How it handles this:** Three-column layout — layers panel (left, ~240px), canvas (center, fills), properties panel (right, ~240px). Left panel has tabs: Layers, Assets, Plugins. Right panel is contextual — contents change based on selection state. Both panels independently collapsible via keyboard shortcut or header button.
- **Strengths:** Right panel contextuality is directly relevant to Erika's future annotations panel. When nothing is selected, the right panel can show session metadata; when viewing a section, it could show annotation fields. The tab system within the left panel (Layers vs. Assets) maps to Erika's potential future of "Sessions vs. Projects" in the sidebar.
- **Weaknesses:** Figma's panels are fixed-width by default; resize is available but not obvious to new users.

### Linear

- **URL:** https://linear.app
- **How it handles this:** Single left sidebar (~220px) with navigation tree and filter options. Main content fills the rest. Uses slide-over panels (overlaying content) rather than restructuring the grid when showing details, filters, or settings. No persistent right panel.
- **Strengths:** Extremely clean. The minimal chrome keeps focus on content. Navigation rail pattern (icon + label) works well for a tool with multiple top-level sections.
- **Weaknesses:** The overlay approach forecloses simultaneous information density. You cannot see both a list and a detail panel side-by-side without a popup. This is Linear's intentional design choice (focus, not density), but it is the wrong choice for Erika, where simultaneous session list + session content is the core interaction.

### Cursor IDE

- **URL:** https://cursor.com/product
- **How it handles this:** Inherited VS Code's five-region architecture and added a persistent right panel for AI chat (the product-differentiating panel). Community feedback (2025) reveals tension around the sidebar icon orientation change (vertical to horizontal) — users noticed immediately, indicating how sensitive spatial affordances are.
- **Strengths:** Confirms the pattern: a second panel (AI chat) can be added to a VS Code-style layout without breaking the core model. The right panel is a product feature, not an afterthought.
- **Weaknesses:** Cursor's layout customization requests in community forums (2024–2025) show users want more control over panel positions. This is a sign that the initial layout decisions matter enormously — users build muscle memory around spatial positions.

### Vercel Dashboard

- **URL:** https://vercel.com/geist
- **How it handles this:** Not a multi-panel app — uses page-based navigation. But the Geist design system (which Erika also uses via the Geist fonts) confirms: 14px base font for most UI text, 8px spatial grid for spacing, generous use of `--space-2` (8px) and `--space-4` (16px) as the primary padding values. Vercel's dashboard uses consistent typography hierarchy without a strict baseline grid.
- **Strengths:** Evidence that the 14px base is appropriate for developer tool dashboards. The Geist system's 8px grid produces consistent, visually aligned interfaces without requiring baseline alignment.
- **Weaknesses:** Not directly comparable — Vercel is a page-based navigation tool. Not applicable as an app shell reference.

### Mantine AppShell

- **URL:** https://mantine.dev/core/app-shell/
- **How it handles this:** Open-source React component that formally models the five-region layout: `Header` (top), `Navbar` (left), `Aside` (right), `Footer` (bottom), `Main` (content). Dimensions accept responsive breakpoint objects (e.g., `{ sm: 200, lg: 300 }` for navbar width). Collapse state is tracked separately for mobile vs. desktop. The `offset` property allows hiding sections without reflowing Main — relevant for scroll-to-hide header patterns.
- **Strengths:** Validates the architectural decision to define all regions up front. The mobile vs. desktop collapse distinction is useful — Erika needs both (`collapsed.mobile: true` by default, `collapsed.desktop: false` for sidebar).
- **Weaknesses:** This is a component library, not a pure CSS approach. Erika's architecture is pure CSS Grid + Vue — the Mantine AppShell is useful as a reference model, not an implementation source.

### Carbon Design System (IBM)

- **URL:** https://carbondesignsystem.com/patterns/empty-states-pattern/
- **How it handles this:** Defines empty states across multiple categories: first use, no data, no results, error. First-use empty states include in-context documentation and direct pathways to the first key action. The system uses illustration + heading + body copy + primary CTA as the standard empty state anatomy.
- **Strengths:** The taxonomy (first use vs. no results vs. error) is useful for Erika — each state needs different content. The "first use" state teaches the product; the "no results" state after filtering needs a clear path to clear filters; the error state needs a retry action.
- **Weaknesses:** IBM's enterprise aesthetic (blue, structured, formal) is the opposite of Erika's Midnight Neon personality. The patterns apply; the aesthetics do not.

---

## Best Practices

- **Define all four grid regions from day one.** `sidebar`, `main`, `aside`, `bottom` must exist in `grid-template-areas` before any panel code ships. Declaring them later requires restructuring every component that references a grid area.

- **Grid template in pure CSS, not in Vue.** The CSS Grid shell must be a blocking stylesheet loaded before the Vue bundle. Vue components mount into pre-existing grid areas. This prevents layout shift during hydration.

- **Panel collapse = `0fr` in the grid, not `display: none`.** Using `display: none` removes the area from the grid and causes layout reflow. Using `0fr` collapses it to zero while keeping the area in the template, enabling smooth CSS transitions.

- **Animate panel transitions with `grid-template-columns`/`grid-template-rows` transitions.** 150–200ms, ease-out. Do not animate properties that trigger full layout recalculation on every frame for frequent interactions (scroll, hover). Panel open/close is infrequent — the performance cost is acceptable.

- **Persist panel state in localStorage.** Width (for resizable panels), open/closed state, and scroll position. Restore silently on load, suppressing transitions during the initial hydration frame.

- **Sidebar width: resizable, default ~260px, min 220px, max 360px.** Research confirms 220–300px is the standard range for content-bearing sidebars. 200px is too narrow for the proposed Erika sidebar content (session name + metadata + search + filters + action button). Make it resizable to let users calibrate to their screen.

- **Dual-rhythm density.** Use 21px baseline for the main content area. Use 8px spatial grid for sidebar/chrome components. A CSS custom property (`--sidebar-density: compact`) on the sidebar region switches relevant spacing tokens without touching the baseline system.

- **Empty states: system status + product education + direct action pathway.** One illustration or animation (communicates value), one heading (names the state), one CTA (lowest-friction path forward). No more than one primary action.

- **Drop zones: entire viewport on mobile, prominent zone on desktop.** Use dashed border convention. Animate to "receiving" state on `dragenter` (border glow, centered overlay). Transition in ~100ms. Pair with fallback button for accessibility and keyboard users.

- **Status indicators: color + motion pair.** Pulsing = actively processing. Steady = done. Shifted to error color + no animation = failed. Do not rely on color alone.

- **Skeleton loaders must match final layout dimensions exactly.** Skeletons sized incorrectly cause layout shift when content arrives. Use the same spacing tokens and component heights in both skeleton and real components.

- **Skip link for keyboard users.** Place a visually-hidden "Skip to main content" as the first focusable element. Reveals on focus. Essential for keyboard-only navigation of a sidebar + main layout.

- **Panel toggle keyboard shortcuts.** VS Code, Figma, and Raycast all bind panel toggles to keyboard shortcuts. Erika should define shortcuts for sidebar toggle (`Cmd+B` follows VS Code convention) from the start.

---

## Accessibility Considerations

### WCAG 2.2 Relevant Patterns

- **2.1.1 Keyboard:** All interactive elements — sidebar items, session cards, filter pills, upload button, search input, panel toggles — must be focusable and operable by keyboard alone.

- **2.4.1 Bypass Blocks:** A "Skip to main content" link must be the first focusable element in the DOM. For a sidebar + main layout this is essential — without it, keyboard users must Tab through the entire sidebar to reach the main content area on every page load/session change.

- **2.4.3 Focus Order:** When the user clicks a session in the sidebar and the main content updates, focus should remain in the sidebar (the selection action) unless the user explicitly moves focus to main. Avoid auto-moving focus on selection — this disorients users who want to continue navigating the list.

- **4.1.3 Status Messages:** SSE-driven status updates (session processing, upload complete) must be announced to screen readers via ARIA live regions. Use `role="status"` (polite, non-interrupting) for processing updates and `role="alert"` (assertive, interrupting) for error states. Toast notifications should use `role="status"`.

### Panel and Sidebar Specifics

- **Sidebar collapse on mobile:** When the sidebar slides in as an overlay (below 768px), it should use `aria-modal="true"` on the overlay container and a focus trap. Tab cycles through sidebar controls only while open. `Escape` closes the sidebar and returns focus to the trigger button (hamburger toggle).

- **Session list:** Use `role="list"` + `role="listitem"` or a `<ul>/<li>` structure. Each session card is a listitem with an accessible name (session name). Status indicators should have `aria-label` text that describes the status, not just visual color/animation.

- **Filter pills:** Use `role="group"` with a label like "Filter by status" wrapping the pill set. Each pill is a `<button>` with `aria-pressed` to indicate selection state. All/Processing/Ready/Failed states are named explicitly.

- **Drop zone:** Must support keyboard-activated upload (file picker via Enter/Space on a `<button>` trigger). Screen reader must announce `aria-dropeffect="copy"` on the drop zone. After upload, announce the result in an ARIA live region.

- **Reduced motion:** The pipeline visualization animation on the empty state, the processing pulse indicator, and all panel transitions must respect `@media (prefers-reduced-motion: reduce)`. Disable decorative animations; preserve state-change animations (but make them instant/fade rather than slide/pulse).

### Color Contrast

- Cyan `#00d4ff` on `--bg-surface` (#212136): approximately 7:1 — AAA for text, well above the 4.5:1 AA requirement.
- Neon pink `#ff4d6a` on dark backgrounds: approximately 4.1:1 — passes AA for large text. For body-size text in status labels, verify on each background color used.
- `--text-muted` (#aaaab0) on `--bg-surface`: approximately 4.2:1 — marginal AA. Use sparingly for truly supplementary information, not for primary metadata users need to read.

---

## Recommendations

### Priority 1 — The Grid Architecture (Non-Negotiable)

Adopt CSS Grid named template areas with all four regions defined immediately. The template should be:

```
"brand   header  header  header"
"sidebar main    aside   aside"
"sidebar bottom  bottom  bottom"
```

With collapsed state (this cycle):
- `aside` column: `0fr` (grid area exists, renders nothing)
- `bottom` row: `0fr` (grid area exists, renders nothing)
- `brand` column: a token width matching the sidebar width
- `sidebar` column: `--sidebar-width` (default 260px, resizable)

This belongs in `design/styles/layout.css` as pure CSS, loaded as a blocking stylesheet. This is the single most important structural decision of this cycle. All other patterns are downstream of getting this right.

### Priority 2 — Dual-Rhythm Spacing (Strongly Recommended)

Move sidebar/chrome components off the 21px baseline and onto an 8px spatial grid. The 21px baseline creates session cards that are 57–63px tall minimum — nearly double what Linear (40px) or Figma (32px) use for comparable list items. An 8px grid allows 32px (tight cards), 40px (comfortable cards), 48px (cards with vitals strip) — all reasonable options the designer can iterate on.

The main content area keeps the 21px baseline. The change is scoped to the sidebar region only, implemented by a CSS custom property override on the `.sidebar` class that remaps the `--rhythm-*` tokens to 8px multiples.

This is a design system decision, not a breaking change. The token architecture already supports it via the `--rhythm-*` naming convention.

### Priority 3 — Empty State with Animated Pipeline Visualization (Recommended as Specified)

The vision's proposal for an animated pipeline visualization is the right instinct and is backed by research. Key implementation guidance from the research:

- The animation should loop gently and continuously, at low opacity or scale, as a background element
- The drop zone and primary CTA are the foreground — they should be visually dominant over the animation
- The pipeline nodes (Record, Detect, Curate, Validate, Replay) should be legible but not demanding
- On `prefers-reduced-motion`, reduce to a static graphic with no animation

This serves three purposes simultaneously: teaches Erika's product philosophy, communicates "nothing here yet, that's expected," and draws the eye to the upload action. No competing pattern from the research achieves all three.

### Priority 4 — Session Card Anatomy (Recommended with Constraints)

Based on the dual-rhythm recommendation, the session card should target ~40px height (5 × 8px units) for the base state, with an optional vitals strip adding 8–12px when present. The anatomy:

- Row 1 (primary): session name (truncated with ellipsis), status dot — right-aligned
- Row 2 (secondary): metadata in `--text-muted` at `--text-sm` (12px) — section count, age
- Optional row 3: vitals strip (thin bar, ~8px tall, proportional segments)

Selected state: left border in `--accent-primary` (2px), background shift to `--accent-primary-subtle`. Do not use full background fill — it reduces contrast for the text elements.

Processing state: status dot pulses (CSS animation, 1.5s ease-in-out infinite). Shimmer animation on the card background is optional but effective for conveying active work.

### Priority 5 — Mobile Overlay Sidebar (Required, Defer Resize to Later)

The mobile overlay pattern is well-established and the vision specifies it correctly. On viewports below 768px: sidebar collapses, hamburger toggle in header, `translateX(-100%)` to hide, `translateX(0)` to reveal, backdrop overlay, focus trap while open, `Escape` to close.

Panel resize via drag handle (desktop) is lower priority for this cycle. The research shows mature tools all offer it (VS Code, Figma, Linear), but it is an enhancement on top of a working layout. Defer to a follow-up cycle unless the designer naturally includes the resize handle affordance in mockups.

### Patterns Ranked by Fit for Erika

| Rank | Pattern | Fit | Rationale |
|------|---------|-----|-----------|
| 1 | CSS Grid named template areas, four regions | Essential | Enables all future panel features without rewrite |
| 2 | Dual-rhythm density (21px content / 8px chrome) | High | Sidebar cards are visually proportionate to comparables |
| 3 | Ambient SSE status via pulse/steady/error indicators | High | Erika's live connection is a product differentiator |
| 4 | Empty state as pipeline philosophy visualization | High | Communicates product soul; backed by NNGroup patterns |
| 5 | Critical CSS shell (grid before Vue hydration) | High | Prevents layout shift; required for perceived quality |
| 6 | Viewport-wide drop zone on dragenter | Medium-High | Appropriate for an upload-first product |
| 7 | localStorage panel state persistence | Medium | User experience polish; implement from day one |
| 8 | Skip link + ARIA live regions | Required (WCAG) | Keyboard + screen reader accessibility baseline |
| 9 | Skeleton loaders matching final layout | Medium | Prevents CLS; adds perceived performance polish |
| 10 | Drag handle resize for sidebar | Low (defer) | Enhances but not required for MVP shell |

---

## Sources

- **VS Code Custom Layout documentation** — https://code.visualstudio.com/docs/configure/custom-layout
- **VS Code User Interface reference** — https://code.visualstudio.com/docs/getstarted/userinterface
- **Mantine AppShell component** — https://mantine.dev/core/app-shell/
- **CSS Grid: Holy Grail Layout (DigitalOcean)** — https://www.digitalocean.com/community/tutorials/css-css-grid-holy-grail-layout
- **CSS Grid Template Areas (MDN)** — https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Grid_layout/Grid_template_areas
- **CSS Grid Can Do Auto Height Transitions (CSS-Tricks)** — https://css-tricks.com/css-grid-can-do-auto-height-transitions/
- **Animating CSS Grid (CSS-Tricks)** — https://css-tricks.com/animating-css-grid-how-to-examples/
- **Animated CSS Grid Layouts (web.dev)** — https://web.dev/articles/css-animated-grid-layouts
- **Grid-template-rows MDN** — https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/grid-template-rows
- **How to animate height with CSS grid (Stefan Judis)** — https://www.stefanjudis.com/snippets/how-to-animate-height-with-css-grid/
- **The Trick to Animating Grid Columns (theadhocracy.co.uk)** — https://theadhocracy.co.uk/wrote/the-trick-to-animating-grid-columns
- **8-Point Grid specification (Spec.fm)** — https://spec.fm/specifics/8-pt-grid
- **Spacing, Grids, and Layouts (designsystems.com)** — https://www.designsystems.com/space-grids-and-layouts/
- **Designing Empty States in Complex Applications (NNGroup)** — https://www.nngroup.com/articles/empty-state-interface-design/
- **Empty State UI Pattern (Mobbin)** — https://mobbin.com/glossary/empty-state
- **The Role Of Empty States In User Onboarding (Smashing Magazine)** — https://www.smashingmagazine.com/2017/02/user-onboarding-empty-states-mobile-apps/
- **Drag-and-Drop UX Guidelines (Smart Interface Design Patterns / Vitaly Friedman)** — https://smart-interface-design-patterns.com/articles/drag-and-drop-ux/
- **Sidebar UI Design (Mobbin)** — https://mobbin.com/glossary/sidebar
- **Vercel Geist Design System** — https://vercel.com/geist/introduction
- **Vercel Geist Typography** — https://vercel.com/geist/typography
- **Figma Spacing System and Density Scale (Figma Community)** — https://www.figma.com/community/file/1469423195609152209/spacing-system-and-density-scale
- **Figma Layers Panel Compact Mode discussion** — https://forum.figma.com/t/figma-layers-panel-compact-layers-mode/49485
- **Tree View API (VS Code Extension Docs)** — https://code.visualstudio.com/api/extension-guides/tree-view
- **Primer TreeView component (GitHub)** — https://primer.style/components/tree-view/
- **Carbon Design System Empty States Pattern** — https://carbondesignsystem.com/patterns/empty-states-pattern/
- **Skeleton Loading Screen Design (LogRocket)** — https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/
- **WCAG 2.2** — https://www.w3.org/TR/WCAG22/
- **Skip link (WCAG 2.4.1 guide)** — https://getwcag.com/en/accessibility-guide/skip-link
- **Keyboard Navigation Focus (Accesify)** — https://www.accesify.io/blog/keyboard-navigation-focus-wcag/
- **Cursor IDE flexible panel layout discussion (2025)** — https://forum.cursor.com/t/flexible-panel-layout/127935
- **Cursor IDE layout UI feedback megathread (2025)** — https://forum.cursor.com/t/megathread-cursor-layout-and-ui-feedback/146790
- **Sidebar best practices gallery (2025)** — https://www.navbar.gallery/blog/best-side-bar-navigation-menu-design-examples
