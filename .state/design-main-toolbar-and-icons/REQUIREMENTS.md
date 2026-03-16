# Requirements: Main Toolbar and Icon Library Migration

## Problem Statement

Erika's application header has an empty right section and a broken icon system. The `shell-header__right` div contains nothing — no user presence, no pipeline status, no settings entry point. The icon set is 46 hand-drawn SVGs in a bespoke 20x20 coordinate space with no expansion path; the settings icon (`icon-settings`) renders as a sun/starburst rather than a gear. Together, these gaps make the application feel like an anonymous single-purpose tool and block every near-term roadmap item (auth, workspaces, notifications, pipeline transparency) that requires both a persistent control surface and a coherent visual language.

## Desired Outcome

After implementation:

1. The header's right section contains a glass pill toolbar (matching `draft-2b-lucide.html` exactly) that shows pipeline activity, a settings entry point, a notification placeholder, and the user's avatar — always visible, always in sync with backend state.
2. All 46 custom icons are replaced with Lucide equivalents encoded as CSS data URIs. Every icon across the entire application renders correctly and consistently. No icon sizes change. The mask-image rendering approach is preserved.
3. The `settings` icon is unambiguously gear-shaped.
4. Adding a new icon requires only looking up a Lucide name and writing a single CSS class definition.
5. Lucide's ISC + MIT license attribution is recorded in `THIRD-PARTY-LICENSES` at the repo root and referenced from the README.

## Scope

### In Scope

- New `ToolbarPill` Vue component (or equivalent name) that implements the glass pill design verbatim from `draft-2b-lucide.html`
- Pipeline ring: animated SVG progress ring showing total sessions in pipeline (processing + queued), with dormant/active states
- Pipeline dropdown: frosted panel with Processing, Queued, and Recently Completed sections, opened by clicking the ring trigger
- Settings button (30px circular, Lucide `settings` icon, hover state per mockup, `aria-label="Settings"`)
- Bell button (30px circular, Lucide `bell` icon, hover state per mockup, `aria-label="Notifications"`, non-functional placeholder)
- User avatar (30px circle, gradient initial, hover border glow per mockup, collapse trigger)
- Toolbar collapse/expand animation triggered by clicking the avatar — collapsed state shows avatar only
- SSE disconnection indicator on the pipeline ring (ambient, non-disruptive)
- `overflow: clip` on `.shell-header` changed to `overflow: visible` (with `z-index: 50` on `.spatial-shell__header`) so the dropdown can extend below the header boundary
- Full Lucide icon migration: all 46 existing icon classes in `design/styles/icons.css` replaced with Lucide equivalents per the mapping in `references/iconography-lucide.html`
- Developer documentation comment at the top of `icons.css` explaining the data URI pattern for adding new icons
- `THIRD-PARTY-LICENSES` file at the repo root with Lucide ISC copyright, ISC license text, and Feather Icons MIT attribution
- README update referencing `THIRD-PARTY-LICENSES`
- Raw `rgba()` values in the toolbar component extracted into scoped CSS custom properties (e.g., `--toolbar-glass-bg`, `--toolbar-separator`, `--toolbar-btn-hover-bg`)

### Out of Scope

- Settings page or panel (toolbar provides the entry point; destination is a future cycle)
- User authentication, login, registration, and profile management (avatar is a placeholder)
- Notification system infrastructure (bell icon is present but non-functional)
- Clickable session names in the pipeline dropdown (navigation shortcut is an opportunity, not a requirement)
- Real-time pipeline progress percentage (degrades gracefully to a spinner if the backend does not expose granular progress)
- Responsive / mobile toolbar behavior (desktop-first; mobile adaptation deferred)
- Animated icon transitions (e.g., menu-to-close morphing)
- Dark / light theme switching (dark-theme only at this stage)

## Functional Requirements

### FR-01 — Glass Pill Toolbar Present in Header (Story: Platform user — pipeline awareness; Platform user — user presence)

The `shell-header__right` section MUST contain the glass pill toolbar component. The pill MUST be visually integrated with the existing gradient bottom border of the header and spatially balanced against the breadcrumb on the left.

### FR-02 — Pipeline Ring Count (Story: Platform user — pipeline awareness)

The progress ring MUST display the total count of sessions currently in the pipeline (processing + queued combined). When count > 0, the ring MUST glow cyan and the ring's stroke fill proportionally represents progress. When count = 0, the ring MUST transition to a dormant state: "0" displayed with reduced opacity, "Pipeline" label fades to `--text-disabled`.

### FR-03 — Pipeline Ring Animation Transitions (Story: Platform user — pipeline awareness)

State transitions between dormant and active MUST use `--duration-normal` and `--easing-default` design tokens. The transition from "0" to "1" MUST be visible in peripheral vision without requiring user interaction.

### FR-04 — Pipeline Dropdown Opens on Ring Click (Story: Platform user — pipeline inspection)

Clicking the pipeline ring trigger MUST open the frosted dropdown panel. The trigger button MUST carry `aria-expanded` set to `true` when open and `false` when closed.

### FR-05 — Pipeline Dropdown Content (Story: Platform user — pipeline inspection)

The dropdown MUST contain:
- A header row with "Pipeline Status" title and an active/queued summary (e.g., "1 active / 2 queued")
- A "Processing" section: each session shown with a mini-spinner and percentage if available, spinner only if not
- A "Queued" section: each session shown with a queue-dot and position number (#1, #2, …)
- Session names truncated with `text-overflow: ellipsis` when too long
- No worker counts, thread counts, memory usage, or any internal infrastructure data

### FR-06 — Recently Completed Section (Story: Platform user — pipeline inspection — recently completed)

When at least one session has completed recently, the dropdown MUST show a third "Recently Completed" section listing the last 3–5 completed sessions with a checkmark icon and relative timestamp ("2m ago"). The section MUST be omitted entirely when no recently completed sessions exist.

### FR-07 — Dropdown Dismissal (Story: Platform user — pipeline inspection)

The dropdown MUST close when:
- The user clicks outside the dropdown and the trigger button
- The user presses the Escape key

On Escape, focus MUST return to the pipeline ring trigger button.

### FR-08 — SSE Disconnection Indicator (Story: Platform user — pipeline awareness — SSE disconnection)

When the SSE connection drops, the pipeline ring MUST show a subtle ambient warning state (dim/grey ring or a small disconnect indicator). When SSE reconnects, the ring MUST return to its normal state and refresh the count. No error toast or modal is shown for this condition.

### FR-09 — Toolbar Collapse / Expand (Story: Platform user — toolbar collapse)

Clicking the user avatar MUST toggle the toolbar between expanded (full pill) and collapsed (avatar only) states. During the transition, all other elements (pipeline ring, settings, bell, separators) MUST animate out/in using `--duration-normal` and `--easing-default`. No layout shift or content jump is permitted. Collapsed state MUST persist across in-app navigation within the session but NEED NOT persist across page reloads.

### FR-10 — User Avatar (Story: Platform user — user presence)

The pill's right end MUST show a 30px circular avatar displaying the user's initial letter on a gradient background (cyan-to-pink, matching the Midnight Neon palette). The avatar MUST be visible in both expanded and collapsed toolbar states. Hovering MUST produce a border glow matching the mockup.

### FR-11 — Settings Button (Story: Platform user — settings access)

A 30px circular button using the Lucide `settings` icon MUST be placed inside the pill between the pipeline indicator and the user avatar. The button MUST have `aria-label="Settings"` and `title="Settings"`. The icon MUST render as an unambiguous gear, not a sun/starburst. Hover state MUST match other pill controls.

### FR-12 — Bell Button (Story: Platform user — bell icon placeholder)

A 30px circular button using the Lucide `bell` icon MUST be placed between the settings button and the avatar. The button MUST have `aria-label="Notifications"` and `title="Notifications"`. Clicking MUST produce no action. Hover state MUST match other pill controls.

### FR-13 — Icon Migration — All 46 Icons Replaced (Story: Platform user — consistent icons everywhere)

Every icon class in `design/styles/icons.css` MUST be replaced with a Lucide equivalent per the mapping defined in `.state/design-main-toolbar-and-icons/references/iconography-lucide.html`. This includes icons used in: sidebar, session cards, section headers, toolbar, empty states, upload zone, and toast notifications. No existing icon class name changes. No icon is broken, missing, or visually different in rendered size after migration.

### FR-14 — Icon ViewBox and Rendering Approach Unchanged (Story: Self-hosting operator — zero new runtime dependencies; Developer — icon scalability)

The `.icon` base class and all size classes (`.icon--xs` through `.icon--2xl`) MUST remain unchanged. Icons MUST continue to use CSS `mask-image` with data URIs. The internal viewBox of the SVG data changes from 20x20 to 24x24 (Lucide standard), but the rendered pixel sizes controlled by the CSS size classes DO NOT change.

### FR-15 — Zero New Runtime Dependencies (Story: Self-hosting operator — zero new runtime dependencies)

No `lucide-vue-next` package, no icon font, no external CDN request for icons. Lucide SVG paths MUST be embedded as data URIs directly in `icons.css`. The `npm run build` output MUST produce the same entry point structure as before.

### FR-16 — Developer Icon Documentation (Story: Developer — icon scalability)

A comment block at the top of `icons.css` MUST document the pattern for adding a new icon: find Lucide icon name → extract SVG path data → encode as URL-safe data URI → add CSS class. Adding a new icon MUST be achievable in under two minutes following this pattern.

### FR-17 — Mockup-First Vue Implementation (Story: Developer — faithful Vue conversion from mockup)

The Vue component MUST be built by copying the HTML/CSS from `draft-2b-lucide.html` verbatim first, then progressively enhancing with reactivity and composables. The implementation MUST NOT reimplement the design from memory or from prose description.

### FR-18 — Design Token Extraction (Story: Developer — design token extraction)

No raw `rgba()` color values MAY appear in the toolbar component's `<style>` block. All colors MUST reference `var(--*)` tokens. Toolbar-specific tokens (e.g., `--toolbar-glass-bg`, `--toolbar-separator`, `--toolbar-btn-hover-bg`, `--toolbar-btn-hover-border`) MUST be defined as scoped custom properties in the component or promoted to `layout.css` if reusable.

### FR-19 — Header Overflow Fix (Story: Developer — dropdown overflow fix)

The `.shell-header` `overflow` property MUST be changed from `overflow: clip` to `overflow: visible`. The `.spatial-shell__header` grid row MUST have `z-index: 50` applied so the dropdown renders above sidebar content. No other layout regions may be visually affected by this change.

### FR-20 — Keyboard Navigation (Story: Developer — keyboard accessibility)

- Tab order through pill controls: pipeline trigger → settings → bell → avatar
- Escape closes the dropdown and returns focus to the pipeline trigger
- All icon-only buttons have `aria-label` attributes
- Pipeline trigger has `aria-expanded` reflecting dropdown state
- Dropdown items are focusable and navigable with arrow keys

### FR-21 — Lucide License Attribution (Story: Legal / compliance — Lucide attribution)

A `THIRD-PARTY-LICENSES` file MUST exist at the repository root. It MUST contain: Lucide copyright notice, ISC license text, and Feather Icons MIT attribution (Lucide is a Feather fork). The project README MUST reference this file.

### FR-22 — Pipeline Data Source (Story: Self-hosting operator — pipeline transparency without exposure)

The toolbar MUST source pipeline data from the existing session list and SSE event infrastructure already consumed by sidebar components. No new backend API endpoints are required. The component MUST access only: session name, status, and queue position. No infrastructure fields (worker count, thread count, memory) may be read or rendered.

## Non-Functional Requirements

### NFR-01 — Icon Render Performance

All icons MUST render using CSS `mask-image` with inline data URIs — no network requests, no JavaScript execution, no font loading. Icon rendering cost is zero beyond initial CSS parse.

### NFR-02 — Toolbar Animation Performance

Collapse/expand transitions and the progress ring stroke animation MUST use CSS transitions and animations only (no JavaScript animation loops). Animations MUST not cause layout recalculation (use `transform` and `opacity` where possible).

### NFR-03 — Accessibility — ARIA

All interactive toolbar elements MUST have explicit `aria-label` attributes. The pipeline trigger MUST have `aria-expanded`. The dropdown MUST be reachable by keyboard. Icons used decoratively in text context MUST carry `aria-hidden="true"`.

### NFR-04 — Accessibility — Focus

Focus ring MUST be visible on all interactive elements using the design system's existing focus styles. Focus MUST return to the trigger button when the dropdown is closed by Escape.

### NFR-05 — License Compliance

Lucide icons embedded in `icons.css` fall under the ISC license (a permissive license functionally equivalent to MIT). Attribution in `THIRD-PARTY-LICENSES` is a hard legal requirement, not optional polish. The ELv2-licensed `icons.css` file may embed ISC-licensed SVG path data without license conflict.

### NFR-06 — Build Output Stability

`npm run build` MUST complete without errors. The build output MUST NOT introduce additional entry points, changed file hashes unrelated to the feature, or new chunks from icon dependencies. A network audit of the running application MUST show zero icon-related network requests.

### NFR-07 — No Visual Regressions

All existing icons MUST render at the same sizes and positions as before the migration. Icons MUST inherit color from their parent via `currentColor` exactly as before. Playwright visual regression tests comparing before-and-after screenshots of the session list and session detail pages MUST pass (or clearly show expected Lucide style improvements, not accidental breakage).

### NFR-08 — Design Fidelity

A Playwright screenshot of the running Vue toolbar component at 1440x900 viewport MUST match a screenshot of `draft-2b-lucide.html` at the same viewport with no differences in layout, color, spacing, or typography beyond anti-aliasing. Both the expanded state and the dropdown-open state MUST be verified.

## Technical Constraints

### TC-01 — Spec Authority

The authoritative source of truth for all visual details (spacing, colors, border radii, backdrop blur values, box shadows, animation timings) is `.state/design-main-toolbar-and-icons/references/draft-2b-lucide.html`. Prose descriptions in requirements and the vision document are context, not override. When in doubt, open the mockup and read the CSS.

### TC-02 — Vue 3 Composition API

All new Vue components MUST use `<script setup>` syntax and composables for state management. No Pinia store. No Options API.

### TC-03 — Existing SSE Infrastructure

The toolbar MUST reuse the existing SSE event bus (`EventBusAdapter` / `EmitterEventBusImpl`) and session list composables. No new server-side infrastructure is permitted.

### TC-04 — CSS Custom Property Fidelity

All colors, spacing, typography, radii, shadows, and animation timings MUST reference existing custom properties from `layout.css` where a matching token exists. Raw values from the mockup that have no existing token MUST be promoted to new scoped tokens (toolbar-prefix) rather than used inline.

### TC-05 — Mask-Image Rendering Preserved

The `.icon` base class, size classes, and data URI rendering mechanism MUST remain unchanged. The migration replaces only the SVG path data inside the data URIs. Stroke-width changes from 1.5 (custom) to 2 (Lucide default), and linecap/linejoin changes from butt/miter to round/round — this is the only intentional visual delta.

### TC-06 — Icon Sizes Unchanged

The rendered pixel sizes of icons MUST NOT change. The viewBox internal coordinate space changes (20x20 → 24x24), but the `.icon--xs` through `.icon--2xl` CSS size classes remain the same pixel values and are unchanged.

### TC-07 — Node 24 LTS Build Compatibility

No build tooling changes may break compatibility with Node 24 LTS. The development server and Vite build MUST continue to work as before.

## Acceptance Matrix

| Story | Requirement(s) | Verification Method |
|-------|---------------|---------------------|
| Platform user — pipeline awareness | FR-01, FR-02, FR-03 | Playwright screenshot (expanded + ring active at 1440x900); manual: upload session, observe ring increment |
| Platform user — pipeline inspection | FR-04, FR-05, FR-07 | Playwright screenshot (dropdown-open state); manual: open dropdown, verify sections and content |
| Platform user — pipeline inspection — recently completed | FR-06 | Manual: complete a session, verify "Recently completed" section appears with checkmark and relative timestamp |
| Platform user — pipeline awareness — SSE disconnection | FR-08 | Manual: kill backend SSE endpoint, observe ring enters warning state; restore, observe recovery |
| Platform user — toolbar collapse | FR-09 | Playwright screenshot (collapsed state); manual: click avatar, verify animation uses design tokens |
| Platform user — user presence | FR-10 | Playwright screenshot; visual review of gradient initial circle |
| Platform user — settings access | FR-11 | Playwright screenshot; code review confirms `aria-label`, `title`; visual confirms gear shape (not sun) |
| Platform user — bell icon placeholder | FR-12 | Playwright screenshot; code review confirms `aria-label`, `title`; manual: click produces no action |
| Platform user — consistent icons everywhere | FR-13, FR-14 | Playwright visual regression: session list page before/after; session detail page before/after; manual review of all icon-using components |
| Self-hosting operator — pipeline transparency without exposure | FR-05, FR-22 | Code review: confirm component only reads name/status/queue position; manual review of dropdown confirms no infra fields |
| Self-hosting operator — zero new runtime dependencies | FR-15 | Network audit in browser devtools (zero icon-related requests); `package.json` diff confirms no new runtime deps; `npm run build` output diff |
| Developer — icon scalability | FR-16 | Timed walkthrough: developer (or reviewer) adds a new icon following the documentation in under two minutes |
| Developer — faithful Vue conversion from mockup | FR-17, NFR-08 | Playwright screenshot comparison at 1440x900: running component vs `draft-2b-lucide.html` static page (both states) |
| Developer — design token extraction | FR-18 | Code review: search for raw `rgba()` in toolbar component `<style>` block; confirm zero matches |
| Developer — dropdown overflow fix | FR-19 | Playwright screenshot: dropdown fully visible below header; code review confirms `overflow: visible` and `z-index: 50` |
| Developer — keyboard accessibility | FR-20 | Manual: keyboard-only navigation through pill; Escape closes dropdown and returns focus |
| Legal / compliance — Lucide attribution | FR-21 | File existence check: `THIRD-PARTY-LICENSES` at repo root; content review for ISC + Feather MIT; README grep for reference |

## Dependencies

Before implementation starts, the following must exist or be confirmed:

1. **Lucide SVG data URIs** — The SVG path data for each of the 46 icon mappings must be extracted from the Lucide source (or from `references/iconography-lucide.html`) and encoded as URL-safe data URIs. This is a pre-implementation task for the engineer (or a separate tooling step).

2. **Icon mapping confirmed** — `.state/design-main-toolbar-and-icons/references/iconography-lucide.html` must confirm the Lucide icon name for each of the 46 existing custom icons. The Architect's ADR should reference this mapping.

3. **Design token inventory** — The raw `rgba()` values in `draft-2b-lucide.html` that do not map to existing `layout.css` tokens must be catalogued so the engineer can define the toolbar-scoped tokens before writing component CSS. Key values: `rgba(0, 212, 255, 0.04)` (pill background), `rgba(0, 212, 255, 0.15)` (pill border / separator), `rgba(28, 28, 50, 0.95)` (dropdown background), `rgba(0, 212, 255, 0.12)` (button hover background), `rgba(0, 212, 255, 0.3)` (button hover border).

4. **SSE composable interface confirmed** — The Architect must confirm which existing composable(s) the toolbar will use to read session status and pipeline state, to avoid duplication and ensure the toolbar does not create a parallel data pipeline.

5. **`overflow: clip` → `overflow: visible` risk assessed** — The existing `.shell-header` uses `overflow: clip` (not `overflow: hidden`) specifically to prevent a scroll context while clipping overflowing breadcrumb text. The Architect must confirm that changing this to `overflow: visible` does not break focus outline visibility or breadcrumb truncation behavior. Alternatively, if a different strategy (e.g., a wrapper element) is needed, that must be decided before implementation.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Icon visual regressions — Lucide stroke-width 2 + round terminals changes how icons read at small sizes | Medium | Medium | Run Playwright visual regression before/after; review at xs (12px) and sm (16px) sizes specifically |
| `overflow` change on `.shell-header` breaks breadcrumb truncation or focus outlines | Medium | Low | Architect confirms safe approach; test breadcrumb overflow at narrow viewport; confirm focus rings remain visible |
| Dropdown z-index conflict with sidebar sticky section headers (`z-index: 10`) or mobile overlay | Low | Medium | Verify `z-index: 50` on `.spatial-shell__header` is sufficient; test with sidebar open |
| SSE disconnection state is difficult to trigger in development | Low | Low | Write a test helper or manually kill the backend; the risk is in testing coverage, not implementation correctness |
| Raw `rgba()` token extraction accidentally misses a value, leaving inline color in production | Medium | Low | Code review step explicitly searches for `rgba(` in toolbar `<style>` block |
| Toolbar collapse animation causes layout shift that breaks breadcrumb or brand mark alignment | Low | Medium | Test collapse at multiple viewport widths; Playwright screenshot before and after collapse |
| Lucide icon for `list-filter` (the current `icon-filter`) looks different enough to confuse users who learned the old funnel shape | Low | Low | Visual review by Designer before merge; the Lucide `list-filter` variant is confirmed in `iconography-lucide.html` |
| `THIRD-PARTY-LICENSES` omission — license attribution not completed before merge | Low | High | Treat FR-21 as a merge blocker; reviewer checklist includes file existence check |

## Context

- **Branch:** `design-main-toolbar-and-icons`
- **Mockup spec:** `.state/design-main-toolbar-and-icons/references/draft-2b-lucide.html`
- **Icon mapping reference:** `.state/design-main-toolbar-and-icons/references/iconography-lucide.html`
- **Stories:** `.state/design-main-toolbar-and-icons/STORIES.md` (19 stories, sign-off 2026-03-16)
- **Vision:** `.state/design-main-toolbar-and-icons/VISION_STEP.md`
- **Current header:** `src/client/components/ShellHeader.vue` — `shell-header__right` div is empty; `overflow: clip` on `.shell-header`
- **Current icons:** `design/styles/icons.css` — 46 icons, 20x20 viewBox, stroke-width 1.5, butt linecap, miter linejoin; `icon-settings` renders as sun/starburst
- **SSE infrastructure:** `EventBusAdapter` / `EmitterEventBusImpl` already streams processing events consumed by sidebar components
- **Design system:** Midnight Neon palette — `--accent-primary: #00d4ff` (cyan), `--accent-secondary: #ff4d6a` (neon pink). Design tokens in `design/styles/layout.css`
- **License context:** Application = AGPL-3.0, design system (`design/styles/`) = ELv2. Lucide = ISC (permissive, compatible with both)

---
**Sign-off:** Pending
