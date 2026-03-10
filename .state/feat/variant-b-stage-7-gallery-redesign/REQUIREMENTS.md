# REQUIREMENTS — Stage 7: Gallery Page Redesign

**Branch:** `feat/variant-b-stage-7-gallery-redesign`
**Date:** 2026-03-10
**Sign-off:** Approved by user

---

## Problem Statement

The current landing page gallery does not reflect the approved Stage 6 design system. Session cards are sparse and omit important metadata (section count, detection status). The upload zone is always full-height regardless of whether sessions exist. There is no search, no status filtering, no live pipeline progress feedback, and no skeleton loading state — the user sees a plain "Loading sessions..." text string while data fetches. The layout structure does not match the design drafts produced in Stage 6.

---

## Desired Outcome

The gallery page must match `design/drafts/landing-populated.html` (populated state) and `design/drafts/landing-empty.html` (empty state) as the authoritative visual references. A user landing on the page should see:

- Rich cards that communicate filename, status, size, marker count, section count, and relative upload time at a glance.
- Live status updates for sessions that are still processing — without requiring a manual page refresh.
- A compact upload strip above the session list (instead of a full upload zone) once sessions exist.
- A welcoming full-page empty state with a large upload zone when no sessions exist.
- Skeleton placeholder cards while the initial session list loads.
- A search bar and status filter pills to narrow visible cards.

---

## Scope

### In Scope

- `src/client/pages/LandingPage.vue` — restructure layout to match design drafts; introduce empty vs populated state branching
- `src/client/components/SessionList.vue` — replace current card structure with the rich two-column card layout from the design draft
- `src/client/composables/useSessionList.ts` — extend as needed to support skeleton loading and live status updates
- New client-side code to manage text search and filter-pill state, producing a derived list of visible sessions
- New client-side code to subscribe to SSE events and keep session status current without a page reload
- New presentational card component to render all session card states (processing, ready, failed, skeleton)
- `src/shared/types/` — any new shared types required (e.g. `DetectionStatus` enum/union if not already exported)

### Out of Scope

- Backend API changes — all three existing endpoints (`GET /api/sessions`, `POST /api/upload`, `GET /api/sessions/:id/events`) are used as-is; no new backend endpoints
- Session detail page — not touched
- Delete functionality — may remain accessible but the design draft does not show a delete button inline; the architect may choose to defer or retain it
- Pagination — not required for this stage
- Agent/tool detection badges shown in the design draft (Claude Code, Claude, Gemini CLI, Codex) — the `detection_status` field on the Session type reflects pipeline state, not agent type; agent-type detection is a future feature. Cards must not render agent-type badges until that data exists on the session object.

---

## Explicit Non-Changes

- `design/styles/components.css` — must not be modified
- `design/styles/layout.css` — must not be modified
- `design/styles/icons.css` — must not be modified
- `design/styles/page.css` — must not be modified
- `src/client/composables/useUpload.ts` — must not be modified
- `src/client/composables/useToast.ts` — must not be modified
- `src/client/components/UploadZone.vue` — must not be modified
- `src/client/components/ToastContainer.vue` — must not be modified
- The router configuration and session detail route — must not be modified
- All server-side files — must not be touched

---

## Acceptance Criteria

### AC-1: Rich Session Cards (Ready State)

- [ ] Each ready session card renders the filename using `.session-card__filename`
- [ ] Each ready session card renders marker count using `.session-card__meta-item` with `icon-tag` icon
- [ ] Each ready session card renders section count using `.session-card__meta-item` with `icon-sections` icon
- [ ] Each ready session card renders relative upload time (e.g. "2 hours ago", "yesterday") in the right column using `.landing__card-date`
- [ ] Each ready session card renders human-readable file size (e.g. "342 KB", "1.2 MB") in the right column using `.landing__card-size`
- [ ] Ready session cards do not show an agent-type badge (no hardcoded agent names)
- [ ] Cards are clickable and navigate to the session detail route
- [ ] Card layout matches the two-column structure in `landing-populated.html` using `.landing__card-layout`, `.landing__card-main`, `.landing__card-top`, `.landing__card-right`

### AC-2: Status Badges on Cards

- [ ] A processing session card renders a `badge--warning` badge containing a `.spinner--sm.spinner--secondary` and the text "Processing"
- [ ] A processing session card applies the `.session-card--processing` modifier class to the card root
- [ ] A processing session card renders a `.dot-spinner.dot-spinner--muted` with descriptive label text ("Detecting sections..." or equivalent) in place of marker/section meta
- [ ] A failed session card renders a `badge--error` badge with an error icon
- [ ] A ready session card renders no status badge (status is implied by the presence of metadata)

### AC-3: Live SSE Updates

- [ ] After uploading a session, the new card appears in the list without a full page reload
- [ ] A processing session card updates its status badge and meta in real-time as pipeline events arrive (processing → ready/failed)
- [ ] When a session transitions to ready, the card updates to show marker count, section count, and removes the processing indicator — without a page reload
- [ ] When a session transitions to failed, the card updates to the failed state — without a page reload
- [ ] The SSE strategy does not require backend API changes

### AC-4: Search and Filter

- [ ] A search bar renders using `.search-bar`, `.search-bar__icon`, `.search-bar__input` in the toolbar row
- [ ] Typing in the search bar filters visible cards by filename (case-insensitive, substring match)
- [ ] Filter pills render using `.filter-pills` and `.filter-pill` with an "All" pill active by default
- [ ] Filter pills include: All, Processing, Ready, Failed
- [ ] The active filter pill applies `.filter-pill--active`
- [ ] Selecting a filter pill narrows visible cards to that detection status group
- [ ] Search and filter can be combined (search within a filtered subset)
- [ ] When no cards match the combined search/filter, a descriptive empty message is shown (not a blank area)

### AC-5: Empty State

- [ ] When no sessions exist and the initial load is complete, the page renders the empty state matching `landing-empty.html`
- [ ] The empty state renders the upload zone using `.upload-zone` with the title "No sessions yet. Fix that." and appropriate subtitle text
- [ ] The empty state is vertically centered in the viewport below the header (matching `.landing-empty` layout from the draft)
- [ ] The empty state renders the AGR hint link below the upload zone
- [ ] The empty state renders the personality tagline at the bottom
- [ ] The toolbar (search bar + filter pills) is NOT shown in the empty state
- [ ] The compact upload strip is NOT shown in the empty state

### AC-6: Skeleton Loading

- [ ] While the initial session list is loading, skeleton placeholder cards are rendered instead of "Loading sessions..." text
- [ ] Skeleton cards use `.skeleton` and `.skeleton--card` classes from the design system
- [ ] At least 3 skeleton cards are shown during loading
- [ ] The layout does not jump visibly when real cards replace skeleton cards

### AC-7: Compact Upload Strip

- [ ] When sessions exist, the upload zone is replaced by a compact upload strip using `.landing__upload-strip` layout styles
- [ ] The compact strip renders the upload icon using `.landing__upload-strip-icon.icon-upload`
- [ ] The compact strip renders hint text matching the draft ("Drop `.cast` files here to upload, or use the button above") using `.landing__upload-strip-text`
- [ ] The compact strip supports drag-and-drop file upload (same behavior as the full upload zone)
- [ ] The compact strip applies hover styles on drag-over (`border-color: var(--accent-primary)`, `background: var(--accent-primary-subtle)`)
- [ ] The full upload zone component is not rendered when sessions exist

### AC-8: Separation of Concerns (Non-Functional)

SSE subscription logic, session list state, and search/filter state must be cleanly separated from each other and from page-level orchestration. No single component or module should mix fetch logic, SSE event handling, and search/filter derivation. The exact boundaries and file structure are for the architect to decide.

### AC-9: Design Token Compliance

- [ ] No hex color values, raw pixel values, or font family names are hardcoded in any new or modified Vue component `<style>` blocks
- [ ] All spacing, color, typography, and radius values reference `var(--*)` tokens from `layout.css`
- [ ] All component classes used are BEM classes from `components.css` — no new class names that duplicate or shadow existing design system classes
- [ ] Page-layout-specific styles (grid, column layout for the card interior, toolbar row) use the same token references as the design draft

### AC-10: Responsive Behavior

- [ ] On viewports narrower than 768px, the toolbar stacks vertically (search above filter pills) matching the media query in the design draft
- [ ] On narrow viewports, the card right column (date + size) switches to horizontal inline layout matching the design draft
- [ ] The empty state remains usable on narrow viewports

---

## Existing Files That Need Changing

The following files have user-visible problems that must be resolved. The nature of each problem is described; the internal solution is for the architect to design.

### `src/client/pages/LandingPage.vue`

- Always renders the full `UploadZone` component regardless of whether sessions exist — should show compact strip when sessions are present and the full zone only in the empty state
- Contains a `<h2>` "Sessions" heading that does not appear in the design drafts — must be removed
- Layout structure does not match the design drafts (no toolbar, no compact upload strip, no empty/populated branching)

### `src/client/components/SessionList.vue`

- Card structure is single-column with header/meta/footer stacking — does not match the two-column draft layout
- Loading state renders plain text "Loading sessions..." — must be replaced with skeleton cards (AC-6)
- Empty state is handled inline within the list — the full-page empty state (no sessions at all) belongs at the page level; the list should only handle the "no results for this search/filter" case
- Card layout uses a CSS grid not present in the design draft — cards should be a vertical flex stack with `gap: var(--space-2)`
- Inline delete button is not present in the design draft
- `formatDate` uses absolute datetime formatting — relative time (e.g. "2 hours ago") is required

### `src/client/composables/useSessionList.ts`

- Does not currently support live in-place status updates for individual sessions — must be extended so that SSE-driven status changes can be reflected in the list without re-fetching all sessions

---

## Constraints

- No backend API changes — all required data comes from `GET /api/sessions` and `GET /api/sessions/:id/events`
- All styling uses tokens from `design/styles/layout.css` and BEM classes from `design/styles/components.css` — no new CSS files
- Allowed commit scopes: `client`, `shared`, `design`
- Allowed file paths: `src/client/**`, `src/shared/**`, `design/**`

---

## Visual Authority

The design drafts are the source of truth for all layout decisions:

- Populated state: `design/drafts/landing-populated.html`
- Empty state: `design/drafts/landing-empty.html`

When implementation choices are ambiguous, match the draft HTML structure and class usage exactly rather than inferring intent.
