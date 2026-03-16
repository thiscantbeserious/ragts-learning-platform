# Requirements: Main Toolbar and Icon Library Migration

## Problem Statement

Erika's application header has an empty right section and a broken icon system. There is no user presence, no pipeline status, no settings entry point. The icon set is 46 hand-drawn SVGs with no expansion path; the settings icon renders as a sun instead of a gear. Together, these gaps block every near-term roadmap item (auth, workspaces, notifications, pipeline transparency).

## Desired Outcome

After implementation:

1. The header contains a glass pill toolbar matching the approved mockup that shows pipeline activity, a settings entry point, a notification placeholder, and the user's avatar — always visible, always in sync with backend state.
2. All 46 custom icons are replaced with Lucide equivalents. Every icon renders correctly and consistently. No icon sizes change.
3. The settings icon is unambiguously gear-shaped.
4. Adding a new icon requires only looking up a Lucide name and writing a single CSS class definition.
5. Lucide's license attribution is properly recorded and referenced.

## Scope

### In Scope

- Glass pill toolbar component implementing the approved mockup
- Pipeline ring showing total sessions in pipeline with dormant/active states
- Pipeline dropdown with Processing, Queued, and Recently Completed sections
- Settings button (gear icon, accessible)
- Bell button (notification placeholder, non-functional)
- User avatar (collapse trigger)
- Toolbar collapse/expand animation — collapsed state shows avatar only
- SSE disconnection indicator on the pipeline ring
- Header overflow fix so the dropdown can extend below the header
- Full Lucide icon migration (all 46 icons)
- Developer documentation for adding new icons
- License attribution file
- Design token extraction from mockup raw values

### Out of Scope

- Settings page or panel
- User authentication, login, registration, and profile management
- Notification system infrastructure (bell is a placeholder)
- Clickable session names in the pipeline dropdown
- Real-time pipeline progress percentage (degrades to a spinner if unavailable)
- Responsive / mobile toolbar behavior
- Animated icon transitions
- Dark / light theme switching

## Functional Requirements

### FR-01 — Glass Pill Toolbar in Header

The header's right section must contain the glass pill toolbar. It must be visually integrated with the existing header and balanced against the breadcrumb on the left.

### FR-02 — Pipeline Ring Count

The progress ring must display the total count of sessions in the pipeline (processing + queued). When active, the ring must glow and the stroke must fill proportionally. When the count is 0, the ring must transition to a visually dormant state.

### FR-03 — Pipeline Ring Transitions

State transitions between dormant and active must be animated and noticeable without requiring user interaction.

### FR-04 — Pipeline Dropdown Opens on Ring Click

Clicking the pipeline ring must open the dropdown panel. The trigger must communicate its expanded/collapsed state to assistive technology.

### FR-05 — Pipeline Dropdown Content

The dropdown must show:
- A header with active/queued summary
- Processing sessions with activity indicator and progress if available
- Queued sessions with position number
- Session names truncated when too long
- No internal infrastructure data (worker counts, thread counts, memory)

### FR-06 — Recently Completed Section

When sessions have completed recently, the dropdown must show a "Recently Completed" section with the last 3–5 sessions, a completion indicator, and relative timestamp. Omitted when empty.

### FR-07 — Dropdown Dismissal

The dropdown must close on outside click and Escape key. Focus must return to the trigger on Escape.

### FR-08 — SSE Disconnection Indicator

When the SSE connection drops, the pipeline ring must show a subtle warning state. When SSE reconnects, the ring must recover and refresh. If the dropdown is open during reconnection, its content must refresh. No disruptive error modals.

NOTE: The disconnection visual is not in the approved mockup — the designer must approve it before implementation.

### FR-09 — Toolbar Collapse / Expand

Clicking the user avatar must toggle between expanded (full pill) and collapsed (avatar only) states with a smooth animation. No layout shift during transition. Collapsed state persists across in-app navigation but not page reloads.

NOTE: The collapsed visual is not in the approved mockup — the designer must approve it before implementation.

### FR-10 — User Avatar

The pill must show a circular avatar with the user's initial on a gradient background. The avatar must be visible in both expanded and collapsed states. Hover produces a border glow.

### FR-11 — Settings Button

A button with a gear icon must be placed inside the pill between the pipeline indicator and the avatar. It must be accessible (labeled for screen readers). The icon must be unambiguously a gear.

### FR-12 — Bell Button Placeholder

A bell icon button must be placed between settings and avatar. It must be accessible. Clicking produces no action.

### FR-13 — Icon Migration

All 46 existing icon classes must be replaced with Lucide equivalents per the mapping in the reference file. This includes icons in: sidebar, session cards, section headers, toolbar, empty states, upload zone, and toast notifications. No existing icon class names change. No icon sizes change.

### FR-14 — Icon Rendering Approach Preserved

Icons must continue to use the same CSS rendering mechanism. Size classes remain unchanged. The rendered pixel sizes do not change.

### FR-15 — Zero New Runtime Dependencies

No new packages, fonts, or external network requests for icons. Icons must be embedded in CSS. Build output structure unchanged.

### FR-16 — Developer Icon Documentation

The icon stylesheet must document the pattern for adding a new icon. A developer must be able to add a new icon in under two minutes following the documented pattern.

### FR-17 — Mockup-First Implementation

The component must be built by copying the approved mockup's HTML/CSS first, then enhancing with reactivity. Not reimplemented from memory.

Approved deviations from the mockup:
- Accessibility attributes added (mockup has only `title`)
- Icon class pattern aligned with the rest of the app
- Collapsed, dormant, and SSE disconnection states added (require designer approval)

### FR-18 — Design Token Extraction

No raw color values in the toolbar component. All colors must reference design tokens — either existing ones or new toolbar-scoped tokens.

### FR-19 — Header Overflow Fix

The header's overflow must be changed to allow the dropdown to render below the header boundary without clipping. No other layout regions affected.

### FR-20 — Keyboard Navigation

All toolbar controls must be reachable and operable by keyboard. Tab order must follow the visual layout. All icon-only buttons must be labeled for screen readers. Dropdown items must be navigable with arrow keys.

### FR-21 — Lucide License Attribution

A third-party license file must exist at the repo root containing the complete license texts for Lucide (ISC) and Feather Icons (MIT). The README must reference it. This is a merge blocker.

### FR-22 — Pipeline Data Source

The toolbar must reuse existing session list and SSE infrastructure. No new backend API endpoints. The component must access only session name, status, and queue position.

### FR-23 — Pipeline Label

The ring trigger must include a text label. The label must visually reflect the dormant/active state. Hidden when collapsed.

### FR-24 — Minimum Viewport Width

The dropdown must render without viewport overflow at widths >= 1024px.

## Non-Functional Requirements

### NFR-01 — Icon Render Performance

Icons must render with zero runtime cost beyond initial CSS parse. No network requests, no JavaScript, no font loading.

### NFR-02 — Animation Performance

All toolbar animations must use CSS only. No JavaScript animation loops. No layout recalculation during transitions.

### NFR-03 — Accessibility

All interactive elements must have ARIA attributes. The dropdown must communicate its state to assistive technology. Decorative icons must be hidden from screen readers.

### NFR-04 — Focus Management

Focus ring visible on all interactive elements. Focus returns to trigger when dropdown closes via Escape.

### NFR-05 — License Compliance

Lucide icons are ISC-licensed (permissive). Attribution is a legal requirement, not optional. Compatible with both AGPL-3.0 and ELv2.

### NFR-06 — Build Stability

Build must complete without errors. No new entry points or unexpected chunks. Network audit shows zero icon-related requests.

### NFR-07 — No Visual Regressions

All existing icons must render at the same sizes and positions. Color inheritance must work as before. Visual regression tests must pass or show only expected Lucide style differences (rounded terminals, adjusted stroke weight).

### NFR-08 — Design Fidelity

The running component must visually match the approved mockup at 1440x900 viewport. Both expanded and dropdown-open states must be verified.

## Acceptance Matrix

| Story | Requirement(s) | Verification |
|-------|---------------|--------------|
| Pipeline awareness | FR-01, FR-02, FR-03 | Screenshot + manual upload test |
| Pipeline inspection | FR-04, FR-05, FR-07 | Screenshot + manual dropdown review |
| Recently completed | FR-06 | Manual: complete session, verify section |
| SSE disconnection | FR-08 | Manual: kill SSE, observe warning, restore |
| Toolbar collapse | FR-09 | Screenshot of collapsed state + manual |
| User presence | FR-10 | Screenshot + visual review |
| Settings access | FR-11 | Screenshot + code review for accessibility |
| Bell placeholder | FR-12 | Screenshot + manual: click produces no action |
| Consistent icons | FR-13, FR-14 | Visual regression screenshots before/after |
| No infra exposure | FR-05, FR-22 | Code review + manual dropdown review |
| Zero runtime deps | FR-15 | Network audit + package.json diff + build diff |
| Icon scalability | FR-16 | Timed exercise: add icon in under 2 minutes |
| Faithful conversion | FR-17, NFR-08 | Screenshot comparison: component vs mockup |
| Token extraction | FR-18 | Code review: search for raw color values |
| Overflow fix | FR-19 | Screenshot: dropdown visible below header |
| Keyboard a11y | FR-20 | Manual: keyboard-only navigation |
| License attribution | FR-21 | File existence + content review |

## Dependencies

1. **Lucide SVG data URIs** — SVG path data for all 46 mappings must be extracted and encoded before implementation.
2. **Icon mapping confirmed** — The reference file must confirm the Lucide name for each existing icon.
3. **Design token inventory** — Raw values in the mockup that don't map to existing tokens must be catalogued.
4. **SSE composable interface confirmed** — Architect must confirm which composable(s) the toolbar uses for pipeline state.
5. **Overflow change risk assessed** — Architect must confirm the header overflow change doesn't break breadcrumb truncation or focus outlines.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| Icon visual regressions at small sizes | Medium | Medium | Visual regression tests; review at xs and sm sizes |
| Overflow change breaks breadcrumb truncation | Medium | Low | Architect confirms approach; test breadcrumb behavior |
| Dropdown z-index conflicts with sidebar | Low | Medium | Verify z-index layering with sidebar open |
| SSE disconnection hard to test in dev | Low | Low | Test helper or manual backend kill |
| Missed raw color value in toolbar CSS | Medium | Low | Code review searches for raw values |
| Collapse animation causes layout shift | Low | Medium | Test at multiple viewport widths |
| License attribution omitted before merge | Low | High | Merge blocker; reviewer checklist |

## References

- **Mockup spec (THE SPEC):** `.state/design-main-toolbar-and-icons/references/draft-2b-lucide.html`
- **Icon mapping:** `.state/design-main-toolbar-and-icons/references/iconography-lucide.html`
- **Stories:** `.state/design-main-toolbar-and-icons/STORIES.md`
- **Vision:** `.state/design-main-toolbar-and-icons/VISION_STEP.md`

---
**Sign-off:** Pending
