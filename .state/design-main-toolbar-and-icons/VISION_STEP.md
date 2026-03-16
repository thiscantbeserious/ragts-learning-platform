# Vision: Main Toolbar and Icon Library Migration

> Establish the application toolbar as Erika's command surface, and migrate the icon system to Lucide for long-term scalability -- laying the foundation for pipeline visibility, user identity, and every future feature that needs a visual vocabulary.

## Core Intent

The user is building **the permanent scaffolding for a multi-user product**. Today Erika has no global controls above the content area -- no way to see pipeline activity at a glance, no user presence, no settings entry point. The header's right side is empty. Meanwhile, the icon system is a dead end: 46 hand-drawn SVGs in a bespoke 20x20 coordinate space with no path to expansion. Together, these two gaps block every near-term roadmap item -- auth, workspaces, notifications, and pipeline transparency all require both a place to live (toolbar) and a visual language to speak (icons).

The real goal is not "add three buttons to the header." It is to make Erika feel like an application that knows who you are, what it is doing, and where you can go next. The toolbar is the user's persistent awareness surface. The icon migration is what makes that surface (and every future surface) articulate.

## Current State

**Toolbar:** The `ShellHeader.vue` component contains a breadcrumb on the left and nothing on the right. The `shell-header__right` div exists but is empty. There is no user presence, no settings access, no pipeline visibility, and no notification surface. The header's bottom border already carries the accent gradient (cyan-to-pink), establishing visual weight. The spatial shell grid (`spatial-shell__header`) currently has `overflow: hidden`, which would clip dropdown content.

**Icons:** 46 icons defined as CSS mask-image data URIs in `design/styles/icons.css`. Every icon uses a custom 20x20 viewBox, stroke-width 1.5, butt linecap, miter linejoin. The settings icon (`icon-settings`) is broken -- its radial line pattern renders as a sun/starburst rather than a gear. Adding any new icon requires hand-drawing SVG path data and encoding it as a data URI. There is no way to preview icons outside the running application. The icon comparison reference at `.state/design-main-toolbar-and-icons/references/iconography-lucide.html` has already mapped all 46 current icons to Lucide equivalents and confirmed visual parity at all size classes (xs through xl).

**Pipeline:** The backend already streams processing events via SSE (`EventBusAdapter` / `EmitterEventBusImpl`). Session cards in the sidebar show processing state with animated dots and swoosh effects. But there is no global summary -- the user must scan the sidebar to understand how many sessions are processing or queued. The pipeline dropdown in the mockup exposes only session-level information (names, status, queue position), deliberately hiding infrastructure details (worker count, thread count, internal concurrency).

**Gap:** The application looks and feels like an anonymous single-purpose tool rather than a multi-user platform. There is no sense of "who am I" or "what is happening in the background" at the global level.

## Design Direction

The approved design is **Draft 2b** — the glass pill toolbar mockup.

> **THE MOCKUP IS THE SPEC.** The authoritative source of truth for all visual details is:
> `.state/design-main-toolbar-and-icons/references/draft-2b-lucide.html`
>
> This HTML file contains the exact CSS values, spacing, colors, border radii, backdrop blur, shadow, animation timings, and layout. Do NOT interpret the prose descriptions below as the spec — they are summaries for context. When in doubt, open the mockup and read the CSS. The engineer MUST copy the mockup's HTML/CSS first, then componentize.

The design establishes a **glass pill** paradigm — a frosted, translucent container that groups functionally related controls into a single cohesive element in the header's right section. Key elements (all values are in the mockup):

- **Frosted glass material** with `backdrop-filter`, cyan-tinted background, subtle border
- **Internal grouping via separators** — thin vertical lines between functional zones: pipeline status | settings + notifications | user avatar
- **SVG progress ring** — animated circle with count digit for pipeline status
- **Dropdown as frosted panel** — extends below the pill with Processing / Queued / Recently completed sections
- **Emotional tone** — cockpit instrument cluster: compact, always-visible, information-dense but calm

**Icon visual language after migration:** Lucide SVGs use a 24x24 internal coordinate space (viewBox), but the rendered size is unchanged -- all existing CSS size classes (`.icon--xs` 12px through `.icon--2xl` 48px) continue to control the actual pixel size, exactly as today. The viewBox is an internal detail, not a sizing change. Stroke-width 2 (Lucide default), round linecap and linejoin. The rounder stroke terminals give a slightly warmer, more approachable feel compared to the current butt/miter style. The mask-image rendering approach is preserved -- Lucide SVGs are encoded as data URIs in `icons.css`, maintaining the `currentColor` inheritance model and all existing size classes. No icon sizes change. No runtime JavaScript, no font loading, no network requests for icons.

## Key Interactions

### 1. Glancing at pipeline activity

The user uploads a session and continues browsing. In their peripheral vision, the progress ring in the toolbar pill transitions from "0" (dormant, dim) to "1" (active, cyan glow). The ring's stroke fills proportionally as the pipeline progresses. Without clicking anything, the user knows: something is processing, and roughly how far along it is. This is ambient awareness -- the toolbar communicates state without demanding attention.

### 2. Inspecting the pipeline queue

The user clicks the progress ring. A frosted dropdown appears below the pill, anchored to the right edge. It shows three sections: "Processing" (with a spinning indicator and percentage), "Queued" (with position numbers), and "Recently completed" (with checkmarks and timestamps). Session names are truncated with ellipsis. The user can see exactly which sessions are in flight and their order. No internal infrastructure details are exposed -- no worker counts, no thread pools, no memory usage. Just sessions and their status. Clicking outside or pressing Escape closes the dropdown.

### 3. Recognizing yourself in the application

The top-right of the pill shows the user's avatar -- an initial letter in a gradient circle (cyan-to-pink) for users without a profile image, or a real avatar for those who have one. This is the first moment Erika acknowledges the user as an individual rather than an anonymous operator. Hovering the avatar shows a subtle border glow. In the future, clicking it will open a profile/account menu. For this cycle, it is a visual placeholder that establishes the pattern.

### 4. Accessing settings

The gear icon sits between the pipeline and the avatar, inside the pill. It is a 30px circular button with the same hover treatment as other pill controls (cyan background tint, border glow). Clicking it will navigate to settings. For this cycle, the button exists and is interactive but the settings destination may not yet be built -- the toolbar establishes the entry point, the settings page comes later.

### 5. Encountering consistent, recognizable icons everywhere

After the Lucide migration, every icon across the entire application -- sidebar, session cards, section headers, toolbar, empty states, upload zone -- speaks the same visual language. The settings icon is unambiguously a gear. The filter icon is a clean funnel variant (Lucide `list-filter`). New features can draw from 1700+ professionally designed icons without any manual SVG work. The user does not consciously notice the change (icons should be invisible infrastructure), but the cumulative effect is an application that feels more polished and internally consistent.

### 6. Collapsing the toolbar to save space

The toolbar should be able to collapse/shrink with a smooth animation -- for example, when clicking the user avatar. In collapsed state, the toolbar reduces to a minimal footprint (perhaps just the avatar or a small icon) while the full glass pill is hidden. Clicking again expands it back. This gives users control over header real estate, especially useful when they want maximum content area for reading sessions. The animation should use the design system's transition tokens (`--duration-normal`, `--easing-default`).

## Opportunities

**1. Pipeline dropdown as a navigation shortcut.** The dropdown lists session names. Making them clickable links that navigate to that session would turn the pipeline status from a read-only display into a navigation tool. The user uploads a file, continues working, sees it finish in the dropdown, clicks the name, and lands on the completed session. This closes the loop between "I started something" and "I can see the result" without touching the sidebar.

**2. Idle/active toolbar state transitions.** When no sessions are processing, the entire pill could dim slightly -- the progress ring shows "0" with reduced opacity, the "Pipeline" label fades to `--text-disabled`. When activity begins, the pill brightens with a smooth transition. This creates a breathing quality that conveys system liveness. The application feels alive when working, calm when idle.

**3. Notification badge as a future extension point.** The bell icon is already in the mockup. Adding an unread count dot (a small accent circle in the top-right of the bell button) would be trivial once the toolbar is built. This prepares for workspace invitations, pipeline failures that need attention, and system announcements -- all without redesigning the toolbar.

**4. Keyboard shortcut surface.** The toolbar buttons are natural targets for keyboard shortcuts. `Cmd+,` for settings, `Cmd+Shift+P` for pipeline status -- the toolbar provides the visual anchor for shortcut discovery (tooltips showing the shortcut alongside the label).

## Constraints

- **Design system tokens are fixed.** All colors, spacing, typography, radii, and shadows must come from the existing custom properties in `layout.css`. The glass pill uses design token values (e.g., `--radius-full`, `--space-3`, `--duration-normal`, `--easing-default`) where available. Raw `rgba()` values in the mockup that do not map to existing tokens should be extracted into new toolbar-scoped tokens or promoted to the design system.

- **Spatial shell grid is fixed.** The header lives in `spatial-shell__header`. The toolbar must fit within `shell-header__right` without changing the grid layout. The `overflow: hidden` on the header must be changed to `overflow: visible` to allow the dropdown to extend beyond the header's bounds.

- **Mask-image rendering approach is preserved.** Icons continue to use CSS `mask-image` with data URIs. The migration replaces the SVG content inside the data URIs, not the rendering mechanism. The `.icon` base class, all size classes (`--xs` through `--2xl`), and the `currentColor` inheritance model remain unchanged.

- **Backend pipeline API exists.** SSE events and session status are already available. The toolbar reads existing data; it does not require new API endpoints. The pipeline dropdown sources its data from the same session list and status information already consumed by sidebar components.

- **Lucide license compatibility.** Lucide is ISC-licensed (functionally MIT). This is compatible with both AGPL-3.0 (application code) and ELv2 (design system). The SVG paths themselves are ISC-licensed data embedded in the ELv2-licensed `icons.css` file. No license conflict.

- **Lucide license attribution is a hard deliverable.** The Lucide ISC + MIT license MUST be honored with proper attribution. A `THIRD-PARTY-LICENSES` or `NOTICES` file must be added to the repository root listing Lucide's copyright and license text. The project's `LICENSE` file or `README` should reference the third-party notices. This is not optional polish -- it is a legal requirement for ISC/MIT licensed code and must be treated as a mandatory deliverable in the implementation plan.

- **Mockup-first implementation.** The frontend engineer MUST start by copying the approved HTML/CSS from `draft-2b-lucide.html` verbatim into a Vue component, then progressively enhance it with reactivity, data binding, and composables. The engineer does NOT reimplement the design from scratch or from memory. The mockup IS the source of truth for all visual details -- spacing, colors, border radii, backdrop blur values, animation timings. This ensures zero design drift between the approved mockup and the shipped component.

- **Vue 3 Composition API.** All new components use `<script setup>` with composables for state. No Pinia. No Options API.

- **Node 24 LTS target.** No constraints from this for frontend work, but build tooling and dev server must remain compatible.

## Out of Scope

- **Settings page or panel.** The toolbar provides the entry point; the destination is a future cycle.
- **User authentication and profile management.** The avatar is a placeholder. Login, registration, and profile editing are part of the Workspaces/Auth roadmap.
- **Notification system.** The bell icon is present in the toolbar but non-functional in this cycle. Notification infrastructure (what triggers notifications, persistence, read/unread state) is deferred.
- **Pipeline dropdown navigation.** Clickable session names in the dropdown are an opportunity, not a requirement. If included, it is a bonus; if omitted, the dropdown is read-only status display.
- **Real-time pipeline progress percentage.** The mockup shows "42%" for a processing session. Whether the backend exposes granular progress is an existing API question. The dropdown should display progress if available, gracefully degrade to a spinner if not.
- **Responsive/mobile toolbar behavior.** The glass pill design is desktop-first. Mobile adaptation (hamburger collapse, bottom sheet dropdown) is deferred.
- **Icon animation.** Lucide icons are static SVGs. Animated icon transitions (e.g., menu-to-close morphing) are deferred.
- **Dark/light theme switching.** Erika is dark-theme only at this stage.

## Success Criteria

- A user uploading a session sees the pipeline ring count increment without navigating away from their current view. The transition from "0" to "1" is animated and visible in peripheral vision.

- Opening the pipeline dropdown shows an accurate, real-time list of processing and queued sessions with no infrastructure details exposed. The dropdown closes cleanly on outside click and Escape.

- The settings gear icon renders as an unmistakable gear (not a sun). Every other icon in the application renders correctly and consistently after the Lucide migration.

- The toolbar pill feels like it belongs in the header -- visually integrated with the existing gradient border, spatially balanced against the breadcrumb on the left, and consistent with the Midnight Neon design language.

- Adding a new icon to the application (for any future feature) requires only looking up the Lucide icon name and adding a single CSS class definition with the data URI -- no hand-drawing, no custom SVG authoring.

- The entire icon migration introduces zero visual regressions in existing components. Icons render at the same sizes, in the same positions, with the same color inheritance behavior as before.

---
**Sign-off:** Approved (2026-03-16)
