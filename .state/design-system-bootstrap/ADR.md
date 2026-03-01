# ADR: Design System Bootstrap

Branch: design-system-bootstrap
Date: 2026-02-27
Status: Accepted

## Context

The PO has scoped a design-only sprint (DS-1 through DS-9, plus 4 nice-to-haves) to establish a visual design system for RAGTS before the next wave of features (auth, curation, search). The deliverable is Penpot mockups, not code.

This ADR evaluates the PO's scope for completeness, corrects the route/page architecture, and makes binding UX decisions so the Frontend Designer has unambiguous guidance.

## Decision 1: Complete Route Map

The PO defined 7 routes/modals. The actual application needs 13 routes plus 3 modals. Here is the complete map:

### Public Routes (no auth required)

| Route | Type | Screen | Source |
|-------|------|--------|--------|
| `/login` | Page | Login form (email/password + OIDC) | PO DS-6 |
| `/register` | Page | Registration form (invite-only or open) | PO DS-6 |
| `/setup` | Page | First-run bootstrap (create admin account) | PO DS-6 (extracted) |
| `/auth/callback` | Redirect | OIDC callback handler, no UI needed | Architect addition |

### Protected Routes (auth required)

| Route | Type | Screen | Source |
|-------|------|--------|--------|
| `/` | Page | Landing: upload zone + session list + search/filter | PO DS-4 |
| `/session/:id` | Page | Session detail: terminal document with fold/unfold | PO DS-5 |
| `/settings` | Page | User settings (profile, password, API tokens) | PO DS-10 |
| `/settings/workspace` | Page | Workspace admin settings (admin only) | PO DS-10 (split) |

### Utility Routes

| Route | Type | Screen | Source |
|-------|------|--------|--------|
| `/:pathMatch(.*)*` | Page | 404 Not Found | Architect addition |

### Modal Overlays (no route change)

| Trigger | Type | Content | Source |
|---------|------|---------|--------|
| Upload button (global) | Modal | Drag-and-drop + agent type selection | PO DS-7 |
| Edit icon on session header | Modal | Session metadata editing | PO DS-8 |
| Curate button on section header | Slide-over panel | Curation annotation form | PO DS-9 (changed) |

### Auth Flow Redirects

| Scenario | Redirect |
|----------|----------|
| Unauthenticated user hits any protected route | `/login?redirect=<original-path>` |
| Successful login | Redirect to `?redirect` param, or `/` if none |
| Successful registration (open mode) | `/login` with success toast |
| Successful registration (invite mode) | `/login` with confirmation message |
| Successful OIDC callback | `/` (or `?redirect` from state param) |
| First app launch (no users exist) | Auto-redirect from `/login` to `/setup` |
| Successful bootstrap setup | `/login` with "Admin account created" toast |
| Logout | `/login` (session cleared) |

### Rationale: Changes from PO Scope

**Added `/setup` as a separate route.** The PO placed first-run bootstrap under DS-6 as a variant of the auth screens. But the bootstrap flow is fundamentally different: it appears exactly once, has different form fields (no "sign in" option, no OIDC), and must prevent access to everything else until complete. It deserves its own route and its own page treatment.

**Added `/auth/callback` for OIDC.** This is a technical route with no UI (it processes the callback and redirects), but the designer needs to know it exists because: (a) the login page shows OIDC buttons that navigate to external providers, and (b) returning from those providers hits this route. The designer does not need to mock it up, but needs to design the "returning from OIDC" loading state on the login page.

**Added `/:pathMatch(.*)*` (404 catch-all).** Every application needs a 404 page. The PO listed this under DS-13 (nice-to-have). It should be must-design because it is a real page that real users hit -- broken links, deleted sessions, typos. It is also low effort: a single frame with personality.

**Split `/settings` into `/settings` and `/settings/workspace`.** The PO combined user settings and workspace admin settings on one page. These have different audiences (every user vs admins only) and different sensitivity levels. Separating them avoids permission confusion and simplifies the page layouts.

**Did NOT add `/workspaces`.** The PO listed this as nice-to-have (DS-11). The workspace switcher is a header component, not a standalone page. Workspace creation can be a modal triggered from the switcher dropdown. A dedicated page is unnecessary at this stage.

**Did NOT add password reset flow.** Password reset (`/forgot-password`, `/reset-password/:token`) is a real need but is implementation work beyond the design sprint scope. The designer should leave a placeholder in the login page mockup (a "Forgot password?" link) but does not need to design the full flow.

## Decision 2: Navigation Model -- Top Nav with Contextual Breadcrumbs

**Decision: Flat top-nav. No sidebar. Breadcrumbs on detail pages only.**

The PO proposed this and it is correct. Here is why, and where it has limits:

### Layout Structure

```
+--------------------------------------------------------------------+
| [RAGTS]  [workspace name v]                    [Upload] [avatar v] |
+--------------------------------------------------------------------+
|                                                                    |
|  [breadcrumb: Sessions > filename.cast]  (detail pages only)       |
|                                                                    |
|  page content                                                      |
|                                                                    |
+--------------------------------------------------------------------+
```

### Header Slots

| Position | Content | When Visible |
|----------|---------|--------------|
| Left | RAGTS brand (link to `/`) | Always |
| Center-left | Workspace name + switcher dropdown | When multi-tenancy enabled |
| Right | Upload button (icon + label) | Authenticated pages |
| Far right | User avatar/initial + dropdown menu | Authenticated pages |

### User Dropdown Menu

- Profile / Settings
- Workspace Settings (admin only)
- Logout

### Breadcrumbs

Only on the session detail page: `Sessions > session-filename.cast`

The breadcrumb replaces the current "Back" link and adds context.

### Why No Sidebar

RAGTS has exactly two primary views: the session list and the session detail. There is no navigation tree, no nested hierarchy, no multi-section dashboard. A sidebar would waste 200-280px of horizontal space on every page for navigation that fits in a top bar with room to spare. Terminal content is already width-constrained; sacrificing horizontal space is particularly costly.

### When This Breaks Down

If RAGTS later adds: admin dashboards, workspace management pages, analytics views, or multi-object types (e.g., "Libraries" alongside Sessions), the flat top-nav will need a secondary nav tier (horizontal tabs below the header) or a responsive sidebar. That is a future concern. The current scope (sessions + auth + curation) fits the flat model.

### Session-to-Session Navigation

The PO did not address how users navigate between sessions without returning to the list. Two options to include in the design:

- **Previous / Next arrows** in the session detail header (server provides adjacent session IDs)
- **Keyboard shortcuts** (left/right arrow or j/k) for power users

The designer should mock up the previous/next arrows as part of DS-5.

## Decision 3: Curation UX -- Slide-Over Panel, Not Modal

**Decision: The curation interface (DS-9) should be a right-side slide-over panel, not a modal.**

### Rationale

The PO specified a modal. That works for simple interactions (upload, edit metadata) where the user's focus temporarily shifts away from the content. Curation is different:

1. **Context is critical.** The user is annotating a specific section of terminal output. They need to see that output while annotating. A modal covers it.
2. **The form is substantial.** Title, tags, notes, retrieval intent -- this is not a quick 2-field form. A modal either gets too tall or forces scrolling within the modal, both of which are poor UX.
3. **Iteration is common.** Curators often annotate multiple sections in sequence. Closing and reopening a modal for each section adds friction. A panel can stay open while the user scrolls through sections and clicks "Curate" on each one.

### Slide-Over Specification

```
+--------------------------------------------------------------------+
| [RAGTS]  [workspace]                           [Upload] [avatar v] |
+--------------------------------------------------------------------+
|                                          |                         |
|  Terminal content (shrinks to ~65%)      |  Curation Panel (~35%)  |
|                                          |  Section: "label"       |
|  [section header]                        |  [preview: 3 lines]     |
|  terminal output continues...            |                         |
|  ...                                     |  Title: [___________]   |
|  [section header] <- active section      |  Tags: [pill] [pill] +  |
|  terminal output...                      |  Notes: [textarea]      |
|                                          |  Intent: [dropdown]     |
|                                          |                         |
|                                          |  [Save]  [Cancel]       |
+--------------------------------------------------------------------+
```

- Panel slides in from the right, pushes terminal content to ~65% width
- Terminal remains scrollable and interactive (user can re-read the section)
- Panel header shows section label + compact preview (first 3 lines of terminal output, monospace)
- Panel stays open between curations; user can click a different section header's "Curate" button and the panel updates in-place
- Close via Cancel, X button, or Escape key

### Fallback for Small Viewports

Below 1024px, the slide-over becomes a full-screen overlay (same as a modal in practice). Terminal content is hidden. This is an acceptable degradation because curation on small screens is inherently compromised.

## Decision 4: Upload -- Inline Zone + Global Trigger

**Decision: Keep the inline upload zone on the landing page. Add a global upload button in the header that triggers a modal.**

The PO already specified this. Confirming it and adding specifics:

- **Landing page:** The upload zone is the primary call-to-action in empty state. In populated state, it collapses to a smaller strip above the session list (not hidden -- always one click away).
- **Header button:** An "Upload" button in the top-right area of the header. Clicking it opens the upload modal (DS-7) from any page.
- **The modal and the inline zone share the same interaction pattern:** drag-and-drop + file picker + agent type selection. The modal wraps this in a dismissible overlay.

## Decision 5: What the PO Got Right (No Changes)

These items from the requirements are sound as specified:

- **DS-1 (Three visual directions):** Correct approach. Prevents premature commitment.
- **DS-2 (Design tokens):** Essential for consistency. Named tokens, not raw values.
- **DS-3 (Component library):** The component list is comprehensive. No additions needed.
- **DS-4 (Landing page):** Empty state + populated state, search bar + agent filter. Good.
- **DS-5 (Session detail):** Terminal chrome + sticky headers + fold/unfold. Good. Adding: previous/next session navigation and a 404 state for deleted/nonexistent sessions.
- **DS-6 (Auth screens):** Login + registration + bootstrap. Good. Adding: extracting bootstrap to its own route.
- **DS-7 (Upload modal):** States are well-defined (pre-drop, dropped, uploading, success). Good.
- **DS-8 (Session edit modal):** Simple and appropriate for the interaction. Good.

## Decision 6: Missing States and Micro-Screens to Design

The PO mentioned DS-13 (empty/error states) as nice-to-have. Several of these states are must-design because they appear in the normal flow, not just edge cases:

### Must-Design States (Promoted from Nice-to-Have)

| State | Where It Appears | Why Must-Design |
|-------|-----------------|-----------------|
| 404 Not Found | `/:pathMatch(.*)` catch-all | Users hit broken links, deleted sessions |
| Session processing | `/session/:id` when `detection_status !== 'completed'` | Every session passes through this state after upload |
| Session failed | `/session/:id` when `detection_status === 'failed'` | Users need to know what went wrong and what to do |
| Loading skeletons | Landing page (session list), Session detail (terminal) | Every page load shows these; they set perceived performance |
| Empty search results | Landing page with active filters | Common interaction, needs personality |

### Nice-to-Have States (Remain Deferred)

| State | Where | Why Deferrable |
|-------|-------|---------------|
| Network error banner | Global | Can use a generic toast pattern |
| Upload size limit exceeded | Upload zone/modal | Can use inline error pattern |
| Concurrent session limit | Upload zone/modal | Future concern |

## Decision 7: Session Detail Page -- Expanded Scope

The session detail page (`/session/:id`) is the core experience. The PO's specification is good but needs several additions:

### Page States (4 total, not 1)

1. **Loading** -- Skeleton placeholder while session data loads
2. **Ready** -- Full terminal document with sections, fold/unfold, curation affordances
3. **Processing** -- Session uploaded but sections still being detected. Show available content (if any) with a persistent info banner: "Sections are being detected. This page will update automatically."
4. **Error/Not Found** -- Session does not exist (deleted or bad ID) or processing failed

### Header Additions

- Previous / Next session arrows (for sequential navigation)
- Session status indicator (processing badge if not yet complete)
- Delete button (with confirmation)

## Consequences

### Positive

- Complete route map eliminates discovery of missing pages during implementation
- Slide-over panel for curation preserves context, reducing cognitive load
- First-run bootstrap as a separate route simplifies auth guard logic
- Promoted must-design states prevent "unstyled" states in the shipped product

### Negative

- The slide-over panel is more complex to implement than a modal (responsive behavior, panel push vs overlay)
- More screens to design (13 routes + 3 overlays + 5 promoted states vs the PO's 7 + 2 + 0)
- Previous/next session navigation requires a new API endpoint

### Risks

- The curation slide-over has not been user-tested; it may feel heavy for simple annotations
  - Mitigation: the panel's content is modular -- if users want a lighter interaction, the panel can be simplified without changing the interaction model
- The route map assumes auth will be implemented as described in ARCHITECTURE.md; if the auth model changes significantly, routes may need revision
  - Mitigation: the route map is a design artifact, not code; updating mockups is lower cost than refactoring implemented routes

## Approval

- [x] Reviewed by user
- [x] Approved for design execution (2026-02-27)
