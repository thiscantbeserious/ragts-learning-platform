# PLAN: Design System Bootstrap

Branch: design-system-bootstrap
Date: 2026-02-27
Status: Approved
Depends on: ADR.md approval

## Stages Overview

| Stage | Deliverable | Owner | Depends on |
|-------|------------|-------|------------|
| 0 | Current app audit + observation document | Frontend Designer | Nothing |
| 1 | Three visual directions (DS-1) | Frontend Designer | Stage 0 |
| 2 | User picks direction | User | Stage 1 |
| 3 | Design tokens (DS-2) | Frontend Designer | Stage 2 |
| 4 | Component library (DS-3) | Frontend Designer | Stage 3 |
| 5 | Landing page mockups (DS-4) | Frontend Designer | Stage 4 |
| 6 | Session detail page mockups (DS-5) | Frontend Designer | Stage 4 |
| 7 | Auth screens (DS-6) | Frontend Designer | Stage 4 |
| 8 | Upload modal (DS-7) | Frontend Designer | Stage 4 |
| 9 | Session edit modal (DS-8) | Frontend Designer | Stage 4 |
| 10 | Curation slide-over (DS-9) | Frontend Designer | Stage 6 |
| 11 | 404 + error states (promoted from DS-13) | Frontend Designer | Stage 4 |

Stages 5 through 9 are parallelizable (no file overlap, all depend on Stage 4 only).
Stage 10 depends on Stage 6 because the curation panel coexists with the session detail layout.
Stage 11 can run in parallel with Stages 5-9.

---

## Shared CSS Convention

All stage HTML files import shared CSS via `<link>` tags:
```html
<link rel="stylesheet" href="../shared/layout.css">
<link rel="stylesheet" href="../shared/components.css">  <!-- Stage 4+ -->
```

**File structure:**

| File | Purpose | Contents |
|------|---------|----------|
| `shared/layout.css` | Foundation | Design tokens (`:root`), Google Fonts import, reset (`*`, `body`), grid/layout utility classes |
| `shared/components.css` | Reusable UI | Component styles consumed by multiple stages (introduced in Stage 4, imported by Stages 5+) |
| `stage-N/*.html` | Page-specific | Styles in `<style>` block — no `:root`, no grid class duplication |

**What lives where:**

| Category | File | Examples |
|----------|------|----------|
| Design tokens | `layout.css` | `--accent-primary`, `--text-base`, `--space-4`, `--radius-md` |
| Reset + body base | `layout.css` | `* { box-sizing }`, `body { font-family }` |
| Layout utilities | `layout.css` | `.container`, `.grid`, `.grid--2col`, `.grid--sidebar`, `.grid--holy-grail` |
| Reusable components | `components.css` | Buttons, inputs, badges, cards, modals, toasts (Stage 4+) |
| Page-specific styles | `stage-N/*.html` | Demo visualizations, section layouts, page-only presentation |

**Available grid classes (from `layout.css`):**

| Class | Columns | Use case |
|-------|---------|----------|
| `.grid` | — (base) | Sets `display: grid` + `gap: var(--grid-gap)` |
| `.grid--auto-fill` | `repeat(auto-fill, minmax(200px, 1fr))` | Responsive card grids |
| `.grid--2col` | `repeat(2, 1fr)` | Two equal columns |
| `.grid--3col` | `repeat(3, 1fr)` | Three equal columns |
| `.grid--sidebar` | `var(--progress-width) 1fr` | Sidebar + content |
| `.grid--holy-grail` | `var(--progress-width) 1fr var(--progress-width)` | Sidebar + content + sidebar |

All multi-column grids collapse to single column below 768px viewport.

**Rules:**
- No `:root` block in individual stage HTML files — all tokens live in `layout.css`
- Use shared `.grid--*` classes for layout — don't redefine them in stage files
- `var()` cannot be used inside `repeat(auto-fill, ...)` — use raw px values with a comment
- Component styles reused across stages go in `components.css`, not in stage HTML
- Stage-specific presentation styles stay in the HTML file's `<style>` block

---

## Stage 0: Explore the Current Application

**Owner:** Frontend Designer
**Depends on:** Nothing
**Output:** Observation document (text in Penpot or markdown) + screenshots

### Tasks

- [ ] 0.1: Start the dev server (`npm run dev` from the project root)
- [ ] 0.2: Browse the landing page at `http://localhost:5173`
- [ ] 0.3: Upload the sample `.cast` file from `fixtures/sample.cast` via drag-and-drop
- [ ] 0.4: Wait for processing to complete, then navigate to the session detail page
- [ ] 0.5: Interact with fold/unfold on section headers
- [ ] 0.6: Scroll through the terminal document, noting how terminal content renders
- [ ] 0.7: Screenshot each of the following states:
  - Landing page (empty, before any uploads)
  - Landing page (populated, after upload)
  - Session detail page (sections expanded)
  - Session detail page (sections collapsed)
  - Upload zone (dragging state if possible)
  - AppHeader (the top bar)
- [ ] 0.8: Document observations — what works, what feels rough, what is missing. Specifically note:
  - Color usage (hardcoded hex values, no token system)
  - Spacing inconsistencies
  - Typography: where is monospace used vs system-ui?
  - Interactive affordances: are buttons obvious? Is fold/unfold discoverable?
  - Missing UI: no search, no filters, no agent badges, no edit, no auth
  - Terminal rendering: readability, line density, scroll behavior
  - Overall personality: does the current UI reflect the product's irreverent voice?

### Exit Criteria

Designer has screenshots and a written list of observations. This document is the baseline that all three visual directions react to — either preserving what works or deliberately replacing what does not.

---

## Stage 1: Three Visual Directions (DS-1)

**Owner:** Frontend Designer
**Depends on:** Stage 0
**Output:** Three Penpot pages, each containing a complete direction with the artifacts listed below

### What Each Direction Must Include

For each of the three directions, create a single Penpot page containing:

1. **Color palette** — Background layers (3-4 levels: page bg, card bg, elevated surface, overlay). Primary accent + secondary accent. Status colors (success, warning, error, info). Text hierarchy (primary, secondary, muted, disabled).

2. **Typography specimen** — Heading hierarchy (h1-h4), body text, small/meta text, monospace specimen. Font family choices with rationale. If proposing a web font, show the fallback stack too.

3. **Spacing and shape** — Spacing scale (4px, 8px, 12px, 16px, 24px, 32px, 48px or equivalent). Border radius philosophy (sharp, slightly rounded, or pill). Border/divider treatment.

4. **Mood description** — 2-3 sentences describing how this direction feels. Is it austere and technical? Warm and approachable? Sharp and editorial? The description helps the user make an intuitive choice.

5. **Sample screen** — The landing page (populated state) rendered in this direction. This is the primary comparison artifact. Include: header with brand, session cards with metadata, search bar, upload zone (collapsed position), and at least one toast notification.

### Direction Guidance

The designer has full creative freedom. These are suggested starting points, not mandates:

- **Direction A:** Could lean into the terminal aesthetic — monospace-heavy, minimal chrome, the UI feels like a well-designed TUI application running in a browser. High contrast, sharp edges, dense information.

- **Direction B:** Could lean into the developer-tool aesthetic — think VS Code / GitHub Dark. Familiar surfaces, rounded cards, syntax-highlighting-inspired accents. Professional, polished, recognizable.

- **Direction C:** Could break from both — an editorial or magazine-like reading experience. Serif or humanist sans headings, generous whitespace, the terminal content is framed as the "hero artifact" surrounded by elegant controls. Less typical for dev tools, more distinctive.

The designer should push at least one direction into unexpected territory. If all three feel like minor variations on "dark theme with blue accent," the exploration is too conservative.

### Hard Constraints (Apply to All Directions)

- Terminal content areas: monospace, high-contrast, readable. This is the only non-negotiable visual constraint.
- The RAGTS brand name must be visible and recognizable in the header
- Web fonts are encouraged — they give the product uniqueness. Show fallback stacks for implementation.
- Everything else is open: dark, light, mixed, color palette, layout density, typography personality. The designer owns these choices.

### Exit Criteria

- Three distinct directions, each on its own Penpot page
- Each direction has all 5 artifacts listed above
- Directions are visually distinguishable from each other (not three shades of the same idea)
- Ready for user review and selection

---

## Stage 2: Direction Selection (User Gate)

**Owner:** User
**Depends on:** Stage 1

The designer presents the three directions. The user selects one, requests a hybrid, or asks for revisions.

### Exit Criteria

- User has explicitly chosen a direction (or described a hybrid)
- Designer has confirmed understanding of the choice
- Any hybrid instructions are unambiguous

**The designer MUST NOT proceed to Stage 3 without explicit user approval.**

---

## Stage 3: Design Tokens (DS-2)

**Owner:** Frontend Designer
**Depends on:** Stage 2 (direction chosen)
**Output:** One Penpot page: "Design Tokens"

### Token Categories to Formalize

Take the chosen direction and extract every visual value into named tokens:

1. **Color Tokens**
   - `color-bg-page`, `color-bg-surface`, `color-bg-elevated`, `color-bg-overlay`
   - `color-accent-primary`, `color-accent-secondary`
   - `color-status-success`, `color-status-warning`, `color-status-error`, `color-status-info`
   - `color-text-primary`, `color-text-secondary`, `color-text-muted`, `color-text-disabled`
   - `color-text-inverse` (for text on accent backgrounds)
   - `color-border-default`, `color-border-strong`, `color-border-accent`
   - `color-terminal-bg`, `color-terminal-text` (specific to terminal chrome areas)

2. **Typography Tokens**
   - Font families: `font-family-body`, `font-family-mono`, `font-family-heading` (if different)
   - Size scale: `font-size-xs` through `font-size-2xl` (at least 6 steps)
   - Weight scale: `font-weight-normal`, `font-weight-medium`, `font-weight-bold`
   - Line height: `line-height-tight`, `line-height-normal`, `line-height-relaxed`

3. **Spacing Tokens**
   - Scale: `space-1` (4px) through `space-12` (48px) or equivalent
   - Named shortcuts: `space-inline` (horizontal padding), `space-stack` (vertical margin between elements)

4. **Shape Tokens**
   - `radius-sm`, `radius-md`, `radius-lg`, `radius-full` (pill)
   - `shadow-sm`, `shadow-md`, `shadow-lg` (elevation levels)

5. **Animation Tokens**
   - `duration-fast` (150ms), `duration-normal` (250ms), `duration-slow` (400ms)
   - `easing-default` (ease-out or equivalent)

### Penpot Organization

- All tokens defined as Penpot color/typography library entries where the tool supports it
- A reference page showing all tokens with their names and values
- Annotation: which tokens map to CSS custom properties in implementation

### Exit Criteria

- Every visual value in the chosen direction is captured as a named token
- No raw hex values, pixel sizes, or unnamed font choices remain
- The token page is the single source of truth for all subsequent mockups

---

## Stage 4: Component Library (DS-3)

**Owner:** Frontend Designer
**Depends on:** Stage 3
**Output:** One or more Penpot pages: "Components"

### Components to Design (All States)

For each component, design every relevant state as a separate frame:

**Button**
- Variants: primary, secondary, ghost, destructive
- States per variant: default, hover, active, disabled, loading (spinner)
- Sizes: default, small (for inline/compact use)

**Input**
- Text input with label, with helper text, with error message
- States: default, focused, filled, disabled, error
- Password variant (with show/hide toggle)

**Dropdown / Select**
- Closed state, open state with option list, with search/filter, selected state
- Multi-select variant (for tags)

**Badge**
- Agent type badges (Claude, Claude Code, Gemini CLI, Codex, custom)
- Section type badges (Marker, Detected)
- Status badges (processing, completed, failed)
- Size: default (for cards), small (for section headers)

**Card**
- Session card: default, hover, with agent badge, with processing indicator
- Show filename (monospace), agent type badge, marker count, section count, upload date, file size

**Modal Shell**
- Overlay + centered card
- Header (title + close X), body (scrollable), footer (action buttons)
- Backdrop: dark semi-transparent

**Slide-Over Panel**
- Right-side panel, same header/body/footer pattern as modal
- Show the panel both in isolation and in context (alongside terminal content)

**Toast**
- Success, error, info variants
- With dismiss button
- Stacked (show how multiple toasts arrange)

**Section Header**
- Expanded state, collapsed state
- Marker type vs Detected type (visually distinct)
- Hover state showing "Curate" affordance
- Show line range metadata

**Terminal Chrome**
- The container frame for terminal content
- Top bar (optional faux traffic lights or minimal title bar)
- Content area with monospace text
- Show with section headers inside (sticky)

**Search Bar**
- Input with search icon, clear button
- With adjacent filter pills (agent type filters)
- Active filter state (pill highlighted)

**Upload Zone**
- Default state (dashed border, icon, text)
- Drag-over state (highlighted border, background shift)
- Uploading state (progress indicator)
- Compact variant (for populated landing page, collapsed strip)

**Navigation: Header**
- Full header bar: brand, workspace switcher (placeholder), upload button, user avatar menu
- User menu open state
- Responsive: what collapses at narrow widths

**Navigation: Breadcrumb**
- Session detail breadcrumb: "Sessions > filename.cast"

**Previous / Next Arrows**
- Session-to-session navigation controls
- Disabled state (first/last session)

### Exit Criteria

- Every component listed above has all its states as separate frames
- All components use only tokens from Stage 3 (no raw values)
- Components are organized as reusable Penpot components where the tool supports it
- Interactive states (hover, active, disabled, error) documented for every interactive component

---

## Stage 5: Landing Page Mockups (DS-4)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Landing Page"

### Frames to Produce

1. **Empty state (first-run, no sessions)**
   - Upload zone centered and prominent (this is the ONLY action)
   - Personality-driven empty state copy (not "No data found")
   - Hint linking to AGR for recording sessions
   - Full header visible (but no workspace switcher, no user menu if pre-auth)

2. **Populated state (sessions exist)**
   - Upload zone in collapsed/compact position (strip above list, or button in header triggers modal)
   - Search bar (left) + agent type filter pills (right) above session list
   - Session cards: 4-6 cards showing variety (different filenames, agent types, file sizes, dates)
   - One card in "processing" state (spinner/pulse)
   - Full header with all slots filled

3. **Empty search results**
   - Active search term visible in search bar
   - Active filter pills selected
   - "No sessions match" message with personality
   - Clear/reset affordance

4. **Loading state**
   - Skeleton placeholders for session cards (3-4 skeleton cards)
   - Search bar and filters visible but disabled/muted

### Design Notes

- Session cards should show: filename (monospace), agent type badge, marker count, detected section count, upload date, file size
- Card hover state should be visible on at least one card
- The landing page max-width is currently 720px; the designer may adjust this if the card layout benefits from more width

### Exit Criteria

- [ ] All 4 frames produced
- [ ] Empty state has personality-driven copy
- [ ] Populated state shows search + filters + diverse cards
- [ ] Processing card state visible
- [ ] Loading skeleton state visible
- [ ] All components use DS-3 library components

---

## Stage 6: Session Detail Page Mockups (DS-5)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Session Detail"

### Frames to Produce

1. **Full render (sections expanded)**
   - Page header: back/breadcrumb + filename (monospace) + agent badge + edit button + prev/next arrows
   - Terminal chrome fills remaining vertical space
   - 3-4 sections visible, expanded, with sticky headers
   - Section headers show: chevron, label, type badge (Marker vs Detected with visual distinction), line range, "Curate" affordance on hover
   - Terminal content: realistic-looking monospace text (can be placeholder but should look like terminal output, not lorem ipsum)

2. **Collapsed sections**
   - Same layout, but 2 of the sections are collapsed
   - Collapsed visual treatment: opacity reduction, chevron rotated, content hidden
   - One section expanded for contrast

3. **Curation affordance on hover**
   - One section header in hover state
   - "Curate" button/icon visible on the right edge of that header
   - Annotation: "clicking this opens the curation panel (Stage 10)"

4. **Processing state**
   - Session uploaded but detection not complete
   - Info banner at top of terminal chrome: "Sections are being detected. This page will update automatically."
   - Show partial content if available, or a pulsing placeholder if not

5. **Not found / error state**
   - Session ID does not exist or loading failed
   - Personality-driven error message
   - Link back to session list

### Design Notes

- Terminal content max-width is currently 960px; designer may adjust
- Section header for "Marker" type should have a distinct visual treatment (e.g., left accent border in a different color) vs "Detected" type
- Previous/next arrows should be subtle but discoverable -- integrated into the page header, not floating

### Exit Criteria

- [ ] All 5 frames produced
- [ ] Marker vs Detected sections are visually distinct beyond badge text
- [ ] Curation affordance is visible and annotated
- [ ] Processing state has informative banner
- [ ] Previous/next session navigation visible in header
- [ ] Terminal content is realistic and readable

---

## Stage 7: Auth Screens (DS-6)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Auth"

### Frames to Produce

1. **Login page (`/login`)**
   - Centered card on dark page background
   - RAGTS brand mark at top of card
   - Email + password fields (using DS-3 input component)
   - "Sign in" primary button
   - Divider: "or continue with"
   - 1-2 generic OIDC provider buttons (e.g., "Continue with SSO" -- do not design for specific providers)
   - "Create an account" link below (conditionally visible when open registration is enabled)
   - "Forgot password?" link (placeholder, no target page needed)

2. **Registration page (`/register`) -- open mode**
   - Same centered card layout
   - Email, password, confirm password fields
   - "Create account" primary button
   - "Already have an account? Sign in" link

3. **Registration page (`/register`) -- invite-only mode**
   - Same centered card layout
   - Invite code / token field (single field)
   - Explanatory text: "Registration requires an invite code from your workspace administrator"
   - "Continue" button
   - If valid code: reveal email + password fields (or navigate to a second step)

4. **First-run bootstrap (`/setup`)**
   - Same centered card layout but with different tone
   - Heading: "Set up RAGTS" or similar
   - Explanatory text: "Create the first administrator account to get started"
   - Email + password + confirm password fields
   - "Create admin account" primary button
   - No links to login/register (there are no accounts yet)

### Design Notes

- Auth pages have no header/nav -- they are standalone centered cards
- Background should reinforce brand identity (subtle gradient, pattern, or just solid dark)
- Forms should demonstrate the input component's error state (at least one field showing validation error in one frame)
- The bootstrap page should feel like a welcome/setup experience, not a registration form

### Exit Criteria

- [ ] All 4 frames produced
- [ ] Login shows both email/password and OIDC patterns
- [ ] Invite-only registration variant is distinct from open registration
- [ ] Bootstrap page has setup/welcome tone
- [ ] At least one input field shows error/validation state

---

## Stage 8: Upload Modal (DS-7)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Upload Modal"

### Frames to Produce

1. **Pre-drop state** — Modal open, empty drag-and-drop zone, agent type dropdown (default: Claude), "Browse files" button
2. **File dropped state** — File selected, showing filename + file size preview, agent type confirmed, "Upload" primary button enabled
3. **Uploading state** — Progress indicator (determinate or indeterminate), disabled controls
4. **Success state** — Checkmark, "Session uploaded successfully" message, "Open session" link, modal auto-closes after delay or on click

### Design Notes

- The modal uses the DS-3 modal shell component
- Agent type dropdown options: Claude, Claude Code, Gemini CLI, Codex, Other (free text)
- The drag-and-drop zone inside the modal should match the visual language of the landing page upload zone (compact variant)

### Exit Criteria

- [ ] All 4 state frames produced
- [ ] Agent type selection visible
- [ ] File preview (name + size) visible in dropped state
- [ ] Uses DS-3 modal and dropdown components

---

## Stage 9: Session Edit Modal (DS-8)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Session Edit Modal"

### Frames to Produce

1. **Editing state** — Modal with editable fields: filename (text input, monospace), agent type (dropdown). Read-only display: upload date, file size, section count. Save + Cancel buttons.
2. **Save success** — Modal closes, toast appears ("Session updated")

### Design Notes

- Triggered by pencil/edit icon on session detail page header
- Simple and quick -- this is a lightweight interaction
- Read-only fields should be visually distinct from editable fields (no border, muted text, or label-value layout)

### Exit Criteria

- [ ] Both frames produced
- [ ] Editable vs read-only fields are visually distinct
- [ ] Uses DS-3 modal, input, dropdown, button, and toast components

---

## Stage 10: Curation Slide-Over Panel (DS-9)

**Owner:** Frontend Designer
**Depends on:** Stage 6 (session detail layout)
**Files:** Penpot page "Curation Panel"

### Frames to Produce

1. **Panel open, in context** — The session detail page with the curation panel slid in from the right. Terminal content shrinks to ~65% width. Panel shows:
   - Section label (from the curated section)
   - Compact preview: first 3 lines of terminal content from the section (monospace, muted)
   - Title field: text input (override auto-detected label)
   - Tags field: multi-select with free-form input and suggestions
   - Notes field: textarea (markdown-lite, optional)
   - Retrieval intent: dropdown/radio (Debugging pattern, Architecture decision, Error recovery, Workflow example, Other)
   - Save curation + Cancel buttons

2. **Panel with populated data** — Same layout but fields are filled in (show what a completed curation looks like before saving)

3. **Panel standalone (for component reference)** — The panel isolated from the page context, showing full height and all fields. This is the reference for implementation.

### Design Notes

- The curation panel is the product's differentiating feature. It should feel intentional and purposeful -- not an afterthought or a tacked-on form
- The section preview (3 terminal lines in monospace) connects the annotation to the content. It reminds the user what they are curating
- Tags should look like pills/chips with an "add" affordance
- The retrieval intent field explains to the user WHY they are curating: this annotation will be used by agents. Copy/microcopy should reinforce this
- Below 1024px viewport width: panel becomes full-screen overlay

### Exit Criteria

- [ ] All 3 frames produced
- [ ] Panel coexists with terminal content in the in-context frame
- [ ] Section preview is visible and in monospace
- [ ] Tags use pill/chip pattern
- [ ] Retrieval intent has clear options
- [ ] The panel feels intentional, not like a hastily attached form

---

## Stage 11: 404 and Error States (Promoted from DS-13)

**Owner:** Frontend Designer
**Depends on:** Stage 4
**Files:** Penpot page "Error States"

### Frames to Produce

1. **404 Not Found page** — Full page with header. Personality-driven message (not "Page not found"). Link back to session list. The copy should match the product's irreverent voice.

2. **Session loading skeleton** — Skeleton placeholder for the session detail page while data loads. Terminal chrome frame with pulsing/shimmer placeholder content.

3. **Session list loading skeleton** — Skeleton placeholder for session cards (3-4 shimmering card shapes).

4. **Session processing banner** — The info banner that appears at the top of the session detail terminal chrome when detection is still running. (This also appears in Stage 6 frame 4, but include it here as a standalone component reference.)

5. **Session failed state** — What the session detail page shows when processing failed. Error message, "Retry" button, link back to session list.

### Design Notes

- Skeleton placeholders should be subtle (low-contrast shimmer, not bright flashing)
- Error states should provide actionable next steps, not just "something went wrong"
- The 404 page is an opportunity for product personality

### Exit Criteria

- [ ] All 5 frames produced
- [ ] 404 has personality-driven copy
- [ ] Skeletons are subtle and realistic (match card/terminal chrome shapes)
- [ ] Error states have actionable messaging

---

## Summary: Full Deliverable Checklist

| Stage | DS Item | Frames | Status |
|-------|---------|--------|--------|
| 0 | Exploration | Screenshots + observations | [ ] |
| 1 | DS-1: Directions | 3 pages (5 artifacts each) | [ ] |
| 2 | User choice | Explicit approval | [ ] |
| 3 | DS-2: Tokens | 1 page (all token categories) | [ ] |
| 4 | DS-3: Components | 1-2 pages (all components, all states) | [ ] |
| 5 | DS-4: Landing | 4 frames | [ ] |
| 6 | DS-5: Session detail | 5 frames | [ ] |
| 7 | DS-6: Auth | 4 frames | [ ] |
| 8 | DS-7: Upload modal | 4 frames | [ ] |
| 9 | DS-8: Session edit modal | 2 frames | [ ] |
| 10 | DS-9: Curation panel | 3 frames | [ ] |
| 11 | Error states | 5 frames | [ ] |
| **Total** | | **~35 frames + 3 direction pages** | |
