# ADR: Erika Spatial Foundation -- Application Shell Architecture

## Status
Accepted

## Context

Erika's frontend is a page-based Vue 3 application with two routes (`/` -> LandingPage, `/session/:id` -> SessionDetailPage), no persistent navigation, no spatial architecture, and all CSS loaded through JS imports. The product vision requires a persistent multi-panel spatial shell where the session list sidebar never leaves, session selection updates the main content area without page transitions, and the layout is stable before JavaScript hydrates.

Six architectural decisions must be made before implementation can begin:

1. How does the spatial shell integrate with Vue Router?
2. Which CSS loads as a blocking stylesheet vs. stays in the Vite bundle?
3. Where does the grid shell CSS live?
4. What is the component tree under the spatial shell?
5. How do composables for layout, session list, and SSE compose?
6. How does the per-session SSE integration work?

Forces at play:
- The grid must define all six regions (`brand`, `header`, `sidebar`, `main`, `aside`, `bottom`) from day one -- adding regions later requires restructuring the template
- The shell must paint before JavaScript hydrates to prevent layout shift (CLS < 0.1)
- Vue 3 + Composition API, no Pinia -- composables and provide/inject only
- Backend is frozen -- all APIs exist, including per-session SSE at `/api/sessions/:id/events`
- One PR, one branch (`feat/client-design-bootstrap`)
- The frontend-designer reviews each existing component and produces a rebuild/adapt verdict before the engineer touches it

Input documents:
- `.state/feat/client-design-bootstrap/REQUIREMENTS.md` (13 acceptance criteria, 15-step dependency chain)
- `.state/feat/client-design-bootstrap/VISION_STEP.md` (spatial foundation, CSS Grid shell, dual-rhythm analysis)
- `.state/feat/client-design-bootstrap/STORIES.md` (11 user stories)
- `.state/feat/client-design-bootstrap/UX_RESEARCH.md` (competitor analysis, panel patterns)
- `.state/feat/client-design-bootstrap/UX_RESEARCH_BASELINE.md` (baseline grid research, Path C recommendation)

## Options Considered

### D1: Routing Model

#### Option A: Layout Route Wrapper (Selected)

Introduce a single parent route with a layout component (`SpatialShell.vue`) that contains the CSS Grid shell, sidebar, header, and brand mark. The two existing routes become children rendered via `<router-view>` into the `main` grid area.

Route table:
```
/                -> SpatialShell (layout) -> StartPage (main area)
/session/:id     -> SpatialShell (layout) -> SessionDetailView (main area)
```

The sidebar is part of the parent layout component, so it never unmounts on route change. Session selection calls `router.push('/session/' + id)`. Browser history (back/forward) works natively. Deep links are free.

- Pros: Standard Vue Router pattern for persistent shells; URL reflects state naturally; browser back/forward works; each main-area view is a self-contained component; well-established pattern engineers are familiar with
- Cons: Vue Router unmounts/remounts the child component on route change (minor -- mitigable with `<KeepAlive>` if needed later); navigation guards trigger on session change (acceptable cost)

#### Option B: Single Route with Selection State

Collapse to one route (`/`). Session selection is reactive state (`selectedSessionId` ref), not a route change. URL updates via `history.replaceState` for deep linking, but Vue Router is not involved in session switching.

- Pros: Zero component remounting; sidebar and main are purely reactive; feels most "spatial"
- Cons: Loses browser back/forward for session switching; manual URL sync is fragile and error-prone; deep link handling requires custom logic outside Vue Router; breaks the established Vue Router mental model

#### Option C: Nested Routes with Named Views

Use Vue Router named views (`<router-view name="sidebar">`, `<router-view name="main">`) to render sidebar and main as peer targets.

- Pros: Clean separation in theory
- Cons: Overengineered -- the sidebar content is identical on every route, so a named view buys nothing; adds complexity without benefit; harder for engineers to reason about

**Decision: Option A.** The layout route wrapper is the standard Vue pattern for persistent shells. Browser history works naturally. Deep links are free. The minor cost of child remounting on route change is acceptable and can be mitigated with `<KeepAlive>` later if profiling shows it matters.

---

### D2: CSS Loading Strategy

#### Option A: New shell.css Only as Blocking Link

Create a small `design/styles/shell.css` containing only the grid template and area assignments. Add it as a blocking `<link>` in `index.html`. Keep `layout.css` (tokens, reset) and all other CSS in the Vite bundle.

- Pros: Minimal blocking payload; Vite manages the bulk of CSS
- Cons: shell.css must reference tokens from layout.css which has not loaded yet -- either duplicate token values or accept that token-based sizing (e.g., `--sidebar-width`) is unavailable until Vite CSS loads; creates a fragile sync dependency between two files

#### Option B: Move layout.css to Blocking Link (Selected)

Move the entire `layout.css` to a blocking `<link>` in `index.html` before the script tag. Remove the `import '../../design/styles/layout.css'` from `main.ts`. Keep `components.css`, `page.css`, and `icons.css` in the Vite bundle.

Add `shell.css` as a second blocking `<link>` after `layout.css`. This gives the shell access to all design tokens at first paint.

- Pros: All tokens available at first paint; shell.css can reference `--sidebar-width`, `--header-height`, and all rhythm tokens without duplication; layout.css is ~12KB uncompressed which is acceptable as blocking CSS; the reset and base styles also apply immediately, preventing FOUC
- Cons: Slightly larger blocking payload than Option A; layout.css is now outside Vite's hashing (cache busting via query param or manual versioning)

#### Option C: Inline Critical CSS in HTML Head

Inline the grid template and essential tokens into a `<style>` block in `index.html`.

- Pros: Zero network requests for first paint; fastest possible FCP
- Cons: Cannot be cached independently; HTML file grows; harder to maintain; duplicates values from layout.css

**Decision: Option B.** Moving `layout.css` to a blocking link ensures all tokens are available at first paint. The shell.css file (loaded immediately after) can use token references for grid sizing. The combined blocking payload is small enough (~15KB uncompressed, ~3KB gzipped). Cache busting is handled by adding a version query parameter during the build step.

The loading order in `index.html` becomes:
```html
<link rel="stylesheet" href="/design/styles/layout.css">
<link rel="stylesheet" href="/design/styles/shell.css">
<script type="module" src="/src/client/main.ts"></script>
```

And `main.ts` removes the `layout.css` import, keeping only:
```ts
import '../../design/styles/components.css';
import '../../design/styles/page.css';
import '../../design/styles/icons.css';
```

---

### D3: Grid Shell Implementation

#### Option A: New shell.css File (Selected)

Create `design/styles/shell.css` as a dedicated file for the CSS Grid shell. It defines the `grid-template-areas`, column/row sizing, responsive breakpoint, and grid area assignments. It depends on tokens from `layout.css` (loaded first).

- Pros: Clean separation -- layout.css is tokens/reset, shell.css is structural layout; each file has a single responsibility; shell.css can be understood in isolation
- Cons: One more file to load

#### Option B: Add Grid to layout.css

Append the grid shell definitions to the existing layout.css.

- Pros: Single file; no additional network request
- Cons: layout.css already mixes tokens, reset, and utility classes; adding the application shell grid further overloads its responsibility; harder to reason about

**Decision: Option A.** `shell.css` is a new file in `design/styles/` that contains only the spatial grid architecture. It is loaded as a blocking stylesheet after `layout.css` in `index.html`.

Shell.css contents (structural):
- `.spatial-shell` -- the grid container with `grid-template-areas`, `grid-template-columns`, `grid-template-rows`
- Grid area assignments: `.spatial-shell__brand`, `.spatial-shell__header`, `.spatial-shell__sidebar`, `.spatial-shell__main`, `.spatial-shell__aside`, `.spatial-shell__bottom`
- `--sidebar-width` token (default 260px) added to `:root` in `layout.css`
- Responsive breakpoint: below 768px, sidebar collapses (grid changes to single-column)
- Transition rules for panel open/close (150-200ms ease-out on `grid-template-columns`)

Grid template:
```css
.spatial-shell {
  display: grid;
  grid-template-areas:
    "brand   header  header"
    "sidebar main    aside"
    "sidebar bottom  aside";
  grid-template-columns: var(--sidebar-width) 1fr 0fr;
  grid-template-rows: var(--header-height) 1fr 0fr;
  min-height: 100vh;
  /* Note: 3 columns, not 4. The header spans columns 2-3.
     aside spans full height (rows 2-3) for a right-panel use case —
     the aside track is shared by both content rows, allowing a
     right panel to occupy the full content height when activated.
     When aside activates, it gets its own width. */
}
```

The `aside` column is `0fr` (collapsed). The `bottom` row is `0fr` (collapsed). Both grid areas exist in the template but render nothing this cycle.

---

### D4: Component Architecture

#### Option A: Shell as Vue Layout Component (Selected)

The spatial shell is a Vue component (`SpatialShell.vue`) that acts as a route layout. It renders the grid container and all persistent chrome (sidebar, header, brand). The `<router-view>` slot fills the `main` grid area.

Component tree:
```
App.vue
  SpatialShell.vue (grid container -- route layout)
    BrandMark.vue (grid-area: brand)
    ShellHeader.vue (grid-area: header)
      Breadcrumb (reactive to current route)
      MobileHamburger (visible < 768px)
    SidebarPanel.vue (grid-area: sidebar)
      SearchInput
      FilterPills
      SessionCardList
        SessionCard.vue (per session)
      NewSessionButton
    <router-view> (grid-area: main)
      StartPage.vue (route: /)
      SessionDetailView.vue (route: /session/:id)
    ToastContainer.vue (fixed position, outside grid)
    DropOverlay.vue (fixed position, viewport-wide drag target)
```

Existing component mapping:
- `AppHeader.vue` -> replaced by `BrandMark.vue` + `ShellHeader.vue`
- `LandingPage.vue` -> replaced by `StartPage.vue` (start page / empty state in main area)
- `SessionDetailPage.vue` -> refactored into `SessionDetailView.vue` (breadcrumb moves to ShellHeader; container wrapper removed; content fills main grid area)
- `SessionList.vue` -> replaced by `SidebarPanel.vue` + `SessionCard.vue` (page grid layout incompatible with sidebar)
- `UploadZone.vue` -> replaced by `DropOverlay.vue` (system-wide drag target) + `NewSessionButton` (sidebar) + start page drop zone
- `ToastContainer.vue` -> adapt or rebuild per designer verdict (add ARIA live regions)
- `SessionContent.vue` -> preserved (terminal rendering core)
- `TerminalSnapshot.vue` -> preserved (WASM rendering)
- `SectionHeader.vue` -> adapt per designer verdict

New components:
- `SpatialShell.vue` -- grid container, layout route wrapper
- `BrandMark.vue` -- "Erika" brand in sidebar brand area
- `ShellHeader.vue` -- breadcrumb, global actions, mobile toggle
- `SidebarPanel.vue` -- sidebar container with search, filters, list
- `SessionCard.vue` -- individual session card for sidebar list
- `StartPage.vue` -- cognitive empty state / start page with drop zone and animation
- `DropOverlay.vue` -- viewport-wide drag overlay
- `SkeletonSidebar.vue` -- sidebar loading skeleton (3-5 shimmer cards)
- `SkeletonMain.vue` -- main content loading skeleton
- `MobileSidebarOverlay.vue` -- overlay wrapper for mobile sidebar (backdrop + focus trap)

**Decision: Option A.** The spatial shell is a Vue layout component rendered as a route parent. All persistent chrome lives in the shell. Only the `main` area content swaps on route change.

---

### D5: State Management

Three composables compose to manage application state. No Pinia. Shared state is distributed through provide/inject where needed.

**`useLayout()` (new)**
- State: `isSidebarOpen` (boolean), `sidebarWidth` (number, px)
- Persistence: reads/writes `localStorage` key `erika:layout`
- Methods: `toggleSidebar()`, `closeSidebar()`, `openSidebar()`
- Hydration safety: suppresses CSS transitions during the first frame via a `data-hydrating` attribute on the shell element, removed after `requestAnimationFrame`
- Provided at `SpatialShell.vue` level via `provide('layout', ...)`

**`useSessionList()` (existing, enhanced)**
- Existing: `sessions`, `loading`, `error`, `fetchSessions`, `deleteSession`
- New: `searchQuery` (string ref), `statusFilter` (ref: 'all' | 'processing' | 'ready' | 'failed'), `filteredSessions` (computed, applies search + filter)
- Session selection: the sidebar calls `router.push('/session/' + id)` on card click. Selection state is derived from the current route (`route.params.id`), not a separate ref. This keeps the router as the single source of truth for "which session is selected."
- Provided at `SpatialShell.vue` level via `provide('sessionList', ...)`

**`useSSE(sessionId)` (new)**
- Takes a reactive `Ref<string>` session ID
- Opens an `EventSource` to `/api/sessions/:id/events` when the session's `detection_status` is active (not `completed`, `failed`, or `interrupted`)
- Returns: `status` (reactive ref), `isConnected` (boolean ref)
- Closes the connection on terminal event, on session ID change, or on composable cleanup (`onUnmounted`)
- The composable is used per-card in the sidebar for sessions in active states

**`useToast()` (existing, enhanced)**
- Existing: `toasts`, `addToast`, `removeToast`
- Enhancement: longer auto-dismiss for errors (8s vs 4s for success/info), ARIA role assignment per toast type
- Provided at `SpatialShell.vue` level via `provide('toast', ...)`

**`useUpload()` (existing, enhanced)**
- Existing upload logic preserved
- Enhancement: returns the new session ID from the upload response so the sidebar can insert an optimistic entry immediately
- Enhancement: viewport-wide drag handling (registered at `SpatialShell.vue` level, not scoped to a zone component)

Composition pattern: `SpatialShell.vue` creates all shared composables and provides them. Child components inject what they need. This avoids prop drilling through the component tree while keeping state ownership clear.

---

### D6: SSE Integration Model

The backend exposes per-session SSE at `/api/sessions/:id/events`. There is no global status feed. The integration model has three layers:

**Layer 1: Initial state from REST**
`GET /api/sessions` returns `detection_status` for each session. This is the initial state displayed on session cards when the sidebar first renders. No SSE connection is needed for sessions in terminal states (`completed`, `failed`, `interrupted`).

**Layer 2: Per-session SSE for active sessions**
For sessions with active `detection_status` values (`pending`, `processing`, `queued`, `validating`, `detecting`, `replaying`, `deduplicating`, `storing`), the `useSSE()` composable opens an `EventSource`. The composable:
- Opens on mount (or when status becomes active)
- Listens for status update events and updates the session's `detection_status` in the session list
- Closes on terminal event (`completed`, `failed`, `interrupted`)
- Closes on composable unmount (component destroyed)
- Handles reconnection: `EventSource` auto-reconnects on network errors; the composable handles the `error` event to update UI state

**Layer 3: Connection budget**
Browsers limit concurrent connections per origin (~6 in most browsers). With many sessions processing simultaneously, unbounded SSE connections would exhaust this budget and block API requests. Mitigation:
- Limit to a maximum of 3 concurrent SSE connections
- Priority: (1) the currently selected session, (2) the most recently uploaded sessions, (3) sessions visible in the sidebar viewport
- Sessions beyond the budget fall back to polling `GET /api/sessions` on a 10-second interval to catch status changes
- When an SSE slot frees up (session completes), the next highest-priority active session takes it

This is a pragmatic constraint. In practice, users rarely have more than 2-3 sessions processing simultaneously, so the budget will rarely be exhausted.

**Event-to-UI mapping:**
- `uploading` -> directional arrow icon animation on card
- `pending`, `queued` -> waiting state (subtle pulse)
- `processing`, `validating`, `detecting`, `replaying`, `deduplicating`, `storing` -> active processing (cyan pulsing dot)
- `completed` -> steady green dot with brief glow burst on transition
- `failed`, `interrupted` -> error-colored static dot, no animation
- Each transition fires a toast notification and updates an ARIA live region

## Decision

All six decisions are accepted as described above:

1. **Routing: Layout Route Wrapper.** `SpatialShell.vue` is a route parent. Child routes render into the `main` grid area. Browser history works natively.
2. **CSS Loading: layout.css + shell.css as blocking links.** Both loaded in `index.html` before the script tag. Tokens and grid structure available at first paint.
3. **Grid Shell: New shell.css file.** Six named areas, `aside` at `0fr`, `bottom` at `0fr`. Pure CSS, no JS dependency.
4. **Component Architecture: Shell as layout component.** Persistent chrome in the shell. Only main area content swaps on route change.
5. **State Management: Composables with provide/inject.** `useLayout()`, enhanced `useSessionList()`, new `useSSE()`. No Pinia. Router is the source of truth for selection.
6. **SSE Integration: Per-session with connection budget.** Initial status from REST, per-session SSE for active sessions, max 3 concurrent connections.

## Consequences

### What becomes easier
- Adding future panels (`aside`, `bottom`) requires only setting the grid track size and mounting a component -- no layout restructuring
- Session switching is instant -- no page transitions, sidebar persists
- Deep linking works for free via Vue Router
- SSE status updates arrive without polling for the common case (< 3 concurrent processing sessions)
- Skeleton loaders prevent layout shift because the grid structure exists at first paint

### What becomes harder
- Two CSS loading paths (blocking links + Vite bundle) require awareness during development
- The connection budget logic adds complexity to the SSE composable
- The layout route wrapper means every new "page" must be a child route, not a standalone page
- Cache busting for the blocking CSS files needs a build-time solution (Vite plugin or manual query param)

### Follow-ups to scope for later
- `<KeepAlive>` on the main area `<router-view>` if session detail remounting is measurably slow
- Drag-handle resize for the sidebar (deferred unless designer includes it naturally)
- Keyboard shortcuts for panel toggles (`Cmd+B` for sidebar)
- Virtual scrolling for the session list (when session counts grow large)
- Service worker for offline shell caching

## Decision History

Decisions made with user during design:

1. Layout Route Wrapper selected over single-route-with-state because browser back/forward and deep linking are free, and the pattern is standard Vue.
2. layout.css moved to blocking link (not just shell.css) because tokens must be available at first paint for the shell to reference `--sidebar-width`, `--header-height`, etc.
3. shell.css is a separate file from layout.css to maintain single responsibility -- layout.css is tokens/reset, shell.css is spatial structure.
4. Selection state derived from the router (`route.params.id`) rather than a separate ref, keeping the router as the single source of truth.
5. SSE connection budget of 3 concurrent connections to stay within browser limits, with fallback polling for overflow.
6. All six decisions approved by user before ADR finalization.
