# Plan: Erika Spatial Foundation -- Application Shell Bootstrap

References: ADR.md, REQUIREMENTS.md (15-step dependency chain), VISION_STEP.md, STORIES.md

## Open Questions

Implementation challenges to solve (architect identifies, implementer resolves):

1. **Cache busting for blocking CSS:** `layout.css` and `shell.css` are loaded as raw `<link>` tags outside Vite's asset pipeline. How do we bust browser cache on deploy? Options: Vite plugin that rewrites the `<link>` href with a content hash, or a build script that appends `?v=<hash>`. The engineer should investigate Vite's `transformIndexHtml` hook.

2. **Hydration transition suppression:** `useLayout()` must suppress CSS transitions during the first frame to prevent a visible sidebar slide-in when restoring state from localStorage. The `data-hydrating` attribute approach needs testing across browsers to confirm `requestAnimationFrame` timing is sufficient.

3. **SSE connection budget implementation:** The 3-connection limit with priority queue is conceptually simple but needs careful lifecycle management. When does a freed slot get reassigned? On the next `watch` tick? On a timer? The engineer should design this to avoid race conditions.

4. **System-wide drag target without interfering with sidebar interactions:** The viewport-wide `dragenter`/`dragleave` handler must not trigger false positives when dragging over the sidebar or other interactive elements. The engineer should use the `dragenter` counter pattern (increment on enter, decrement on leave, show overlay when > 0).

5. **Start page animation from theme-tron-v1.html:** The reference file uses vanilla JS + canvas or SVG for the orbiting dots animation. The engineer needs to extract the animation logic and wrap it in a Vue component that respects `prefers-reduced-motion`. Determine whether to use CSS animations, canvas, or SVG based on what the reference file actually implements.

## Stages

### Stage 0: Baseline Grid Decision

Goal: Frontend-designer evaluates Path A (21px), Path B (dual-rhythm), and Path C (18px/36px) through mockup comparison and documents the chosen baseline. Updates `--baseline` in `design/styles/layout.css`. This is a hard prerequisite for all component work.

Owner: frontend-designer

- [ ] Produce mockups at Path A, Path B, and Path C densities (sidebar cards, header, search bar, filter pills)
- [ ] Compare against Gemini prototype screenshots in `.state/feat/client-design-bootstrap/references/`
- [ ] Document the verdict and rationale in `.state/feat/client-design-bootstrap/BASELINE_DECISION.md`
- [ ] Update `--baseline` value in `design/styles/layout.css`
- [ ] If Path C: hardcode `--lh-mono` independently (~20px) for terminal reading comfort
- [ ] If Path C: update background grid repeat from `84px` to `72px` in `layout.css` body background
- [ ] Verify all derived rhythm tokens recalculate correctly (spot-check `--rhythm-2`, `--btn-height-md`, `--header-height`)

Files: `design/styles/layout.css`, `.state/feat/client-design-bootstrap/BASELINE_DECISION.md`
Depends on: none

Considerations:
- UX_RESEARCH_BASELINE.md strongly recommends Path C. The designer should validate this recommendation, not rubber-stamp it.
- The background grid repeat value is hardcoded (not a token) -- must be updated manually if baseline changes.
- `--btn-height-sm` at `calc(var(--baseline) * 1.5)` produces a fractional value under both paths (31.5px at 21px, 27px at 18px). Verify this does not cause subpixel rendering issues.

---

### Stage 1: Design Review Verdicts

Goal: Frontend-designer reviews each existing component against VISION_STEP.md and documents rebuild vs. adapt verdicts. This gates all implementation work.

Owner: frontend-designer

- [ ] Review `AppHeader.vue` -- evaluate for grid area split (brand + header), rename to "Erika"
- [ ] Review `SessionList.vue` -- evaluate for sidebar panel format (page grid is incompatible)
- [ ] Review `UploadZone.vue` -- evaluate for system-wide drag target conversion
- [ ] Review `ToastContainer.vue` -- evaluate for ARIA live region additions and design polish
- [ ] Review `SessionDetailPage.vue` -- evaluate for main grid area placement, breadcrumb extraction
- [ ] Review `SessionContent.vue` -- evaluate for responsive width changes
- [ ] Review `SectionHeader.vue` -- evaluate against design system
- [ ] Document all verdicts in `.state/feat/client-design-bootstrap/DESIGN_VERDICTS.md`
- [ ] For each "rebuild" verdict, describe the target design (layout, spacing, visual treatment)
- [ ] For each "adapt" verdict, list specific changes needed

Files: `.state/feat/client-design-bootstrap/DESIGN_VERDICTS.md`
Depends on: Stage 0 (baseline must be decided before evaluating component sizing)

Considerations:
- The default assumption is rebuild, not reuse. "Adapt in place" only when the existing component already aligns with the vision.
- The designer should reference the Gemini prototype screenshots as the quality benchmark.
- `SessionContent.vue` and `TerminalSnapshot.vue` contain working WASM rendering logic -- preserve this regardless of verdict.

---

### Stage 2: CSS Grid Shell

Goal: Create the pure CSS grid shell and update the HTML loading model. After this stage, the six named grid areas exist at first paint before any JavaScript runs.

Owner: frontend-engineer

- [x] Add `--sidebar-width: 260px` token to `:root` in `design/styles/layout.css`
- [x] Create `design/styles/shell.css` with the spatial grid template (6 named areas, 3 columns, 3 rows)
- [x] Grid: `aside` column at `0fr`, `bottom` row at `0fr`
- [x] Grid area assignment classes: `.spatial-shell__brand`, `__header`, `__sidebar`, `__main`, `__aside`, `__bottom`
- [x] Responsive rule: below 768px, collapse to single-column (sidebar hidden, main fills width)
- [x] Transition rule for `grid-template-columns` (175ms, ease-out) for sidebar toggle animation
- [x] Update `index.html`: add blocking `<link>` for `layout.css` and `shell.css` before the script tag
- [x] Update `index.html`: rename `<title>` from "RAGTS" to "Erika"
- [x] Update `main.ts`: remove `layout.css` import (now loaded via `<link>`)
- [x] Verify: grid areas visible in DevTools at first paint before Vue mounts
- [x] Verify: adding `<div style="grid-area: aside">test</div>` shows content in correct position

Files: `design/styles/shell.css` (new), `design/styles/layout.css` (token addition), `index.html`, `src/client/main.ts`
Depends on: Stage 0 (baseline tokens must be finalized)

Considerations:
- Do NOT use `repeat()` in animated grid templates -- set column widths individually to avoid interpolation bugs.
- The `min-height: 100vh` on the grid container prevents the shell from collapsing when main content is short.
- The `#app` div in index.html must gain the `.spatial-shell` class or the shell component must provide it. Decide: static class on `#app` in HTML (for first-paint) or applied by Vue on mount. Recommendation: add `.spatial-shell` to `#app` in `index.html` so the grid exists before Vue.
- Edge case: Vite dev server may handle `<link>` paths differently than production build. Test both.

---

### Stage 3: Route Restructure

Goal: Convert the router from page-based navigation to a layout route wrapper pattern. `SpatialShell.vue` becomes the route parent. Existing pages become child routes.

Owner: frontend-engineer

- [ ] Create `src/client/components/SpatialShell.vue` -- grid container with `<router-view>` in main area
- [ ] Create stub components: `BrandMark.vue`, `ShellHeader.vue`, `SidebarPanel.vue` (minimal implementations to establish the component tree)
- [ ] Update `router.ts`: single parent route with `SpatialShell` as component, children for `/` and `/session/:id`
- [ ] Update `App.vue`: remove `<AppHeader />`, render only `<router-view />`
- [ ] Create `src/client/composables/useLayout.ts` -- sidebar state management with localStorage persistence
- [ ] Wire `useLayout()` into `SpatialShell.vue` via provide
- [ ] Hydration transition suppression: `data-hydrating` attribute removed after first `requestAnimationFrame`
- [ ] Verify: navigating between `/` and `/session/:id` swaps only the main area content
- [ ] Verify: sidebar stub persists across route changes
- [ ] Verify: browser back/forward works between routes

Files: `src/client/components/SpatialShell.vue` (new), `src/client/components/BrandMark.vue` (new), `src/client/components/ShellHeader.vue` (new), `src/client/components/SidebarPanel.vue` (new), `src/client/composables/useLayout.ts` (new), `src/client/router.ts`, `src/client/App.vue`
Depends on: Stage 2 (grid shell CSS must exist)

Considerations:
- SpatialShell.vue does NOT use scoped styles for the grid -- it applies the `.spatial-shell` class which is defined in shell.css (blocking CSS). This ensures the grid exists at first paint.
- The stub components should render minimal content with correct grid-area assignments so the layout is visually verifiable.
- `useLayout()` must handle the case where localStorage contains invalid JSON gracefully (fallback to defaults).

---

### Stage 4: Skeleton Loaders

Goal: Create skeleton loader components that match final component dimensions. Wires the existing `.skeleton` CSS class from `components.css`.

Owner: frontend-engineer

- [x] Create `src/client/components/SkeletonSidebar.vue` -- 3-5 shimmer cards at session-card height
- [x] Create `src/client/components/SkeletonMain.vue` -- breadcrumb placeholder + section header placeholders + terminal shimmer
- [x] Skeleton card dimensions must match the session card height from the baseline decision
- [x] Wire skeletons into `SidebarPanel.vue` (show while `loading` is true)
- [x] Wire skeleton into main area (show while session detail is loading)
- [ ] Verify: skeletons appear in correct grid areas before data arrives
- [ ] Verify: no layout shift when real content replaces skeletons (measure CLS)

Files: `src/client/components/SkeletonSidebar.vue` (new), `src/client/components/SkeletonMain.vue` (new), `src/client/components/SidebarPanel.vue`, `src/client/pages/SessionDetailPage.vue`
Depends on: Stage 3 (shell and grid areas must exist), Stage 1 (designer must have produced card height targets)

Considerations:
- Skeleton dimensions must match EXACTLY. If the session card is 50px tall, the skeleton card must be 50px tall. This is the CLS prevention contract.
- Use `--bg-elevated` as shimmer base, `--accent-primary-subtle` as highlight color, per the design system.
- The existing `.skeleton` class in components.css provides the shimmer animation. The Vue components just need to apply it with correct dimensions.

---

### Stage 5: Branding Rename

Goal: Replace all user-facing "RAGTS" references with "Erika".

Owner: frontend-engineer

- [ ] Update `BrandMark.vue` to show "Erika" (this may already be done if created in Stage 3)
- [ ] Update `index.html` `<title>` to "Erika" (this may already be done in Stage 2)
- [ ] Search all `.vue`, `.ts`, and `.html` files for "RAGTS" and replace with "Erika" where user-facing
- [ ] Verify: no user-visible instance of "RAGTS" remains in the running application

Files: `src/client/components/BrandMark.vue`, `index.html`, any file containing user-facing "RAGTS"
Depends on: Stage 3 (BrandMark.vue must exist)

Considerations:
- Do NOT rename the repository, package.json name, or internal code identifiers. Only user-facing text.
- The `<meta>` description (if any) and any `<noscript>` fallback should also be updated.

---

### Stage 6: Sidebar Panel

Goal: Build the persistent sidebar with brand mark, session list, search, filters, and upload button. Wire `useSessionList()` with search and filter enhancements.

Owner: frontend-engineer (design from frontend-designer in Stage 1 verdicts)

- [x] Enhance `useSessionList.ts`: add `searchQuery`, `statusFilter`, `filteredSessions` computed
- [x] Build `SidebarPanel.vue` with full structure: brand area, search input, filter pills, session card list, "+ New Session" button
- [x] Search input: filters session list in real time (client-side, case-insensitive substring match on filename)
- [x] Filter pills: All / Processing / Ready / Failed with `role="group"`, `aria-pressed`
- [x] Session list: `<ul>` / `<li>` structure with `role="list"` / `role="listitem"`
- [x] "+ New Session" button opens system file picker for `.cast` files
- [x] "No results" empty state when filters produce zero results, with clear-filters action
- [ ] Wire `useLayout()` for sidebar open/close state (CSS class toggle on grid container)
- [x] Sidebar width governed by `--sidebar-width` CSS custom property
- [ ] Verify: sidebar persists across route changes
- [ ] Verify: search + filter compose correctly
- [ ] Verify: sidebar open/closed state persists across page reload

Files: `src/client/components/SidebarPanel.vue`, `src/client/composables/useSessionList.ts`, `src/client/components/SpatialShell.vue`
Depends on: Stage 3 (route structure), Stage 4 (skeleton loaders), Stage 1 (design verdicts for sidebar)

Considerations:
- Filter status mapping: `detection_status` values `completed` maps to "Ready" pill; `pending`/`processing`/`queued`/`validating`/`detecting`/`replaying`/`deduplicating`/`storing` map to "Processing" pill; `failed`/`interrupted` map to "Failed" pill.
- The session list composable uses `onMounted(fetchSessions)` currently. Under the spatial shell, it should fetch once when the sidebar mounts (which is once per app lifecycle, since the shell never unmounts).
- Provide `useSessionList()` at the shell level so both sidebar and main area can access session data.

---

### Stage 7: Session Card

Goal: Build the session card component for the sidebar list. Status indicator with color + motion pairing. Selection state.

Owner: frontend-engineer (design from frontend-designer)

- [x] Create `src/client/components/SessionCard.vue`
- [x] Card shows: session name (truncated with ellipsis), status indicator dot, metadata row (section count, age in human-readable format)
- [x] Card height within the target range from the baseline decision
- [x] Selected state: 2px left border in `--accent-primary`, background shift to `--accent-primary-subtle`
- [x] Status indicator: processing = CSS pulse animation (cyan); ready/completed = steady green dot; failed/interrupted = error color, no animation
- [x] Each status indicator has `aria-label` with human-readable text
- [x] Initial status sourced from `detection_status` field
- [x] Click handler: `router.push('/session/' + session.id)`
- [x] After click on desktop: focus remains in sidebar (do not auto-move to main)
- [x] Verify: card renders at correct height
- [x] Verify: status dot animates for processing state
- [x] Verify: selected state visual is correct

Files: `src/client/components/SessionCard.vue` (new), `src/client/components/SidebarPanel.vue`
Depends on: Stage 6 (sidebar must exist), Stage 0 (baseline for card height)

Considerations:
- Age display: use relative time ("2m ago", "3h ago", "yesterday"). Consider a utility function or lightweight library.
- Section count comes from `detected_sections_count` on the Session type.
- The pulse animation should use `@keyframes` in the component or in components.css, respecting `prefers-reduced-motion`.

---

### Stage 8: Start Page / Empty State

Goal: Build the cognitive start page shown in the `main` area when no session is selected. Includes drop zone, CTA, and animated background from `theme-tron-v1.html`.

Owner: frontend-engineer (design from frontend-designer)

- [x] Create `src/client/pages/StartPage.vue` (replaces LandingPage.vue as the `/` route child)
- [x] Drop zone with dashed border and "Browse Files" CTA button
- [x] CTA button opens system file picker for `.cast` files
- [x] Animated background: extract and adapt from `references/theme-tron-v1.html` (5 orbiting dots: Record, Detect, Curate, Validate, Replay)
- [x] Animation is low-opacity background element, does not compete with drop zone or CTA
- [x] `prefers-reduced-motion`: replace animation with static graphic
- [x] Start page also serves as the "no session selected" state (when navigating to `/`)
- [x] Drop zone has `aria-dropeffect="copy"`
- [ ] Verify: a user unfamiliar with Erika can identify what to do within 5 seconds
- [ ] Verify: animation does not play when `prefers-reduced-motion` is set

Files: `src/client/pages/StartPage.vue` (new), `src/client/pages/LandingPage.vue` (delete or archive)
Depends on: Stage 3 (route structure), Stage 6 (sidebar exists to provide context)

Considerations:
- The animation from `theme-tron-v1.html` must be studied first to understand its implementation (canvas, SVG, or CSS). The engineer should read the file and determine the best porting strategy.
- The drop zone on the start page is a secondary upload affordance (the primary is the system-wide drag target built in Stage 10). They share the same upload flow.
- If no sessions exist at all, this is the first-use empty state. If sessions exist but none is selected, this is the "home" state. Both show the same start page.

---

### Stage 9: Session Detail Layout

Goal: Adapt or rebuild SessionDetailPage for the main grid area. Breadcrumb moves to ShellHeader. Content fills the main area.

Owner: frontend-engineer (verdict from Stage 1)

- [x] Create `src/client/pages/SessionDetailView.vue` (or refactor `SessionDetailPage.vue` per designer verdict)
- [x] Remove container wrapper and standalone breadcrumb -- breadcrumb now rendered by `ShellHeader.vue` based on current route
- [x] Content fills the `main` grid area directly
- [x] Loading state uses `SkeletonMain.vue`
- [x] Error state styled within the main area
- [x] Component responsive to width changes (for future `aside` panel activation)
- [x] Wire `ShellHeader.vue` to display breadcrumb: "Sessions > {filename}" when on `/session/:id`
- [ ] Verify: session detail renders correctly in the main grid area
- [ ] Verify: breadcrumb appears in the header area
- [ ] Verify: switching sessions updates main content without sidebar change

Files: `src/client/pages/SessionDetailView.vue` (new or refactored), `src/client/components/ShellHeader.vue`, `src/client/pages/SessionDetailPage.vue` (remove if rebuilt)
Depends on: Stage 3 (route structure), Stage 4 (skeleton loaders), Stage 1 (designer verdict)

Considerations:
- `SessionContent.vue` and `TerminalSnapshot.vue` contain working WASM terminal rendering. Preserve this logic regardless of whether the page wrapper is rebuilt.
- The breadcrumb in `ShellHeader.vue` should reactively read `route.params.id` and look up the session filename from the session list data (provided via inject).
- The detail view should handle the case where the session ID in the URL does not match any session (404-like state).

---

### Stage 10: Upload Flow

Goal: System-wide drag target. Immediate sidebar entry creation on upload. Wire `useUpload()` into the spatial shell.

Owner: frontend-engineer

- [x] Create `src/client/components/DropOverlay.vue` -- fixed-position viewport overlay
- [x] Register `dragenter`/`dragleave`/`drop` handlers at the `SpatialShell.vue` level (viewport-wide)
- [x] Use the dragenter counter pattern to handle nested elements (increment on enter, decrement on leave, show overlay when > 0)
- [x] Receiving state: visible border glow + centered overlay confirming drop target, within 100ms of `dragenter`
- [x] Drop: initiate upload to `POST /api/upload`; immediately insert optimistic sidebar entry in `uploading` state
- [x] Wire "+ New Session" button in sidebar to open file picker
- [x] Wire CTA button on start page to open file picker
- [x] `prefers-reduced-motion`: static border change instead of animated glow
- [x] `aria-dropeffect="copy"` on the drop overlay
- [ ] Verify: dragging a file anywhere over the viewport triggers the receiving state
- [ ] Verify: new sidebar entry appears immediately before server responds
- [ ] Verify: upload success refreshes session list

Files: `src/client/components/DropOverlay.vue` (new), `src/client/components/SpatialShell.vue`, `src/client/composables/useUpload.ts`
Depends on: Stage 6 (sidebar must exist for entry insertion), Stage 8 (start page CTA)

Considerations:
- The optimistic sidebar entry needs a temporary ID (e.g., `uploading-<timestamp>`) that gets replaced with the real session ID when the upload response arrives.
- `useUpload()` needs enhancement to return the server response (session ID) so the sidebar can swap the optimistic entry.
- The dragenter counter pattern: `let counter = 0; on dragenter: counter++, show overlay; on dragleave: counter--, if counter === 0 hide overlay; on drop: counter = 0, hide overlay`.

---

### Stage 11: SSE Status Updates

Goal: Build `useSSE()` composable. Per-session connections for active processing. Sidebar card transitions driven by events.

Owner: frontend-engineer

- [ ] Create `src/client/composables/useSSE.ts`
- [ ] Composable takes a reactive session ID and current status
- [ ] Opens `EventSource` to `/api/sessions/:id/events` when status is active
- [ ] Returns reactive `status` ref and `isConnected` boolean
- [ ] Closes connection on terminal event, session ID change, or unmount
- [ ] Connection budget: max 3 concurrent SSE connections (module-level tracking)
- [ ] Priority: selected session first, then most recent uploads
- [ ] Fallback: sessions beyond budget use polling (10s interval)
- [ ] Wire into `SessionCard.vue`: status indicator driven by SSE status ref
- [ ] ARIA live region (`role="status"`) for processing updates, `role="alert"` for errors
- [ ] Status transition animations: pulse for active, glow burst for completion, static for error
- [ ] Verify: upload a session and watch the card transition through states without refresh
- [ ] Verify: SSE connection closes after terminal event
- [ ] Verify: screen reader announces status changes

Files: `src/client/composables/useSSE.ts` (new), `src/client/components/SessionCard.vue`
Depends on: Stage 7 (session cards must exist with status indicators)

Considerations:
- `EventSource` auto-reconnects on network errors. The composable should handle the `error` event gracefully (update `isConnected` to false, do not duplicate reconnection logic).
- The connection budget is tracked at the module level (not per composable instance) via a shared `Set<string>` of active session IDs.
- Test with the backend running: upload a `.cast` file and verify the SSE endpoint sends status events.

---

### Stage 12: Toast System

Goal: Adapt or rebuild toast notifications per designer verdict. Add ARIA live regions.

Owner: frontend-engineer

- [ ] Apply designer verdict to `ToastContainer.vue` / `useToast.ts`
- [ ] Toasts fire on: upload success, upload failure, processing complete, processing failed
- [ ] Toast copy names the session (e.g., "session-1.cast is ready")
- [ ] Self-dismiss: 4-6s for success/info, 8s for errors (or manual dismiss)
- [ ] Each toast has `role="status"` (informational) or `role="alert"` (errors)
- [ ] Screen reader announces toast content
- [ ] Design polish per the design system tokens
- [ ] Verify: upload a file and see success toast
- [ ] Verify: screen reader announces the toast

Files: `src/client/components/ToastContainer.vue`, `src/client/composables/useToast.ts`
Depends on: Stage 10 (upload flow triggers toasts), Stage 11 (SSE triggers toasts), Stage 1 (designer verdict)

Considerations:
- The existing `useToast()` uses a module-level `nextId` counter. This is fine for a single-instance app but should be noted.
- Toast integration with SSE: when `useSSE()` receives a terminal event, it should call `addToast()` with the session name and outcome.

---

### Stage 13: Mobile Overlay

Goal: Sidebar collapses on mobile. Hamburger toggle. Overlay with focus trap and backdrop.

Owner: frontend-engineer

- [ ] Add hamburger toggle button to `ShellHeader.vue` (visible only < 768px)
- [ ] Create `src/client/components/MobileSidebarOverlay.vue` -- overlay wrapper with backdrop
- [ ] Sidebar slides in: `translateX(-100%)` -> `translateX(0)`, 150-200ms ease-out
- [ ] Backdrop dims main content while sidebar is open
- [ ] `aria-modal="true"` on overlay
- [ ] Focus trap: Tab cycles sidebar controls only while overlay is open
- [ ] Escape closes overlay, returns focus to hamburger toggle
- [ ] Tapping a session card closes overlay and shows session detail
- [ ] Filter pills meet 44px minimum touch target height (padding compensation)
- [ ] `useLayout()` tracks mobile vs desktop sidebar state separately
- [ ] Verify: on mobile viewport, hamburger opens sidebar overlay
- [ ] Verify: Escape closes and returns focus
- [ ] Verify: selecting a session closes overlay

Files: `src/client/components/MobileSidebarOverlay.vue` (new), `src/client/components/ShellHeader.vue`, `src/client/components/SidebarPanel.vue`, `src/client/composables/useLayout.ts`
Depends on: Stage 6 (sidebar), Stage 7 (session cards), Stage 2 (responsive grid rules)

Considerations:
- Focus trap implementation: use a lightweight focus-trap utility or implement manually (query all focusable elements within the overlay, wrap Tab at boundaries).
- The sidebar content is the same component in both desktop and mobile -- only the container changes (inline grid area vs overlay).
- `useLayout()` should expose `isMobile` (derived from `matchMedia('(max-width: 767px)')`) so components can branch behavior.

---

### Stage 14: Accessibility Pass

Goal: Final accessibility audit. Skip link, ARIA live regions, focus management, contrast verification, touch targets.

Owner: frontend-engineer

- [ ] Add "Skip to main content" link as first focusable element in DOM (visually hidden until focused)
- [ ] Verify all ARIA live regions are in place (SSE status, upload results, toast notifications)
- [ ] Verify focus management: after session selection on desktop, focus stays in sidebar
- [ ] Verify drop zone has `aria-dropeffect="copy"` and announces results
- [ ] Verify cyan on `--bg-surface` meets WCAG AA (>= 4.5:1)
- [ ] Verify `--text-muted` on `--bg-surface` meets WCAG AA where used for informational text
- [ ] Verify all interactive elements are keyboard-operable (Tab to reach, Enter/Space to activate)
- [ ] Verify filter pills have `role="group"` + `aria-pressed`
- [ ] Verify session list uses `role="list"` / `role="listitem"` or semantic `<ul>` / `<li>`
- [ ] Verify all status indicators have `aria-label`
- [ ] Run axe DevTools or similar automated checker, fix any issues
- [ ] Verify: Tab through the entire app, every interactive element is reachable and operable

Files: `src/client/components/SpatialShell.vue`, various component files
Depends on: All previous stages (this is the final pass)

Considerations:
- The skip link should target the `main` grid area with an `id` attribute.
- This stage is verification and fixes, not new features. If earlier stages implemented ARIA correctly, this should be a confirmation pass with minor fixes.
- Color contrast should be verified with a tool, not by eye. Use Chrome DevTools color picker or axe.

---

### Stage 15: Design Token Audit

Goal: Verify all new and rebuilt code uses design system tokens exclusively. No hardcoded values.

Owner: frontend-engineer (or pair-reviewer)

- [ ] Search all new/modified `.vue` and `.css` files for hardcoded color values (hex, rgb, hsl)
- [ ] Search for hardcoded pixel values for spacing, font sizes, border radii
- [ ] Verify all new BEM class names follow existing conventions
- [ ] Fix any violations found
- [ ] Verify: zero hardcoded color values in new or rebuilt code
- [ ] Verify: zero hardcoded spacing/sizing values -- all map to tokens

Files: All files modified in this branch
Depends on: All previous stages

Considerations:
- A grep for `#[0-9a-fA-F]{3,8}` in `.vue` files (excluding `<script>` sections and comments) catches most color violations.
- A grep for `[0-9]+px` in style sections, excluding token definitions, catches spacing violations.
- This can be run as part of the pair-review process rather than a standalone stage if preferred.

## Dependencies

What must be done before what:

```
Stage 0 (Baseline Decision)
  |
  +-> Stage 1 (Design Verdicts) -- needs baseline for sizing evaluation
  |     |
  +--+--+-> Stage 2 (CSS Grid Shell) -- needs baseline tokens finalized
        |     |
        |     +-> Stage 3 (Route Restructure) -- needs grid CSS
        |           |
        |           +-> Stage 4 (Skeleton Loaders) -- needs grid areas + card height targets
        |           |
        |           +-> Stage 5 (Branding Rename) -- needs BrandMark.vue from Stage 3
        |           |
        |           +-> Stage 6 (Sidebar Panel) -- needs route structure + skeletons
        |                 |
        |                 +-> Stage 7 (Session Card) -- needs sidebar
        |                 |     |
        |                 |     +-> Stage 11 (SSE Status) -- needs cards with status indicators
        |                 |           |
        |                 |           +-> Stage 12 (Toast System) -- needs SSE for event-driven toasts
        |                 |
        |                 +-> Stage 8 (Start Page) -- needs route structure + sidebar context
        |                 |
        |                 +-> Stage 9 (Session Detail) -- needs route structure + skeletons
        |                 |
        |                 +-> Stage 10 (Upload Flow) -- needs sidebar for entry insertion
        |                       |
        |                       +-> Stage 12 (Toast System) -- needs upload for success/failure toasts
        |
        +-> Stage 13 (Mobile Overlay) -- needs sidebar + cards + responsive grid
              |
              +-> Stage 14 (Accessibility Pass) -- needs all features in place
                    |
                    +-> Stage 15 (Design Token Audit) -- final verification
```

Parallelizable stages (no file ownership overlap):
- Stage 4 (Skeleton Loaders) and Stage 5 (Branding Rename) can run in parallel after Stage 3
- Stage 8 (Start Page) and Stage 9 (Session Detail) can run in parallel after Stage 6
- Stage 8 (Start Page) and Stage 10 (Upload Flow) have a minor dependency (CTA wiring) but can mostly run in parallel

## Progress

Updated by implementer as work progresses.

| Stage | Status | Notes |
|-------|--------|-------|
| 0 | pending | Baseline grid decision |
| 1 | pending | Design review verdicts |
| 2 | complete | CSS Grid shell |
| 3 | pending | Route restructure |
| 4 | complete | Skeleton loaders |
| 5 | pending | Branding rename |
| 6 | in progress | Sidebar panel — core implementation done; layout toggle wiring deferred to Stage 13 |
| 7 | complete | Session card |
| 8 | complete | Start page — StartPage.vue implemented; router updated to route name 'home' |
| 9 | complete | Session detail layout — SessionDetailView.vue created, ShellHeader breadcrumb wired |
| 10 | complete | Upload flow — DropOverlay, drag handlers, optimistic entries, file picker wired |
| 11 | pending | SSE status updates |
| 12 | pending | Toast system |
| 13 | pending | Mobile overlay |
| 14 | pending | Accessibility pass |
| 15 | pending | Design token audit |
