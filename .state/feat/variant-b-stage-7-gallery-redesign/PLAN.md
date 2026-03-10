# PLAN: Gallery Page Redesign (Stage 7)

**Branch:** `feat/client-gallery-redesign`
**ADR:** `.state/feat/variant-b-stage-7-gallery-redesign/ADR.md`
**Methodology:** TDD RED-GREEN-REFACTOR for every stage

---

## Stage 1: Shared Utilities

**Description:** Create a consolidated formatting utility file with relative time formatting, file size formatting, and pipeline stage label mapping. This stage has no visual impact but provides the foundation for subsequent stages.

**Owner:** Frontend Engineer
**Depends on:** None

**Files:**
- Create `src/client/utils/format.ts` -- `formatRelativeTime(iso)`, `formatSize(bytes)`, `formatPipelineStage(status)`
- Create `src/client/utils/format.test.ts` -- unit tests for all three formatters

**TDD Cycle:**
1. **RED:** Write `format.test.ts` with failing tests for all three functions. Test edge cases: just now (<60s), minutes, hours, yesterday, days, short date; B/KB/MB thresholds; all 11 DetectionStatus values. Tests import from `format.ts` which does not exist yet -- tests fail.
2. **GREEN:** Create `format.ts` with minimum implementation to make all tests pass.
3. **REFACTOR:** Clean up, ensure consistent return types, extract shared constants if needed.

**Acceptance criteria:**
- [ ] `formatRelativeTime` handles: just now, minutes ago, hours ago, yesterday, days ago, short date
- [ ] `formatSize` handles: B, KB, MB thresholds
- [ ] `formatPipelineStage` maps all `DetectionStatus` values to human-readable labels:
  - `'pending'` -> `'Waiting to start...'`
  - `'queued'` -> `'Queued for processing...'`
  - `'processing'` -> `'Processing...'`
  - `'validating'` -> `'Validating format...'`
  - `'detecting'` -> `'Detecting sections...'`
  - `'replaying'` -> `'Replaying terminal...'`
  - `'deduplicating'` -> `'Deduplicating output...'`
  - `'storing'` -> `'Storing results...'`
  - `'completed'` -> `'Ready'`
  - `'failed'` -> `'Failed'`
  - `'interrupted'` -> `'Interrupted'`
- [ ] All unit tests pass

**Commit:** `feat(client): add consolidated formatting utilities for time, size, and pipeline stage`

---

## Stage 2: Search and Filter Composable

**Description:** Create the `useSessionFilter` composable that derives a filtered session list from search text and status filter selection. Pure derivation logic, no API calls.

**Owner:** Frontend Engineer
**Depends on:** None (uses Session type only)

**Files:**
- Create `src/client/composables/useSessionFilter.ts`
- Create `src/client/composables/useSessionFilter.test.ts`

**TDD Cycle:**
1. **RED:** Write `useSessionFilter.test.ts` with failing tests. Test: input typed as `Readonly<Ref<Session[]>>`, search by filename (case-insensitive), filter by status groups (processing/ready/failed), combined search+filter, empty results. Tests import from `useSessionFilter.ts` which does not exist yet -- tests fail.
2. **GREEN:** Create `useSessionFilter.ts` with minimum implementation to pass all tests.
3. **REFACTOR:** Extract status group constants, clean up computed chain.

**Acceptance criteria:**
- [ ] Input parameter is typed `Readonly<Ref<Session[]>>` (not a raw array)
- [ ] `searchQuery` ref filters sessions by case-insensitive substring match on `filename`
- [ ] `activeFilter` ref with values `'all' | 'processing' | 'ready' | 'failed'` narrows by detection status
- [ ] Processing filter group includes: pending, queued, processing, validating, detecting, replaying, deduplicating, storing
- [ ] Ready filter group includes: completed
- [ ] Failed filter group includes: failed, interrupted
- [ ] Combined search + filter works correctly
- [ ] `filteredSessions` is a computed that updates reactively
- [ ] All unit tests pass

**Commit:** `feat(client): add useSessionFilter composable for search and status filtering`

---

## Stage 3: SSE Composable with Connection State

**Description:** Create the `useSessionSSE` composable that auto-subscribes to SSE events for processing sessions, updates session state in-place, and exposes per-session connection health. Uses named event listeners (`addEventListener`) per pipeline event type -- NOT `onmessage`.

**Owner:** Frontend Engineer
**Depends on:** None (uses Session type and PipelineEvent type)

**Files:**
- Create `src/client/composables/useSessionSSE.ts`
- Create `src/client/composables/useSessionSSE.test.ts`

**TDD Cycle:**
1. **RED:** Write `useSessionSSE.test.ts` with failing tests using a mock EventSource. Test: opens EventSource per processing session, registers `addEventListener` per event type (NOT `onmessage`), maps events to session patches, handles `session.retrying`, tracks connection states via shallowRef, cleans up on terminal events and unmount. Tests fail because composable does not exist.
2. **GREEN:** Create `useSessionSSE.ts` with minimum implementation to pass tests.
3. **REFACTOR:** Extract event mapping logic, clean up lifecycle management.

**Acceptance criteria:**
- [ ] Opens an `EventSource` for each session whose `detection_status` is not `completed` or `failed`
- [ ] Registers `addEventListener` for each event type in `ALL_PIPELINE_EVENT_TYPES` -- does NOT use `onmessage`
- [ ] Parses incoming `PipelineEvent` messages and calls an `updateSession(id, patch)` callback
- [ ] Maps `session.detected` -> `{ detected_sections_count: event.sectionCount, detection_status: 'detecting' }` explicitly
- [ ] Maps `session.ready` -> `{ detection_status: 'completed' }` and closes the EventSource
- [ ] Maps `session.failed` -> `{ detection_status: 'failed' }` and closes the EventSource
- [ ] Maps `session.retrying` -> `{ detection_status: 'processing' }`
- [ ] Maps other intermediate events to their corresponding `detection_status` value
- [ ] Exposes `connectionStates` as `Readonly<ShallowRef<Map<string, SseConnectionState>>>`
- [ ] Uses `shallowRef` with replace-on-mutation pattern for Vue reactivity (creates new Map on each state change)
- [ ] Sets state to `'connecting'` on EventSource creation
- [ ] Sets state to `'connected'` on `onopen` event
- [ ] Sets state to `'connecting'` on `onerror` when `readyState === CONNECTING` (browser auto-reconnecting)
- [ ] Sets state to `'disconnected'` on `onerror` when `readyState === CLOSED`
- [ ] Removes connection state entry when EventSource is closed (terminal event or cleanup)
- [ ] Closes all EventSource connections on component unmount (`onUnmounted`)
- [ ] Watches sessions list reactively: new processing sessions get subscribed, removed sessions get unsubscribed
- [ ] All unit tests pass (mock `addEventListener` pattern, not `onmessage`)

**Commit:** `feat(client): add useSessionSSE composable with named event listeners and connection state`

---

## Stage 4: Extend useSessionList

**Description:** Extend the existing `useSessionList` composable with `updateSession(id, patch)` for in-place updates from SSE, and adjust the return signature.

**Owner:** Frontend Engineer
**Depends on:** None

**Files:**
- Modify `src/client/composables/useSessionList.ts`
- Modify `src/client/composables/useSessionList.test.ts` (if exists, or create)

**TDD Cycle:**
1. **RED:** Add failing tests for `updateSession(id, patch)`: merges patch into existing session, re-fetches single session via `GET /api/sessions/${id}` on `detection_status: 'completed'` (NOT full list re-fetch), no-op for unknown IDs. Verify existing tests still pass.
2. **GREEN:** Add `updateSession` to the composable with minimum implementation.
3. **REFACTOR:** Clean up, ensure consistent error handling.

**Acceptance criteria:**
- [ ] `updateSession(id: string, patch: Partial<Session>)` updates a session in the `sessions` ref in-place by merging the patch
- [ ] If `updateSession` is called with `detection_status: 'completed'`, it re-fetches that single session via `GET /api/sessions/${id}` (confirmed at `src/server/index.ts` line 137) to get final counts (marker_count, detected_sections_count) -- does NOT call `GET /api/sessions` (full list)
- [ ] Existing `fetchSessions` and `deleteSession` behavior is unchanged
- [ ] `onMounted(fetchSessions)` still works
- [ ] No existing tests break

**Commit:** `feat(client): extend useSessionList with in-place session updates`

---

## Stage 5: Presentational Components

**Description:** Create the four new presentational components for the populated gallery state: `GalleryCard`, `SkeletonCard`, `SessionToolbar`, and `SessionGrid`. These are pure render components with props and emits, no business logic. The compact upload strip is inlined in LandingPage (Stage 6), not a separate component.

**Owner:** Frontend Engineer
**Depends on:** Stage 1 (formatting utilities)

**Files:**
- Create `src/client/components/GalleryCard.vue`
- Create `src/client/components/GalleryCard.test.ts`
- Create `src/client/components/SkeletonCard.vue`
- Create `src/client/components/SkeletonCard.test.ts`
- Create `src/client/components/SessionToolbar.vue`
- Create `src/client/components/SessionToolbar.test.ts`
- Create `src/client/components/SessionGrid.vue`
- Create `src/client/components/SessionGrid.test.ts`

**TDD Cycle:**
1. **RED:** Write component test files first. For each component, write render tests using `@vue/test-utils`:
   - `GalleryCard.test.ts`: renders filename, meta items, relative time, size for ready session; renders badge+spinner+preview for processing session; renders error badge+preview for failed session; connection dot only in degraded states; no agent badges.
   - `SkeletonCard.test.ts`: renders skeleton structure with correct classes; bar widths vary across 3 instances (variant prop or nth-child).
   - `SessionToolbar.test.ts`: renders search bar, filter pills, session count; emits update events.
   - `SessionGrid.test.ts`: renders skeleton cards when loading; renders gallery cards when populated; shows no-results message when empty.
   All tests fail because components do not exist.
2. **GREEN:** Create each Vue component with minimum implementation to pass all tests.
3. **REFACTOR:** Extract shared prop types, clean up CSS class organization.

**Acceptance criteria:**

### GalleryCard.vue
- [ ] Props: `session: Session`, `connectionState?: SseConnectionState`
- [ ] Renders filename using `.landing__card-filename` (within `.landing__card-body`)
- [ ] Renders marker count and section count using `.landing__card-meta-item` with correct icons
- [ ] Renders relative upload time using `.landing__card-date` and file size using `.landing__card-size`
- [ ] **Processing state:**
  - Applies `.landing__gallery-card--processing`
  - Shows `.badge--warning` with spinner and text "Processing"
  - Shows `.landing__preview` area with spinner + "Analyzing..." label
  - Connection dot (4px circle) ONLY in degraded states:
    - `connecting` (amber pulse, `var(--status-warning)`) -- reconnecting
    - `disconnected` (red, `var(--status-error)`) -- permanently failed
    - `connected` -- NO dot shown (happy path is silent)
  - Meta area shows dynamic pipeline stage label from `formatPipelineStage(session.detection_status)` with a `.dot-spinner.dot-spinner--muted`
- [ ] **Failed state:** applies `.landing__gallery-card--failed`, shows `.badge--error`, shows `.landing__preview` area with error icon + "Parse failed" label, shows error text in meta
- [ ] **Ready state:** no status badge, no preview area (no API data available), full metadata displayed, no connection dot
- [ ] Card is a `<router-link>` to session-detail route
- [ ] No hardcoded agent-type badges

### SkeletonCard.vue
- [ ] Renders `.landing__skeleton-card` with `.skeleton` and `.skeleton--text` placeholders
- [ ] Matches the skeleton structure from `landing-populated.html` (lines 895-950)
- [ ] Skeleton bar widths MUST vary across the 3 instances to avoid identical-looking placeholders. Reference widths from the prototype:
  - Instance 1: preview bars 60%/80%/45%/70%, body 75%, meta 70px/80px, footer 60px/45px
  - Instance 2: preview bars 50%/90%/65%/55%, body 85%, meta 65px/90px, footer 55px/50px
  - Instance 3: preview bars 70%/55%/85%/40%, body 65%, meta 75px/85px, footer 70px/40px
- [ ] Implementation: use a `variant` prop (1/2/3) or `:nth-child` pseudo-selectors -- engineer's discretion

### SessionToolbar.vue
- [ ] Props: `searchQuery: string`, `activeFilter: string`, `sessionCount: number`, `filteredCount: number`
- [ ] Emits: `update:searchQuery`, `update:activeFilter`
- [ ] Renders search bar using `.search-bar`, `.search-bar__icon`, `.search-bar__input`
- [ ] Renders filter pills: All, Processing, Ready, Failed with `.filter-pill` / `.filter-pill--active`
- [ ] Renders session count using `.landing__session-count`
- [ ] Filter pills have tinted variants (`.landing__pill--processing`, `.landing__pill--ready`, `.landing__pill--failed`)

### SessionGrid.vue
- [ ] Props: `sessions: Session[]`, `loading: boolean`, `connectionStates?: Map<string, SseConnectionState>`
- [ ] Renders `.landing__session-grid` container
- [ ] When loading: shows 3 SkeletonCard instances (each with different variant/width pattern)
- [ ] When populated: renders GalleryCard per session, passing `connectionState` per card
- [ ] Emits: none (cards self-navigate via router-link)
- [ ] Inline no-results message when sessions array is empty (no slot)

**Commit:** `feat(client): add gallery presentational components with SSE state display`

---

## Stage 6: LandingPage Orchestration

**Description:** Rewrite `LandingPage.vue` to orchestrate all composables and components, implementing empty/populated state branching, and wire everything together. The compact upload strip is inlined as template in the page component. The empty state at this stage uses a basic centered layout -- the full TRON experience is added in Stage 8.

**Owner:** Frontend Engineer
**Depends on:** Stage 2, Stage 3, Stage 4, Stage 5

**Files:**
- Modify `src/client/pages/LandingPage.vue`
- Modify or create `src/client/pages/LandingPage.test.ts`
- Modify `src/client/components/SessionList.vue` (may become unused or repurposed; evaluate at implementation time)

**TDD Cycle:**
1. **RED:** Write/update `LandingPage.test.ts` with failing tests: empty state renders UploadZone, populated state renders toolbar+grid+upload strip, body grid class toggle, search/filter wiring, SSE state pass-through, skeleton loading state. Tests fail because page has not been rewritten yet.
2. **GREEN:** Rewrite `LandingPage.vue` with minimum implementation to pass all tests.
3. **REFACTOR:** Extract inline template sections, clean up composable wiring, verify responsive CSS.

**Acceptance criteria:**
- [ ] Empty state (no sessions, loading complete): renders `UploadZone` in `.landing-empty` layout (AC-5)
- [ ] Empty state includes AGR hint link and personality tagline
- [ ] Empty state does NOT show toolbar or compact upload strip
- [ ] Empty state adds `.no-body-grid` class to `<body>` to suppress CSS body grid (the SVG TRON grid replaces it)
- [ ] `.no-body-grid` class is removed when navigating away or when sessions arrive
- [ ] Populated state: shows inline compact upload strip template + `SessionToolbar` + `SessionGrid`
- [ ] Compact upload strip is ~15 lines of inline template in LandingPage.vue, NOT a separate component
- [ ] Upload strip supports drag-and-drop using `useUpload` handlers
- [ ] Search bar filters cards in real-time (AC-4)
- [ ] Filter pills narrow by status (AC-4)
- [ ] Combined search + filter works; "no results" message shown when nothing matches
- [ ] Skeleton cards shown during initial load (AC-6)
- [ ] SSE subscriptions are active for processing sessions (AC-3)
- [ ] Session status updates in real-time without page reload (AC-3)
- [ ] Connection states are passed through to GalleryCard components
- [ ] Processing cards show dynamic pipeline stage labels and connection dots (degraded only)
- [ ] "Sessions" h2 heading is removed
- [ ] No hex colors or raw pixel values in scoped styles (AC-9)
- [ ] Responsive: toolbar stacks vertically below 768px (AC-10)
- [ ] `.landing-page` and `.landing-page__content` classes are replaced with `.landing` and `.landing-empty` as appropriate
- [ ] Page-specific CSS from the design drafts is in the component `<style scoped>` blocks
- [ ] `ToastContainer` remains wired and functional

**Commit:** `feat(client): redesign landing page with gallery layout and live updates`

---

## Stage 7: Reusable Atmosphere Components

**Description:** Create the two reusable atmospheric components extracted from `theme-tron-v1.html`: `BackgroundGrid.vue` (SVG grid pattern) and `AmbientParticles.vue` (drifting glowing dots). These are generic visual atmosphere layers usable on any page. ALL markup and CSS MUST be copied verbatim from `design/drafts/theme-tron-v1.html` -- the designer hand-tuned all values. Do NOT reimagine or re-derive any values.

**Owner:** Frontend Engineer
**Depends on:** None (standalone components; can be built in parallel with Stages 1-5)

**Source reference:** `design/drafts/theme-tron-v1.html`

**Files:**
- Create `src/client/components/BackgroundGrid.vue`
- Create `src/client/components/BackgroundGrid.test.ts`
- Create `src/client/components/AmbientParticles.vue`
- Create `src/client/components/AmbientParticles.test.ts`

**TDD Cycle:**
1. **RED:** Write component render tests:
   - `BackgroundGrid.test.ts`: renders SVG with pattern element, unique pattern ID, `aria-hidden="true"`, `pointer-events: none`, gridFadeIn class/animation, reduced-motion class handling. Smoke render test.
   - `AmbientParticles.test.ts`: renders exactly 8 particle divs, `aria-hidden="true"` on all, correct class names per particle, reduced-motion handling. Smoke render test.
   Tests fail because components do not exist.
2. **GREEN:** Create components by copying exact markup from `theme-tron-v1.html`:
   - `BackgroundGrid.vue`: Copy SVG from lines 1298-1308 (from `<defs>` to closing `</rect>`). CSS from lines 241-243 (grid-dots base), 891-894 (gridFadeIn keyframe), 940-942 (animation in `@media no-preference`). Add unique pattern ID via `background-grid-${uid}`. Add `<!-- Copied from design/drafts/theme-tron-v1.html lines 1298-1308 (HTML), 241-243, 891-894, 940-942 (CSS) -->` comment.
   - `AmbientParticles.vue`: Copy particle divs from lines 1411-1418. CSS from lines 670-676 (base `.ambient-particle`), 814-876 (8 `particleDrift` keyframes), 1098-1199 (per-particle positions/colors/animations in `@media no-preference`). Add source comment.
3. **REFACTOR:** Ensure Vue SFC structure is clean, verify `prefers-reduced-motion` rules are copied from line 911 (grid) and line 925 (particles).

**Acceptance criteria:**

### BackgroundGrid.vue
- [ ] `<!-- Copied from design/drafts/theme-tron-v1.html lines 1298-1308 (HTML, from <defs> to </rect>), 241-243, 891-894, 940-942 (CSS) -->` comment present
- [ ] SVG pattern definition, grid lines, intersection dots, opacity values, stroke widths are pixel-exact copies from the reference
- [ ] Pattern ID uses unique identifier: `background-grid-${uid}` (avoids SVG ID collisions with multiple instances)
- [ ] `uid` generated via `Math.random().toString(36).slice(2, 8)` or similar on component setup
- [ ] SVG fills its parent container (position absolute, inset 0, width/height 100%)
- [ ] `viewBox` set appropriately with `preserveAspectRatio="xMidYMid slice"`
- [ ] Grid rect fills 100% using `url(#background-grid-${uid})`
- [ ] Fade-in animation on mount (1.5s ease-out, matching `gridFadeIn` from line 891-894)
- [ ] `prefers-reduced-motion: reduce`: grid shown at full opacity immediately, no animation (copied from line 911)
- [ ] Component is `pointer-events: none` (does not interfere with overlaid interactive elements)
- [ ] `aria-hidden="true"` on the SVG element
- [ ] No props (standardized pattern)

### AmbientParticles.vue
- [ ] `<!-- Copied from design/drafts/theme-tron-v1.html lines 1411-1418 (HTML), 670-676, 814-876, 1098-1199 (CSS) -->` comment present
- [ ] Renders exactly 8 absolutely-positioned particle divs -- copied from lines 1411-1418
- [ ] No `count` prop -- particle count is hardcoded to match theme-tron-v1.html exactly
- [ ] Particle positions, sizes, colors, animation durations, and delays are EXACT copies from lines 1098-1199 (per-particle CSS in `@media no-preference`)
- [ ] Color distribution: 6 cyan (`var(--accent-primary)`, particles 1/3/4/5/6/8) + 2 pink (`var(--accent-secondary)`, particles 2/7)
- [ ] Particle sizes: 4-6px as defined per particle in the reference (4px for 1/2/3/6/7, 5px for 4/8, 6px for 5)
- [ ] Each particle has `box-shadow` glow matching its color -- exact values from lines 1098-1199
- [ ] Drift keyframes `particleDrift1` through `particleDrift8` are EXACT copies from lines 814-876
- [ ] Drift durations match reference: 12s, 15s, 10s, 13s, 16s, 9s, 14s, 17s (from lines 1106, 1119, 1132, 1145, 1158, 1171, 1184, 1197)
- [ ] Animation delays match reference: -3s, -7s, -1s, -5s, -9s, -2s, -6s, -11s (from lines 1107, 1120, 1133, 1146, 1159, 1172, 1185, 1198)
- [ ] `prefers-reduced-motion: reduce`: particles hidden (`display: none`) -- copied from line 925
- [ ] All particles are `aria-hidden="true"` and `pointer-events: none`

**Commit:** `feat(client): add reusable BackgroundGrid and AmbientParticles atmosphere components`

---

## Stage 8: Pipeline Visualization and Empty State Integration

**Description:** Create the page-specific `PipelineVisualization.vue` component (5 pipeline nodes + deco paths + anchor dots + cursor prompt, ALL CSS-only) and integrate all three background layers plus the drop zone content into the `LandingPage.vue` empty state. ALL markup and CSS MUST be copied verbatim from `design/drafts/theme-tron-v1.html`. No S-curve path, no energy flow, no JS-driven animation.

**Owner:** Frontend Engineer
**Depends on:** Stage 6, Stage 7

**Source reference:** `design/drafts/theme-tron-v1.html`

**Files:**
- Create `src/client/components/PipelineVisualization.vue`
- Create `src/client/components/PipelineVisualization.test.ts`
- Modify `src/client/pages/LandingPage.vue` (empty state template and styles)

**TDD Cycle:**
1. **RED:** Write tests:
   - `PipelineVisualization.test.ts`: Smoke render test only (component mounts without error, renders 5 node groups, renders 4 deco paths, renders 6 anchor dots, renders cursor-prompt element). No animation unit tests.
   - Update `LandingPage.test.ts`: empty state renders BackgroundGrid + AmbientParticles + PipelineVisualization + drop zone content.
   Tests fail because PipelineVisualization does not exist and LandingPage empty state is basic.
2. **GREEN:** Create `PipelineVisualization.vue` by copying exact markup from `theme-tron-v1.html`:
   - Deco paths from lines 1312-1319, anchor dots from lines 1322-1327, nodes from lines 1349-1407, cursor from lines 1421-1423
   - CSS from lines 275-360 (deco/node/anchor styles), 628-648 (cursor), 713-736 (appearance keyframes), 782-811 (pulse keyframes), 880-900 (cursor/anchor keyframes), 944-1053 (per-node animations), 1202-1208 (cursor animation)
   - Integrate into LandingPage empty state. Copy drop zone from lines 1427-1491, CSS from lines 382-424, 502-530 (icon+disc), 1058-1093 (choreography).
   Add source comments to all sections.
3. **REFACTOR:** Verify reduced-motion fallbacks (lines 910-931), mobile responsive (lines 1214-1264). Clean up scoped styles.

**Acceptance criteria:**

### PipelineVisualization.vue

#### Source Reference
- [ ] `<!-- Copied from design/drafts/theme-tron-v1.html lines 1312-1319, 1322-1327, 1349-1407, 1421-1423 (HTML), 275-360, 628-648, 713-736, 782-811, 880-900, 944-1053, 1202-1208 (CSS) -->` comment present

#### Pipeline Nodes (5) -- copied from lines 1349-1407
- [ ] Node positions, radii, stroke widths, colors are EXACT copies from the reference SVG
- [ ] Each node has: inner fill circle, inner ring (stroke), outer dashed ring (stroke-dasharray) -- per reference
- [ ] Nodes 1,3,5 are cyan; nodes 2,4 are pink
- [ ] Node 5 (curate) has stronger glow and larger radius (r=8 fill, r=13 ring, r=20 outer) as in reference (lines 1399-1406)
- [ ] Labels: "record", "validate", "detect", "replay", "curate" -- copied verbatim from lines 1358, 1370, 1382, 1394, 1406. These are **decorative text**, NOT derived from the `PipelineStage` enum (which has different values: validate/detect/replay/dedup/store). Copy the labels exactly as-is.
- [ ] Staggered appearance via CSS `animation-delay` -- values copied from lines 971-1053
- [ ] After appearance, nodes pulse via CSS keyframes -- `nodePulseCyan`, `nodePulsePink`, `nodePulseFinal` copied from lines 782-811
- [ ] ALL animation is CSS-only. No `requestAnimationFrame`, no `getPointAtLength`, no `Float64Array`

#### Decorative Elements -- copied from lines 1312-1327
- [ ] 4 decorative Bezier paths with exact `d` attribute values from lines 1312-1319
- [ ] 6 anchor dots with exact `cx`, `cy`, `r`, `stroke` values from lines 1322-1327
- [ ] CSS from lines 275-282 (deco path styles), 354-360 (anchor dot styles), 944-950 (deco/anchor animation)
- [ ] Giant cursor-prompt `>_` copied from lines 1421-1423 with CSS from lines 628-648
- [ ] Cursor underscore blinks via CSS (step-end from `cursorBlink` keyframe, lines 880-883)

#### Reduced Motion -- copied from lines 910-931
- [ ] `prefers-reduced-motion: reduce`: all elements shown in final state, no animations
- [ ] Node rings/fills/labels: static at final opacity (lines 914-917)
- [ ] Deco paths and anchor dots at target opacity, visible (lines 929-930)

#### Mobile Responsive -- copied from lines 1214-1264
- [ ] Below 768px: pipeline opacity reduces to 0.3, scales to 140% width with -20% left offset (lines 1233-1238)
- [ ] Node labels increase to 24px (legibility at reduced opacity) (line 1242)
- [ ] Cursor prompt reduces to 14rem (line 1246)
- [ ] Disc rings hidden on mobile (lines 1257-1258)

#### Testing
- [ ] Smoke test only for PipelineVisualization (renders without error). No animation unit tests.

### LandingPage.vue Empty State Integration
- [ ] Empty state renders three background layers: `BackgroundGrid` + `AmbientParticles` + `PipelineVisualization`
- [ ] Drop zone content copied from `theme-tron-v1.html` lines 1427-1491, from `<div class="landing-empty__drop-zone">` through `</footer>`
- [ ] CSS from lines 382-424 (drop zone + hover + focus), 502-530 (upload icon + disc ring), 1058-1093 (content entrance choreography in `@media no-preference`)
- [ ] `<!-- Copied from design/drafts/theme-tron-v1.html lines 1427-1491 (HTML), 382-424, 502-530, 1058-1093 (CSS) -->` comment present
- [ ] Drop zone uses `.landing-empty__drop-zone` styling (backdrop-filter blur, cyan border glow, hover lift)
- [ ] Upload icon with single thin disc ring, gentle bob animation
- [ ] Heading "No sessions yet. Fix that." with staggered entrance
- [ ] Subtitle with `.cast` code styling
- [ ] "Browse Files" CTA button with TRON styling (mono font, uppercase, letter-spacing 0.12em)
- [ ] AGR hint link below drop zone
- [ ] Footer tagline: "// the subagent deleted half your codebase again." etc.
- [ ] Body grid suppression is active via `.no-body-grid` class (from Stage 6)
- [ ] Content entrance choreography matches `theme-tron-v1.html` CSS timeline (lines 1058-1093)
- [ ] Drop zone supports drag-and-drop (using `useUpload` handlers)
- [ ] Drag-over state: border intensifies, glow pulses
- [ ] `prefers-reduced-motion: reduce` shows all content immediately (lines 918-928)
- [ ] Mobile responsive: content padding reduces, heading/subtitle shrink, tagline width narrows (lines 1214-1264)
- [ ] Empty state vertically centers below header (matching `.landing-empty__main` flex layout, line 102-108)

**Commit:** `feat(client): add CSS-only pipeline visualization and integrate TRON empty state`

---

## Stage 9: Toast Improvement

**Description:** Upgrade `ToastContainer.vue` and `useToast.ts` to match the design system's richer toast pattern from `components.css`. The design system defines `.toast__icon` (colored vertical strip), `.toast__content` (title + message), but the current implementation only uses flat text. Prerequisite check: verify `components.css` is globally imported in the Vue app (confirmed at `src/client/main.ts` line 2).

**Owner:** Frontend Engineer
**Depends on:** None (can be done in parallel with other stages)

**Files:**
- Modify `src/client/components/ToastContainer.vue`
- Modify or create `src/client/components/ToastContainer.test.ts`
- Modify `src/client/composables/useToast.ts`

**TDD Cycle:**
1. **RED:** Write/update `ToastContainer.test.ts` with failing tests: renders `.toast__icon` strip, renders `.toast__title` when provided, renders `.toast__message`, renders `.toast__close`, success toast uses correct icon class, no inline color overrides in rendered output. Update `useToast` tests for optional `title` parameter. Tests fail because components have not been updated yet.
2. **GREEN:** Update `useToast.ts` (add `title` field) and `ToastContainer.vue` (new template structure matching `components.css` BEM pattern).
3. **REFACTOR:** Remove inline color overrides from scoped styles, verify design system classes are sufficient.

**Acceptance criteria:**
- [ ] Verify `components.css` global import at `src/client/main.ts` before relying on toast classes
- [ ] `Toast` interface gains optional `title?: string` field
- [ ] `addToast` accepts an optional `title` parameter
- [ ] Each toast renders `.toast__icon` strip with status-colored background and appropriate icon:
  - success: `icon-check-circle`
  - error: `icon-error-circle`
  - info: `icon-info` (or similar)
- [ ] Toast body uses `.toast__content` wrapper with `.toast__title` (when provided) and `.toast__message`
- [ ] `.toast__close` button with icon remains functional
- [ ] Inline color overrides in scoped styles are removed -- rely on `components.css` `.toast--success .toast__icon` etc.
- [ ] Existing toast functionality (auto-dismiss timer, manual dismiss) is unchanged
- [ ] Upload success toast uses title: "Session uploaded" and message with filename (matching `landing-populated.html` toast reference)
- [ ] Visual appearance matches the toast shown in `landing-populated.html`

**Commit:** `feat(client): upgrade toast component to match design system`

---

## Stage 10: Visual Regression Tests

**Description:** Create Playwright visual regression tests that compare the Vue implementation against the reference HTML prototypes. Capture screenshots at key breakpoints and states. Acceptance threshold: max 5% pixel drift.

**Owner:** Frontend Engineer
**Depends on:** Stage 8, Stage 9

**Files:**
- Create `e2e/gallery-visual.spec.ts` (or similar Playwright test file)
- Baseline screenshots stored in `e2e/__screenshots__/` (or project-standard snapshot directory)

**TDD Cycle:**
1. **RED:** Write Playwright visual regression tests:
   - Empty state at desktop (1280x800): capture, compare against baseline from `theme-tron-v1.html`
   - Empty state at mobile (375x812): capture, compare
   - Populated state at desktop with 3+ sessions (mixed ready/processing/failed): capture, compare against baseline from `landing-populated.html`
   - Populated state at mobile: capture, compare
   - Skeleton loading state: capture, compare
   - `prefers-reduced-motion: reduce` forced: empty state, verify no animations
   Tests fail because baselines have not been established.
2. **GREEN:** Capture baselines from the reference HTML files at matching viewports. Run tests against the Vue app -- if drift exceeds 5%, fix the implementation to match the reference more closely.
3. **REFACTOR:** Organize screenshot baselines, add descriptive test names, document the 5% threshold rationale.

**Acceptance criteria:**
- [ ] Playwright visual regression tests exist for empty state (desktop + mobile)
- [ ] Playwright visual regression tests exist for populated state (desktop + mobile)
- [ ] Playwright visual regression tests exist for skeleton loading state
- [ ] Playwright visual regression tests exist for `prefers-reduced-motion: reduce` (empty state)
- [ ] All screenshots are within 5% pixel drift of reference HTML baselines
- [ ] Baselines are captured from `design/drafts/theme-tron-v1.html` (empty) and `design/drafts/landing-populated.html` (populated)
- [ ] Tests run as part of `npx playwright test`

**Commit:** `test(client): add visual regression tests for gallery page against HTML prototypes`

---

## Stage 11: Integration Verification

**Description:** End-to-end manual verification and any remaining adjustments. Run the full test suite (unit + visual regression), lint, and type-check. Check for missing `--status-error-dim` token.

**Owner:** Frontend Engineer
**Depends on:** Stage 10

**Files:**
- Any files needing adjustment from verification findings
- Possibly `design/styles/layout.css` if `--status-error-dim` token is missing

**Acceptance criteria:**
- [ ] `npx vitest run` passes all tests (existing + new)
- [ ] `npx playwright test` passes all visual regression tests (within 5% threshold)
- [ ] `npm run lint` passes with no errors
- [ ] `npx tsc --noEmit` shows no new type errors (pre-existing test file errors are known)
- [ ] Upload flow works end-to-end: upload a `.cast` file, see processing card, see it transition to ready
- [ ] Processing card shows dynamic pipeline stage label (not just "Processing")
- [ ] Processing card does NOT show connection dot when connected (happy path is silent)
- [ ] When SSE connection drops, card shows amber (reconnecting) or red (disconnected) connection dot
- [ ] When pipeline stage advances, card meta text updates in real-time
- [ ] Processing card preview area shows spinner + "Analyzing..." label
- [ ] Failed card preview area shows error icon + "Parse failed" label
- [ ] Ready card has no preview area (intentional)
- [ ] Toast shows icon strip and title/message structure on upload success
- [ ] Search filters cards by filename
- [ ] Filter pills narrow by status
- [ ] Empty state displays three-layer TRON background (grid + particles + pipeline nodes)
- [ ] No S-curve path or energy flow visible anywhere
- [ ] 5 pipeline nodes appear with staggered CSS animation, labels are decorative ("record"/"validate"/"detect"/"replay"/"curate")
- [ ] Ambient particles drift across empty state
- [ ] Skeleton cards appear during initial load with varied bar widths
- [ ] Responsive layout works at mobile and desktop widths
- [ ] `prefers-reduced-motion` disables animations and shows final state
- [ ] CSS body grid is hidden during empty state (`.no-body-grid` active)
- [ ] CSS body grid reappears when sessions exist or when navigating away
- [ ] `--status-error-dim` token exists in layout.css (add if missing)
- [ ] All source comments reference `design/drafts/theme-tron-v1.html` with correct line ranges
- [ ] All AC-1 through AC-10 verified

**Commit:** `fix(client): address integration verification findings` (if needed)

---

## Summary

| Stage | Description | Files | Depends on |
|-------|-------------|-------|------------|
| 1 | Shared utilities (time, size, pipeline stage) | 2 new | None |
| 2 | Search/filter composable | 2 new | None |
| 3 | SSE composable with connection state | 2 new | None |
| 4 | Extend useSessionList | 1-2 modified | None |
| 5 | Presentational components (with SSE state) | 8 new (4 .vue + 4 .test.ts) | Stage 1 |
| 6 | LandingPage orchestration | 2-3 modified | Stage 2, 3, 4, 5 |
| 7 | Reusable atmosphere (BackgroundGrid, AmbientParticles) | 4 new (2 .vue + 2 .test.ts) | None |
| 8 | CSS-only pipeline visualization + empty state integration | 2-3 new/modified | Stage 6, 7 |
| 9 | Toast improvement | 2-3 modified | None |
| 10 | Visual regression tests | 1 new + baselines | Stage 8, 9 |
| 11 | Integration verification | varies | Stage 10 |

**Parallelizable:** Stages 1, 2, 3, 4, 7, 9 have no file ownership overlap and can be implemented concurrently. Stage 5 depends only on Stage 1. Stage 6 is the gallery integration point. Stage 8 integrates the atmosphere and pipeline into the empty state. Stage 10 adds visual regression testing. Stage 11 is final verification.

**File ownership summary (no overlap across parallel stages):**

| Stage | Owns (creates/modifies) |
|-------|------------------------|
| 1 | `src/client/utils/format.ts` + test |
| 2 | `src/client/composables/useSessionFilter.ts` + test |
| 3 | `src/client/composables/useSessionSSE.ts` + test |
| 4 | `src/client/composables/useSessionList.ts` + test |
| 5 | `src/client/components/GalleryCard.vue`, `SkeletonCard.vue`, `SessionToolbar.vue`, `SessionGrid.vue` + tests |
| 6 | `src/client/pages/LandingPage.vue` + test, `src/client/components/SessionList.vue` |
| 7 | `src/client/components/BackgroundGrid.vue`, `AmbientParticles.vue` + tests |
| 8 | `src/client/components/PipelineVisualization.vue` + test, `src/client/pages/LandingPage.vue` |
| 9 | `src/client/components/ToastContainer.vue` + test, `src/client/composables/useToast.ts` |
| 10 | `e2e/gallery-visual.spec.ts` + baseline screenshots |

Note: Stage 8 modifies `LandingPage.vue` which is also modified by Stage 6. This is intentional -- Stage 6 builds the basic page structure, Stage 8 adds the TRON empty state. They are sequential (Stage 8 depends on Stage 6).

**TDD applies to ALL stages.** Every stage follows RED (write failing tests) -> GREEN (minimum implementation) -> REFACTOR (clean up). Tests are written BEFORE implementation code.

**Copy-over principle applies to Stages 7, 8.** All visual markup and CSS values must be copied verbatim from `design/drafts/theme-tron-v1.html` with source line reference comments. No creative reinterpretation.

**Node labels are decorative.** The 5 node labels ("record", "validate", "detect", "replay", "curate") are copied from the prototype as-is. They do NOT map to the `PipelineStage` enum values (validate/detect/replay/dedup/store). Do not derive them from code.
