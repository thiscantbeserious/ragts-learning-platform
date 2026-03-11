# User Stories — Stage 7: Gallery Page Redesign

**Date:** 2026-03-10

---

## Platform User — Browsing

### US-1: Rich Session Cards

As a platform user, I want to see rich session cards with filename, upload time, file size, marker count, and section count so that I can quickly assess a session's content and relevance without opening it.

**Acceptance signal:** Each session card in the populated gallery displays all six metadata fields and the correct processing status badge.

### US-2: Live Processing Progress

As a platform user, I want to see live processing progress on session cards without refreshing the page so that I know exactly when a session becomes ready to view.

**Acceptance signal:** When a session transitions from Processing to Ready (or Failed), the card updates in place via SSE within the same browser session, with no manual reload required.

### US-3: Search and Filter

As a platform user, I want to search sessions by filename and filter by status so that I can find the specific session I need in a growing library.

**Acceptance signal:** Typing in the search field and selecting a status filter immediately narrows the displayed cards; clearing both restores the full list.

---

## Platform User — First Visit

### US-4: Inviting Empty State

As a platform user arriving with no sessions uploaded, I want to see an inviting, clearly guided empty state with a prominent upload zone so that I understand what the platform is for and how to get started without reading documentation.

**Acceptance signal:** The empty state renders the TRON-themed animated background with the glassmorphic upload zone, and uploading a file from that zone starts a session correctly.

### US-5: Compact Upload Strip

As a platform user with sessions already uploaded, I want the upload area to compress into a compact strip rather than dominating the page so that the gallery content remains the primary focus during normal browsing.

**Acceptance signal:** When at least one session exists, the upload zone renders as the compact strip variant; when the gallery is empty, the full-size upload zone is shown.

---

## Platform User — Perceived Quality

### US-6: Skeleton Loading

As a platform user, I want to see skeleton cards while sessions are loading so that the page feels responsive rather than blank or frozen during initial fetch.

**Acceptance signal:** On gallery load, skeleton card placeholders appear immediately and are replaced by real session cards once the API response arrives.

### US-7: Toast Notifications

As a platform user, I want toast notifications for upload success and failure to be visually distinct and consistent with the rest of the interface so that I can immediately tell what happened without re-reading the message.

**Acceptance signal:** Upload success and failure toasts render with the correct icon strip matching the design system's status color conventions.

### US-8: Accessibility

As a platform user who navigates by keyboard or uses a screen reader, I want all gallery controls (search, filter, cards, upload zone) to be reachable by keyboard and correctly labeled so that the redesigned page does not regress my ability to use the platform.

**Acceptance signal:** All interactive elements pass WCAG 2.1 AA contrast checks and are operable via keyboard with meaningful ARIA labels present.

---

## Developer — Extensibility

### US-9: Reusable Atmosphere Components

As a developer adding new pages to RAGTS, I want the TronGrid and AmbientParticles components to be self-contained and reusable so that I can apply the same atmospheric visual language on other pages without duplicating implementation.

**Acceptance signal:** TronGrid and AmbientParticles are importable from a shared location and can be dropped onto a new page without modifications to their internals.

### US-10: Visual Regression Coverage

As a developer maintaining the frontend, I want visual regression tests covering the empty, loading, populated, and filtered gallery states so that future changes to the gallery or design system surface regressions automatically.

**Acceptance signal:** The Playwright visual regression suite includes at least one snapshot per named gallery state, and all snapshots pass on the baseline build.

---

## Self-Hosting Operator

### US-11: SSE Connection Hygiene

As a self-hosting operator running RAGTS for a team, I want the SSE connection used for live session updates to be well-behaved under concurrent users so that server resources are not exhausted by long-lived connections from many browsers.

**Acceptance signal:** The SSE endpoint closes connections cleanly when a client navigates away, and the feature works correctly under at least the documented concurrent-user baseline without requiring additional server configuration.

---

## Traceability

| Story | Acceptance Criteria |
|-------|-------------------|
| US-1 | AC-1, AC-9 |
| US-2 | AC-3 |
| US-3 | AC-4 |
| US-4 | AC-5 |
| US-5 | AC-7 |
| US-6 | AC-6 |
| US-7 | (Toast improvement — beyond AC scope) |
| US-8 | AC-9, AC-10 |
| US-9 | (Reusable components — beyond AC scope) |
| US-10 | (Visual regression — beyond AC scope) |
| US-11 | AC-3, AC-8 |
