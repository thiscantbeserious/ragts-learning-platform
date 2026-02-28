# HTML + CSS Design Utilities

Technical patterns for creating design mockups as standalone HTML files that map directly to Vue 3 SFC components. Use alongside `visual-design-harmony.md` for design principles.

## File Structure

```
.state/design/<branch-name>/
  stage-N/
    <name>.html          # Self-contained mockup (embedded styles)
    <name>.png           # Screenshot for handoff
```

Each HTML file must be self-contained: embedded `<style>`, Google Fonts via CDN, viewable by opening directly in a browser. No external stylesheets, no build step.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Stage N — Description</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=..." rel="stylesheet">
  <style>
    /* Tokens → Layout → Components → States */
  </style>
</head>
<body>
  <!-- Content -->
</body>
</html>
```

## CSS Custom Properties as Design Tokens

All design values are defined as CSS custom properties in `:root`. This maps 1:1 to the token system the frontend engineer will implement.

```css
:root {
  /* Structure: --category-name: value; */
  /* Colors */
  --bg-page: #0c0c0c;
  --accent-primary: #00ff9f;
  /* Typography */
  --font-body: 'Geist', sans-serif;
  --font-mono: 'Geist Mono', monospace;
  /* Spacing (8px grid) */
  --space-1: 4px;
  --space-2: 8px;
  /* Shape */
  --radius-md: 6px;
}
```

Rules:
- Every magic number should be a token — if you type a raw `#hex` or `px` value more than once, extract it
- Token names use kebab-case with category prefix: `--bg-*`, `--text-*`, `--space-*`, `--radius-*`
- Semantic names over raw values: `--bg-surface` not `--bg-141414`

## Layout: CSS Grid + Flexbox

Use **Grid for page-level structure**, **Flexbox for component internals**. Do not use floats, absolute positioning for layout, or manual pixel placement.

### Page Layout with Grid

```css
.page {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto; /* header / content / footer */
  min-height: 100vh;
}

.main-content {
  max-width: 960px;
  margin: 0 auto;
  padding: var(--space-8) var(--space-6);
}
```

### Card Grids

```css
/* Auto-fill responsive grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: var(--space-2);
}

/* Fixed column count */
.token-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--space-2);
}
```

### Subgrid for Aligned Cards

When cards in a grid need their internal rows (header, body, footer) to align across columns:

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: auto; /* let subgrid children define rows */
  gap: var(--space-2);
}

.card {
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 3; /* match number of internal rows */
}
```

### Component Layout with Flexbox

```css
/* Horizontal bar: items spaced apart */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-6);
  height: 48px;
}

/* Vertical stack with gap */
.card-body {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}

/* Inline group */
.badge-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
```

### Container Queries for Reusable Components

Components that adapt to their container rather than the viewport:

```css
.card-container {
  container-type: inline-size;
  container-name: card;
}

@container card (min-width: 400px) {
  .card__layout {
    flex-direction: row; /* side-by-side when container is wide */
  }
}

@container card (max-width: 399px) {
  .card__layout {
    flex-direction: column; /* stacked when container is narrow */
  }
}
```

## Component HTML Patterns

Design mockups use BEM-style class naming that maps to Vue component structure. Each top-level BEM block = one Vue SFC.

```
.component-name           → ComponentName.vue
.component-name__element  → element within the component template
.component-name--modifier → prop/state variant
```

### Card Component

```html
<div class="session-card session-card--hover">
  <div class="session-card__main">
    <div class="session-card__top-row">
      <span class="session-card__filename">file.cast</span>
      <span class="badge badge--agent-claude">Claude</span>
    </div>
    <div class="session-card__meta">
      <span class="session-card__meta-item"><span class="count">7</span> markers</span>
    </div>
  </div>
  <div class="session-card__right">
    <span class="session-card__date">2 hours ago</span>
  </div>
</div>
```

```css
.session-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-xl);
  transition: all 0.15s ease-out;
}

.session-card--hover,
.session-card:hover {
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
```

### Button Component

```html
<button class="btn btn--primary">Upload</button>
<button class="btn btn--primary" disabled>Upload</button>
<button class="btn btn--ghost btn--sm">Edit</button>
```

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 5px 14px;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all 0.15s ease-out;
  border: 1px solid transparent;
  background: transparent;
}

.btn--primary {
  border-color: var(--accent-primary);
  color: var(--accent-primary);
}
.btn--primary:hover {
  background: var(--accent-primary);
  color: var(--bg-page);
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn--sm {
  padding: 3px 10px;
  font-size: 12px;
}
```

### Badge Component

```html
<span class="badge badge--success">Detected</span>
<span class="badge badge--warning badge--sm">Processing</span>
```

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 12px;
}
.badge--sm {
  padding: 1px 6px;
  font-size: 10px;
  border-radius: 8px;
}
```

### Input Component

```html
<div class="input-group">
  <label class="input-group__label">Email</label>
  <div class="input-wrapper">
    <span class="input-wrapper__icon">/</span>
    <input class="input" type="text" placeholder="Search sessions...">
  </div>
  <span class="input-group__helper">Helper text</span>
</div>
```

```css
.input {
  width: 100%;
  padding: 8px 14px;
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.input::placeholder { color: var(--text-muted); }
.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 3px var(--accent-primary-subtle);
}
.input--error {
  border-color: var(--status-error);
  box-shadow: 0 0 0 3px rgba(255, 59, 48, 0.07);
}
```

## Representing States in Static HTML

Since mockups are static HTML, show interactive states by duplicating elements with modifier classes. Label each state visually.

```html
<!-- State showcase pattern -->
<div class="state-row">
  <div class="state-label">Default</div>
  <button class="btn btn--primary">Upload</button>
</div>
<div class="state-row">
  <div class="state-label">Hover</div>
  <button class="btn btn--primary btn--primary-hover">Upload</button>
</div>
<div class="state-row">
  <div class="state-label">Disabled</div>
  <button class="btn btn--primary" disabled>Upload</button>
</div>
```

For hover states that can't be shown statically, create explicit `--hover` modifier classes that mirror the `:hover` styles:

```css
.btn--primary:hover,
.btn--primary-hover {
  background: var(--accent-primary);
  color: var(--bg-page);
}
```

## Typography System

Use a modular type scale. Define sizes as tokens, not magic numbers.

```css
:root {
  --text-xs: 10px;
  --text-sm: 11px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 20px;
  --text-2xl: 28px;
}
```

Font pairing pattern:
- **UI text:** `var(--font-body)` at `var(--text-base)` weight 400-500
- **Headings:** `var(--font-body)` at `var(--text-xl)`+ weight 600-700, negative letter-spacing
- **Code/mono:** `var(--font-mono)` at one step smaller than surrounding UI text
- **Labels/meta:** `var(--font-body)` at `var(--text-sm)`, uppercase, `letter-spacing: 0.12em`, `var(--text-muted)`

## Spacing System

8px base grid. All spacing values are multiples of 4px.

```css
:root {
  --space-1: 4px;   /* micro: badge padding, tight gaps */
  --space-2: 8px;   /* base: card gaps, list gaps, standard spacing */
  --space-3: 12px;  /* comfortable: input padding, search gaps */
  --space-4: 16px;  /* spacious: terminal padding, header gaps */
  --space-5: 20px;  /* card padding, section header margins */
  --space-6: 24px;  /* page horizontal padding */
  --space-8: 32px;  /* section vertical padding */
  --space-12: 48px; /* large section breaks */
}
```

Rules from `visual-design-harmony.md`:
- Internal spacing ≤ external spacing (padding inside a card ≤ gap between cards)
- Content fills 65-80% of its container
- Consistent gaps within a group, larger gaps between groups (proximity principle)

## Mapping to Vue 3 SFCs

The HTML mockup should map cleanly to Vue components. One BEM block = one `.vue` file.

**Mockup HTML:**
```html
<div class="session-card">
  <span class="session-card__filename">file.cast</span>
  <span class="badge badge--agent-claude">Claude</span>
</div>
```

**Vue SFC equivalent:**
```vue
<template>
  <div class="session-card">
    <span class="session-card__filename">{{ session.filename }}</span>
    <AppBadge :variant="session.agentType">{{ session.agentLabel }}</AppBadge>
  </div>
</template>

<style scoped>
.session-card { /* same CSS as mockup */ }
.session-card__filename { /* same CSS */ }
</style>
```

Key Vue CSS features to design for:
- **`scoped` styles** — each component's CSS is isolated. Design tokens in `:root` cascade through, scoped styles don't leak.
- **`v-bind()` in CSS** — component props can drive CSS values: `color: v-bind(accentColor)`. Design with props in mind.
- **CSS Modules** — alternative to scoped for stricter isolation. Class names become `$style.className`.

## Responsive Breakpoints

From `visual-design-harmony.md`:

```css
/* Mobile first */
@media (min-width: 768px)  { /* tablet */ }
@media (min-width: 1280px) { /* desktop */ }
@media (min-width: 1440px) { /* wide */ }
```

Mobile adjustments:
- Stack horizontal layouts vertically
- Full-width cards (single column)
- Touch targets minimum 44x44px
- Reduce horizontal padding: `var(--space-4)` instead of `var(--space-6)`

## Token Documentation Pattern

When creating design token reference pages, use this structure:

```html
<section class="token-section">
  <h3 class="token-section__title">Color Tokens</h3>
  <p class="token-section__desc">Background, accent, text, and status colors.</p>
  <div class="token-grid">
    <div class="token-card">
      <div class="token-card__swatch" style="background: var(--bg-surface);"></div>
      <div class="token-card__info">
        <code class="token-card__name">--bg-surface</code>
        <span class="token-card__value">#141414</span>
        <span class="token-card__usage">Card backgrounds, panels</span>
      </div>
    </div>
    <!-- more cards -->
  </div>
</section>
```

```css
.token-section__title {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  margin-bottom: var(--space-5);
}

.token-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-2);
}

.token-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-default);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.token-card__swatch {
  height: 48px;
  width: 100%;
}

.token-card__info {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.token-card__name {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.token-card__value {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-secondary);
}

.token-card__usage {
  font-size: var(--text-xs);
  color: var(--text-muted);
}
```

## Visual Verification Checklist

Before handing off any design, verify in browser (via Playwright or Chrome MCP):

1. All text is readable — no clipping, overflow, or invisible-on-background
2. Interactive states are distinct — hover, focus, active, disabled all visually different
3. Alignment — elements in a row share a baseline, columns align their edges
4. Spacing consistency — same gaps between same-level siblings, no orphaned tight/loose spots
5. Token coverage — no raw hex/px values that should be tokens
6. Responsive — content doesn't overflow at 375px width, still uses space well at 1440px
