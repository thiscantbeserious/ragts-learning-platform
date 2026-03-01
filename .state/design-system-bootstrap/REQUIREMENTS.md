# Requirements: Frontend MVP Design Sprint

## Problem Statement

The current RAGTS frontend has zero design system — raw hardcoded colors, no spacing tokens, no visual identity, no navigation model beyond a back link. The product works but looks like a prototype. Before the next wave of features (auth, curation, search) lands, the frontend needs a coherent visual design so those features can be built into something intentional, not bolted onto a blank scaffold.

This is a design-only cycle. The deliverable is Penpot mockups, not code.

## Desired Outcome

A complete set of high-fidelity mockups in Penpot that covers every screen and component the frontend will need through MVP v3 and into the next cycle (auth, curation). From these mockups, an engineer can implement without making design decisions on the fly.

The visual identity should read as: developer tool with personality. Dark, terminal-native, monospace where it matters, but not austere — the irreverence in the README should be visible in the UI.

## Information Architecture

### Navigation Model

Flat, top-nav-anchored layout. No sidebar. RAGTS is not a complex dashboard app — it is a reader and curator. A persistent top bar with brand + optional workspace context + user menu is sufficient. Depth is handled by breadcrumbs inside page content, not by persistent nav panels.

```
[ RAGTS brand ] [ workspace switcher (deferred) ]         [ user menu ]
--------------------------------------------------------
  page content
```

### Route Map (Design Scope)

| Route | Screen | Priority |
|-------|--------|----------|
| `/` | Landing — upload zone + session list | Must-design |
| `/session/:id` | Session detail — terminal document with fold/unfold | Must-design |
| `/login` | Login screen (built-in email/password + OIDC button) | Must-design |
| `/register` | Registration (invite-only or open, flag-controlled) | Must-design |
| `modal: upload` | Upload flow with agent type selection | Must-design |
| `modal: session-edit` | Edit session metadata (filename, agent type) | Must-design |
| `modal: curation` | Annotate/tag a selected segment | Must-design |
| `/settings` | User settings + workspace settings (admin) | Nice-to-have |
| `/workspaces` | Workspace switcher / creation (multi-tenancy) | Nice-to-have |

## Design Process

### Step 0: Explore the Current App
Before designing anything, the designer MUST browse the running application to understand what exists today. Start the dev server (`npm run dev`), navigate the landing page and session detail page, upload a sample `.cast` file if none exist, interact with fold/unfold, and take screenshots of the current state. Understanding the existing UX — what works, what feels rough, what's missing — is essential context for the design exploration.

### Step 1: Three Directions (DS-1)
Present 3 distinct visual directions. User picks one or requests a hybrid.

### Step 2: Tokens + Components (DS-2, DS-3)
Formalize the chosen direction, build out the component library.

### Step 3: Full Mockups (DS-4 through DS-9)
Design all screens and modals using the finalized tokens and components.

## Scope

### In Scope — Must Design

**DS-1: Design Exploration — 3 Theme Directions**
The designer presents **three distinct visual directions** for the platform. Each direction should include: color palette, typography choices, surface hierarchy, accent colors, and overall mood. The user picks one (or a hybrid) before the designer proceeds to full mockups.

Each direction must define:
- Background + surface layer hierarchy (3–4 levels)
- Primary accent color + secondary accent
- Status colors (success, warning, error, info)
- Text hierarchy (primary, secondary, muted)
- Typography choices (the designer is free to explore beyond system-ui/monospace — web fonts are allowed if they add real value)
- Spacing scale and border radius philosophy (sharp vs rounded, tight vs airy)
- Overall mood/personality (how does this direction *feel*?)

The designer has full creative freedom here. The current `#0f0f0f` + `#4a9eff` is a starting point, not a constraint. Dark theme is the expectation but not necessarily the only option — if a direction works better with a different base, explore it.

The only hard constraint: terminal content areas must remain highly readable with monospace text. Everything else is open.

**DS-2: Design Tokens (after direction is chosen)**
Formalize the chosen direction into named tokens: color palette, typography scale, spacing scale, border radius, shadow levels. Codify in Penpot so all components reference tokens, not raw values.

**DS-3: Component Library (Penpot frames)**
Core interactive components to mock up:

- Button: primary, secondary, ghost, destructive — all states (default, hover, active, disabled, loading)
- Input: text, with label, with helper text, error state
- Dropdown / Select: closed, open, with options, with search
- Badge: agent type, section type (Marker vs Detected), status
- Card: session card — default, hover, with agent badge, with processing state
- Modal: base shell with overlay, header, body, footer — used for upload, edit, curation
- Toast: success, error, info
- Section header: collapsed, expanded, marker type vs detected type (already visually distinct in code)
- Terminal chrome: the container that frames terminal content — border, radius, top-bar aesthetic (optional faux traffic lights)

**DS-4: Landing Page**
Screen showing the full empty state and populated state.

Empty state (first-run):
- Upload zone centered and prominent — this is the only action available, make it clear
- "No sessions yet" messaging with personality — not corporate empty state copy
- Hint to point to AGR for recording

Populated state:
- Upload zone still accessible but less dominant (collapses or moves to a secondary position)
- Session list: cards with filename (monospace), agent type badge, marker count, upload date, file size
- Search bar and agent type filter visible above the list (search box left, filter pills right)
- Processing state: card shows spinner/pulsing state while background job runs
- Empty search state: "No sessions match your search" with clear/reset option

**DS-5: Session Detail Page**
The core reading experience. This is the page users spend the most time on.

Layout:
- Page header: back arrow + session filename (monospace) + agent type badge + edit button (pencil icon)
- Terminal chrome fills remaining vertical space
- Within terminal chrome: sticky section headers + fold/unfold content (matches current implementation direction)

Section header states to design:
- Expanded: label (blue), type badge (Marker / Detected), line range metadata, collapse chevron
- Collapsed: same but opacity-reduced content, arrow points right
- Hover: subtle highlight
- Section header for marker sections vs auto-detected sections should have a visual distinction beyond just the badge text — consider border-left accent color or different badge background

Curation affordance (even if not implemented yet):
- On hover of any section header, a "Curate" affordance appears — a small button or icon-button on the right edge of the header
- On hover of terminal content area, a text-selection-driven annotation trigger could appear (design intent only, not interactive in mockups)

Processing state: if session is still processing, show a non-blocking banner at the top of the terminal chrome explaining sections are still being detected.

**DS-6: Auth Screens**

Login:
- Centered card on dark background
- RAGTS brand mark at top
- Email + password fields
- "Sign in" primary button
- Divider: "or continue with"
- OIDC provider buttons (generic slot — don't design for specific providers, just show the pattern)
- Link to registration if open registration is enabled

Registration:
- Same centered card layout
- Email, password, confirm password
- If invite-only: single token/invite-code field instead of registration form, with explanation
- Submit + back to login link

First-run / bootstrap:
- One-time setup screen: create the first admin account
- Simple form, clear explanation that this is the setup step

**DS-7: Upload Flow (Modal)**
Currently the upload zone is inline on the landing page. This remains the default. But the modal version is needed for when a user wants to upload from the session detail page or from a future sidebar shortcut.

Modal layout:
- Drag-and-drop zone (same visual as landing, sized for modal)
- Agent type select: dropdown, default is "Claude", other options include Claude Code, Gemini CLI, Codex, custom (free text)
- File size + filename preview after drop but before confirm
- Upload progress state
- Success state before modal close

**DS-8: Session Metadata Edit Modal**
Simple inline-editable fields, triggered by the pencil icon on the session detail header.

- Editable: filename (text input, monospace), agent type (dropdown)
- Read-only display: upload date, file size, section count
- Save / Cancel buttons
- Optimistic UI feedback (toast on save)

**DS-9: Curation Modal (Design Intent)**
The curation UX is the product's core differentiator. It doesn't need to be implemented in this cycle, but it needs to be designed so engineers know what they're building toward.

Trigger: user selects a section header "Curate" affordance.

Modal content:
- Section context: shows the section label and a compact preview of the first few terminal lines
- Annotation fields:
  - Title (override the auto-detected label)
  - Tags (multi-select, free-form with suggestions)
  - Notes (optional free text, markdown-lite)
  - Retrieval intent: radio/select for what this segment should teach (e.g., "Debugging pattern", "Architecture decision", "Error recovery", "Workflow example")
- Actions: "Save curation", Cancel

This modal represents what makes RAGTS more than a viewer — the human annotation that creates the retrieval corpus. The design should make it feel intentional and purposeful, not an afterthought.

### In Scope — Nice-to-Have (Design if time allows)

**DS-10: Settings Page**
User-facing settings: change password, notification preferences (stub), API token for agent access.
Admin-facing: workspace name, OIDC configuration display (read-only), member list with roles.

**DS-11: Workspace Switcher**
Header component showing current workspace name + dropdown to switch or create.
Only needed if designing multi-tenancy navigation — can be deferred.

**DS-12: Responsive / Mobile Breakpoints**
The terminal content is wide-format by nature — mobile is a degraded experience and that's acceptable. But the landing page and auth screens should be readable on mobile. Design at 375px and 1280px.

**DS-13: Empty/Error States Catalogue**
A single Penpot page documenting all edge-case states: loading skeletons, error banners, empty lists, 404, session still processing. Ensures these states are intentional, not afterthoughts.

### Out of Scope

- Any implementation (code changes, CSS rewrites, Vue component changes)
- MCP / agent retrieval UI — not a user-facing screen
- Deployment or ops UI
- White-label theming configuration UI (defer — this requires knowing the theming architecture first)
- Notification / webhook configuration UI
- Search indexing / embedding configuration UI
- Session versioning or diff view
- The actual fold/unfold animation behavior — that is an engineering concern, not a mockup concern

## Acceptance Criteria

- [ ] Designer has browsed the running app and documented current state observations
- [ ] DS-1: Three visual directions presented — each with color palette, typography, mood board, and a sample screen mockup (e.g., landing page in each direction)
- [ ] User has chosen a direction (or hybrid) before proceeding
- [ ] DS-2: Token page — color palette, typography scale, spacing scale defined with named tokens in the chosen direction
- [ ] DS-3: Component library page with all listed components in all states
- [ ] DS-4: Landing page — two frames: empty state and populated state (with search bar + filters visible)
- [ ] DS-5: Session detail page — one frame at full render, one frame showing a collapsed section, one frame showing the curation affordance on hover
- [ ] DS-6: Auth screens — login frame, registration frame, first-run/bootstrap frame
- [ ] DS-7: Upload modal — drag-before state, file-dropped state, uploading state, success state
- [ ] DS-8: Session edit modal — editing state and save-success toast
- [ ] DS-9: Curation modal — single frame showing a populated curation in progress
- [ ] All interactive states documented (hover, active, disabled, error) for every component in DS-3
- [ ] Visual consistency: every screen uses only tokens from DS-2 (no one-off hex values)
- [ ] Design is legible and functional in Penpot for a frontend engineer to implement from without asking design questions

## Constraints

- Penpot is the required design tool (it's in the stack — see SDLC overhaul ADR).
- Terminal content areas must remain highly readable with monospace text — this is non-negotiable.
- Design must be implementable in Vue 3 without exotic dependencies.
- Everything else is open: color palette, fonts, dark vs mixed themes, layout approaches — the designer has creative freedom.

## Context

- Current frontend: Vue 3 + Vite, 2 routes, dark theme, minimal styling, hardcoded colors. Working but unstyled.
- Tech stack already decided (see MEMORY.md). Design must be implementable in Vue 3 without exotic dependencies.
- MVP v3 features being designed for: agent type badges (FR-v3-4), search/filter (FR-v3-5), session metadata editing (FR-v3-6).
- Post-MVP v3 features being designed for: authentication, curation UX.
- Curation is the product differentiator. DS-8 must communicate this clearly even if it's the last thing built.
- The product has irreverent personality (see README). This should be visible in empty states, onboarding copy, and the first-run experience — not just in the code comments.

---
**Sign-off:** Approved (with designer creative freedom on themes/colors, 3-direction exploration)
