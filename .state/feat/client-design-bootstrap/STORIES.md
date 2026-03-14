# Stories: Erika Spatial Foundation — CSS Grid Shell and Application Shell Bootstrap

> Transform Erika from a page-based prototype into a persistent multi-panel spatial application, establishing the CSS Grid architecture, baseline grid, sidebar, cognitive start page, upload flow, live status, skeleton loading, accessibility baseline, and mobile responsiveness.

## Stories

### Platform user — spatial permanence: the session list is always there

As a platform user, I want the session list to remain visible while I read a session's detail, so that switching between sessions feels like switching files in an editor rather than navigating between pages.

Acceptance signal: opening a session detail leaves the sidebar exactly as it was — scroll position preserved, selection highlighted — and clicking another session in the sidebar swaps the main content without any navigation or reload.

---

### Platform user — oriented from first paint

As a platform user, I want the application's layout to appear instantly and remain stable as data loads, so that I never see a blank screen, a flash of unstyled content, or content jumping around as JavaScript initializes.

Acceptance signal: the grid shell (sidebar region, main region, header) is visibly painted before any session data arrives, skeleton loaders pulse within their correct grid areas, and no layout shift occurs when real content replaces them.

---

### Platform user — a first launch that teaches rather than abandons

As a platform user opening Erika for the first time with no sessions uploaded, I want the main area to show me what Erika is and give me a direct path to my first action, so that I am never left staring at a blank void wondering if something went wrong.

Acceptance signal: the start page shows a recognizable drop zone and a primary call to action; a user unfamiliar with Erika understands what to do within five seconds without reading documentation.

---

### Platform user — upload that responds to how I work

As a platform user, I want to upload a session by dragging a file anywhere over the application window or clicking a button in the sidebar, so that I can start an upload in whatever way feels natural without hunting for a specific upload zone.

Acceptance signal: dragging a `.cast` file over the viewport triggers a visible receiving state (border glow, overlay) within 100ms; dropping or clicking upload causes a new entry to appear in the sidebar immediately, in a processing state.

---

### Platform user — ambient awareness of background processing

As a platform user, I want to see a session's processing state update automatically in the sidebar while I do other things, so that I never have to refresh the page or wonder whether an upload finished.

Acceptance signal: a session card transitions through uploading → processing → ready (or failed) states driven by live server events, with each state paired with both a color and a motion pattern (pulsing = active, steady = done, no motion = failed), without any user action.

---

### Platform user — search and filter that sculpts the view

As a platform user, I want to search sessions by name and filter by status in the sidebar, so that I can find a specific session immediately without scrolling through a long list.

Acceptance signal: typing in the search bar narrows the session list in real time; status filter pills (All / Processing / Ready / Failed) further narrow the list; both filters compose; clearing the search restores the full list.

---

### Platform user — upload feedback I can trust

As a platform user, I want a brief notification when an upload completes or fails and when processing finishes, so that I can continue working without watching the sidebar for state changes.

Acceptance signal: a toast appears automatically on upload success, upload failure, and processing completion or failure; each toast is announced to screen readers; toasts self-dismiss without requiring interaction.

---

### Platform user — a mobile experience that is intentional, not crammed

As a platform user on a phone or small screen, I want the sidebar to be accessible without blocking the session detail, so that I can browse and review sessions on the go without fighting the layout.

Acceptance signal: on viewports below 768px, a toggle button reveals the sidebar as a full-height overlay with a visible backdrop; tapping a session closes the overlay and shows its detail; the overlay traps focus while open and returns it to the toggle on close.

---

### Developer extending the platform — a grid that accommodates future panels without a rewrite

As a developer adding features to Erika, I want the CSS Grid shell to pre-declare all six named regions (`brand`, `header`, `sidebar`, `main`, `aside`, `bottom`) from day one with `aside` and `bottom` collapsed to `0fr`, so that I can activate a new panel by setting its grid track size without restructuring the layout template.

Acceptance signal: the grid template is defined in a pure CSS file loaded before the Vue bundle; `aside` and `bottom` are valid named areas that collapse cleanly to zero; adding a component to either area causes it to appear without touching the grid definition.

---

### Developer extending the platform — design tokens that are consistent with the spatial shell

As a developer building components for the sidebar or main content area, I want the spacing tokens to produce component heights that are proportionate to comparable tools (sidebar items ~36-50px, header ~54px, inputs ~36px), so that I can implement new components without fighting the spacing system.

Acceptance signal: the frontend-designer documents which baseline path (A: 21px, B: dual-rhythm, C: 18px/36px) was adopted and why, and the chosen `--baseline` value is reflected in `design/styles/layout.css` before any component implementation begins.

---

### Platform user — status that works for everyone, not just color vision

As a platform user relying on a screen reader or with color vision differences, I want session status indicators to communicate their meaning through more than color alone, so that I can understand which sessions are processing, ready, or failed regardless of how I perceive the interface.

Acceptance signal: processing indicators pair color with a motion pattern (pulsing animation); each status dot has an `aria-label` describing its state in text; SSE-driven status changes are announced via ARIA live regions without interrupting ongoing screen reader activity.

---

## Out of Scope

- Right panel (`aside`) and bottom panel (`bottom`) content — grid areas are defined and collapsed, but nothing populates them this cycle
- Drag-handle resize for the sidebar — deferred unless the frontend-designer naturally includes it in mockups
- Session curation UI (annotations, tagging, segment marking) — separate future feature
- Multi-user features, workspaces, team sharing, authentication, authorization
- Virtual scrolling for the session list — incremental addition when needed
- Backend changes of any kind — all APIs exist (session CRUD, upload, SSE status, re-detect)
- Dashboard analytics or metrics beyond the cognitive start page
- Terminal rendering improvements (scrollback dedup, VT processing)
- Server-side search indexing — client-side filtering only this cycle

---
**Sign-off:** Approved
