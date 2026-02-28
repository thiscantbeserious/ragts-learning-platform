# Visual Design Harmony Guide

This guide defines how human visual perception governs design decisions. Every section is grounded in cognitive science, Gestalt psychology, and established design systems theory. Compliance is mandatory, violations are design defects

Project-specific values (palette, fonts, tokens) live in the Penpot design file. This guide provides the principles that determine how those values are composed, proportioned, and verified

---

## Part 1: Design Process

### Human Vision

The visual system processes information in this order. Design must work with it

1. Peripheral vision builds a rough map before the eye moves. Consistent spacing and aligned edges signal order. Random spacing signals chaos
2. Pre-attentive processing (<500ms, unconscious) detects color, size, shape, orientation instantly. One accent pops out. Multiple competing accents cancel each other
3. Gestalt grouping (unconscious) organizes input: close=grouped, similar=related, aligned=continuous. Hardwired, no override
4. Conscious scanning: saccades (20-40ms jumps) between fixations (200-300ms rests). Each fixation costs time. Fewer fixations = better design

Gestalt rules:

| Principle | Rule |
|---|---|
| Proximity | Close = grouped, far = separate. Spacing IS hierarchy |
| Similarity | Same look = same function. Identical cards must have identical structure |
| Continuity | Eye follows lines and edges. Adjacent cards must share alignment lines |
| Common Region | Enclosure = group. Cards and borders create grouping stronger than proximity |
| Figure/Ground | Contrast separates layers. Card surface distinct from page, content distinct from card |
| Symmetry | Balanced = stable. Content distributed within container, not dumped at one edge |

Scanning patterns:
- Layer-cake: eyes hit headings as horizontal bands, skip body. Section headers and card titles must form clear scannable lines
- F-pattern: top scan, then left edge descent. Left-aligned labels create the stem
- Spotted: eyes jump to visually distinct elements. Pre-attentive pop-out

Reading mechanics:
- Return sweeps undershoot by 5-7 characters. Left margins must be adequate
- Line spacing: 120-150% of font size. Below 120% lines interfere. Above 150% lines disconnect
- Minimum text inset from container edge: 16px or 120% of line height, whichever is larger

Use exactly one primary pop-out element per view (accent color or size). Competing pop-outs cancel each other

Verify: section headers form clear horizontal layer-cake bands for scanning [1][2][3][4]

### Mental Model First

Before modifying any element, complete in order:

1. Audit the full target area programmatically. Read every element position, size, content, color, font. Store as ground truth
2. Screenshot (Chrome MCP or export_shape). Look at it. Code audits miss visual defects obvious to the eye: overlapping text, invisible elements, broken alignment
3. Articulate the mental model before writing code: what sections exist, how they flow vertically, which cards share a row and must share alignment lines, reading order within each card, where the eye lands first
4. Plan all changes as a batch per row. Calculate all target positions for adjacent cards at once. Verify cross-card alignment holds. Then apply

### Typographic Baseline Grid

Before placing any element, establish a baseline grid for the entire board. This is the single most important layout tool. When every text element snaps to the same vertical rhythm, cross-element alignment happens automatically

How to establish:
1. Choose a baseline unit derived from the body text line height. If body text is 16px at 1.5 line height, the baseline unit is 24px
2. The board origin Y becomes grid line 0. Every subsequent grid line is at Y + (N x baseline_unit)
3. All text baselines must land on a grid line. This includes text inside cards, section headers, labels, specimens, everything
4. Card top edges and bottom edges should also land on grid lines (or at consistent offsets from them)
5. Card internal padding top should be chosen so that the first text baseline inside the card lands on a grid line

Why this works:
- Two cards side by side at the same Y with the same padding will automatically have aligned title baselines because both snap to the same grid
- A section header and a card title at the same vertical position will share a baseline if both snap to the grid
- Content text across different card types aligns if all cards use the same baseline grid
- Eliminates per-row manual alignment calculations entirely

Implementation:
1. Calculate baseline_unit from base font size and line height
2. For each card row, determine which grid line the card top lands on
3. Card padding top = distance from card top to the nearest grid line where the first text baseline should sit
4. All subsequent text elements within the card are spaced in multiples of baseline_unit
5. Verify: draw horizontal ruler lines across the full board width at each grid line. Every text baseline in every card must touch a ruler line

The baseline grid is invisible scaffolding. It is not rendered in the final design but governs all vertical positioning

### Box-Outline Draft

Before implementing visual content, build the layout as outline boxes on top of the baseline grid. This forces correct distribution and proportion before details distract

Phase 1 - Baseline grid + container outlines:
1. Establish the baseline grid for the full board (see above)
2. Create unfilled rectangles with 1px stroke for every major container: board, sections, card groups
3. Position and size containers so their edges align with grid lines
4. Screenshot the result. Verify: proportions correct? Sections balanced? Card grid uniform? Container edges on grid lines?
5. Fix any layout issues before proceeding

Phase 2 - Element outlines with ruler verification:
1. Within each card outline, add thin rectangles for every element: title line, subtitle line, content area, specimen block
2. Position text line placeholders so their baselines land on the baseline grid
3. Draw horizontal ruler lines across the full board width at key baselines (title row, content row, bottom edge)
4. Screenshot the result. Verify: all title placeholders across a row touch the same ruler line? All content placeholders touch their ruler line? Golden ratio zone split visible? No overlapping outlines?
5. Fix any distribution issues before proceeding

Phase 3 - Implementation:
1. Replace outline boxes with actual elements: text, fills, colors, specimens
2. After each text element is placed, verify its baseline lands on the grid
3. Verify each component visually after implementation (see Visual Verification below)
4. The outline draft + baseline grid is the ground truth. If implementation deviates, the implementation is wrong

### Visual Verification Per Component

Every card or component modified must be visually verified before moving to the next

1. Make programmatic changes
2. Set viewport: `penpot.viewport.center = {x,y}; penpot.viewport.zoom = N;`
3. Screenshot via Chrome MCP or export via export_shape
4. Check: text visible and readable? Spacing proportional? Labels in label zone, content in content zone? Adjacent cards aligned horizontally?
5. If anything is wrong, fix immediately. Do not accumulate defects

Code-level positioning does not guarantee visual correctness. Text rendering, font metrics, and visual weight all affect appearance. The only validation is looking at the result

### Design Directions

Two complementary approaches. Use both

Outwards-to-inwards (top-down decomposition):

- Full page/board: total dimensions, page margins (3-5% width), major sections, column structure
- Sections: proportional height allocation, section padding (2-3%), card grid layout, section header positioning
- Card grid: identical dimensions per type, consistent gaps, uniform padding (5-7% width, equal all sides), alignment lines across adjacent cards
- Card internals: golden ratio zone split (38% label : 62% content), label spacing (0.5x base), content centered in zone, 65-80% fill ratio
- Element tuning: cross-card baseline alignment, visual weight adjustment, text overlap/overflow/cramping check

Bottom-to-top (alignment verification):

Start from the bottom edge of a row and work upward:
- Bottom edges of all cards in a row align on the same Y
- Content bottom baselines align across adjacent cards. In type pairing cards the rendered text bottom edge must match horizontally
- Content zone tops align
- Label zone tops align (= card top + padding, identical if cards share same Y and padding)
- Section header baselines align if multiple headers sit at the same vertical level

Then check vertical lines left-to-right:
- All text left edges share the same parentX within card type
- Section headers left-align with card content left edges
- Card left edges align within their column

Verify: all spacing expressed as proportional relationships, not arbitrary pixel values. Distribution is intentional, whitespace serves a purpose, never leftover [5]

### Core Ratios

Express spacing as ratios, not pixels. Pixels are the output of applying ratios to a specific size

| Ratio | Value | Use |
|---|---|---|
| Golden Ratio | 1:1.618 (~62%:38%) | Two-zone splits, label:content |
| Rule of Thirds | 33%:33%:33% | Three-column grids |
| Modular Scale | base x ratio^n | Typography and spacing steps |
| Fibonacci | 1,1,2,3,5,8,13,21 | Size relationships |

### Cross-Element Alignment

The baseline grid (see above) handles horizontal alignment automatically. If all text baselines snap to the grid, adjacent cards align without manual calculation

Horizontal verification: draw a ruler line across the full board width at any text baseline. It must pass through the equivalent text element in every card in that row. If it hits a title in one card and a description in another, either the card padding or the element spacing is off-grid

Vertical: all text starts at same parentX within card type. Section headers left-align with card content left edges

Verify: every text baseline in every card sits on the baseline grid. Left text edges consistent across all cards in a column [6]

### Text Legibility Audit

Run before considering any design complete:
- No overlap: no two text bounding boxes intersect
- No invisible text: all text meets WCAG AA contrast. #30363d on #141414 = ~1.6:1 = invisible
- No overflow: no text extends beyond container bounds
- No cramping: minimum 16px inset from container edge (or 120% of line height)

---

## Part 2: Color

### Harmony Types

Color harmony uses structured relationships from the color wheel. Choose a scheme intentionally

| Harmony | Wheel Relationship | Character |
|---|---|---|
| Monochromatic | Single hue, varied lightness/saturation | Unified, calm |
| Analogous | 3 adjacent hues | Natural, cohesive |
| Complementary | Opposite hues | High contrast, vibrant |
| Split-Complementary | Base + 2 hues adjacent to complement | Contrast with less tension |
| Triadic | 3 hues at 120 degrees | Vibrant, balanced |
| Tetradic | 2 complementary pairs | Rich, requires careful balance |

Identify which harmony type your palette belongs to. Verify colors follow that relationship on the wheel. Do not add hues outside the scheme without justification

Verify: color scheme follows an identifiable harmony type

### The 60-30-10 Rule

| Proportion | Role | Application |
|---|---|---|
| 60% | Dominant, backgrounds, large surfaces | Neutral base colors |
| 30% | Secondary, text, cards, containers | Neutral text hierarchy |
| 10% | Accent, highlights, interactive elements | Primary and secondary accent colors |

If more than 10% of visible pixels are accent-colored, the balance is broken

Verify: accent colors < 10% of visible area

### Color Roles

Define every color role explicitly:

| Role | Rules |
|---|---|
| Primary accent | Small surfaces only: outlined/ghost buttons, focus rings, active indicators, small badges |
| Secondary accent | Even smaller than primary: category markers, type distinctions |
| Neutral dominant | 3-4 levels of near-neutral tone. No color tint in backgrounds |
| Neutral text | 4 levels: primary, secondary, muted, disabled |
| Semantic | Success, warning, error, info, each needs theme-adjusted variants |

### Saturated Colors on Dark Backgrounds

Highly saturated neon/vivid colors on dark backgrounds cause chromatic vibration. The eye struggles to focus

Full-saturation accents only for:
- Badges/tags < 100px wide
- Icons < 24px
- Thin borders (1-3px): accent borders, focus rings, underlines
- Dot indicators, progress markers
- Interactive affordances on hover/focus (not resting state)

For text in accent colors, desaturate. Mix toward white. Never use raw high-saturation color for readable body/label text. If text visually buzzes against the background, it needs desaturation

For colored backgrounds, use opacity layering:
- Hover: accent at 8-12% opacity over base surface
- Active/selected: accent at 12-18% opacity
- Section tints: accent at 6-10% opacity
- Never use full-saturation fills for containers, cards, or panels

Never pair two saturated colors adjacent without a neutral buffer. Separate with background, border, or 8px+ neutral gap

Verify: no raw high-saturation colors for text or large fills. Desaturated variants used for text and backgrounds. No two saturated colors adjacent without neutral separator

### Background Hierarchy

Dark themes: 3-4 surface levels with subtle lightness steps

| Level | Purpose | HSL Lightness |
|---|---|---|
| Page | Body/viewport background | ~5% |
| Surface | Cards, panels, containers | ~8% |
| Elevated | Dropdowns, tooltips, modal cards | ~11% |
| Overlay | Modal/dialog backdrop | Semi-transparent black |

Lightness steps of ~3% between adjacent levels. Backgrounds must be pure neutral (0% saturation). Tinted backgrounds break 60-30-10. For light themes, invert (lightest = page, darkest = elevated)

Verify: background hierarchy is pure neutral (0% saturation)

### Status Colors

Raw status colors are too harsh against dark and light backgrounds. Adjust for theme

Each status color needs three variants:
1. Text variant, readable on theme surface color
2. Background tint, accent at 8-12% opacity for banners/alerts
3. Icon/badge variant, closer to full saturation (small surface area)

Dark themes: lighter/desaturated text variants, low-opacity tints
Light themes: darker/richer variants for contrast

Verify: status colors have theme-adjusted variants (text, background tint, icon)

### WCAG Contrast

| Context | Minimum Ratio |
|---|---|
| Normal text (< 18px / 14px bold) | 4.5:1 |
| Large text (>= 18px / 14px bold) | 3:1 |
| UI components and graphical objects | 3:1 |

Avoid pure white on pure black, maximum contrast causes eye strain. Soften both ends
Disabled elements are intentionally below AA to signal non-interactivity
Never rely on color alone, pair with icons, labels, or patterns

Verify: all text meets WCAG AA contrast on its background

---

## Part 3: Typography

### Modular Scale

Font sizes generated by a mathematical ratio feel harmonious. Random sizes do not

Formula: `size = base x ratio^n` (positive n = larger, negative n = smaller)

| Ratio | Value | Best For |
|---|---|---|
| Minor Second | 1.067 | Dense data tables |
| Major Second | 1.125 | Documentation |
| Minor Third | 1.200 | UI design, dashboards, apps (standard recommendation) |
| Major Third | 1.250 | Marketing, mixed content |
| Perfect Fourth | 1.333 | Landing pages |
| Perfect Fifth | 1.500 | Hero sections |
| Golden Ratio | 1.618 | Print, portfolios |

Example with base 16px, Minor Third (1.2):

| Step | Size | Usage |
|---|---|---|
| -2 | ~11px | Fine print, captions |
| -1 | ~13px | Small/meta text |
| 0 | 16px | Body text (base) |
| +1 | ~19px | Large body, subheadings |
| +2 | ~23px | H4 |
| +3 | ~28px | H3 |
| +4 | ~33px | H2 |
| +5 | ~40px | H1 |
| +6 | ~48px | Display/hero (rare) |

Round to whole pixels. Not every step must be used

Verify: all font sizes come from the chosen modular scale. No arbitrary sizes outside the scale

### Font Weight Pairing

| Size context | Rule |
|---|---|
| Large headings | Bold (700) or Semibold (600), not Black (900). Size carries emphasis |
| Mid-sized headings | Semibold (600) or Medium (500). Bold feels heavy at these sizes |
| Body text | Regular (400). Maximum readability |
| Small text | Regular (400) or Medium (500). Slightly heavier compensates for small size |

As text gets smaller, weight can increase slightly for legibility. As text gets larger, weight should decrease, size carries emphasis

Anti-patterns:
- Bold (700) for body text reduces readability
- Regular (400) for headings fails to distinguish from body
- Jumping from 400 to 900 without intermediate weights (500, 600, 700)
- More than 3 font weights on a single screen creates visual noise

Verify: font weights follow size-based pairing. No jumps from 400 to 900. Maximum 3 weights per screen

### Line Height

| Text Category | Size Range | Line Height |
|---|---|---|
| Body text | 14-18px | 1.5-1.6 |
| Large body | 19-24px | 1.4-1.5 |
| Small text | 11-13px | 1.6-1.8 |
| Headings | 24-40px | 1.2-1.3 |
| Display text | 40px+ | 1.0-1.15 |
| Monospace/code | Any | 1.5-1.7 |

Inverse relationship: as font size increases, line height ratio decreases. Large text at 1.6 line height looks comically spaced

Verify: line heights follow the size-based table

### Font Family Pairing

- Proportional font: all UI text, headings, body, labels, buttons, navigation
- Monospace font: only terminal/code content, filenames, technical identifiers, code snippets
- No mixing: no monospace headings, no proportional text inside code/terminal areas
- Define fallback stacks (system fonts) for web font failures

Verify: monospace used only for code/terminal/filenames. Proportional font used for all UI text

---

## Part 4: Proportion, Spacing and Layout

Use proportional thinking, ratios and percentages, not fixed pixel values. Pixels are the output of applying proportions to a specific container size

### Golden Ratio as Layout Foundation

The golden ratio (1:1.618, ~62%:38%) creates visual hierarchy by giving the primary element more space

Two-zone vertical split (label zone : content zone):
- Label zone: ~38% of card height
- Content zone: ~62% of card height
- Specimen/content becomes visual hero, labels stay readable

Two-column horizontal split:
- Content: ~62% of width
- Sidebar: ~38% of width

Typography scaling: body x 1.618 = next heading size (16px body -> 26px heading)
Spacing scaling: base spacing x 1.618 = next spacing step

Verify: golden ratio (62:38) used for zone splits where two zones exist [7]

### Modular Spacing Scale

Same principle as typographic scale. Generate spacing from base unit and ratio

`spacing_step(n) = base x ratio^n`

Using base = 8, ratio = 1.5 (Perfect Fifth):

| Step | Value | Nearest 8px | Usage |
|---|---|---|---|
| 0 | 8 | 8 | Tightest coupling: icon + label |
| 1 | 12 | 12 | Fine detail: badge padding |
| 2 | 18 | 16 | Standard internal spacing |
| 3 | 27 | 24 | Card padding, sub-section gaps |
| 4 | 40 | 40 | Section gaps, between card rows |
| 5 | 61 | 64 | Major section breaks |
| 6 | 91 | 96 | Page-level separation |

The ratio between steps creates harmony. Each step is ~1.5x the previous

Verify: spacing scale generated from a modular ratio, not arbitrary pixel picks [8]

### Proportional Padding

Express padding as percentage of container smaller dimension (usually width for landscape)

| Container | Padding % |
|---|---|
| Page/board | 3-5% |
| Section | 2-3% |
| Standard card | 5-7% |
| Compact card (swatch, tag) | 3-4% |
| Inline element (pill, badge) | Fixed 4-8px |

Padding must be uniform on all 4 sides. A card with 5% left but 3% top feels lopsided

Why percentages: 440px card at 5% = 22px (round to 24px). 320px card at 5% = 16px. Proportion stays constant, pixels adapt

Verify: container padding expressed as percentage of container width. Equal padding on all 4 sides

### Content-to-Container Ratio

Target: 65-80% fill. Content bounding box area relative to content area (container minus padding)

| Fill | Effect |
|---|---|
| < 50% | Wasteful, empty |
| 50-65% | Generous, acceptable for hero sections |
| 65-80% | Ideal, content breathes without cramping |
| 80-90% | Dense, only for data tables / code blocks |
| > 90% | Cramped |

Verify: content-to-container fill ratio is 65-80%

### Zone Composition

Cards with mixed content (labels + specimens) compose into zones with proportional vertical splits

Two-zone golden split:
- Label zone (~38%): title, subtitle, description, compact, information-dense
- Content zone (~62%): specimen, demo, the hero

Gap between zones: ~1 spacing step larger than gaps within each zone

Within label zone: tight spacing. Title to subtitle: ~0.5x base. Gestalt proximity keeps them as single group
Within content zone: content vertically centered, or at golden ratio position (~38% from zone top)

Padding shapes (Nathan Curtis): inset (equal all sides), squish (reduced top/bottom by 50%), stretch (increased top/bottom) [9]

### Internal Less-Than-Or-Equal External Rule

Space inside a container must always be less than or equal to the space outside (between containers). Gestalt proximity: elements within a container feel more related to each other than to neighbors

Proportional expression:
- Card internal padding: 1x base proportion
- Card-to-card gap: 1x to 1.5x base proportion
- Section gap: 2.5x to 4x base proportion

If internal spacing equals or exceeds external, elements lose visual grouping. Design looks flat

Verify: internal padding <= external gaps. Related items closer than unrelated items [10]

### Spacing Friendship Model

Gestalt proximity as a practical mental model:

| Level | Distance | Example |
|---|---|---|
| Best friends | 1x base | Heading + description, icon + label |
| Friends | 2x base | Related cards in a row |
| Acquaintances | 3-4x base | Card rows, sub-section boundaries |
| Strangers | 5-8x base | Major section breaks |

Spacing IS hierarchy. Proportional whitespace separates content without visual ornaments

Verify: Gestalt proximity holds, tight inside cards, wider between cards, widest between sections

### Element Distribution

Uniform sizing: elements of the same type must have identical dimensions. Varying widths/heights in a grid of like items reads as a mistake

Gutters:
- Column and row gaps from the same spacing scale
- Consistent proportions within a grid (row gap = column gap, or row gap = 1.5x column gap for wide cards)
- Gutters within a section smaller than gaps between sections

Alignment:
- Left-align text. No centered body text
- Top-align cards in a row
- Baseline-align text elements in a row when possible
- All positions resolve to 8px implementation grid

Vertical balance: when content does not fill available height, center vertically within zone or distribute extra space at golden ratio (62% above, 38% below)

Verify: all cards of same type have identical dimensions. Consistent gutter proportions. Visual rhythm maintained [11]

### Visual Rhythm

Repeating consistent proportional patterns creates rhythm. The eye learns to predict where elements appear

Enforce:
- All section headers use same proportional spacing: [3x gap] HEADER [0.5x gap] description [1x gap] content
- All card grids use same gutter proportion
- All cards of same type use same internal zone structure and padding percentage
- All label-value pairs use same proportional gap

Larger gaps signal section breaks. Smaller gaps signal grouping. These breaks are the hierarchy, deliberate and consistent

Verify: section headers follow consistent proportional spacing pattern. No random gaps

### The 8px Implementation Grid

The 8px grid is the implementation mechanism, not the design principle. Proportion first, then round to nearest 8px

Why 8px: divisible by 2 and 4, aligns with screen densities (1x, 1.5x, 2x, 3x), matches Apple HIG and Material Design. 4px sub-grid permitted for fine adjustments only (icon alignment, border offsets, small badges)

Process:
1. Calculate proportional value (5% of 440px = 22px)
2. Round to nearest 8px (22px -> 24px)
3. Verify rounded value maintains proportional relationship
4. If rounding breaks hierarchy (internal = external), adjust one step

Verify: all final positions resolve to 8px grid [12]

---

## Part 5: Responsive Design

### Breakpoints

| Name | Width | Target |
|---|---|---|
| Mobile | 375px | Phones, stacked layout, touch-friendly |
| Tablet | 768px | Transition point |
| Desktop | 1280px | Primary design target |
| Wide | 1440px+ | Max-width container, centered content |

All pages and components must be designed at both mobile (375px) and desktop (1280px)

### Mobile Treatments

- Cards/lists stack vertically
- Multi-column layouts collapse to single column
- Search/filter controls collapse into dropdown or bottom sheet
- Modals and side panels become full-screen overlays
- Navigation collapses to hamburger/condensed menu
- Wide content (code, terminal, tables) gets horizontal scroll within scrollable container, never on page itself
- Page chrome (headers, section headers, controls) remains fully responsive

### Mobile Rules

- Touch targets: minimum 44x44px (Apple HIG / WCAG 2.5.8)
- Text size: minimum 14px, never smaller
- Increase padding on mobile (thumb-friendly margins)
- No hover states on mobile. Replace with explicit tap targets
- Consider stepping down modular scale ratio for mobile (1.125 instead of 1.200) to prevent oversized headings

Verify: every page/modal has mobile (375px) and desktop (1280px) frame. Touch targets >= 44px. No text < 14px. Wide content scrolls in container, not page. Modals and side panels full-screen on mobile

---

## References

1. https://www.nngroup.com/articles/text-scanning-patterns-eyetracking/
2. https://www.smashingmagazine.com/2014/03/design-principles-visual-perception-and-the-principles-of-gestalt/
3. https://www.interaction-design.org/literature/article/preattentive-visual-properties-and-how-to-use-them-in-information-visualization
4. https://web.mit.edu/6.813/www/sp16/classes/17-typography/
5. https://www.interaction-design.org/literature/article/visual-hierarchy-organizing-content-to-follow-natural-eye-movement-patterns
6. https://www.uxpin.com/studio/blog/alignment-in-design-making-text-and-visuals-more-appealing/
7. https://www.nngroup.com/articles/golden-ratio-ui-design/
8. https://8thlight.com/insights/ra-elational-design
9. https://medium.com/eightshapes-llc/space-in-design-systems-188bcbae0d62
10. https://cieden.com/book/sub-atomic/spacing/spacing-best-practices
11. https://draw-down.com/products/grid-systems-in-graphic-design
12. https://www.designsystems.com/space-grids-and-layouts/
