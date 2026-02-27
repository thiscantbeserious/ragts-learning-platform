# Stage 0: Current Application Audit

**Date:** 2026-02-27
**Method:** Live browsing at http://localhost:5173, uploaded fixtures/sample.cast

## Screenshots Captured

All screenshots taken via Chrome MCP during live exploration:
- Landing page (empty state): Upload zone + "No sessions yet" message
- Landing page (populated): Session card with sample.cast visible
- Landing page (card hover): Blue border on hover, subtle background shift
- Session detail (expanded): All 4 sections visible with terminal content
- Session detail (collapsed): "Test Execution" section collapsed, others open
- App header: "RAGTS" brand link only, left-aligned, on near-black bar

## What Works

1. **Terminal content readability.** Monospace text renders correctly. ANSI colors (green checkmarks, red failures, yellow highlights, cyan paths) are properly translated. Line numbers provide useful reference. The `white-space: pre` approach avoids word-wrap issues.

2. **Fold/unfold is functional.** Clicking section headers toggles content visibility. Sticky headers stay in view while scrolling within a section. The chevron rotation gives clear state indication.

3. **Section header information density.** Each header shows label, type badge (Marker/Detected), line range, and line count. This is the right metadata. The layout is efficient.

4. **Upload zone is clear.** The dashed border, arrow icon, and "Browse files" button communicate the drag-and-drop affordance. The `.cast` code tag adds specificity.

5. **Toast system exists.** Success/error/info variants with animation and dismiss. Functional.

## What Feels Rough

### Color System
- **Everything is hardcoded hex.** `#0f0f0f` background, `#1a1a1a` surfaces, `#4a9eff` as the sole accent. There are at least 12 distinct gray values used across components with no naming convention: `#e0e0e0`, `#b0b0b0`, `#808080`, `#666`, `#555`, `#444`, `#333`, `#2a2a2a`, `#222`, `#1a1a1a`, `#0f0f0f`, `#0d0d0d`.
- **One accent color does everything.** `#4a9eff` is used for the brand, links, hover borders, marker labels, code highlights, the upload button, and the "3 markers" text on session cards. It has no variation -- no lighter/darker shades, no secondary accent.
- **Status colors are ad-hoc.** Success is `#32cd32` (lime green), error is `#ff5050`, info is `#4a9eff` (same as the accent). These feel like random picks rather than a deliberate palette.

### Typography
- **Body text is `system-ui`.** Functional but generic. No character, no brand voice.
- **Monospace is inconsistent.** Session filename uses `'SF Mono', 'Fira Code', monospace`. Upload zone code tag uses the same. Terminal content uses `'Menlo', 'Monaco', 'Courier New', monospace`. These are different stacks that may render differently across platforms.
- **No heading hierarchy.** "Sessions" is the only heading on the landing page at `1.1rem`. The session detail page title is also `1.1rem`. There is no visual difference between page titles and section headings.
- **Font sizes are arbitrary.** Values like `1rem`, `1.1rem`, `0.95rem`, `0.9rem`, `0.85rem`, `0.8rem`, `0.75rem`, `0.65rem` appear without a scale.

### Spacing
- **No consistent spacing scale.** Padding values include `0.25rem`, `0.5rem`, `0.6rem`, `0.75rem`, `1rem`, `1.25rem`, `1.5rem`, `2rem`, `2.5rem`, `3rem`. Gaps include `0.5rem`, `0.75rem`, `1rem`, `2rem`. No 4px/8px grid.
- **Content width mismatch.** Landing page is `720px` max-width, session detail is `960px`. These feel arbitrary rather than designed to a layout grid.

### Interactive Affordances
- **"Back" link feels weak.** The `<- Back` text link on the session detail page is easy to miss. It is the same color as all links (`#4a9eff`) and provides no visual hierarchy.
- **Delete button is a raw `x`.** The session card delete button has no confirmation UX beyond a `window.confirm()` dialog. The `x` is small and has no hover state beyond color change.
- **Section headers lack clear click affordance.** They are `<button>` elements (good for accessibility) but visually look like static dividers. The cursor changes to pointer, but there is no hover state that says "I am interactive." The hover background shift from `#1a1a1a` to `#222` is barely perceptible.
- **No "Edit" button anywhere.** No way to change session metadata after upload.
- **No search or filter.** The session list has no way to find sessions.

### Missing UI
- No search bar or filters on the landing page
- No agent type badges (no agent type data yet, but no visual slot for it)
- No session metadata editing
- No auth screens (login, register, setup)
- No curation affordance on section headers
- No upload modal (only inline zone)
- No breadcrumbs (only a "Back" link)
- No previous/next session navigation
- No 404 page
- No loading skeletons (just "Loading sessions..." text)
- No keyboard shortcuts
- No branding beyond the "RAGTS" text in the header

### Terminal Rendering
- **Line density is comfortable.** `line-height: 1.4` with `font-size: 0.875rem` is readable.
- **Line numbers are useful but monotone.** `#444` text with a `#222` right border. They fade into the background, which is fine, but they could be a subtle design element.
- **No terminal chrome.** The terminal area has a slightly different background (`#0d0d0d` vs `#0f0f0f`) and rounded corners, but no top bar, no faux traffic lights, no visual framing that says "this is a terminal." It just looks like a slightly darker rectangle.
- **Horizontal scroll works but has no indicator.** Long lines scroll horizontally with `overflow-x: auto`, but there is no visual hint that content extends beyond the viewport.

### Personality
- **The UI has zero personality.** The README is irreverent and sharp. The UI is a blank dark page with a blue word "RAGTS" and functional components. Empty state says "No sessions yet. Upload a .cast file to get started." -- this is corporate placeholder copy. The product's voice is completely absent.
- **The header is barren.** Just the brand name. No tagline, no visual mark, no character.
- **Error and empty states are generic.** "Loading session...", "No content available", "This session has no content." -- these could be from any template.

## Summary

The application is functional and the terminal rendering engine is solid. The design problems are: (1) no token system -- every value is ad-hoc, (2) one accent color doing too much work, (3) generic typography with no brand voice, (4) missing interactive states and affordances, (5) completely absent product personality. The terminal content rendering is the strongest part and should be preserved and built upon. Everything else needs to be designed from scratch.
