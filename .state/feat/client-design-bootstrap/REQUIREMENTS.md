# Requirements: Erika Spatial Foundation — Application Shell Bootstrap

## Problem Statement

Erika's current frontend is a page-based Vue prototype with two routes: a session list page and a session detail page. Navigating to a session detail loses the session list. There is no persistent spatial layout, no upload affordance inside the app flow, no loading states, no empty state for new users, no live processing feedback, and no mobile consideration. The application communicates nothing while data is loading or background work is happening. This cycle establishes the structural foundation — the CSS Grid shell and all components that depend on it — that the product will build upon for the next two years. These decisions are load-bearing. Getting them wrong requires a full layout rewrite.

## Desired Outcome

After this cycle, Erika has a persistent multi-panel spatial shell. The session list remains visible while viewing any session detail. A new user with no sessions sees a purposeful start page that teaches the product and offers a direct upload path. An uploaded session appears in the sidebar and its processing state updates automatically via SSE, without page refresh. The layout loads before JavaScript hydrates, preventing layout shift. The mobile experience is an intentional overlay sidebar, not a broken desktop layout. All six CSS Grid areas are defined from day one so future panels (annotations, log viewer) can be activated by changing one CSS value, not by restructuring the layout.

## Scope

### In Scope

- CSS Grid shell with six named areas (`brand`, `header`, `sidebar`, `main`, `aside`, `bottom`) in pure CSS, loaded as a blocking stylesheet before Vue hydrates
- `aside` column and `bottom` row set to `0fr` — declared but collapsed to zero this cycle
- Sidebar component: session list, search input, status filter pills (All / Processing / Ready / Failed), "+ New Session" upload button, brand mark area
- Session card component: session name, status indicator, metadata row (section count, age); status indicator pairs color with motion (pulsing = processing, steady = ready, no-motion = failed)
- Start page / cognitive empty state: drop zone, primary CTA ("Browse Files"), animated pipeline visualization (Record → Detect → Curate → Validate → Replay) at low opacity as a background element; respects `prefers-reduced-motion`
- Skeleton loaders: sidebar skeleton (3–5 shimmer cards at session-card height) and main content skeleton (breadcrumb placeholder, section header placeholders); dimensions must match real component heights exactly to prevent layout shift
- Session detail layout: breadcrumb in header area, collapsible sections with line numbers in main area (existing terminal rendering wire-up preserved)
- Spatial selection model: clicking a session updates main content without page navigation; sidebar scroll position and selection highlight preserved; URL updates for direct linking
- Upload flow: drag-over any part of the viewport triggers visible receiving state (border glow, overlay) within 100ms; drop initiates upload to `POST /api/upload`; new sidebar entry appears immediately in uploading state
- SSE-driven status updates: sidebar session cards transition through `uploading → processing → ready / failed` states driven by the existing SSE endpoint; no user action required
- Toast notification system: self-dismissing toasts for upload success, upload failure, processing complete, processing failed; `role="status"` for success/progress, `role="alert"` for errors
- Real-time search: typing in sidebar search bar filters session list; composes with status filter pills; clearing search restores full list; client-side only
- Panel state persistence: sidebar open/closed state and width persisted in `localStorage`; restored silently on page load; transitions suppressed during initial hydration frame
- Baseline grid decision: frontend-designer evaluates Path A (21px), Path B (dual-rhythm), and Path C (18px/36px) through mockup comparison; chosen `--baseline` value updated in `design/styles/layout.css` before any component implementation begins
- Mobile responsive layout: viewports below 768px — sidebar collapses, hamburger toggle in header bar, sidebar reveals as full-height overlay via `translateX`, backdrop dim, `aria-modal="true"`, focus trap (Tab cycles sidebar controls only), Escape closes and returns focus to toggle; selecting a session closes the overlay
- Accessibility baseline: skip link (first focusable element in DOM, reveals on focus), ARIA live regions for SSE status updates, `aria-label` on all status indicators, `role="list"` / `role="listitem"` for session list, `role="group"` + `aria-pressed` on filter pills, `aria-dropeffect="copy"` on drop zone, focus stays in sidebar after session selection on desktop, color contrast validation (cyan on `--bg-surface` ≥ 7:1, `--text-muted` only used for supplementary information)
- Touch target compliance: all interactive elements on mobile viewports meet 44px minimum touch target (WCAG 2.5.5); filter pills use padding compensation or pseudo-element expansion if visually smaller
- All new UI elements use design system tokens exclusively — no hardcoded colors, sizes, spacing, or radii

### Out of Scope

- `aside` panel content — grid area is defined and collapsed; nothing populates it this cycle
- `bottom` panel content — grid area is defined and collapsed; nothing populates it this cycle
- Drag-handle resize for the sidebar — deferred unless the frontend-designer naturally includes it in mockups
- Session curation UI (annotations, tagging, segment marking)
- Multi-user features, workspaces, team sharing, authentication, authorization
- Virtual scrolling for the session list
- Backend changes of any kind — all APIs exist: session CRUD (`GET/DELETE /api/sessions`), upload (`POST /api/upload`), SSE status, re-detect
- Dashboard analytics or aggregate metrics
- Terminal rendering improvements (scrollback dedup, VT processing changes)
- Server-side search indexing — client-side filtering only this cycle
- Keyboard shortcut bindings for panel toggles (e.g., Cmd+B) — out of scope for this cycle
- Keyboard navigation through session list items using arrow keys

## Acceptance Criteria

### R1 — CSS Grid Shell (Foundational — all other criteria depend on this)

- [ ] A pure CSS file (in `design/styles/`) defines a `grid-template-areas` with all six named areas: `brand`, `header`, `sidebar`, `main`, `aside`, `bottom`
- [ ] The grid template matches: `"brand header header header" / "sidebar main aside aside" / "sidebar bottom bottom bottom"` (exact layout may vary on arrangement but all six named areas must be present)
- [ ] The `aside` column is set to `0fr`; the `bottom` row is set to `0fr`
- [ ] This CSS file is loaded as a blocking `<link>` in `index.html` before the Vue bundle
- [ ] Verifiable: inspecting DevTools before Vue hydration shows the grid areas defined on the app container
- [ ] Verifiable: adding a placeholder `<div style="grid-area: aside">` to the DOM causes it to appear in the correct position without modifying the CSS

### R2 — No Layout Shift on Hydration

- [ ] The grid areas exist and are positioned before any Vue component mounts (critical CSS loaded as blocking stylesheet)
- [ ] Skeleton loaders appear inside their correct grid areas before session data arrives
- [ ] No visible layout jump when real content replaces skeletons — skeleton element dimensions match the real component heights they represent
- [ ] Verifiable: Chrome DevTools Lighthouse CLS score for the start page is 0 or near-zero (< 0.1)

### R3 — Baseline Grid Decision Resolved Before Component Work

- [ ] The frontend-designer has produced mockups at Path A (21px), Path B (dual-rhythm), and Path C (18px/36px) densities
- [ ] The chosen path is documented in a decision file (`.state/feat/client-design-bootstrap/BASELINE_DECISION.md` or equivalent)
- [ ] `design/styles/layout.css` reflects the chosen `--baseline` value before any sidebar or component CSS is written
- [ ] If Path C is adopted: `--lh-mono` is hardcoded independently of `--baseline` (value ~20px) to preserve reading comfort in terminal output sections
- [ ] If Path C is adopted: the background grid repeat value is updated from `84px` to `72px`

### R4 — Persistent Sidebar (Desktop)

- [ ] On viewports >= 768px, the sidebar is visible at all times: during session list view, session detail view, and while filtering
- [ ] Clicking a session in the sidebar updates the main content area; the sidebar does not change position, scroll, or selection state except to highlight the selected item
- [ ] The sidebar width is set by a CSS custom property (`--sidebar-width`); default value is between 220px and 300px (frontend-designer validates)
- [ ] Sidebar open/closed state is stored in `localStorage` and restored on page reload without a visible transition
- [ ] The `brand` grid area spans the sidebar column and displays the Erika product mark

### R5 — Start Page / Empty State

- [ ] When no sessions exist, the main content area shows the start page (not a blank void)
- [ ] The start page contains a visible drop zone with dashed border and a primary CTA button ("Browse Files" or equivalent)
- [ ] A user unfamiliar with Erika can identify what to do within five seconds without documentation (validated via informal user observation or team review)
- [ ] The animated background from `references/theme-tron-v1.html` (5 orbiting dots: Record, Detect, Curate, Validate, Replay) is the reference implementation for the start page background — build from this file, not from scratch
- [ ] The animated background is a background element at low opacity — it does not obscure or compete with the drop zone or CTA
- [ ] When `prefers-reduced-motion` is set, the pipeline animation is replaced by a static graphic; no motion plays
- [ ] The start page also serves as the "no session selected" home state when the user deselects or closes a session

### R6 — Session Card

- [ ] Each session card in the sidebar shows: session name (truncated with ellipsis if needed), a status indicator, and a metadata row (section count, age in human-readable format)
- [ ] Card height under the chosen baseline path is within the target range documented in the baseline decision (expected: ~36–54px depending on path chosen)
- [ ] Selected state: left border in `--accent-primary` (2px), background shift to `--accent-primary-subtle`; no full background fill
- [ ] Status indicator is a colored dot; processing state uses a CSS pulse animation; ready state is a steady dot; failed state uses error color with no animation
- [ ] Each status indicator has an `aria-label` with human-readable text describing the state (e.g., "Processing", "Ready", "Failed")

### R7 — Upload Flow

- [ ] Dragging a `.cast` file anywhere over the viewport (not just a specific zone) triggers the receiving state within 100ms of `dragenter`
- [ ] Receiving state shows a visible border glow and a centered overlay confirming the drop target
- [ ] Dropping a file initiates upload to `POST /api/upload`; a new entry appears in the sidebar immediately in `uploading` state before the server responds
- [ ] Clicking the "+ New Session" button in the sidebar opens the system file picker for `.cast` files
- [ ] Clicking "Browse Files" on the start page opens the system file picker
- [ ] The drag-over receiving state respects `prefers-reduced-motion` (no animated glow effect; use a static border change instead)

### R8 — SSE-Driven Ambient Status

- [ ] Session cards transition through states `uploading → processing → ready` (or `failed`) driven by events from the existing SSE endpoint — no page refresh needed
- [ ] Each state transition animates: pulsing dot for processing, steady dot with brief glow burst on transition to ready, error-colored static dot for failed
- [ ] Status indicators pair color with motion pattern — no status communicates meaning through color alone
- [ ] All SSE-driven status changes are announced to screen readers via an ARIA live region with `role="status"` (polite); errors use `role="alert"` (assertive)

### R9 — Toast Notification System

- [ ] Toasts appear automatically for: upload success, upload failure, processing complete, processing failed
- [ ] Toasts self-dismiss without requiring user interaction (dismiss timer: 4–6 seconds for success/info, longer or manual for errors)
- [ ] Each toast is announced to screen readers (`role="status"` for informational, `role="alert"` for errors)
- [ ] Toast content is meaningful: at minimum, session name and outcome (e.g., "claude-session-1.cast is ready")

### R10 — Search and Filter

- [ ] Typing in the sidebar search input filters the session list in real time (client-side, no debounce required for MVP)
- [ ] Status filter pills (All / Processing / Ready / Failed) are always visible below the search input
- [ ] Search and filter compose: searching "claude" while selecting "Failed" shows only failed sessions whose name contains "claude"
- [ ] Clearing the search input restores all sessions that match the current status filter
- [ ] Filter pills use `role="group"` with an accessible label ("Filter by status") and `aria-pressed` on each pill button
- [ ] A "no results" empty state is shown when filters produce zero results, with a visible path to clear filters

### R11 — Mobile Layout (< 768px viewport width)

- [ ] On viewports below 768px, the sidebar is collapsed by default; main content fills the full width
- [ ] A hamburger toggle button is visible in the header bar at all times on mobile
- [ ] Tapping the toggle reveals the sidebar as a full-height overlay using `translateX(-100%)` → `translateX(0)` transition (150–200ms)
- [ ] A backdrop overlay dims the main content while the sidebar is open
- [ ] The sidebar overlay uses `aria-modal="true"`; focus is trapped within the sidebar while open (Tab cycles sidebar controls only)
- [ ] Pressing Escape closes the sidebar overlay and returns focus to the hamburger toggle button
- [ ] Tapping a session card in the overlay closes the overlay and shows the session detail
- [ ] Filter pills meet 44px minimum touch target height on mobile

### R12 — Accessibility Baseline

- [ ] A "Skip to main content" link is the first focusable element in the DOM; it is visually hidden until focused, then reveals as a visible control
- [ ] On desktop: after clicking a session in the sidebar, focus remains in the sidebar (focus is not auto-moved to main content)
- [ ] Session list is rendered with `<ul>` / `<li>` (or `role="list"` / `role="listitem"`)
- [ ] Drop zone has `aria-dropeffect="copy"` and announces upload result in an ARIA live region
- [ ] Cyan (`#00d4ff`) on `--bg-surface` (#212136) meets WCAG AA contrast (≥ 4.5:1 for text; actual ~7:1)
- [ ] `--text-muted` is only used for supplementary text, not for primary metadata users need to read; contrast verified ≥ 4.5:1 where used for informational text
- [ ] All interactive elements are keyboard-operable (Tab to reach, Enter/Space to activate)

### R13 — Design System Tokens Only

- [ ] A code review confirms zero hardcoded color values in any new Vue component or CSS file
- [ ] A code review confirms zero hardcoded pixel values for spacing, font sizes, or border radii in new UI code — all map to `--space-*`, `--text-*`, `--rhythm-*`, or `--radius-*` tokens
- [ ] New BEM class names follow existing naming conventions (no hyphen/underscore mixing within a single identifier)

## Constraints

- **Backend is frozen.** All APIs exist and must not be modified: session CRUD (`GET /api/sessions`, `GET /api/sessions/:id`, `DELETE /api/sessions/:id`), upload (`POST /api/upload`), SSE status, re-detect. The frontend works entirely with existing endpoints.
- **Design system is authoritative.** `design/styles/layout.css` and `design/styles/components.css` are the token source of truth. Token additions for the grid shell (e.g., `--sidebar-width`, `--aside-width`, `--bottom-height`) must follow existing naming conventions.
- **Baseline grid decision gates component work.** The frontend-designer must resolve the Path A / B / C decision and update `design/styles/layout.css` before any sidebar or component implementation begins. This is a hard dependency.
- **Vue 3 + Composition API; no Pinia.** Panel state (sidebar open/closed, width) is managed by a Vue composable wrapping `localStorage`. No additional state management libraries are introduced.
- **Midnight Neon palette is fixed.** Cyan `#00d4ff` primary, neon pink `#ff4d6a` secondary, deep backgrounds (`#1a1a2e` / `#212136` / `#28283e`). No new palette colors without an explicit design decision.
- **Geist + Geist Mono fonts only.** No new font families.
- **66 existing BEM component classes.** Prefer extending existing components. Any new components follow BEM conventions.
- **Critical CSS must be a blocking `<link>` in `index.html`.** The grid shell CSS cannot live in Vue scoped styles or the Vite bundle — it must paint before JavaScript executes.
- **Panel transitions: 150–200ms, ease-out.** Use `--duration-fast` (150ms) or `--duration-normal` (250ms) from the design system. Do not use `repeat()` in animated grid templates.

## Context

- This is Phase 2 of the `feat/client-design-bootstrap` SDLC cycle. The vision (VISION_STEP.md) and 11 user stories (STORIES.md) are both approved.
- Companion research: UX_RESEARCH.md (full competitor and pattern analysis), UX_RESEARCH_BASELINE.md (baseline grid evidence — strongly recommends Path C).
- Gemini prototype screenshots (`.state/feat/client-design-bootstrap/references/`) show the target visual density. Analysis confirms the prototype visually operates at approximately 18px rhythm — consistent with Path C.
- The CSS Grid named-areas pattern is validated by VS Code, Figma, Mantine AppShell, and CSS-Tricks documentation. It is the correct architecture for Erika's multi-panel future.
- The `0fr` collapse pattern (not `display: none`) is required for smooth future panel expansion. A grid area cannot be transitioned into existence — it must exist in the template from day one.
- The SSE endpoint was merged in PR #66 and is available.
- The `aside` and `bottom` areas are intentionally empty this cycle. Their existence in the template is the deliverable, not their content.
- Sidebar default width: research recommends 260px, resizable with min 220px / max 360px. The drag-handle resize mechanism is deferred unless the frontend-designer naturally includes it. The default width is a frontend-designer decision validated through mockup iteration.

## Existing Components — Design Review and Purposeful Rebuild

The frontend is not a blank canvas. The following components already exist and are functional: SessionDetailPage, SessionList, UploadZone, ToastContainer, AppHeader, and composables (useSession, useSessionList, useUpload, useToast). The design token system (layout.css, components.css) and responsive breakpoints are also in place. Skeleton CSS (`.skeleton` shimmer class) is defined but not wired into any component.

**However, these components are barely functional prototypes — not production quality.** Each existing component must be reviewed by the frontend-designer against the VISION_STEP.md and purposefully rebuilt where the designer and frontend-engineer determine the current implementation does not meet the spatial foundation's quality bar. "Adapt in place" is acceptable only when the existing component already aligns with the vision. The default assumption is rebuild, not reuse.

What is genuinely new (no prior implementation): CSS Grid shell, SSE client composable (`useSSE()`), search/filter UI, sidebar as persistent panel, mobile overlay with focus trap, skip link, ARIA live regions, status indicators with color+motion pairing.

The AppHeader currently says "RAGTS" — must be renamed to "Erika."

## Implementation Order (Dependency Chain)

The following order is binding — later items depend on earlier ones:

1. **Baseline grid decision** (frontend-designer mockup comparison, Path A/B/C) → `design/styles/layout.css` updated
2. **CSS Grid shell** (pure CSS, blocking stylesheet) → all layout-dependent work follows
3. **Skeleton loaders** (dimensions depend on component heights, which depend on baseline decision)
4. **Sidebar component** (session list structure, search, filters, brand mark)
5. **Session card component** (depends on sidebar structure and baseline grid)
6. **Start page / empty state** (mounts into main grid area)
7. **Session detail layout** (breadcrumb + main content — wire-up existing terminal rendering)
8. **Upload flow** (drag-over, file picker, sidebar entry creation)
9. **SSE status updates** (sidebar card state transitions)
10. **Toast system** (upload and processing feedback)
11. **Mobile overlay** (sidebar collapse, hamburger toggle, focus trap)
12. **Accessibility pass** (skip link, ARIA live regions, focus management, contrast verification)

---
**Sign-off:** Pending
