# Baseline Grid Decision: Path C (18px/36px) Adopted

## Status

**Decided** -- Path C adopted. `--baseline: 18px`.

## Decision

Adopt **Path C: 18px baseline / 36px grid** as the universal vertical rhythm for Erika.

Two changes to `design/styles/layout.css`:
1. `--baseline: 21px` becomes `--baseline: 18px`
2. Body background grid repeat changes from `84px` to `72px`

One additional change:
3. `--lh-mono` hardcoded to `20px` (independent of `--baseline`) for terminal reading comfort

## Evaluation Summary

### Path A: 21px Baseline (Not Recommended)

| Factor | Assessment |
|---|---|
| Session card height | 73.5px under current anatomy -- nearly double Linear (36-40px) and Figma (28-32px) |
| Header height | 63px -- tall for a compact developer tool; VS Code title bar is ~35px |
| Search bar | 42px -- above comparable tools (Linear: ~36px, VS Code compact: ~36px) |
| Filter pills | 31.5px -- tall for compact chips (Linear: ~24-28px) |
| Prototype alignment | Gemini screenshots show spacing closer to 18px rhythm, not 21px |
| Subpixel profile | **3 fractional values:** rhythm-quarter (5.25px), rhythm-half (10.5px), btn-height-sm (31.5px) |
| Implementation cost | Zero changes required |

Path A produces the most fractional pixel values of any path. The heavily-used `--rhythm-half` (10.5px) — the standard compact padding token — means every sidebar card, list item, and filter pill inherits subpixel rendering issues. Path A was designed for a reading-focused page layout. The spatial application shell demands higher information density in the sidebar and chrome regions. The component math consistently produces values above industry comparables.

### Path B: Dual-Rhythm 21px/8px (Not Recommended)

| Factor | Assessment |
|---|---|
| Density benefit | Achieves sidebar density through scoped token overrides |
| Complexity cost | Requires maintaining two spacing contexts (`--density: compact` scope + scoped tokens) |
| Developer overhead | Engineers must track which context they are working in at all times |
| Subpixel profile | 3 fractional values in content zones (inherits Path A); 0 in compact zones (8px grid) |
| Philosophical fit | Contradicts the design system's single-source simplicity |
| User testing | Not tested; Path C was tested and accepted |

Path B solves the density problem in compact zones by switching to an 8px grid, which eliminates fractional values there. But it inherits all of Path A's subpixel issues in content zones (rhythm-quarter 5.25px, rhythm-half 10.5px, btn-height-sm 31.5px). The dual-system approach is a defensible engineering compromise for a mature product with frozen layouts. For Erika in active design evolution, the complexity cost is not justified when Path C delivers the same density benefit with a cleaner subpixel profile at near-zero implementation cost.

### Path C: 18px/36px (Adopted)

| Factor | Assessment |
|---|---|
| Session card height | 63px under current anatomy, achievable at 36px with tightened card padding (2x baseline) |
| Header height | 54px -- comparable to modern tool headers |
| Search bar | 36px -- matches Linear, VS Code compact inputs |
| Filter pills | 27px -- matches Linear filter chips |
| Buttons (md) | 36px -- matches Material Design standard button |
| Prototype alignment | Gemini screenshots visually align with 18px rhythm |
| User testing | Visually tested by the user with acceptable results |
| Implementation cost | One token change (`--baseline`), one hardcoded value (background grid) |
| 4px sub-grid | 36px / 4 = 9 (clean). LCM of 18 and 4 is 36 -- both grids sync at every 36px boundary |
| 8px coexistence | LCM of 18 and 8 is 72 -- perfect alignment at `--rhythm-4` |

## Subpixel Comparison Across All Paths

The critical factor: how many derived tokens produce fractional pixel values?

| Token | Path A (21px) | Path B content (21px) | Path B compact (8px) | Path C (18px) |
|---|---|---|---|---|
| `--rhythm-quarter` | **5.25px** | **5.25px** | 2px | **4.5px** |
| `--rhythm-half` | **10.5px** | **10.5px** | 4px | 9px |
| `--btn-height-sm` (×1.5) | **31.5px** | **31.5px** | 12px | 27px |
| `--btn-height-md` | 42px | 42px | 16px | 36px |
| `--btn-height-lg` | 63px | 63px | 24px | 54px |
| `--input-height-sm` | 42px | 42px | 16px | 36px |
| `--header-height` | 63px | 63px | n/a | 54px |
| **Fractional count** | **3** | **3** | **0** | **1** |

**Path A** produces 3 fractional values. `--rhythm-half` at 10.5px is especially problematic — it is the standard compact padding token, used everywhere in sidebar cards, list items, and filter pills. Every compact component inherits subpixel rendering.

**Path B** inherits Path A's 3 fractional values in content zones, but eliminates them in compact zones by switching to an 8px grid. The cost: maintaining two parallel spacing systems (`--density: compact` scoped overrides), which engineers must track at all times.

**Path C** has exactly 1 fractional value: `--rhythm-quarter` at 4.5px. This token is used only for tight internal padding (e.g., card vertical padding). On 2x displays (which are standard in 2026), 4.5px renders as exactly 9 device pixels — clean. On the rare 1x display, browsers round to 4px or 5px — visually indistinguishable from intentional 4px padding. Path A's `--rhythm-quarter` at 5.25px is strictly worse: on 2x displays it becomes 10.5 device pixels, which is STILL fractional.

**Verdict:** Path C has the cleanest subpixel profile of any single-system approach. Path B achieves zero fractional values in compact zones, but only by paying the complexity tax of dual systems — and it still has 3 fractional values in content zones.

## Derived Token Values at 18px

| Token | Formula | Value |
|---|---|---|
| `--lh-xs` through `--lh-xl` | `var(--baseline)` | 18px |
| `--lh-2xl`, `--lh-3xl` | `baseline * 2` | 36px |
| `--lh-mono` | hardcoded | **20px** |
| `--rhythm-quarter` | `baseline / 4` | 4.5px |
| `--rhythm-half` | `baseline / 2` | 9px |
| `--rhythm-1` | `baseline` | 18px |
| `--rhythm-2` | `baseline * 2` | 36px |
| `--rhythm-3` | `baseline * 3` | 54px |
| `--rhythm-4` | `baseline * 4` | 72px |
| `--btn-height-sm` | `baseline * 1.5` | 27px |
| `--btn-height-md` | `rhythm-2` | 36px |
| `--btn-height-lg` | `rhythm-3` | 54px |
| `--input-height-sm` | `rhythm-2` | 36px |
| `--input-height-md` | `rhythm-2` | 36px |
| `--input-height-lg` | `rhythm-3` | 54px |
| `--header-height` | `rhythm-3` | 54px |
| `--grid-gap` | `rhythm-1` | 18px |

## Key Observations

### rhythm-quarter at 4.5px — the one fractional value

Path C's single fractional token. See the subpixel comparison table above for the full cross-path analysis. Summary: Path A has 3 fractional values (including the heavily-used `--rhythm-half` at 10.5px), Path B has 3 in content zones, Path C has only this one. On 2x displays (standard in 2026), 4.5px = 9 device pixels (clean). On 1x displays, browsers round to 4px or 5px. Path A's equivalent (`5.25px`) is worse — 10.5 device pixels on 2x, still fractional.

### btn-height-sm at 27px

Under Path A, `--btn-height-sm` was 31.5px (a fractional value causing subpixel issues). Under Path C, it becomes 27px -- a whole pixel value. This is strictly better.

### --lh-mono hardcoded to 20px

Terminal output sections are reading-intensive surfaces where sustained line-by-line scanning occurs. The 18px line-height for 14px monospace text (ratio 1.286) is acceptable for scanning surfaces (sidebar, headers) but compressed for sustained reading. Hardcoding `--lh-mono: 20px` gives a 1.43 ratio -- comfortable for terminal sessions without requiring the full dual-rhythm system of Path B.

### Session Card Target Height

Under Path C, a session card at 2x baseline = 36px, matching the Gemini prototype. Achieving this requires tightening card padding from `--rhythm-half` to `--rhythm-quarter`. The designer will define the exact card anatomy during component mockups. The key enabler: 36px is now the 2-unit height, making compact cards achievable within the rhythm system rather than fighting it.

### Header Height at 54px

The header drops from 63px to 54px, reclaiming 9px of vertical viewport. On a 1080px display, this means 1026px available for sidebar + main content vs. 1017px under Path A. The difference compounds when the bottom panel activates in future cycles.

The Gemini prototype header visually measures at approximately 36-40px. The designer may want to explore `--rhythm-2` (36px) for the header in the spatial shell, reducing `--header-height` to 36px. This is a separate design decision that can be made during Stage 1 component review.

## Changes Required

### design/styles/layout.css

1. Line 51: `--baseline: 21px` -> `--baseline: 18px`
2. Line 168: `--lh-mono: var(--baseline)` -> `--lh-mono: 20px`
3. Lines 306-317: Background grid repeat `84px` -> `72px` (both horizontal and vertical)
4. Line 319-322: Update the background-position comment (header is now 54px / 3 baselines, grid lines at 0, 36, 72...)

### File header comment

Update the comment block at the top of layout.css:
- "line-height: 1.5 = 21px baseline unit" -> "line-height: 18px baseline unit"
- "background grid uses 42px (2 x baseline)" -> "background grid uses 36px (2 x baseline)"
