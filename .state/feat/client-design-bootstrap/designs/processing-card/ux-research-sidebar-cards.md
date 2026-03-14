# UX Research: Sidebar List Items — Glass Cards vs Flat Rows

**Research brief** — What is the better UX pattern for sidebar session list items in Erika: glass morphism cards with rounded corners, or flat/minimal list rows? This came out of a specific mismatch: the design system defines glass cards (backdrop-blur, border-radius, cyan glow) for content areas, while the current sidebar implementation uses flat rows with a left-border accent for selection. The user noticed the gap and wants a principled answer before locking the sidebar treatment.

**Branch:** `feat/client-design-bootstrap`
**Date:** 2026-03-12
**Researcher:** UX Researcher agent

---

## Current State Observed

From the screenshots at `.state/feat/client-design-bootstrap/`:

- `references/current-sidebar-1440.png` — the live sidebar before the redesign: flat transparent rows, status dot on the right, left-border accent for selected state, filter pills wrapping to a second line.
- `screenshots/stage7-sidebar-redesigned.png` — the sidebar after the redesign handoff: flat transparent rows with the dot moved left, compact monospace filename, dimmed metadata. No glass, no rounded corners.
- `designs/processing-card/screenshot-variant-e-accurate.png` — the Variant E processing-card mockup: flat rows with a subtle background tint for the selected state (cyan left border + very faint background fill). Looks clean and scannable at this width.
- `screenshots/stage7-home-1440.png` — the full layout: the main content area uses the design system's glass `.card` components with visible border-radius and glass backgrounds; the sidebar sits to the left with flat rows. The contrast between the two is visible at a glance.

The mismatch is real: sidebar rows look like a different product than the main content area glass cards.

---

## Patterns Found

### Pattern 1: Full-Flat List Rows (zero chrome on items)

**Description:** Items render as transparent rectangular regions that change background color on hover/selection. No individual border, no border-radius, no shadow. The only indicators are: left-border accent for selection, background tint on hover/selected, and optional status icons/dots. Width-spanning rows with edge-to-edge content.

**Examples:**
- VS Code Explorer (file tree) — no background, no border-radius on items; only highlight background on the active row, typically spanning the full sidebar width.
- Figma Layers panel — items are pure rows; hierarchical indentation through padding, not visual containers.
- Linear sidebar (issue list) — flat rows, icon + label, selection shown via a filled background on the row.
- Slack channel list — transparent rows, bold label for unread, background-only selection.
- Discord server list (channels within a guild) — flat rows, color for unread state.
- GitHub file explorer — zero-chrome rows in the repository file tree.
- Notion page list (sidebar) — extremely flat; only hover reveals a faint background on the row.

**Assessment:** This is the near-universal standard for dense, vertically-stacked homogeneous lists in all the tools named above. It is not outdated or boring — it is the correct pattern for the job. The consensus exists for a reason: flat rows are maximally scannable, predictable for the eye, and do not add visual noise around content that is already visually differentiated by status dots and text color.

---

### Pattern 2: Glass / Elevated Cards in Sidebars

**Description:** Each list item is rendered as a visually distinct container: rounded corners (4–12px), background with slight opacity or blur, optional glow border, sometimes a shadow. Every card is a self-contained unit.

**Examples:**
- Apple's macOS Spotlight results (glass container for the full result list, not individual items — important distinction).
- Raycast's command palette (items inside a single glass-containerized region, but individual items are flat rows within that container).
- Some Dribbble-style mockups of "file cards" in sidebars — visually impressive in still images but rarely shipped.
- Spotify's playlist panels (grid cards for browse/discovery, but the "Your Library" sidebar reverted to flat rows in the 2023 redesign because glass cards at sidebar width were cramped and visually overwhelming).

**Assessment:** Glass cards in narrow sidebars are a design pattern that appears often in concept mockups and rarely in shipping software. The reasons are consistent:

1. **Visual weight multiplies with count.** A single glass card looks elegant. Fifteen glass cards in a 260px column looks like a wall of chrome — each card's border and glow competes with every other card's border and glow. The eye has no clear hierarchy signal.
2. **Scanability breaks down.** NN/G research on card layouts vs. lists confirms that card layouts are less scannable than lists. The positioning of individual elements is more predictable in a list, making sequential scanning faster. Cards deemphasize ranking, which is the opposite of what a session list needs.
3. **Border-radius at density clips the status animation.** A processing swoosh that spans the card's full width must be clipped at the rounded corners, which means `overflow: hidden` on the card is required. This works visually but adds compositional complexity for the animation layer.
4. **Glass blur at 15 items is an active performance concern.** `backdrop-filter: blur()` is GPU-accelerated but still triggers compositing layers per element. 15 blurred elements stacked in a scrollable column is measurably more expensive than 15 flat backgrounds, particularly on integrated GPUs. The NN/G glassmorphism article notes this explicitly: heavy blur slows rendering on lower-end devices.

---

### Pattern 3: Compact Glass (Middle Ground — Subtle Rounding, No Blur)

**Description:** Items have rounded corners (4–6px) and a very faint filled background (not blur-based), but no glow border, no backdrop-filter, no shadow. Selection shows an elevated background. The "glass" is achieved entirely through solid background fills with 8–15% opacity, not translucency. This approximates the card aesthetic without the full weight.

**Examples:**
- Vercel's dashboard project list — items in the sidebar have very subtle 4px rounding and a faint hover background, no blur.
- VS Code Explorer in some themes (e.g., One Dark Pro) — the selected item gets a rounded-rect background highlight (4–6px radius) that fills the item row; it reads as a "soft card" because of the rounding but is still a flat background fill.
- Raycast result items — subtle rounded background highlight on selection, transparent at rest.
- JetBrains IDE project tool window — 4px rounding on selection state only, no rounding on at-rest items.
- shadcn/ui Sidebar component (2024–2025) — list items use `rounded-md` (6px) on the selection state only; at rest, items are transparent and row-shaped.

**Assessment:** This is the most interesting middle ground. It adds micro-depth to the selected and hover states without imposing visual weight on every item in the list. The key principle: rounding appears only on active/selected state, not at rest. At rest, items are transparent rows. On hover or selection, the background fill appears with soft corners. This creates the feel of a card when it matters (which item is active) without the wall-of-chrome problem when it doesn't matter (the other 14 items).

---

### Pattern 4: Left-Border Accent + Background Tint (Current Approach)

**Description:** Items are transparent at rest. On selection, a colored left border (2–3px) appears alongside a faint background tint. This is the pattern currently implemented in Erika's sidebar.

**Examples:**
- Atom (original) — pioneered this for open file tabs.
- GitLab sidebar navigation — still uses this.
- Many VS Code themes use this for the selected file.
- Erika's current sidebar — 2px cyan left border + ~8% cyan background tint on selection.

**Assessment:** This is a well-established, high-contrast selection indicator. The left border creates a strong positional anchor that works even at small font sizes. However, the current implementation in Erika shows this pattern in isolation — the item rests on a background that is visually identical to the sidebar container, making non-selected items almost invisible. The flat-row redesign (from the sidebar-redesign-handoff) improves this by dimming at-rest filenames to `text-secondary` and brightening on hover, but the selection indicator remains purely the left border + tint with no rounding.

---

## Competitor Analysis

### VS Code (file explorer, source control panel, extensions)
All three sidebar panels use completely flat rows. No rounding, no glow, no card borders. Selected items receive a `--vscode-list-activeSelectionBackground` highlight that spans the full row width, with no rounding. Hover shows a slightly lighter background. The file icon and indent are the only differentiation besides text. VS Code Explorer is viewed by millions of developers daily; this is the most studied sidebar in the world. Its extreme flatness is a deliberate choice to keep developer attention on file structure, not UI chrome.
Source: https://code.visualstudio.com/api/ux-guidelines/sidebars

### Linear (issue list, team sidebar)
Linear's 2024 redesign explicitly aimed to "reduce visual noise and clutter." Their issue list in the sidebar uses flat transparent rows with a rounded-rect filled background on selection (approximately 4–6px radius on the highlight only). At rest, items are transparent. The selected item looks like a soft card because of the rounded fill, but only one item ever has this treatment at a time. This is Pattern 3 applied precisely.
Source: https://linear.app/now/how-we-redesigned-the-linear-ui

### Figma (layers panel, pages list)
Flat rows, no rounding, no glass. Selected layer or page shows a blue background that spans the row with no border-radius. The exception: Figma uses small rounded chips for component badges/labels, but these are inline elements within a list row, not the row itself. Figma's left panel is famously dense — they run 11px text and 4px vertical padding on list items. Any card chrome would be incompatible with that density.

### Slack (channel list, direct messages)
Flat transparent rows. No rounding at rest. Selected channel shows a rounded-rect filled background (approximately 4px radius) only on the active item. This is identical to the Linear approach: Pattern 3 for the active state, flat/transparent at rest. Slack runs 13px text at approximately 28px row height — 15 channels are visible without scrolling. Glass cards would have required 45px+ rows to accommodate the card chrome.

### Raycast (command list, quicklink list)
Raycast's entire UI is a single glass-morphism window, but individual list items within it are flat rows. The glass effect is applied once to the application window container, not to each list item. This is a crucial distinction — the global glass container gives the whole app its aesthetic, while individual items remain flat for scanability. Selection uses a rounded-rect fill (Pattern 3).
Source: https://developers.raycast.com/api-reference/user-interface

### Spotify (Your Library sidebar, 2023 redesign)
Spotify's 2023 Library panel redesign moved away from album-art "cards" back to flat rows for the browsing list. The stated reason was density and scanability for users with large libraries. Discovery browsing (home, browse) retained card grids because the use case is exploration, not direct lookup. This confirms the pattern: cards for heterogeneous browse, flat rows for homogeneous lookup lists.
Source: https://rausr.com/blog/the-evolution-of-spotify-design/

---

## Best Practices

1. **Cards are for heterogeneous browse. Rows are for homogeneous lookup.** (NN/G) When all items are the same type (session records), rows are faster to scan than cards. Reserve glass cards for the main content area where content varies.

2. **Glass effects belong on containers, not on individual list items.** Raycast, macOS, and modern design systems apply glassmorphism once to the panel that contains the list, not to each item within the list. This achieves the aesthetic without the visual weight multiplication or the performance cost.

3. **Rounding on selection state only is the current best practice.** Linear, Slack, shadcn/ui, VS Code (in many themes), and Raycast all use rounded-rect fill on the active item only. At rest, items are transparent. This creates a clear "selected card" affordance without treating every unselected item as a card.

4. **Density and glass do not mix.** NN/G glassmorphism guidance is explicit: "dense interfaces, data-heavy views, and text-focused screens demand clarity — excessive blur or low-contrast backgrounds can quickly reduce readability and increase cognitive load." A sidebar showing 15 sessions is a dense, text-focused interface.

5. **Visual hierarchy requires contrast between layers.** If the main content area uses full-glass cards with blur + glow, the sidebar must be visually lighter, not equally heavy. Matching the main content's glass treatment in the sidebar would collapse the depth hierarchy — both areas would read as foreground, eliminating the background/navigation + foreground/content distinction that makes multi-panel apps navigable.

6. **Scanability is faster in fixed-position vertical lists.** Eye-tracking research (NN/G) confirms that users scan vertical lists in a more predictable, efficient pattern than cards. A sidebar session list is primarily a navigation element — users scan to find a specific session by name. Maximum scanability beats maximum visual interest.

---

## Accessibility Considerations

- **Glass blur and WCAG contrast:** `backdrop-filter: blur()` on colored elements makes it impossible to guarantee WCAG 2.1 AA (4.5:1) contrast for text within those elements, because the text sits on a variable blurred background. For the main content area glass cards (which hold large text and metadata), this is manageable. For sidebar rows showing truncated monospace filenames at 12px, any blur on the row background is a contrast risk.
- **Focus rings:** Flat rows allow focus outlines to render predictably at the row boundary. Rounded card containers require custom focus ring shapes to match the rounding — if `overflow: hidden` clips the default browser focus outline, users lose keyboard navigation visibility.
- **Reduced motion:** The processing swoosh animation already accounts for `prefers-reduced-motion`. Flat rows make this simpler: the animation layer (before-pseudo-element gradient sweep) is purely decorative and can be stripped without affecting the information-carrying structure of the row.
- **Selection state for screen readers:** Both flat rows and cards can be announced correctly with `aria-selected` on list items. The visual treatment does not affect this.

---

## The Processing Animation Question

The question was specifically raised: does `overflow: hidden` on a rounded card look better or worse than a flat row where the swoosh extends edge-to-edge?

From reviewing the existing variants (`screenshot-variant-e-accurate.png`, `screenshot-variant-e.png`), the current Variant E implementation uses flat rows with the swoosh running edge-to-edge across the full sidebar width (spanning the left border + content area). This has an important visual advantage: the swoosh reads as a scanner — something passing across the entire sidebar region — which reinforces the "system is doing something" metaphor. When clipped inside rounded corners, the swoosh loses its edge-to-edge feel and instead looks like a progress bar inside a contained element. The flat-row version is more thematically correct for the TRON/scanner aesthetic.

If rounded corners are applied to the selected card only, and the processing card is rarely also selected, the rounded overflow clip on processing cards is an acceptable tradeoff. But for the default case where a session is processing but not selected, flat rows are clearly better for the swoosh animation.

---

## Recommendations

Options ranked from most to least appropriate for Erika's sidebar:

### Option 1 (Recommended): Flat rows at rest, rounded-rect fill on selected state only

**Visual treatment:**
- At rest: transparent background, no border-radius, no border on the item itself
- On hover: faint background tint (`--accent-primary` at ~6% opacity), no rounding or 2–4px rounding on the fill only
- On selection: stronger background tint (~10–12% cyan), 4–6px rounding on the fill only (achieved via `border-radius` on the item element, not on a pseudo-element), 2px cyan left border retained
- Processing state: no rounding, full-width swoosh, muted text as in Variant E

**Why it wins:**
- Matches the pattern used by every major tool in the competitive set (Linear, Slack, Raycast, shadcn/ui)
- The selected item reads as a "soft card" because of the rounded fill — this is the concession to the glass card aesthetic without the cost
- Flat at rest means 15 unselected items carry zero visual weight and are maximally scannable
- Processing animation works perfectly edge-to-edge
- No `backdrop-filter` = zero compositing overhead for the list
- Maintains clear hierarchy: sidebar rows (flat, functional) vs. main content glass cards (elevated, content-bearing)

**CSS hint for the selected rounding (no border-radius conflict with the left border):** Apply `border-radius: 0 4px 4px 0` on the selected item so the rounded corners appear only on the right side. The left edge remains square to meet the left border cleanly, or extend the background fill slightly inward from the left border with padding. Alternatively, accept 4px rounding on all four corners and have the left border render on top of the rounded container — the 2px left border visually overrides the rounding at the left edge.

---

### Option 2 (Acceptable): Flat rows with left-border accent only (current post-redesign state)

**Visual treatment:**
- Current implementation as described in `sidebar-redesign-handoff.md`
- No rounding, no fill except for selected (faint tint) and hover

**Why it works:**
- Proven pattern, excellent scanability, no glass conflicts
- Weaker "selected card" affordance than Option 1 — the left border alone is a subtle indicator

**Why it falls short of Option 1:**
- The left-border-only selection is less immediately obvious than a rounded fill
- The mismatch with the main content area glass cards is real but not severe — the sidebar and main content are spatially separated, so some visual language difference is acceptable as hierarchy signaling

---

### Option 3 (Not Recommended): Glass cards on every sidebar item

**Visual treatment:**
- border-radius: 8px on every item
- backdrop-filter: blur(8px) or solid glass fill
- subtle glow border or box-shadow

**Why it fails:**
- 15 glass cards = wall of chrome, zero scanability hierarchy
- `backdrop-filter: blur` at 15 instances in a scrollable list is a performance concern
- WCAG contrast at small monospace text sizes becomes unguaranteed
- Processing animation must be clipped at rounded corners, losing its scanner metaphor
- Collapses the visual hierarchy between sidebar (navigation) and main content (content) — both areas look equally heavy

---

## Final Verdict

Option 1: flat rows at rest + rounded-rect fill on selected state only.

This is what Linear, Slack, Raycast, and shadcn/ui all converged on independently. It is not a compromise — it is the correct design for this interaction model. The "glass card" aesthetic should remain the exclusive language of the main content area, where it signals "this is content worth focusing on." The sidebar's visual job is to disappear when not in use and surface the active session clearly when needed. Rounded fill on the selected state is sufficient and correct.

The `sidebar-redesign-handoff.md` is 90% of the way there. The one addition recommended by this research: add `border-radius: 4px` (or `0 4px 4px 0`) to the selected state background fill. This single change closes the visual gap between the current flat-row treatment and the glass-card design system without any of the downsides of full glass cards.

---

## Sources

- [VS Code UX Guidelines — Sidebars](https://code.visualstudio.com/api/ux-guidelines/sidebars)
- [How we redesigned the Linear UI (part II) — Linear](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Linear Personalized sidebar and new settings pages — Changelog](https://linear.app/changelog/2024-12-18-personalized-sidebar)
- [Glassmorphism: Definition and Best Practices — Nielsen Norman Group](https://www.nngroup.com/articles/glassmorphism/)
- [Cards: UI-Component Definition — Nielsen Norman Group](https://www.nngroup.com/articles/cards-component/)
- [Raycast User Interface API](https://developers.raycast.com/api-reference/user-interface)
- [shadcn/ui Sidebar component](https://ui.shadcn.com/docs/components/radix/sidebar)
- [The Evolution of Spotify's Design — rausr](https://rausr.com/blog/the-evolution-of-spotify-design/)
- [Cards vs. lists, how they impact UX — WebDesignerDepot](https://www.webdesignerdepot.com/2017/01/cards-vs-lists-how-they-impact-ux/)
- [Vertical vs. Horizontal Cards: The UX Tradeoffs That Shape Modern Interfaces — Medium/WebDesignerDepot](https://medium.com/@WebdesignerDepot/vertical-vs-horizontal-cards-the-ux-tradeoffs-that-shape-modern-interfaces-21fc354cbde0)
- [List Design 101 — UXPin](https://www.uxpin.com/studio/blog/list-design/)
- [Glassmorphism UI Features, Best Practices, and Examples — UXPilot](https://uxpilot.ai/blogs/glassmorphism-ui)
- Erika design system: `design/styles/components.css`, `design/styles/layout.css`
- Prior sidebar research: `.state/feat/client-design-bootstrap/UX_RESEARCH.md` (Pattern 7: Dual-Rhythm Density)
- Sidebar redesign handoff: `.state/feat/client-design-bootstrap/designs/sidebar-redesign-handoff.md`
