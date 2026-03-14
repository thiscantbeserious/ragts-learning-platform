# Requirements: Erika Spatial Foundation — Application Shell Bootstrap

## Problem Statement

Erika's frontend has functional but minimally-designed page-based components: a session list rendered as a page grid, a session detail page, an upload zone, a toast system, and a header bar that still says "RAGTS." There is no persistent spatial architecture — navigating to session detail loses the session list entirely. There is no SSE client integration, no sidebar as a persistent panel, no search or filter UI, no loading states wired to real components, and no mobile overlay sidebar. The existing components were built to be "barely functional" and need a purposeful design pass against the vision before they earn their place in the spatial shell. This cycle establishes the CSS Grid shell and rebuilds or adapts every surface to meet the quality bar the spatial foundation demands.

## Desired Outcome

After this cycle, Erika has a persistent multi-panel spatial shell built to a deliberate quality standard. The session list is a sidebar that never leaves. Clicking a session updates the main content without navigation. A new user sees a purposeful start page that teaches the product and offers a direct upload path. An uploaded session appears in the sidebar and its processing state updates automatically via SSE without refresh. The layout is stable before JavaScript hydrates. The mobile experience is an intentional overlay sidebar. All six CSS Grid areas are defined from day one so future panels can be activated by changing one CSS value. Every component — whether rebuilt from scratch or adapted from what exists — reflects the Midnight Neon design system at the standard visible in the Gemini prototype screenshots, not the "baseline acceptable" standard of the current codebase.

## Existing Components — Design Review and Purposeful Rebuild

The frontend is not a blank canvas. The following components already exist and are functional at a baseline level. Each requires a design review by the frontend-designer before implementation. The designer's verdict — **rebuild** or **adapt** — drives the implementation approach.

| Component | Location | Current State | Design Review Required |
|---|---|---|---|
| `SessionDetailPage.vue` | `src/client/pages/` | Full terminal rendering, ANSI colors, collapsible sections, line numbers, breadcrumb — standalone page | Yes — evaluate for grid area context, responsive to width changes, skeleton loading, breadcrumb placement in `header` area |
| `SessionList.vue` | `src/client/components/` | Card grid with filename, size, markers, date, delete — renders as page grid, not sidebar | Yes — current grid layout is incompatible with sidebar panel; likely rebuild |
| `UploadZone.vue` | `src/client/components/` | Drag-and-drop + file picker, error handling, loading states, uses `useUpload()` | Yes — system-wide drag target is new; component needs design refresh |
| `ToastContainer.vue` | `src/client/components/` | Auto-dismiss, success/error/info types, positioned bottom-right | Yes — needs ARIA live region additions and design polish |
| `AppHeader.vue` | `src/client/components/` | Sticky, brand mark (currently "RAGTS"), nav links | Yes — rename to "Erika"; integrate into grid `brand` + `header` areas |
| `LandingPage.vue` | `src/client/pages/` | Combines session list + upload zone on one page | Replace with the spatial shell; this page's role disappears |
| Router (`router.ts`) | `src/client/` | `/` → LandingPage, `/session/:id` → SessionDetailPage (page-level navigation) | Yes — routing model changes from page-nav to spatial selection (see R4 note) |
| `useUpload()` | `src/client/composables/` | Upload composable, working | Review for sidebar entry wiring |
| `useSession()` / `useSessionList()` | `src/client/composables/` | Session data composables, working | Review for sidebar integration |
| `useToast()` | `src/client/composables/` | Toast composable, working | Adapt with ARIA live region support |
| Skeleton CSS | `design/styles/components.css` | `.skeleton` shimmer class defined | Never used; wire to actual skeleton loader components |
| CSS loading (`main.ts`) | `src/client/main.ts` | All design CSS imported via JS bundle — no blocking `<link>` in `index.html` | Must be changed: grid shell CSS needs a blocking `<link>` added to `index.html` before the script tag |

**These components are barely functional prototypes — not production quality.** The default assumption is rebuild, not reuse. "Adapt in place" is acceptable only when the existing component already aligns with the vision and the designer confirms it.

The following do NOT exist and must be built new:

- CSS Grid shell (6-region named areas in pure CSS, plus blocking `<link>` in `index.html`)
- `useSSE()` composable (backend endpoint exists at `/api/sessions/:id/events` — per-session, not global; see R8 for integration model)
- `useLayout()` composable (localStorage panel state persistence)
- Search and filter UI (sidebar search input + status filter pills)
- Sidebar as a persistent panel component
- Mobile overlay sidebar with focus trap
- Skeleton loader components (CSS class exists; Vue components do not)
- Skip link
- ARIA live regions for SSE status updates
- Status indicators with color + motion pairing on session cards
- Session card in sidebar format (name, status dot, metadata row)
- Start page / cognitive empty state

## Scope

### In Scope

**CSS Grid shell:** A new pure CSS file defines a `grid-template-areas` with all six named areas (`brand`, `header`, `sidebar`, `main`, `aside`, `bottom`). The `aside` column and `bottom` row are set to `0fr` — declared but collapsed to zero this cycle. This file is added as a blocking `<link>` in `index.html` before the Vue bundle script tag. Vue components mount into pre-existing grid areas.

**Baseline grid decision:** The frontend-designer evaluates Path A (21px), Path B (dual-rhythm), and Path C (18px/36px) through mockup comparison. The chosen `--baseline` value is updated in `design/styles/layout.css` before any component implementation begins. This is a hard prerequisite for all component work.

**Branding rename:** Every reference to "RAGTS" in user-facing surfaces is replaced with "Erika" — this includes `AppHeader.vue`, `index.html` `<title>`, and any visible text strings throughout the client.

**Design review and rebuild/adapt decisions:** The frontend-designer reviews each existing component listed in the table above against VISION_STEP.md and the Gemini prototype screenshots. For each component the designer produces a verdict: rebuild or adapt. The verdict is documented before implementation begins.

**Sidebar panel (new):** Persistent sidebar containing: "Erika" brand mark in the `brand` grid area, session search input, status filter pills (All / Processing / Ready / Failed), session card list, and a "+ New Session" upload button. Open/closed state and width persisted in `localStorage` via a `useLayout()` composable.

**Session card (new):** Each card shows session name (truncated with ellipsis), a status indicator (color + motion paired), and a metadata row (section count, age). Initial status sourced from `detection_status` field in `GET /api/sessions`. Card height targets the range produced by the chosen baseline path. Selected state: 2px left border in `--accent-primary`, background shift to `--accent-primary-subtle`.

**Start page / cognitive empty state (new):** Shown in the `main` area when no session is selected and when no sessions exist. Contains a drop zone (dashed border) and a primary CTA ("Browse Files" or equivalent). The animated background uses `references/theme-tron-v1.html` as the reference implementation (5 orbiting dots: Record, Detect, Curate, Validate, Replay) — build from this file, not from scratch. Animation is a low-opacity background element that does not compete with the drop zone or CTA. Serves as the "no session selected" home state. Respects `prefers-reduced-motion`.

**Skeleton loaders (new — wires existing CSS):** Sidebar skeleton (3–5 shimmer cards at session-card height) and main content skeleton (breadcrumb placeholder, section header placeholders, terminal shimmer). Skeleton element dimensions must match real component heights exactly to prevent layout shift on replacement.

**Session detail layout (adapt or rebuild per designer verdict):** The existing terminal rendering functionality (ANSI colors, collapsible sections, line numbers) is preserved. The component is evaluated for placement in the `main` grid area: breadcrumb moves to the `header` area, content fills `main`. Component must be responsive to width changes for when the `aside` panel opens in a future cycle.

**Routing model change:** The current router navigates between pages (`/` and `/session/:id`). Under the spatial shell, selecting a session updates the URL (for direct linking) and swaps the `main` area content, but the sidebar persists — no full page swap. The router is adapted to support this: the shell layout mounts once, and session selection updates a reactive selection state that the main area responds to. The exact architectural approach (e.g. keeping the two routes but rendering the shell as a layout wrapper, or collapsing to a single route with a query param, or using a layout route) is an implementation decision for the Architect to specify in the ADR.

**Upload flow (adapt or rebuild per designer verdict):** System-wide drag target is new — dragging a `.cast` file anywhere over the viewport triggers a visible receiving state within 100ms. The `UploadZone.vue` component and `useUpload()` composable are re-evaluated; if the verdict is rebuild, the composable's upload logic is preserved and the component is replaced. On drop or file picker selection, a new sidebar entry appears immediately in `uploading` state before the server responds.

**SSE client integration (new):** A `useSSE()` composable connects to `/api/sessions/:id/events` (per-session SSE). The integration model: the sidebar shows initial `detection_status` from the session list response; when a session enters active processing (status is not `completed`, `failed`, or `interrupted`), the composable opens a per-session SSE connection and drives status transitions from the event stream. The composable closes the connection when the terminal event (`completed`, `failed`, `interrupted`) is received or when the session is no longer in the sidebar view.

**Toast notifications (adapt or rebuild per designer verdict):** The existing `ToastContainer.vue` and `useToast()` are adapted with ARIA live region support and design polish. Toasts fire on upload success, upload failure, processing complete, and processing failed.

**Search and filter (new):** Sidebar search input filters the session list in real time (client-side). Status filter pills compose with search. "No results" empty state with a path to clear filters.

**Mobile layout (new):** On viewports below 768px: sidebar collapses, hamburger toggle in header bar, sidebar reveals as full-height overlay (`translateX(-100%)` → `translateX(0)`, 150–200ms), backdrop dim, `aria-modal="true"`, focus trap (Tab cycles sidebar controls only), Escape closes and returns focus to toggle, tapping a session card closes the overlay.

**Accessibility baseline (new):** Skip link as first focusable element, ARIA live regions for SSE updates, `aria-label` on all status indicators, `role="list"` / `role="listitem"` for session list, `role="group"` + `aria-pressed` on filter pills, `aria-dropeffect="copy"` on drop zone, focus remains in sidebar after session selection on desktop, color contrast validated.

**All new and rebuilt UI uses design system tokens exclusively** — no hardcoded colors, sizes, spacing, or radii.

### Out of Scope

- `aside` panel content — grid area is defined and collapsed; nothing populates it this cycle
- `bottom` panel content — grid area is defined and collapsed; nothing populates it this cycle
- Drag-handle resize for the sidebar — deferred unless the frontend-designer naturally includes it in mockups
- Session curation UI (annotations, tagging, segment marking)
- Multi-user features, workspaces, team sharing, authentication, authorization
- Virtual scrolling for the session list
- Backend changes of any kind — all APIs exist: session CRUD, upload (`POST /api/upload`), per-session SSE (`/api/sessions/:id/events`), per-session status (`/api/sessions/:id/status`), re-detect
- Dashboard analytics or aggregate metrics
- Terminal rendering improvements (scrollback dedup, VT processing changes)
- Server-side search indexing — client-side filtering only
- Keyboard shortcut bindings for panel toggles
- Arrow-key navigation through session list items

## Acceptance Criteria

### R1 — CSS Grid Shell (Foundational — all other criteria depend on this)

- [ ] A new pure CSS file (in `design/styles/`) defines a `grid-template-areas` with all six named areas: `brand`, `header`, `sidebar`, `main`, `aside`, `bottom`
- [ ] The grid template is: `"brand header header header" / "sidebar main aside aside" / "sidebar bottom bottom bottom"` (exact column count may vary but all six named areas must be present)
- [ ] The `aside` column is set to `0fr`; the `bottom` row is set to `0fr`
- [ ] This file is added as a blocking `<link>` in `index.html` before the `<script type="module">` tag — not imported through `main.ts`
- [ ] Verifiable: inspecting DevTools Network panel shows the shell CSS loaded before `main.ts` script execution
- [ ] Verifiable: adding `<div style="grid-area: aside">test</div>` to the DOM causes it to appear in the correct position without modifying the CSS

### R2 — No Layout Shift on Hydration

- [ ] The grid areas exist and are positioned at first paint, before any Vue component mounts
- [ ] Skeleton loaders appear inside their correct grid areas before session data arrives
- [ ] No visible layout jump when real content replaces skeletons — skeleton element dimensions match the real component heights they replace
- [ ] Verifiable: Chrome DevTools Lighthouse CLS score for the start page is < 0.1

### R3 — Baseline Grid Decision Resolved Before Component Work

- [ ] The frontend-designer has produced mockups at Path A (21px), Path B (dual-rhythm), and Path C (18px/36px) densities and documented a verdict
- [ ] The chosen path is recorded in a design note in `.state/feat/client-design-bootstrap/` or in the ADR
- [ ] `design/styles/layout.css` reflects the chosen `--baseline` value before any sidebar or component CSS is written
- [ ] If Path C is adopted: `--lh-mono` is hardcoded independently of `--baseline` (~20px) to preserve reading comfort in terminal output sections
- [ ] If Path C is adopted: the background grid repeat value is updated from `84px` to `72px`

### R4 — Persistent Sidebar (Desktop)

- [ ] On viewports >= 768px, the sidebar is visible at all times: during session list view, session detail view, and while filtering
- [ ] Clicking a session in the sidebar updates the main content area; the sidebar does not change position, scroll position, or selection state except to highlight the newly selected item
- [ ] The sidebar width is governed by a `--sidebar-width` CSS custom property; default value is between 220px and 300px (frontend-designer validates through mockup iteration)
- [ ] Sidebar open/closed state is stored in `localStorage` via a `useLayout()` composable and restored on page reload without a visible transition
- [ ] The `brand` grid area displays the "Erika" product mark in the sidebar column
- [ ] **Note for Architect:** The current router uses separate page routes (`/` and `/session/:id`). This requirement implies the shell layout persists across session changes without a page swap. The Architect must specify the routing model change in the ADR (layout route wrapper, single-route with selection state, or equivalent) before the engineer begins.

### R5 — Start Page / Empty State

- [ ] When no session is selected (including first launch with no sessions), the `main` area shows the start page — not a blank void
- [ ] The start page contains a visible drop zone with dashed border and a primary CTA button ("Browse Files" or equivalent)
- [ ] The animated background uses `references/theme-tron-v1.html` as the reference implementation (5 orbiting dots: Record, Detect, Curate, Validate, Replay) — build from this file, not from scratch
- [ ] The animated background is a low-opacity background element; it does not obscure the drop zone or CTA
- [ ] A user unfamiliar with Erika can identify what to do within five seconds (validated via team review against the Gemini prototype screenshots as the quality benchmark)
- [ ] When `prefers-reduced-motion` is set, the pipeline animation is replaced by a static graphic; no motion plays
- [ ] The start page is also the "no session selected" state when a session is closed or deselected

### R6 — Session Card

- [ ] Each session card shows: session name (truncated with ellipsis), a status indicator dot, and a metadata row (section count, age in human-readable format)
- [ ] Card height under the chosen baseline path is within the target range documented in the baseline decision (expected ~36–54px depending on path)
- [ ] Selected state: 2px left border in `--accent-primary`, background shift to `--accent-primary-subtle`; no full background fill
- [ ] Status indicator: processing state uses a CSS pulse animation; ready/completed state is a steady dot; failed/interrupted state uses error color with no animation
- [ ] Each status indicator has an `aria-label` with human-readable text (e.g., "Processing", "Ready", "Failed")
- [ ] Initial status is sourced from the `detection_status` field returned by `GET /api/sessions`

### R7 — Upload Flow

- [ ] Dragging a `.cast` file anywhere over the viewport triggers the receiving state within 100ms of `dragenter` — not just over a specific upload zone
- [ ] Receiving state shows a visible border glow and a centered overlay confirming the drop target
- [ ] Dropping a file initiates upload to `POST /api/upload`; a new sidebar entry appears immediately in `uploading` state before the server responds
- [ ] Clicking "+ New Session" in the sidebar opens the system file picker for `.cast` files
- [ ] Clicking the CTA on the start page opens the system file picker
- [ ] The drag-over receiving state respects `prefers-reduced-motion` (static border change instead of animated glow)

### R8 — SSE-Driven Ambient Status

- [ ] The `useSSE()` composable connects to `/api/sessions/:id/events` (per-session endpoint); the composable accepts a session ID and opens the connection only when the session is in an active processing state
- [ ] The composable closes the SSE connection when a terminal event (`completed`, `failed`, or `interrupted`) is received, or when the session card leaves the sidebar view
- [ ] Session cards transition through states driven by SSE events — no page refresh needed
- [ ] Each state transition animates: pulsing dot for active processing states, steady dot with brief glow burst on transition to `completed`, error-colored static dot for `failed` / `interrupted`
- [ ] Status indicators pair color with motion pattern — no status communicates meaning through color alone
- [ ] All SSE-driven status changes are announced to screen readers via an ARIA live region with `role="status"` (polite); errors use `role="alert"` (assertive)
- [ ] **Note on scope:** The backend SSE is per-session only (`/api/sessions/:id/events`). There is no global status feed. The sidebar shows initial status from `GET /api/sessions` (which includes `detection_status`). Live updates are per-session SSE connections opened for sessions in active processing. The `useSSE()` composable manages this lifecycle.

### R9 — Toast Notification System

- [ ] Toasts appear automatically for: upload success, upload failure, processing complete, processing failed
- [ ] Toasts self-dismiss (4–6 seconds for success/info; manual dismiss or longer for errors)
- [ ] Each toast is announced to screen readers (`role="status"` for informational, `role="alert"` for errors)
- [ ] Toast copy names the session (e.g., "claude-session-1.cast is ready")
- [ ] The existing `ToastContainer.vue` / `useToast()` are either adapted with these additions or rebuilt — per the designer's verdict

### R10 — Search and Filter

- [ ] Typing in the sidebar search input filters the session list in real time (client-side)
- [ ] Status filter pills (All / Processing / Ready / Failed) are visible below the search input
- [ ] Search and filter compose: "claude" + "Failed" shows only failed sessions matching "claude"
- [ ] Clearing the search input restores all sessions matching the current status filter
- [ ] Filter pills use `role="group"` with an accessible label ("Filter by status") and `aria-pressed` on each pill button
- [ ] A "no results" state is shown when filters produce zero results, with a link or button to clear filters

### R11 — Mobile Layout (< 768px)

- [ ] On viewports below 768px, the sidebar is collapsed by default; main content fills full width
- [ ] A hamburger toggle button is visible in the header bar at all times on mobile
- [ ] Tapping the toggle reveals the sidebar as a full-height overlay (`translateX(-100%)` → `translateX(0)`, 150–200ms ease-out)
- [ ] A backdrop overlay dims the main content while the sidebar is open
- [ ] The overlay uses `aria-modal="true"`; focus is trapped (Tab cycles sidebar controls only)
- [ ] Pressing Escape closes the overlay and returns focus to the hamburger toggle
- [ ] Tapping a session card closes the overlay and shows the session detail
- [ ] Filter pills meet 44px minimum touch target height on mobile (padding compensation or pseudo-element if visually smaller)

### R12 — Accessibility Baseline

- [ ] A "Skip to main content" link is the first focusable element in the DOM; visually hidden until focused
- [ ] On desktop: after clicking a session in the sidebar, focus remains in the sidebar — not auto-moved to main content
- [ ] Session list is rendered with `<ul>` / `<li>` (or `role="list"` / `role="listitem"`)
- [ ] Drop zone has `aria-dropeffect="copy"` and announces upload result in an ARIA live region
- [ ] Cyan (`#00d4ff`) on `--bg-surface` (`#212136`) meets WCAG AA for text contrast (>= 4.5:1; actual ~7:1)
- [ ] `--text-muted` is only used for supplementary text; contrast verified >= 4.5:1 where used for informational text
- [ ] All interactive elements are keyboard-operable (Tab to reach, Enter/Space to activate)

### R13 — Design System Tokens Only (New and Rebuilt Code)

- [ ] A code review confirms zero hardcoded color values in any new or rebuilt Vue component or CSS file
- [ ] A code review confirms zero hardcoded pixel values for spacing, font sizes, or border radii — all map to `--space-*`, `--text-*`, `--rhythm-*`, or `--radius-*` tokens
- [ ] New BEM class names follow existing conventions

## Constraints

- **Backend is frozen.** All APIs exist and must not be modified: session CRUD (`GET /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`), upload (`POST /api/upload`), per-session SSE (`/api/sessions/:id/events`), per-session status (`/api/sessions/:id/status`), re-detect. No global SSE feed exists — see R8 for the per-session integration model.
- **Design system is authoritative.** `design/styles/layout.css` and `design/styles/components.css` are the token source of truth. Token additions for the grid shell (e.g., `--sidebar-width`) follow existing naming conventions.
- **Baseline grid decision gates all component work.** Hard dependency — the frontend-designer must update `design/styles/layout.css` before any component CSS is authored.
- **Design review verdicts gate implementation.** The frontend-designer reviews each existing component before the engineer touches it. Engineers do not make rebuild-vs-adapt decisions independently.
- **CSS loading model must change.** Currently all CSS loads through `main.ts` JS imports with no blocking `<link>` in `index.html`. The grid shell CSS must be extracted to a blocking stylesheet. The Architect must specify in the ADR which CSS moves to the blocking `<link>` and which remains in the bundle.
- **Vue 3 + Composition API; no Pinia.** Panel state managed by `useLayout()` composable wrapping `localStorage`.
- **Midnight Neon palette is fixed.** Cyan `#00d4ff` primary, neon pink `#ff4d6a` secondary, dark backgrounds (`#1a1a2e` / `#212136` / `#28283e`). No new palette colors.
- **Geist + Geist Mono only.** No new font families.
- **Panel transitions: 150–200ms, ease-out.** Use `--duration-fast` or `--duration-normal` from the design system. Do not use `repeat()` in animated grid templates.
- **One PR, one branch.** All work stays on `feat/client-design-bootstrap`. No artificial splitting.

## Context

- This is Phase 2 of the `feat/client-design-bootstrap` SDLC cycle. Vision (VISION_STEP.md) and 11 user stories (STORIES.md) are both approved.
- Companion research: UX_RESEARCH.md (competitor and pattern analysis), UX_RESEARCH_BASELINE.md (baseline grid — strongly recommends Path C: 18px/36px).
- Visual references in `.state/feat/client-design-bootstrap/references/`: Gemini prototype screenshots (quality benchmark), `theme-tron-v1.html` (start page animation reference).
- The existing frontend is functional but visually below the standard the vision requires. "Barely functional and sometimes baseline acceptable" is the honest characterization. Design review is mandatory before any component is adapted or built.
- The `aside` and `bottom` grid areas are intentionally empty this cycle. Their existence in the template is the deliverable, not their content.
- SSE endpoint confirmed live at `/api/sessions/:id/events` (per-session). The `Session` type includes `detection_status` in the list response, enabling initial status display without an SSE connection.
- Sidebar default width: research recommends 260px, resizable with min 220px / max 360px. Drag-handle resize is deferred unless the designer includes it naturally. Final default width is a designer decision.
- The routing model change (page-nav → spatial selection) requires Architect input. The current router has separate page routes; the spatial shell requires the layout to persist. This is flagged in R4 as requiring an ADR decision before engineering begins.

## Implementation Order (Dependency Chain)

This order is binding — later stages depend on earlier ones completing:

1. **Baseline grid decision** — frontend-designer mockup comparison (Path A/B/C); `design/styles/layout.css` updated with chosen `--baseline`
2. **Design review verdicts** — frontend-designer reviews each existing component against the vision; rebuild/adapt decisions documented
3. **ADR: routing model and CSS loading** — Architect specifies how the spatial shell integrates with Vue Router and which CSS moves to the blocking `<link>` in `index.html`
4. **CSS Grid shell** — new pure CSS file; blocking `<link>` added to `index.html`; all six named areas, `aside` and `bottom` collapsed to `0fr`
5. **Skeleton loader components** — sized to match final component heights; wires the existing `.skeleton` CSS class
6. **Branding rename** — "RAGTS" → "Erika" in `AppHeader.vue`, `index.html` `<title>`, and any other visible text
7. **Sidebar panel** — persistent panel with brand mark, session list (search, filters, cards), upload button; `useLayout()` composable
8. **Session card** — within sidebar; `detection_status` for initial state, status indicator with color+motion, metadata row, selection state
9. **Start page / empty state** — `main` area; drop zone, CTA, `theme-tron-v1.html`-based animation
10. **Session detail layout** — adapt or rebuild per designer verdict; breadcrumb in `header` area, content in `main` area
11. **Upload flow** — system-wide drag target; `useUpload()` integration; immediate sidebar entry creation
12. **SSE status updates** — `useSSE()` composable; per-session connections for active processing; sidebar card transitions
13. **Toast system** — adapt or rebuild per designer verdict; ARIA live regions
14. **Mobile overlay** — sidebar collapse, hamburger toggle, focus trap, backdrop
15. **Accessibility pass** — skip link, ARIA live regions, focus management, contrast verification, touch targets

---
**Sign-off:** Approved by Product Owner
