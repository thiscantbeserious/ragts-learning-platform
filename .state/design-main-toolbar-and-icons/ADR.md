# ADR: Main Toolbar and Lucide Icon Migration

## Status
Proposed

## Context

Erika's application header has an empty right section (`shell-header__right`) and a hand-drawn icon system that cannot scale. The settings icon renders as a sun/starburst instead of a gear. There is no global pipeline visibility, no user presence, and no settings entry point. Together these gaps block every near-term roadmap item (auth, workspaces, notifications, pipeline transparency).

The approved design (Draft 2b) introduces a glass pill toolbar with pipeline status ring, settings/bell buttons, and a user avatar. Simultaneously, all 46 custom SVG icons must be replaced with Lucide equivalents to establish a sustainable visual vocabulary.

### Forces

- **Mockup is the spec.** `draft-2b-lucide.html` contains exact CSS values. The engineer must copy them, not reinterpret them.
- **Zero new runtime dependencies** (FR-15). Icons must remain CSS mask-image data URIs. No `lucide-vue-next`, no icon font, no CDN.
- **Existing SSE is session-scoped.** The current `useSSE` composable opens a connection per session ID (`/api/sessions/:id/events`). There is no global SSE endpoint. The toolbar needs aggregate pipeline counts derived from the session list, not a new backend stream.
- **Header overflow is `clip`.** The current `.shell-header` uses `overflow: clip` to truncate breadcrumb text without creating a scroll context. The pipeline dropdown must extend below the header, requiring this to change.
- **Spatial shell grid is fixed.** The toolbar must fit within `shell-header__right` without grid changes.
- **Lucide license (ISC/MIT) requires attribution** in a `THIRD-PARTY-LICENSES` file. This is a merge blocker.
- **States not in mockup** (dormant, collapsed, SSE disconnect) need designer approval before implementation.

## Options Considered

### Decision 1: Icon Delivery Method

#### Option A: Keep mask-image data URIs (Lucide SVG content)
Replace the SVG path data inside existing `mask-image: url("data:image/svg+xml,...")` declarations in `icons.css`. Change viewBox from `0 0 20 20` to `0 0 24 24`, update stroke attributes (width 2, round linecap/linejoin). The CSS rendering mechanism (`.icon` base class, size classes, `currentColor` inheritance) is unchanged. A one-time Node.js script extracts and encodes the 46 Lucide SVGs.

- **Pros:** Zero runtime deps, zero bundle size change, zero behavior change, maintains air-gap deployability, familiar pattern for existing developers
- **Cons:** Data URIs are verbose in CSS, adding a new icon requires copying/encoding a data URI (but documented pattern makes this a 2-minute task)

#### Option B: Inline SVG Vue component (`lucide-vue-next`)
Import Lucide as a Vue component library. Each icon renders as inline `<svg>` in the DOM.

- **Pros:** Tree-shakeable, dynamic stroke/size props, first-class Vue integration
- **Cons:** Violates FR-15 (new runtime dependency), changes rendering mechanism (inline SVG vs mask-image), breaks existing `.icon` CSS pattern, requires touching every component that uses icons, increases bundle size, breaks air-gap deployability

#### Option C: Manual inline SVG (no package)
Copy Lucide SVG markup into Vue components manually without a package.

- **Pros:** No dependency, full control over markup
- **Cons:** Massive effort (46 components), breaks existing CSS icon pattern, no `currentColor` inheritance via mask-image, changes API surface for every icon consumer

**Decision: Option A.** This is the only option that satisfies FR-14 (preserve rendering approach) and FR-15 (zero new deps). The viewBox change from 20x20 to 24x24 is invisible to consumers since `mask-size: contain` scales to the CSS width/height. A Node.js extraction script makes the conversion repeatable if Lucide versions are ever updated.

### Decision 2: Toolbar Component Architecture

#### Option A: Single monolithic `ToolbarPill.vue`
One component contains all toolbar HTML, state, and styles. The mockup HTML is pasted in and incrementally enhanced.

- **Pros:** Fastest to implement, direct mockup-to-component mapping, FR-17 compliance is trivial
- **Cons:** Large file, hard to test individual behaviors (dropdown, collapse, ring), hard to reuse sub-elements

#### Option B: Decomposed component tree
`toolbar/ToolbarPill.vue` (shell) > `toolbar/PipelineRingTrigger.vue` + `toolbar/PipelineDropdown.vue` + `toolbar/ToolbarButton.vue` + `toolbar/ToolbarAvatar.vue`. State managed by a `usePipelineStatus` composable.

- **Pros:** Each component is independently testable, dropdown can be unit-tested without full toolbar, composable is reusable, reviewable in stages
- **Cons:** More files, slightly more wiring, need to ensure mockup CSS is faithfully split across components

#### Option C: Slot-based shell with render props
`ToolbarPill.vue` provides layout slots; content components slot in.

- **Pros:** Maximum flexibility for future toolbar content
- **Cons:** Over-engineered for current needs, makes mockup-first implementation awkward

**Decision: Option B.** The toolbar has four distinct behavioral zones (pipeline status with dropdown, settings button, bell button, avatar with collapse trigger). Each zone has different state, events, and test surface. Decomposition enables per-stage implementation and per-stage review. FR-17 (mockup-first) is achieved by copying the full mockup HTML into the first component, then extracting sub-components in subsequent stages.

### Decision 3: Pipeline Data Flow

#### Option A: New global SSE endpoint
Add a server-side `/api/pipeline/status` SSE stream that broadcasts aggregate pipeline state (processing count, queued count, session names/statuses, completion events).

- **Pros:** Single connection for global counts, server-authoritative, truly real-time (no polling or session list refresh dependency), clean separation of concerns, enables future pipeline features (progress percentage, ETA)
- **Cons:** Requires backend work (expands scope to full-stack), adds a new endpoint

#### Option B: Derive from existing session list
The `useSessionList` composable already holds all sessions. Filter by `detection_status` to compute processing/queued/recently-completed counts. The session list already refreshes via `fetchSessions()` when SSE terminal events fire in `SessionCard`. A new `usePipelineStatus` composable wraps this derivation.

- **Pros:** Reuses existing infrastructure (FR-22), no backend changes, session list is already reactive and SSE-updated, composable is thin (computed properties over injected session list)
- **Cons:** Pipeline counts update when session list refreshes (slightly less real-time than a dedicated stream), but this is the same latency the sidebar already has

#### Option C: Open individual SSE connections from toolbar
The toolbar opens its own per-session SSE connections for processing sessions.

- **Pros:** Real-time per-session status in the toolbar
- **Cons:** Doubles SSE connections (sidebar cards already open them), hits the MAX_CONNECTIONS budget (3), complex lifecycle management

**Decision: Option A (user override of FR-22).** A new `/api/pipeline/status` SSE endpoint broadcasts aggregate pipeline state. The toolbar connects to this single stream for real-time counts and session status. A `usePipelineStatus` composable on the client manages the SSE connection and exposes reactive state: `processingCount`, `queuedCount`, `totalActive`, `processingSessions`, `queuedSessions`, `recentlyCompleted`, `sseConnected`. This expands the branch scope from frontend-only to full-stack. The existing per-session SSE endpoints remain unchanged. The global endpoint uses the existing `EventBusAdapter` to listen for pipeline events and fans them out to connected clients.

### Decision 4: Collapse Mechanism

#### Option A: CSS-only with `:has()` or checkbox hack
Pure CSS collapse using hidden checkbox or `:has()` pseudo-class.

- **Pros:** No JavaScript state, CSS transitions handle animation
- **Cons:** Cannot persist across navigation (no state), `:has()` is relatively new, checkbox hack is fragile for accessibility

#### Option B: Vue reactive state + CSS transition
A `ref<boolean>` controls the collapsed state. CSS `max-width` or `width` transition handles the animation. The ref lives in the composable or component.

- **Pros:** Clean, testable, state can persist in composable (across navigation but not page reload per FR-09), ARIA attributes trivially bound to reactive state
- **Cons:** Requires JavaScript (acceptable for a Vue app)

#### Option C: Vue state + Web Animation API
JavaScript-driven animation via `element.animate()`.

- **Pros:** Fine-grained control over keyframes
- **Cons:** Over-engineered, NFR-02 says CSS-only animations

**Decision: Option B.** The collapsed state is a `ref<boolean>` in the `ToolbarPill` component. CSS handles the transition (animating `width` with `overflow: hidden` on the pill container). The ref persists across navigation naturally since `ToolbarPill` is rendered inside `ShellHeader`, which is rendered inside `SpatialShell` (the layout route parent that survives navigation). No explicit persistence mechanism is needed. Per FR-09, the collapsed state does NOT persist across page reloads, which this approach satisfies since refs reset on mount.

### Decision 5: Header Overflow Strategy

#### Option A: Change `.shell-header` overflow to `visible`
Set `overflow: visible` on the shell header. The dropdown renders below the header boundary.

- **Pros:** Simple, one-line change
- **Cons:** Breadcrumb text currently truncates via the `overflow: clip` chain (`.shell-header` clip > `.shell-header__breadcrumb` hidden > `__breadcrumb-current` text-overflow). Changing to `visible` might break breadcrumb ellipsis if `min-width: 0` and inner `overflow: hidden` on the breadcrumb nav are insufficient.

#### Option B: Change to `visible` + verify breadcrumb chain
Same as A, but with explicit verification that the breadcrumb truncation chain works independently. The breadcrumb already has `overflow: hidden` on `.shell-header__breadcrumb` and `text-overflow: ellipsis` on `__breadcrumb-current`. The outer `overflow: clip` on `.shell-header` is a belt-and-suspenders safeguard, not the primary truncation mechanism. Removing it should be safe because `min-width: 0` on `__left` + `overflow: hidden` on the breadcrumb nav already constrain the text.

- **Pros:** Simple change, dropdown works, breadcrumb chain is independently sound
- **Cons:** Needs visual verification at narrow viewport widths with long filenames

#### Option C: Wrapper element for dropdown overflow context
Keep `overflow: clip` on the header. Wrap the toolbar in an absolutely-positioned container that breaks out of the overflow context.

- **Pros:** Header overflow unchanged, dropdown still renders
- **Cons:** Complex positioning, z-index stacking, harder to align the pill within the header flow

**Decision: Option B.** The mockup already uses `overflow: visible` on `.spatial-shell__header` and `overflow: visible` (implicitly, via no overflow set) on `.shell-header`. The breadcrumb truncation chain is self-contained: `flex: 1` + `min-width: 0` on `__left` > `overflow: hidden` on the breadcrumb nav > `text-overflow: ellipsis` on the current item. The change also requires `z-index: 50` on `.spatial-shell__header` (as in the mockup) to ensure the dropdown renders above main content. Breadcrumb truncation must be visually verified with a long filename at 1024px viewport width as part of the acceptance criteria.

### Decision 6: Lucide SVG Extraction Tooling

#### Option A: Manual copy-paste from Lucide website
Visit lucide.dev, copy each SVG, manually URL-encode and format as data URI.

- **Pros:** No tooling
- **Cons:** Error-prone, 46 icons is tedious, not repeatable, hard to verify correctness

#### Option B: One-time Node.js extraction script
A script that reads Lucide SVG files (fetched from npm or GitHub), applies the Erika mapping from `iconography-lucide.html`, URL-encodes the paths, and generates the CSS declarations. Output: a complete replacement `icons.css` section.

- **Pros:** Repeatable, verifiable, consistent encoding, can be re-run for Lucide version updates
- **Cons:** Script needs to be written (one-time cost)

#### Option C: Build-time Vite plugin
A Vite plugin that resolves Lucide icons at build time and injects them into the CSS.

- **Pros:** Always up-to-date with installed Lucide version
- **Cons:** Adds build complexity, Lucide becomes a build dependency (against the spirit of FR-15), over-engineered for a static set of 46 icons

**Decision: Option B.** A Node.js script in `.agents/scripts/` (alongside the existing `color-science.mjs`). The script fetches Lucide SVGs (from the npm package or GitHub raw), applies the 46-icon mapping from the reference file, normalizes stroke attributes, URL-encodes, and outputs CSS class declarations. This is run once during implementation and can be re-run if the icon set grows. The script itself is committed to the repo but is a dev-only tool, not a runtime dependency.

## Consequences

### What becomes easier
- Adding new icons: look up Lucide name, run the script or copy the pattern, add one CSS class
- Pipeline visibility: users see global status without scanning the sidebar
- Future features (auth, workspaces, notifications): toolbar provides mount points for all of them
- Testing: decomposed components have isolated test surface
- Design fidelity: mockup-first approach eliminates interpretation drift

### What becomes harder
- `icons.css` is larger (24x24 viewBox data URIs are more verbose than 20x20)
- The header overflow change requires visual verification at multiple viewport widths
- The collapse animation needs designer approval for the collapsed visual state
- The new SSE endpoint requires backend implementation and testing
- Branch scope expands from frontend-only to full-stack

### Follow-ups to scope for later
- Global SSE endpoint for truly real-time pipeline counts (if session list refresh latency proves insufficient)
- Clickable session names in the pipeline dropdown (navigation shortcut, out of scope)
- Mobile toolbar adaptation (responsive behavior deferred)
- Settings page destination (toolbar provides the entry point only)
- Notification system infrastructure (bell is a placeholder)

## Decision History

1. **Icon delivery: mask-image data URIs preserved.** Lucide SVGs replace the path data but the CSS rendering mechanism is unchanged. This satisfies FR-14 and FR-15 with zero migration risk.
2. **Toolbar: decomposed component tree.** `ToolbarPill` > `PipelineRingTrigger` + `PipelineDropdown` + `ToolbarButton` + `ToolbarAvatar`. Enables per-stage implementation and testing.
3. **Pipeline data: new global SSE endpoint (user override of FR-22).** A `/api/pipeline/status` SSE stream provides server-authoritative, real-time pipeline state. Expands scope to full-stack.
4. **Collapse: Vue reactive state + CSS transition.** `ref<boolean>` in ToolbarPill, survives navigation naturally via SpatialShell lifecycle, resets on page reload per FR-09.
5. **Header overflow: change to `visible`.** The breadcrumb truncation chain is self-contained. `z-index: 50` on the header ensures dropdown stacking. Visual verification required.
6. **Lucide extraction: one-time Node.js script.** Repeatable, committed to repo, generates CSS declarations from Lucide source SVGs.
