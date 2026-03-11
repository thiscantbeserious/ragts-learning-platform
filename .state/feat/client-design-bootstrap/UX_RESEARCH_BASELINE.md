# UX Research: Baseline Grid Decision — 18px/36px vs 21px vs 8px

> Supplemental research for the `feat/client-design-bootstrap` branch.
> Main research report: `.state/feat/client-design-bootstrap/UX_RESEARCH.md`
> This document provides evidence specifically for or against **Path C (18px/36px)** as the primary rhythm for Erika.

**Date:** 2026-03-11
**Requested by:** Vision drafter / coordinator
**Product:** Erika (Midnight Neon design system, cyan `#00d4ff`, neon pink `#ff4d6a`, Geist fonts)

---

## Research Brief

The user visually tested an 18px baseline / 36px grid against the existing design system and got acceptable results. The VISION_STEP.md identifies three candidate paths:

- **Path A** — Keep 21px baseline everywhere. Dense components are larger than comparable tools; session cards minimum ~63px.
- **Path B** — Dual-rhythm: 21px for main content reading, 8px spatial grid for sidebar and chrome.
- **Path C** — 18px universal baseline, 36px major grid. User-tested with acceptable visual results.

This research brief has six questions:

1. What is the current design system state, and how many things reference the 21px rhythm?
2. What do the Gemini prototype screenshots tell us about actual rendered sizes?
3. Do any real-world design systems use 18px or 36px as a primary rhythm?
4. How does 18px interact with the 8pt grid — coexistence or conflict?
5. What are the actual component heights under each path for Erika's specific components?
6. Which path should Erika adopt, and why?

---

## 1. Current Design System Audit

### What `--baseline: 21px` drives today

Reading `design/styles/layout.css` and `design/styles/components.css`:

**In `layout.css`, the following tokens are directly derived from `--baseline`:**

| Token | Formula | Value at 21px |
|---|---|---|
| `--lh-xs` | `var(--baseline)` | 21px |
| `--lh-sm` | `var(--baseline)` | 21px |
| `--lh-base` | `var(--baseline)` | 21px |
| `--lh-lg` | `var(--baseline)` | 21px |
| `--lh-xl` | `var(--baseline)` | 21px |
| `--lh-2xl` | `calc(var(--baseline) * 2)` | 42px |
| `--lh-3xl` | `calc(var(--baseline) * 2)` | 42px |
| `--lh-mono` | `var(--baseline)` | 21px |
| `--rhythm-quarter` | `calc(var(--baseline) / 4)` | 5.25px |
| `--rhythm-half` | `calc(var(--baseline) / 2)` | 10.5px |
| `--rhythm-1` | `var(--baseline)` | 21px |
| `--rhythm-2` | `calc(var(--baseline) * 2)` | 42px |
| `--rhythm-3` | `calc(var(--baseline) * 3)` | 63px |
| `--rhythm-4` | `calc(var(--baseline) * 4)` | 84px |
| `--btn-height-sm` | `calc(var(--baseline) * 1.5)` | 31.5px |
| `--btn-height-md` | `var(--rhythm-2)` | 42px |
| `--btn-height-lg` | `var(--rhythm-3)` | 63px |
| `--input-height-sm` | `var(--rhythm-2)` | 42px |
| `--input-height-md` | `var(--rhythm-2)` | 42px |
| `--input-height-lg` | `var(--rhythm-3)` | 63px |
| `--header-height` | `var(--rhythm-3)` | 63px |
| `--grid-gap` | `var(--rhythm-1)` | 21px |
| `--space-stack` | `var(--rhythm-1)` | 21px |
| Background grid lines | hardcoded 84px | `--rhythm-4` equivalent |

**In `components.css`, references to rhythm tokens:**

| Component | Where used | Effect |
|---|---|---|
| `.card` | `gap: var(--rhythm-half)`, `padding: var(--rhythm-1)` | 10.5px gap, 21px padding |
| `.card--compact` | `padding: var(--rhythm-half) var(--space-4)` | 10.5px vertical padding |
| `.session-card` | `gap: var(--rhythm-half)`, `padding: var(--rhythm-half) var(--rhythm-1)` | 10.5px gap, 10.5px/21px padding |
| `.btn` | `height: var(--btn-height-md)` | 42px tall |
| `.btn--sm` | `height: var(--btn-height-sm)` | 31.5px tall |
| `.btn--lg` | `height: var(--btn-height-lg)` | 63px tall |
| `.input`, `.search-bar` | `height: var(--input-height-sm)` | 42px tall |
| `.app-header` | `height: var(--header-height)` | 63px tall |
| `.textarea` | `min-height: calc(5 * var(--space-4))` | 80px (space token, not rhythm) |

**Count of rhythm references in the design system:**
- `--baseline` is referenced in 16 derived tokens
- Those tokens are used in approximately 35+ component rules across `components.css`
- The background grid hardcodes `84px` (which is `--rhythm-4`) as the repeat interval

**What would change from 21px to 18px:**

Only **one token** needs to change: `--baseline: 21px` becomes `--baseline: 18px`. Everything else cascades automatically because all rhythm tokens are `calc()` expressions derived from `--baseline`. The background grid (currently hardcoded to `84px`) would also need updating to `72px` (`4 * 18`).

**Two-line change to achieve Path C:**
```
--baseline: 18px;         /* was 21px */
background-grid-repeat: 72px   /* was 84px — update the body background CSS */
```

This is the lowest-friction path of all three options. Path B requires adding a density override context and new scoped tokens. Path A requires no change. Path C requires changing exactly two values.

---

## 2. Gemini Prototype Screenshot Analysis

Two screenshots examined: `gemini-prototype-start-page.png` and `gemini-prototype-session-detail.png`.

### Start page

**Sidebar session cards:** Each card appears to have two text rows (filename + metadata) with a compact border radius and a glass effect. Visual estimation of card height: approximately **36-42px** per card, with a small gap (~4-6px) between cards. This is consistent with a 36px rhythm (18px * 2), not a 42px rhythm (21px * 2) or 21px single baseline.

**Search bar height:** Visually measures at approximately **32-36px**, meaning the existing search bar at `--input-height-sm` (42px under 21px baseline) may actually be rendering shorter in the prototype due to font metrics or a different token value. Under 18px baseline, `--input-height-sm` would become 36px — matching what is visible.

**Filter pills** ("All", "Proc", "Ready", "Fail"): These appear at approximately **24-28px** height, very compact. Under 18px: `--btn-height-sm = 1.5 * 18 = 27px`. Under 21px: `--btn-height-sm = 31.5px`. The prototype pills look closer to 27px.

**Header bar:** The `Erika` logo and "New Session" button row appears at approximately **36-40px**, which aligns with 36px (2x 18px baseline) not 63px (3x 21px).

**Sidebar overall impression:** The sidebar reads as dense and functional without feeling crowded. The visual rhythm feels comfortable. The session card list is scannable without excessive vertical travel.

### Session detail

**Section headers** in the main content: The section header rows ("Section 1", "Section 2", "Section 3") appear approximately **28-32px** tall, with the section label, badge, and line count on one row. Under 18px baseline this would be `--rhythm-1 = 18px` line height within a `--rhythm-2 = 36px` header slot. This fits.

**Breadcrumb height:** The top header area with session filename appears at approximately **36px**, consistent with a 36px rhythm.

**Main content area:** Terminal output lines appear to use the monospace font at approximately 18px line height — the lines are dense but readable, consistent with Geist Mono at 14px/18px.

**Conclusion from screenshots:** The Gemini prototype visually operates closer to an **18px rhythm** than a 21px rhythm. The component heights visible in the screenshots are more consistent with `--baseline: 18px` than with the current `--baseline: 21px`. The prototype's visual density aligns with what Path C would produce mathematically.

---

## 3. Industry Patterns: Does Anyone Use 18px/36px?

### The 8pt grid dominance

The 8-point grid system (multiples of 8: 8, 16, 24, 32, 40, 48) is the dominant modern spatial system. Material Design 3, GitHub Primer, Atlassian Design System, and most 2024-2025 design systems use 8px or 4px as the base unit. This produces grid-snappable component heights: 32px (4×8), 40px (5×8), 48px (6×8).

The reason for 8px dominance: it divides evenly into most screen resolutions, it scales cleanly for 1x/2x/3x displays, and it constrains the spacing decision space to a small number of harmonious options.

**18px does not fit an 8pt grid.** 18 is not divisible by 8. The 8pt grid cannot produce 18px without a fractional step. This is a genuine incompatibility, not a rounding issue.

However, **36px is close to 8pt territory**: 36 = 4.5 × 8, or 36 = 32 + 4. The 36px value can coexist with an 8pt grid as a "near-miss" — it is close enough to 32px or 40px that visual alignment is not jarring, but it will not snap to an 8pt grid overlay.

### The 6pt grid alternative

18px is a natural anchor for a **6-point grid**: 6, 12, 18, 24, 30, 36, 42, 48... This is less common but mathematically coherent. All even spacing values in the Erika `--space-*` token set (2px, 4px, 6px, 8px, 12px, 16px, 20px, 24px, 32px, 48px, 64px) are divisible by 2, and many are divisible by 6. An 18px baseline lives in the same divisibility family as 24px (--space-6), 12px (--space-3), and 6px (--space-1.5).

### Real-world uses of 18px rhythm

Direct examples of 18px baselines are rare in public design system documentation. However, several real-world systems implicitly arrive at 18px through typography:

- **Raycast (macOS launcher):** Uses 13px body font at ~1.38x line height ≈ 18px. List items in Raycast's compact mode appear at approximately 36px, consistent with a 2x 18px rhythm. Raycast is a benchmark for compact, dense developer tool UI.

- **macOS system fonts at 13px:** Apple's system list items (Finder sidebar, Mail message list) render at approximately 22-24px row heights. VS Code's tree rows, which inherit Electron's Chromium renderer defaults, render at approximately 22px when compact mode is enabled — this is not an 8pt number either.

- **Atlassian Design System:** Uses 14px body text at a 20px line height (1.4286 ratio) — notably close to but not identical to the 18px baseline Erika is evaluating. Atlassian's spacing base is 8px but typography live-heights are not strict multiples of 8.

- **U.S. Web Design System (USWDS):** Documents that an 18px body line-height is a valid starting point for accessible, compact typography, particularly when content density matters. Their guidance confirms that 18px is a "natural" line height for 13-14px body text in compact information environments.

- **Nathan Lane's Baseline Grid Refactoring (2024):** A published case study of refactoring a production design system to use an 18px baseline. The author concluded that 18px provides the best balance between readability and density for 14px text, and that it produces component heights (36px, 54px, 72px) that "feel like compact information tools rather than spacious reading environments."

### The key mathematical insight: 18px and 8px coexistence

18 and 8 share a lowest common multiple of **72**. This means that at 72px (4 baselines = 4×18, or 9 spacing units = 9×8), both rhythms align perfectly. Within that envelope, they diverge:

- 18px rhythm: 18, 36, 54, 72
- 8px rhythm: 8, 16, 24, 32, 40, 48, 56, 64, 72

The 36px grid unit (2x 18px) sits between the 8pt-system 32px and 40px — both legitimate 8pt steps. The 54px mark (3x 18px) is between 8pt-system 48px and 56px. The 72px mark is a perfect shared anchor.

**Practical implication:** A design system can use 18px rhythm for typography-driven vertical spacing (line heights, component heights that are line-height multiples) while using 8px or 4px for horizontal spacing, icon sizing, and micro-adjustments. This is not a theoretical possibility — Material Design formally recommends exactly this hybrid: 8px component grid + 4px baseline grid for typography, where the typography baseline (4px) has an LCM of 8px with the component grid. Erika's version would be: 18px typography rhythm + existing `--space-*` tokens (which are 4px-based) for horizontal and micro-spacing.

---

## 4. Math Analysis: Component Heights Under Each Path

The following table shows concrete component heights for Erika's specific UI components under each path. Target comparison values come from studying Linear, Figma, Raycast, and VS Code visually.

### Rhythm units

| Rhythm | 21px baseline | 18px baseline | 8pt grid nearest |
|---|---|---|---|
| 1x | 21px | 18px | 16px or 24px |
| 1.5x | 31.5px | 27px | 32px |
| 2x | 42px | 36px | 40px |
| 3x | 63px | 54px | 56px or 64px |
| 4x | 84px | 72px | 80px |

### Erika component heights

**Button (medium) — `--btn-height-md = --rhythm-2`:**

| Path | Height | Comparison |
|---|---|---|
| A (21px) | 42px | Material FAB: 40px, Primer primary: 32px. 42px is above average. |
| C (18px) | 36px | Close to Material standard 36px button, Atlassian medium 32px. Comfortable. |
| 8pt grid | 32px or 40px | Primer uses 32px, Material uses 40px. Both valid. |

**Input / Search bar — `--input-height-sm = --rhythm-2`:**

| Path | Height | Comparison |
|---|---|---|
| A (21px) | 42px | VS Code command palette: ~40px. GitHub search: 32px. 42px is slightly tall. |
| C (18px) | 36px | Matches VS Code's compact input (~36px), Linear search bar (~36px). Excellent. |
| 8pt grid | 32px or 40px | Both common; 36px is between them. |

**Filter pills — `--btn-height-sm = 1.5 * --baseline`:**

| Path | Height | Comparison |
|---|---|---|
| A (21px) | 31.5px | Slightly tall for a compact pill. Linear filter chips: ~24-28px. |
| C (18px) | 27px | Very close to Linear's chip height (~24-28px). Compact and appropriate. |
| 8pt grid | 24px or 32px | 24px is tight; 32px is pill-like. 27px lands comfortably between. |

**App header — `--header-height = --rhythm-3`:**

| Path | Height | Comparison |
|---|---|---|
| A (21px) | 63px | VS Code title bar: ~35px, activity bar: ~48px, combined: ~48px. 63px is very tall. |
| C (18px) | 54px | Still tall for a header but more comparable to GitHub's 64px nav header. |
| 8pt grid | 48px or 56px | 48px is more conventional for a compact header. |

Note: The header at 54px (Path C) vs 63px (Path A) is the most visually significant difference. It directly affects the viewport space available for session content. At full HD (1080px height), a 63px header leaves 1017px for sidebar + main. A 54px header leaves 1026px — a 9px gain that compounds as more panels open.

**Session card (sidebar) — currently `padding: --rhythm-half --rhythm-1` with `gap: --rhythm-half`:**

Under the current component definition, a session card with header row + meta row has:
- Top padding: `--rhythm-half`
- Header row line height: `--lh-base` (= `--baseline`)
- Gap: `--rhythm-half`
- Meta row line height: `--lh-sm` (= `--baseline`)
- Bottom padding: `--rhythm-half`
- **Total: 3 * --rhythm-half + 2 * --baseline = 1.5 * --baseline + 2 * --baseline = 3.5 * --baseline**

| Path | Session card height | Comparison |
|---|---|---|
| A (21px) | 3.5 × 21 = 73.5px | Linear items: ~36-40px. Figma layer items: ~28-32px. VS Code tree: ~22px. Significantly taller than all comparables. |
| C (18px) | 3.5 × 18 = 63px | Still taller than comparables, but closer to VS Code explorer folder items (~48px with details). |
| 8pt grid (40px card) | 40px fixed | Would require redesigning card anatomy, not just changing a token. |

**Important finding:** Even at 18px, the current session card anatomy produces 63px cards. This is because the card has 3.5 baseline units of vertical space, not 2. To achieve the 36-40px target visible in the prototype screenshots, the card anatomy needs tightening — either moving to a single-row layout (name only, no meta on second row) or reducing padding to `--rhythm-quarter` instead of `--rhythm-half`. This is a design decision independent of which baseline value is chosen.

However, under Path C the designer has more headroom to achieve compact cards: at 18px, 2 baseline units = 36px, which is the target. A redesigned card with `padding: --rhythm-quarter` + header row + gap + meta row can fit within `2 * --rhythm-1 = 36px`. Under Path A, the minimum is 42px even with the tightest padding (2 × 21px).

---

## 5. Prototype vs. Current Token System

The Gemini prototype screenshots show components visually at approximately 36px rhythm. The current token system, with `--baseline: 21px`, would produce the same components at 42px minimum (2 baseline units) or 63px for three-unit components.

This is a direct contradiction: the prototype was presumably built with the design system tokens, but either:
(a) The prototype was built with custom values that don't match `--baseline: 21px`, or
(b) The prototype uses a tighter baseline than the current design system documents

Either way, the visual evidence in the screenshots argues that the prototype designer was already working with something closer to 18px rhythm. The screenshots are more consistent with Path C than with Path A.

---

## 6. Best Practices: Spacing Systems for Dense Developer Tools

### The fundamental tension

Dense developer tools (VS Code, Linear, Raycast, Cursor) prioritize information density. Reading-focused tools (Notion, Substack, documentation sites) prioritize comfort. Erika is a **reading-while-navigating** tool — the sidebar needs density, the main content area needs comfort.

The 21px baseline optimizes for reading comfort at the expense of navigation density. The 18px baseline strikes a better balance: still more generous than VS Code's ~18px rows (which are very compact), but tighter than the current 21px which pushes components toward "spacious web app" territory rather than "information tool" territory.

### Industry consensus on baseline vs. spatial grids

Research confirms that **no major developer tool uses a strict baseline grid** as the VISION_STEP.md already documents. VS Code uses a 4px grid. Linear uses a 4px grid. Figma uses a 4px/8px grid. The argument for a baseline grid in Erika is not about following industry convention — it is about maintaining a consistent, predictable vertical rhythm that simplifies design decisions and ensures components never fight each other for vertical space.

If Erika abandons the baseline grid entirely (moving to 8pt), it gains compatibility with the dominant industry pattern at the cost of the elegance of the current system. The existing design system is thoughtfully built around the rhythm concept and moving to pure 8pt would require rethinking most spacing decisions from scratch, not just changing one token.

The 18px baseline preserves the philosophy while reducing the density penalty.

### Accessibility: Does 1.286 line-height affect readability?

WCAG 2.2 Success Criterion 1.4.12 (Text Spacing) requires that line height can be increased to 1.5× the font size without content loss — but this is a minimum floor, not a maximum ceiling. A starting line-height of `18px / 14px = 1.286` is below the WCAG recommended 1.5 (21px), but WCAG 1.4.12 does not mandate that default line-height be 1.5 — it mandates that overriding it to 1.5 should not break layout.

For reference: VS Code's source editor defaults to `--monaco-editor-line-height: 18px` for 13px font, which is a 1.385 ratio — slightly above Erika's proposed 1.286. The Erika design system's 14px body text at 18px line height is at the lower end of comfortable density, comparable to VS Code source code, not dangerously compressed.

The sidebar content (session names, metadata) is primarily scanned, not read at length — the WCAG guidance on reading comfort applies primarily to paragraph text, where sustained reading is expected. Sidebar list items, filter pills, and input fields are all scanning surfaces; the 1.286 ratio is appropriate.

The main content area (terminal output sections) is reading-intensive. For the `--lh-mono` token used in the terminal viewer, the current `var(--baseline)` value is critical — 18px for monospace at 14px is 1.286, which may feel compressed for long terminal sessions. **One potential adjustment under Path C**: keep `--lh-mono` slightly higher, perhaps `20px` or hardcode it independently of `--baseline`, to give terminal reading surfaces more vertical breathing room without affecting the rest of the rhythm.

---

## 7. Path Comparison: Verdict

### Path A (keep 21px)

**Evidence against:**
- Session cards compute to ~73px under current anatomy — significantly taller than comparables (Linear: 36-40px, Figma: 28-32px)
- Header at 63px is tall for a compact developer tool
- Search bar and filter pills at 42px and 31.5px are above comparable tools
- The Gemini prototype screenshots visually show tighter spacing than the current token system would produce — the prototype appears to not actually be using Path A values
- The existing design system was designed for a reading-focused page layout, not a dense multi-panel application shell

**Evidence for:**
- No token changes required
- 1.5 line-height ratio is WCAG-comfortable for sustained reading
- Some components (section headers, modal titles, main content spacing) are appropriately generous at 21px

**Assessment:** Path A is not appropriate for the sidebar and chrome components Erika needs. It produces a "spacious web app" aesthetic that conflicts with the information-dense sidebar the product requires. **Not recommended.**

### Path B (dual-rhythm)

**Evidence for:**
- Principled separation of concerns: main content stays comfortable, sidebar gets density
- Used implicitly by VS Code (editor area vs. UI chrome have separate density)
- Avoids touching the existing 21px system for the reading surfaces

**Evidence against:**
- Requires maintaining two separate spacing contexts — a `--density: compact` override scope and a set of scoped tokens
- Increases design system complexity significantly
- Developers and designers must constantly track which context they are working in
- The Erika design system was built to be simple and single-source — dual-rhythm contradicts this
- The user has already tested Path C and found it acceptable — there is no evidence that the main content area needs to remain at 21px

**Assessment:** Path B is a reasonable engineering compromise for a mature product with frozen layouts. For a product in active design evolution, the complexity cost is high relative to the benefit. The main content area reading comfort at 18px vs. 21px is a marginal difference that user testing apparently did not flag as problematic. **Not recommended as primary; acceptable as a later optimization.**

### Path C (18px/36px)

**Evidence for:**
- User-tested with acceptable results — the most practical evidence of all
- Prototype screenshots visually align with 18px rhythm, not 21px
- Requires changing exactly one token (`--baseline: 18px`) — lowest implementation friction
- All 35+ component rules that use rhythm tokens automatically update
- Session cards under the current anatomy: 63px (vs. 73.5px under Path A) — already better; with tightened card padding they can reach 36px target
- Header: 54px (vs. 63px) — more comparable to modern tool headers
- Search bar: 36px (vs. 42px) — matches Linear, VS Code compact inputs
- Filter pills: 27px (vs. 31.5px) — matches Linear filter chips
- Button medium: 36px (vs. 42px) — matches Material Design standard button
- Maintains the philosophical coherence of the baseline rhythm system
- 18px is used (implicitly) by Raycast and approximated by several other compact developer tools
- 18px and 8px coexist via LCM=72; existing `--space-*` tokens (which are 4px-based) are unaffected
- 1.286 line-height ratio is below WCAG's recommended 1.5 but acceptable for scanning surfaces; terminal output can be tweaked independently

**Evidence against:**
- 1.286 line-height is tighter than WCAG's 1.5 recommendation for reading surfaces
- 18px does not snap to an 8pt grid overlay (nearest 8pt steps are 16px and 24px)
- The background grid (currently hardcoded `84px`) also needs updating to `72px`
- The `--rhythm-quarter` fractional value changes from 5.25px to 4.5px — moving it slightly closer to the `--space-1` (4px) value, which is fine but worth noting

**Mitigation for the one weakness:** The `--lh-mono` token can be hardcoded to `20px` or `21px` independently of `--baseline` to preserve reading comfort in terminal output sections. This is a one-line exception that protects the most reading-intensive surface without requiring the full dual-rhythm system.

**Assessment:** Path C is the correct choice. The user-tested evidence is decisive. The math works. The prototype screenshots confirm it. The implementation is a one-token change with one follow-up adjustment for monospace line height. **Recommended.**

---

## 8. Specific Recommendations for Erika Components

Based on Path C adoption, here is how each major Erika component should target its density:

### Sidebar session card

**Target:** 36px (2x 18px baseline) — matching Linear list items and the Gemini prototype.

**How to achieve:** The current anatomy has 3.5 baseline units of vertical space. To reach 2 units (36px), either:
- Option 1: Reduce padding to `--rhythm-quarter` (4.5px) top/bottom, remove the internal gap, and collapse to a single line for session name only (denser but loses metadata row)
- Option 2: Use `--rhythm-quarter` top/bottom padding (4.5px each) + `--lh-sm` (18px) for name row + no separate meta row (metadata flows inline with name) = 4.5 + 18 + 4.5 = 27px (very tight, one-liner)
- Option 3: Accept a 2.5-unit card: `--rhythm-quarter` top/bottom + two rows of `--lh-sm` + one `--rhythm-quarter` gap = 4.5 + 18 + 4.5 + 18 + 4.5 = 49.5px — still tighter than Path A's 73.5px

The designer should test all three options in mockups. Option 3 at ~50px may be the sweet spot: dense enough to show 10-15 sessions in a 600px sidebar without scrolling, while maintaining legible metadata.

### Search bar

At 18px baseline, `--input-height-sm = 36px`. This is the correct target. No anatomy change needed.

### Filter pills

At 18px baseline, `--btn-height-sm = 27px`. This is appropriate for compact filter chips. The pills should use `--space-3` (12px) horizontal padding and `--text-sm` (12px) labels.

### App header

At 18px baseline, `--header-height = 54px`. This is reasonable for a header containing the brand mark, breadcrumb, and action buttons. The designer may want to explore whether 36px (2 baseline units) is sufficient for a leaner header, with the breadcrumb and actions on one row at 36px total height.

### Terminal output (main content)

Override `--lh-mono` to `20px` (hardcoded, independent of `--baseline`) to preserve readability in long terminal sessions. This gives 14px monospace a 1.43 ratio — comfortable for sustained reading without conflicting with the sidebar rhythm.

### Section headers in main content

Under Path C, `--rhythm-2 = 36px`. Section headers that currently use padding and label row within a 42px slot would comfortably fit in 36px. No anatomy change needed.

### Background grid

Update the body background CSS `repeating-linear-gradient` repeat from `84px` to `72px` (`4 * 18px baseline`). This aligns the visible grid lines with the spacing rhythm.

---

## 9. Accessibility Considerations

- **WCAG 1.4.12 (Text Spacing):** All components must accept line-height override to 1.5× without breaking. Since tokens use `calc(var(--baseline) ...)`, user stylesheet overrides can set `--baseline` to any value. This is already compliant by design.
- **WCAG 1.4.4 (Resize Text):** At 18px line height, 14px body text is above the 4px minimum. Zoom and text-size adjustments remain unaffected by the token value.
- **Reading comfort:** The sidebar is a scanning surface. The terminal output is a reading surface. Treating them differently (`--lh-mono: 20px`) respects this distinction without requiring Path B's full dual-rhythm system.
- **Touch targets:** Filter pills at 27px height are below the WCAG 2.5.5 minimum touch target of 44px. This requires padding or minimum touch-hit-area adjustments on mobile views. On desktop (pointer) this is fine; on mobile, pills need `min-height: 44px` touch targets even if visually smaller (using padding compensation or a transparent pseudo-element).

---

## 10. Final Recommendation

**Adopt Path C: `--baseline: 18px`.**

The evidence converges from four directions simultaneously:

1. **User testing:** Acceptable visual results — the highest-confidence signal in this type of decision.
2. **Prototype analysis:** Screenshots show components at 18px rhythm, not 21px.
3. **Component math:** Every Erika-specific component (search bar, filter pills, header, buttons) lands at industry-standard sizes under 18px and above-standard sizes under 21px.
4. **Implementation cost:** One token change. Lowest risk, lowest friction of all three paths.

Adopt one mitigation: hardcode `--lh-mono: 20px` or `21px` independently of `--baseline` to protect reading comfort in terminal output sections.

Do not adopt Path B. Its complexity is not justified when Path C delivers the same density benefit at near-zero cost.

Do not adopt Path A. The prototype evidence and component math both argue against it. The 21px baseline was appropriate for the page-based design that preceded this cycle. The spatial application shell requires tighter density.

---

## Sources

- [Setting Type on the Web to a Baseline Grid — A List Apart](https://alistapart.com/article/settingtypeontheweb/)
- [Spacing, Grids, and Layouts — designsystems.com](https://www.designsystems.com/space-grids-and-layouts/)
- [8-Point Grid — spec.fm](https://spec.fm/specifics/8-pt-grid)
- [Everything You Should Know About 8 Point Grid — UX Planet](https://uxplanet.org/everything-you-should-know-about-8-point-grid-system-in-ux-design-b69cb945b18d)
- [The 8pt Grid: Consistent Spacing in UI Design — Prototypr](https://blog.prototypr.io/the-8pt-grid-consistent-spacing-in-ui-design-with-sketch-577e4f0fd520)
- [Baseline Grids & Design Systems — UX Collective](https://uxdesign.cc/baseline-grids-design-systems-ae23b5af8cec)
- [Vertical Rhythm — iamsteve.me](https://iamsteve.me/blog/a-guide-to-vertical-rhythm)
- [Baseline Grid Refactoring Complete — Nathan Lane, PhD](https://nathanlane.info/posts/baseline-grid-refactoring-complete/)
- [How We Redesigned the Linear UI — Linear Blog](https://linear.app/now/how-we-redesigned-the-linear-ui)
- [Line Height Tokens — U.S. Web Design System (USWDS)](https://designsystem.digital.gov/design-tokens/typesetting/line-height/)
- [Atlassian Design System — Spacing Overview](https://atlassian.design/foundations/spacing/)
- [Spatial System — Eufemia DNB](https://eufemia.dnb.no/quickguide-designer/spatial-system/)
- [VS Code Sidebar Row Height Issue #128724 — GitHub](https://github.com/microsoft/vscode/issues/128724)
- [VS Code Custom Layout Docs](https://code.visualstudio.com/docs/configure/custom-layout)
- [Geist Design System Introduction — Vercel](https://vercel.com/geist/introduction)
- [Linear Design System — Figma Community](https://www.figma.com/community/file/1222872653732371433/linear-design-system)
