# Design Review Verdicts: Erika Spatial Foundation

Each existing component is evaluated against VISION_STEP.md, the Gemini prototype screenshots, and the spatial shell architecture (ADR.md). The verdict is either **rebuild** (new component, existing code discarded or archived) or **adapt** (existing component modified in place).

**Baseline context:** Path C adopted (18px / 36px grid). All sizing references below use the 18px rhythm.

---

## AppHeader.vue -- REBUILD

**Current state:** A sticky horizontal bar spanning full viewport width. Contains a router-link brand mark ("RAGTS" with cyan "R" logo), a "Sessions" nav link, and an "Upload" button. Height fixed at `--header-height` (54px). BEM class `.app-header` from `components.css` provides layout.

**Vision target:** The header does not exist as a single component in the spatial shell. It is split into two grid areas:
- `brand` area (top-left, sidebar column): "Erika" brand mark, occupying the sidebar width
- `header` area (top-right, spanning main + aside columns): breadcrumb navigation, global actions, mobile hamburger toggle

**Why rebuild, not adapt:**
1. **Structural incompatibility.** The current header is a single flex row spanning full width. The spatial shell requires two separate grid areas (`brand` and `header`) in different columns. No amount of CSS modification makes a single element span two non-adjacent grid areas with different content.
2. **Content change.** The "Sessions" nav link disappears (the sidebar IS the session navigation). The upload button moves to the sidebar. The breadcrumb (currently in SessionDetailPage) moves to the header area. None of the current header content survives unchanged.
3. **Naming.** "RAGTS" becomes "Erika" -- the brand mark needs a new visual treatment, not just a text swap.

**Target design -- BrandMark.vue (new):**
- Grid area: `brand`
- Content: "Erika" wordmark in Geist, weight semibold, `--text-lg` (17px)
- Subtle cyan glow on the "E" or a small icon mark
- Height: matches `--header-height` (54px) -- shares the grid row with ShellHeader
- Background: `--bg-surface` with bottom border in `--border-default`
- Reference: Gemini prototype shows "Erika" in the top-left above the session list

**Target design -- ShellHeader.vue (new):**
- Grid area: `header`
- Content: reactive breadcrumb ("Sessions > filename.cast"), global action buttons (future), mobile hamburger toggle (visible < 768px)
- Height: same as BrandMark (they share a grid row)
- Background: transparent or `--bg-surface` with bottom border
- The breadcrumb reads `route.params.id` and looks up the session filename from injected session list data

**Disposition of AppHeader.vue:** Archive or delete. The `.app-header` CSS classes in `components.css` can be left in place for now but are no longer consumed by the application.

---

## SessionList.vue -- REBUILD

**Current state:** A page-level component that renders sessions as a card grid using `.grid` layout utility. Each card is a `<router-link>` with filename, size, marker count badge, date, and a delete button. The grid uses `auto-fill` for responsive columns. Loading, error, and empty states are plain text dividers.

**Vision target:** A sidebar panel (`SidebarPanel.vue`) containing: search input, filter pills (All / Processing / Ready / Failed), a scrollable session card list (`<ul>/<li>`), and a "+ New Session" button. The session cards are compact (~36-54px), show filename + status indicator + metadata row. Selection state is derived from the router.

**Why rebuild, not adapt:**
1. **Layout incompatibility.** The current component renders as a page-width grid with auto-fill responsive columns. The sidebar requires a single-column vertical list. The grid layout is fundamentally wrong for a 260px sidebar.
2. **Card anatomy mismatch.** Current cards have header (filename + delete button), meta (size + marker badge), and footer (date) -- three rows designed for 200px+ wide grid cards. Sidebar cards need: filename + status dot (row 1), section count + age (row 2) -- a completely different anatomy.
3. **Missing features.** No search input, no filter pills, no status indicators, no selection state, no "+ New Session" button, no ARIA list semantics.
4. **Missing composable integration.** The current component receives `sessions` as a prop. The sidebar needs `useSessionList()` with `searchQuery`, `statusFilter`, and `filteredSessions`.

**Target design -- SidebarPanel.vue (new):**
- Grid area: `sidebar`
- Internal layout (top to bottom): search input (36px), filter pills row (27px pills), scrollable session list, "+ New Session" button (fixed at bottom)
- Search input: `--input-height-sm` (36px), placeholder "Filter sessions...", filters client-side in real time
- Filter pills: `--btn-height-sm` (27px), `role="group"` with `aria-pressed`, horizontal row with `--space-1` (4px) gap
- Session list: `<ul role="list">` containing `<li role="listitem">` wrappers around `SessionCard.vue`
- "+ New Session" button: `--btn-height-md` (36px), opens system file picker for `.cast`
- Background: `--bg-surface`
- Width: `--sidebar-width` (260px default)
- Scrollable: `overflow-y: auto` on the session list region only (search, filters, and button stay fixed)

**Target design -- SessionCard.vue (new):**
- Height target: ~45-50px (approximately 2.5-3 baseline units)
- Row 1: filename (Geist Mono, `--text-base`, truncated with ellipsis), status dot (right-aligned, 8px circle)
- Row 2: metadata in `--text-muted` at `--text-sm` (12px) -- section count ("3 sections"), relative age ("2h ago")
- Padding: `--rhythm-quarter` (4.5px) top/bottom, `--space-3` (12px) left/right
- Selected state: 2px left border in `--accent-primary`, background `--accent-primary-subtle`
- Status dot colors: processing = `--accent-primary` with CSS pulse animation; ready = `--status-success` steady; failed = `--status-error` steady, no animation
- Each status dot has `aria-label` (e.g., "Processing", "Ready", "Failed")
- Click: `router.push('/session/' + session.id)` -- focus stays in sidebar
- Gap between cards: `--space-1` (4px) or `--space-0.5` (2px)

**Disposition of SessionList.vue:** Archive or delete.

---

## UploadZone.vue -- REBUILD

**Current state:** A drag-and-drop zone component scoped to its own rectangular boundary. Accepts `dragover`/`dragleave`/`drop` events within its element. Shows a file icon, "Drag & drop a .cast file here", "or", and a "Browse files" button. Has uploading spinner and error bar. All events emitted to parent.

**Vision target:** Two separate upload affordances replace this single component:
1. **DropOverlay.vue** -- A viewport-wide fixed-position overlay that activates on `dragenter` anywhere in the window.
2. **Start page drop zone** -- A dashed-border drop zone in the `main` area, part of `StartPage.vue`.
3. **"+ New Session" button** in the sidebar panel opens the system file picker.

**Why rebuild, not adapt:**
1. **Scope change.** The current component is a contained rectangle. The vision requires a viewport-wide system drag target.
2. **Event architecture.** The spatial shell needs drag events registered at `SpatialShell.vue` level with a separate overlay component. The event flow is inverted.
3. **Multiple affordances.** Upload is three entry points sharing `useUpload()`. The monolithic `UploadZone.vue` does not map to this.

**Target design -- DropOverlay.vue (new):**
- Position: `fixed`, full viewport, `z-index` above everything except toasts
- Appearance: subtle border glow (`--accent-primary-glow`) + centered text "Drop to upload" on `--bg-overlay`
- Transition: appears within ~100ms of `dragenter` at the viewport level
- `aria-dropeffect="copy"` on the overlay
- `prefers-reduced-motion`: static border instead of animated glow

**Disposition of UploadZone.vue:** Archive or delete. The upload logic in `useUpload()` composable is preserved.

---

## ToastContainer.vue -- ADAPT

**Current state:** A fixed-position container (bottom-right) with success/error/info toast variants. Each toast has a message and dismiss button. Animation via `toast-in` keyframe. BEM classes from `components.css`.

**Why adapt, not rebuild:**
1. **Structure is correct.** Fixed-position container outside the grid needs no grid area changes.
2. **CSS is solid.** `components.css` toast styles use design system tokens.
3. **Missing features are additive.** ARIA roles, session-aware copy, and dismiss timing are additions, not structural changes.

**Changes needed:**
- Add `role="status"` to success/info toasts, `role="alert"` to error toasts
- Wire `useToast()` to accept a `role` property per toast type
- Adjust auto-dismiss timing: 4-6s success/info, 8s errors
- Verify close button has 44px touch target on mobile
- Remove scoped toast variant styles that duplicate `components.css`

**Disposition:** Keep `ToastContainer.vue` and `useToast.ts`. Modify in place.

---

## SessionDetailPage.vue -- ADAPT (with significant modification)

**Current state:** A standalone page with `.container` wrapper, breadcrumb navigation, and `SessionContent` below. Uses `useSession()` composable. Loading/error states are centered text.

**Why adapt, not rebuild:**
1. **Core rendering logic is correct.** `SessionContent.vue` and `TerminalSnapshot.vue` contain working WASM terminal rendering that must be preserved.
2. **Data flow is correct.** `useSession(sessionId)` with `computed(() => route.params.id)` is the right pattern.
3. **Changes are subtractive.** Remove breadcrumb (moves to ShellHeader), remove `.container` wrapper, replace text loading with `SkeletonMain`.

**Changes needed:**
- Remove `<header>` block with breadcrumb (ShellHeader handles this)
- Remove `.container` class and its padding
- Add internal padding: `padding: var(--space-4) var(--space-6)`
- Replace "Loading session..." text with `<SkeletonMain />`
- Ensure width-responsiveness for future `aside` panel
- Optionally rename to `SessionDetailView.vue`
- Add 404-like state for invalid session IDs

**Disposition:** Keep the file (possibly renamed). Modify template and styles. Preserve `SessionContent` and `TerminalSnapshot` integration entirely.

---

## SessionContent.vue -- PRESERVE (no changes)

**Current state:** Renders terminal session content with collapsible sections, preamble lines, sticky headers, and TerminalSnapshot components for CLI/TUI sections.

**Why preserve:**
1. **Working WASM rendering.** Complex, tested, must not be modified.
2. **No spatial shell impact.** Fills parent width, already responsive via `overflow-x: auto`.
3. **No design system violations.** Uses `--font-mono`, `--space-*`, `--radius-lg` tokens.

**Disposition:** Do not modify.

---

## SectionHeader.vue -- ADAPT (minor)

**Current state:** A `<button>` collapsible section header with chevron, label, type badge, line range. Sticky positioning. BEM styles from `components.css`.

**Why adapt (minor):**
1. **Correct pattern.** Button-as-collapsible-header with sticky positioning is what the vision requires.
2. **Design system compliant.** Uses appropriate tokens.
3. **No spatial shell impact.** Lives deep inside the `main` grid area content.

**Changes needed:**
- Add `aria-expanded` attribute to the button
- Verify sticky `top: 0` works within the grid area scroll context
- Verify height aligns with 18px baseline rhythm

**Disposition:** Keep in place. Minor tweaks.

---

## LandingPage.vue -- REPLACE

**Current state:** Root route (`/`) combining session list and upload zone.

**Disposition:** Archive or delete. Replaced by `StartPage.vue` (new) which renders in the `main` grid area.

---

## Summary Table

| Component | Verdict | New Component(s) | Key Reason |
|-----------|---------|-------------------|------------|
| `AppHeader.vue` | REBUILD | `BrandMark.vue` + `ShellHeader.vue` | Splits into two grid areas; content changes entirely |
| `SessionList.vue` | REBUILD | `SidebarPanel.vue` + `SessionCard.vue` | Page grid incompatible with sidebar; card anatomy changes |
| `UploadZone.vue` | REBUILD | `DropOverlay.vue` + start page integration | Viewport-wide drag target replaces contained zone |
| `ToastContainer.vue` | ADAPT | (same) | Structure correct; add ARIA roles and polish |
| `SessionDetailPage.vue` | ADAPT | (same, possibly renamed) | Remove breadcrumb/container; preserve WASM rendering |
| `SessionContent.vue` | PRESERVE | (same) | Working WASM rendering; no spatial shell impact |
| `SectionHeader.vue` | ADAPT (minor) | (same) | Add `aria-expanded`; verify rhythm alignment |
| `LandingPage.vue` | REPLACE | `StartPage.vue` | Role disappears; replaced by spatial shell + start page |

## Component Height Targets (18px Baseline)

For the engineer building these components:

| Element | Height | Token |
|---------|--------|-------|
| Header row (brand + header areas) | 54px | `--header-height` (3 baselines) |
| Search input | 36px | `--input-height-sm` (2 baselines) |
| Filter pills | 27px | `--btn-height-sm` (1.5 baselines) |
| Session card | ~45-50px | ~2.5-3 baselines (designer iteration target) |
| "+ New Session" button | 36px | `--btn-height-md` (2 baselines) |
| Status indicator dot | 8px | `--space-2` |
| Sidebar width (default) | 260px | `--sidebar-width` (new token) |

## Visual Reference

The Gemini prototype screenshots in `.state/feat/client-design-bootstrap/references/` are the quality benchmark:

1. **Sidebar density:** Cards compact (~2 text rows, minimal padding). ~12-15 sessions visible without scrolling.
2. **Search bar:** Top of sidebar, ~36px height, "Filter..." placeholder.
3. **Filter pills:** Compact horizontal row ("All", "Proc", "Ready", "Fail"), ~24-28px height.
4. **Session card metadata:** "S: 8 | 20 hours ago" -- section count and relative time, very condensed.
5. **Brand area:** "Erika" wordmark with small cyan "E" mark, minimal height.
6. **Start page:** Animated orbiting dots as background; centered drop zone with heading and "Browse Files" CTA.
7. **Session detail:** Breadcrumb in header area, terminal output with collapsible sections and ANSI colors.
