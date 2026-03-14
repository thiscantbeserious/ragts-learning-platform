# Sidebar Redesign -- Design Handoff

## Screenshots

- **Before:** `.state/feat/client-design-bootstrap/screenshots/sidebar-before.png`
- **After (mockup):** `.state/feat/client-design-bootstrap/screenshots/sidebar-redesign-mockup.png`
- **Mockup HTML:** `.state/feat/client-design-bootstrap/designs/sidebar-redesign.html`

## Summary of Changes

Four areas of improvement, all CSS-only except one minor template change in SessionCard.vue.

---

## 1. Filter Pills (SidebarPanel.vue scoped styles)

**Problem:** Pills wrap to second line ("Failed" on row 2), generic rounded shape, no visual hierarchy.

**Fix:** Override the global `.filter-pill` sizing in the sidebar context. Compact uppercase labels, rectangular shape, `nowrap`.

### CSS changes to `.sidebar__filters`:

```css
/* BEFORE */
.sidebar__filters {
  padding: var(--space-2) var(--space-3);
  gap: var(--space-1);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
}

/* AFTER */
.sidebar__filters {
  padding: var(--space-1\.5) var(--space-3);
  border-bottom: 1px solid var(--border-default);
  flex-shrink: 0;
  flex-wrap: nowrap;
  gap: var(--space-1);
}
```

### NEW selector -- override pill sizing in sidebar context:

```css
/* Override global filter-pill sizing for sidebar context:
   smaller padding, smaller text to fit all 4 pills on one line. */
.sidebar__filters .filter-pill {
  padding: 2px var(--space-2);
  font-size: var(--text-xs);
  line-height: var(--lh-xs);
  border-radius: var(--radius-sm);
  letter-spacing: var(--tracking-wide);
  text-transform: uppercase;
}
```

Note: Vue scoped styles will scope `.sidebar__filters .filter-pill` correctly since both elements are within the SidebarPanel template. The `.filter-pill` base class comes from the global `components.css`, but scoped descendant selectors will add the data attribute to `.sidebar__filters` and use a descendant combinator.

---

## 2. Session Card (SessionCard.vue)

### Template change (minor)

Move the status dot from AFTER the filename to BEFORE it. The dot becomes a left-aligned visual anchor that creates a scannable vertical line.

```html
<!-- BEFORE: dot on the right -->
<div class="session-card__row session-card__row--primary">
  <span class="session-card__filename">{{ session.filename }}</span>
  <span class="session-card__status-dot" ... />
</div>

<!-- AFTER: dot on the left -->
<div class="session-card__row session-card__row--primary">
  <span class="session-card__status-dot" ... />
  <span class="session-card__filename">{{ session.filename }}</span>
</div>
```

### CSS changes:

```css
/* BEFORE */
.session-card {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: var(--rhythm-quarter) var(--space-3);
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-family: var(--font-body);
  box-sizing: border-box;
  transition: background 120ms ease-out;
}

/* AFTER */
.session-card {
  display: flex;
  flex-direction: column;
  gap: 1px;                                          /* tighter row gap */
  width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: var(--space-1\.5) var(--space-3);         /* slightly more vertical padding */
  background: transparent;
  border: none;
  border-left: 2px solid transparent;
  cursor: pointer;
  text-align: left;
  color: var(--text-primary);
  font-family: var(--font-body);
  box-sizing: border-box;
  transition: background var(--duration-fast) var(--easing-default),
              border-color var(--duration-fast) var(--easing-default);
}
```

```css
/* BEFORE */
.session-card__row--primary {
  justify-content: space-between;
}

/* AFTER */
.session-card__row--primary {
  justify-content: flex-start;
}
```

```css
/* BEFORE */
.session-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* AFTER */
.session-card__row {
  display: flex;
  align-items: center;
  gap: var(--space-1\.5);              /* tighter gap */
  min-width: 0;
}
```

```css
/* BEFORE */
.session-card__status-dot {
  display: inline-block;
  width: var(--space-2);               /* 8px */
  height: var(--space-2);
  border-radius: var(--radius-full);
  flex-shrink: 0;
}

/* AFTER */
.session-card__status-dot {
  display: inline-block;
  width: 6px;                          /* smaller, more subtle */
  height: 6px;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
```

```css
/* BEFORE */
.session-card__filename {
  font-family: var(--font-mono);
  font-size: var(--text-base);         /* 14px */
  line-height: var(--lh-base);
  color: var(--text-primary);
  ...
}

/* AFTER */
.session-card__filename {
  font-family: var(--font-mono);
  font-size: var(--text-sm);           /* 12px -- one step smaller */
  line-height: var(--lh-sm);
  color: var(--text-secondary);        /* dimmer at rest, brighter on hover */
  ...
}
```

```css
/* NEW: filename brightens on hover/selected */
.session-card:hover .session-card__filename,
.session-card--selected .session-card__filename {
  color: var(--text-primary);
}
```

```css
/* BEFORE */
.session-card__meta {
  color: var(--text-muted);
  font-size: var(--text-sm);           /* 12px */
  line-height: var(--lh-sm);
  gap: var(--space-2);
}

/* AFTER */
.session-card__meta {
  color: var(--text-muted);
  font-size: var(--text-xs);           /* 10px -- one step smaller */
  line-height: var(--lh-xs);
  gap: var(--space-2);
  /* Indent to align under filename (past the dot + gap) */
  padding-left: calc(6px + var(--space-1\.5));
}
```

```css
/* NEW: selected hover state (slightly stronger) */
.session-card--selected:hover {
  background: rgba(0, 212, 255, 0.12);
}
```

---

## 3. Custom Scrollbar (SidebarPanel.vue scoped styles)

**Problem:** Native scrollbar is visible and looks out of place.

**Fix:** Add custom thin dark scrollbar to `.sidebar__list-region`.

```css
/* ADD to existing .sidebar__list-region */
.sidebar__list-region {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  /* Custom thin scrollbar */
  scrollbar-width: thin;
  scrollbar-color: var(--border-strong) transparent;
}

/* NEW: Webkit scrollbar overrides */
.sidebar__list-region::-webkit-scrollbar {
  width: 4px;
}

.sidebar__list-region::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar__list-region::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: var(--radius-full);
}

.sidebar__list-region::-webkit-scrollbar-thumb:hover {
  background: var(--text-disabled);
}
```

---

## 4. List Spacing (SidebarPanel.vue scoped styles)

**Problem:** Too much vertical space between cards.

**Fix:** Reduce list padding.

```css
/* BEFORE */
.sidebar__session-list {
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;           /* 8px top/bottom */
  overflow: hidden;
}

/* AFTER */
.sidebar__session-list {
  list-style: none;
  margin: 0;
  padding: var(--space-1) 0;           /* 4px top/bottom */
  overflow: hidden;
}
```

Also remove `overflow: hidden` from `.sidebar__session-item` -- it is unnecessary and could clip focus outlines:

```css
/* BEFORE */
.sidebar__session-item {
  list-style: none;
  overflow: hidden;
}

/* AFTER */
.sidebar__session-item {
  list-style: none;
}
```

---

## Design Rationale

- **Status dot on left:** Creates a vertical column of colored dots that the eye can scan instantly (pre-attentive processing). The current right-aligned dot is lost in visual noise next to truncated filenames.
- **Filename in `text-secondary` at rest:** Reduces visual weight of the dense monospace text. On hover/selected, it brightens to `text-primary` for clear affordance.
- **Uppercase compact pills:** Distinguishes filter controls from content text. Rectangular shape (`radius-sm`) instead of full-round (`radius-full`) feels more intentional and tool-like.
- **1px card gap:** The 4px (`space-1`) inter-row gap was too loose for a dense list. 1px creates a tighter two-line card without cramping.
- **Metadata indent:** Aligning the "0 sections / yesterday" text under the filename (not under the dot) creates a clean left edge for scanning.
- **Custom scrollbar:** 4px thin scrollbar matches the dark theme and does not steal visual space from the 260px sidebar.

## Tokens Used (no magic numbers)

All values reference existing design tokens from `layout.css`:
- `--space-1\.5` (6px), `--space-2` (8px), `--space-3` (12px)
- `--text-xs` (10px), `--text-sm` (12px), `--text-base` (14px)
- `--lh-xs`, `--lh-sm` (baseline-aligned line heights)
- `--border-default`, `--border-strong`, `--text-disabled` (scrollbar colors)
- `--accent-primary`, `--accent-primary-subtle`, `--accent-primary-hover`
- `--radius-sm` (4px), `--radius-full` (9999px)
- `--tracking-wide` (0.06em), `--weight-medium` (500)
- `--duration-fast` (150ms), `--easing-default` (ease-out)

Exception: `6px` for the status dot size and `1px` for the card inter-row gap. These are sub-grid values that don't map to a token. The `2px` pill vertical padding is also below the smallest token.
