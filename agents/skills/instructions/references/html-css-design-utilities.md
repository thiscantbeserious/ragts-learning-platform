# HTML + CSS Design Utilities

Technical patterns for creating design mockups as standalone HTML files using Vue 3 components. Use alongside `visual-design-harmony.md` for design principles.

## File Structure

```
.state/design/<branch-name>/
  stage-N/
    <name>.html          # Self-contained Vue 3 mockup
    <name>.png           # Screenshot for handoff
```

## Mockup File Skeleton

One HTML file = one shared `<style>` block + Vue components that reference those shared styles. Vue 3 is loaded via CDN for mockup portability (no dev server needed to open in a browser).

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
    /* ========================
       1. DESIGN TOKENS (:root)
       2. RESET + BASE
       3. LAYOUT
       4. ALL COMPONENT STYLES
       ======================== */

    :root {
      /* Tokens here — the ONLY place raw values appear */
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-body);
      background: var(--bg-page);
      color: var(--text-primary);
      font-size: var(--text-md);
      line-height: 1.5;
    }

    /* Shared component styles — all components reference these */
    .btn { /* ... */ }
    .badge { /* ... */ }
    .input { /* ... */ }
    .session-card { /* ... */ }
  </style>
</head>
<body>
  <div id="app"></div>

  <script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
  <script>
    const { createApp, defineComponent } = Vue;

    // Components are THIN — template + props only, NO inline styles
    const AppBadge = defineComponent({ /* ... */ });
    const AppButton = defineComponent({ /* ... */ });

    const app = createApp({ /* root template */ });
    app.component('AppBadge', AppBadge);
    app.mount('#app');
  </script>
</body>
</html>
```

**Key principle: ONE shared stylesheet, components are just templates.** Components contain zero CSS — they reference class names from the single `<style>` block. This mirrors the production pattern where tokens and base styles are a global CSS file and `<style scoped>` in SFCs only adds component-specific overrides.

## Design Tokens — ZERO Magic Numbers

**Every visual value must be a CSS custom property.** The ONLY place raw `#hex`, `px`, `ms`, or `rgba()` values appear is inside `:root`. Component styles use ONLY `var(--*)` references.

```css
:root {
  /* --- Colors --- */
  --bg-page: #0c0c0c;
  --bg-surface: #141414;
  --bg-elevated: #1c1c1c;
  --bg-overlay: rgba(0, 0, 0, 0.75);
  --accent-primary: #00ff9f;
  --accent-primary-hover: #33ffb3;
  --accent-primary-dim: #00cc7f;
  --accent-primary-subtle: rgba(0, 255, 159, 0.07);
  --accent-secondary: #ff6b2b;
  --accent-secondary-hover: #ff8a55;
  --accent-secondary-subtle: rgba(255, 107, 43, 0.07);
  --status-success: #00ff9f;
  --status-warning: #ffcc00;
  --status-error: #ff3b30;
  --status-error-subtle: rgba(255, 59, 48, 0.07);
  --status-info: #5ac8fa;
  --text-primary: #e8e8e8;
  --text-secondary: #8b949e;
  --text-muted: #484f58;
  --text-disabled: #30363d;
  --border-default: #1e1e1e;
  --border-strong: #2a2a2a;
  --border-accent: #00ff9f;
  --terminal-bg: #0a0a0a;
  --terminal-text: #d4d4d4;

  /* --- Typography --- */
  --font-body: 'Geist', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'Geist Mono', 'JetBrains Mono', monospace;
  --text-xs: 0.625rem;
  --text-sm: 0.6875rem;
  --text-base: 0.8125rem;
  --text-md: 0.875rem;
  --text-lg: 1rem;
  --text-xl: 1.25rem;
  --text-2xl: 1.75rem;
  --weight-normal: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;

  /* --- Spacing (4px base grid) --- */
  --space-px: 1px;
  --space-0.5: 2px;
  --space-1: 4px;
  --space-1.5: 6px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;

  /* --- Shape --- */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 10px;
  --radius-full: 9999px;

  /* --- Shadows --- */
  --shadow-sm: 0 4px 16px rgba(0, 255, 159, 0.06);
  --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.5);

  /* --- Animation --- */
  --duration-fast: 150ms;
  --duration-normal: 250ms;
  --duration-slow: 400ms;
  --easing-default: ease-out;
}
```

Font pairing pattern:
- **UI text:** `var(--font-body)` at `var(--text-base)` weight `var(--weight-medium)`
- **Headings:** `var(--font-body)` at `var(--text-xl)`+ weight `var(--weight-bold)`, negative letter-spacing
- **Code/mono:** `var(--font-mono)` at one step smaller than surrounding UI text
- **Labels/meta:** `var(--font-body)` at `var(--text-sm)`, uppercase, `letter-spacing: 0.12em`, color `var(--text-muted)`

Spacing rules from `visual-design-harmony.md`:
- Internal spacing <= external spacing (padding inside a card <= gap between cards)
- Content fills 65-80% of its container
- Consistent gaps within a group, larger gaps between groups (proximity principle)

## Layout: CSS Grid + Flexbox

**Grid for page-level structure and card grids. Flexbox for component internals.** No floats, no absolute positioning for layout.

### Page Layout

```css
.page {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto;
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
/* Responsive auto-fill */
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: var(--space-2);
}

/* Subgrid: align card internals across columns */
.card-grid--aligned {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--space-2);
}
.card-grid--aligned > .card {
  display: grid;
  grid-template-rows: subgrid;
  grid-row: span 3;
}
```

### Container Queries

Components that adapt to their container, not the viewport:

```css
.card-container {
  container-type: inline-size;
  container-name: card;
}
@container card (max-width: 399px) {
  .card__layout { flex-direction: column; }
}
```

## Shared Component Styles

These go in the single `<style>` block. Components are templates that reference these classes.

### Buttons

```css
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-1) var(--space-3);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-fast) var(--easing-default);
  border: var(--space-px) solid transparent;
  background: transparent;
}
.btn--primary { border-color: var(--accent-primary); color: var(--accent-primary); }
.btn--primary:hover { background: var(--accent-primary); color: var(--bg-page); }
.btn--secondary { border-color: var(--accent-secondary); color: var(--accent-secondary); }
.btn--ghost { color: var(--text-secondary); }
.btn--ghost:hover { background: var(--bg-elevated); color: var(--text-primary); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.btn--sm { padding: var(--space-0.5) var(--space-2); font-size: var(--text-sm); }
```

### Badges

```css
.badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: var(--space-0.5) var(--space-2);
  font-size: var(--text-sm);
  font-weight: var(--weight-semibold);
  border-radius: var(--radius-full);
}
.badge--sm { padding: var(--space-px) var(--space-1.5); font-size: var(--text-xs); }
```

### Inputs

```css
.input-group__label {
  font-size: var(--text-base);
  font-weight: var(--weight-medium);
  color: var(--text-secondary);
  margin-bottom: var(--space-1);
}
.input {
  width: 100%;
  padding: var(--space-2) var(--space-3);
  background: var(--bg-surface);
  border: var(--space-px) solid var(--border-default);
  border-radius: var(--radius-lg);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  outline: none;
  transition: border-color var(--duration-fast), box-shadow var(--duration-fast);
}
.input::placeholder { color: var(--text-muted); }
.input:focus {
  border-color: var(--accent-primary);
  box-shadow: 0 0 0 var(--space-0.5) var(--accent-primary-subtle);
}
.input--error {
  border-color: var(--status-error);
  box-shadow: 0 0 0 var(--space-0.5) var(--status-error-subtle);
}
.input-group__helper { font-size: var(--text-sm); color: var(--text-muted); margin-top: var(--space-1); }
.input-group__error { font-size: var(--text-sm); color: var(--status-error); margin-top: var(--space-1); }
```

### Cards

```css
.session-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--space-4) var(--space-5);
  background: var(--bg-surface);
  border: var(--space-px) solid var(--border-default);
  border-radius: var(--radius-xl);
  transition: all var(--duration-fast) var(--easing-default);
  text-decoration: none;
  color: inherit;
}
.session-card:hover {
  border-color: var(--accent-primary);
  background: var(--bg-elevated);
  transform: translateY(calc(-1 * var(--space-px)));
  box-shadow: var(--shadow-sm);
}
```

## Vue Component Definitions

Components are thin — props, slots, template structure. No styles. They reference the shared class names.

```js
const AppBadge = defineComponent({
  props: { variant: String, size: { type: String, default: 'default' } },
  template: `
    <span class="badge"
      :class="['badge--' + variant, size !== 'default' && 'badge--' + size]">
      <slot/>
    </span>`
});

const AppButton = defineComponent({
  props: {
    variant: { type: String, default: 'primary' },
    size: { type: String, default: 'default' },
    disabled: Boolean
  },
  template: `
    <button class="btn"
      :class="['btn--' + variant, size !== 'default' && 'btn--' + size]"
      :disabled="disabled">
      <slot/>
    </button>`
});

const AppInput = defineComponent({
  props: { label: String, helper: String, error: String, modelValue: String, placeholder: String, type: { type: String, default: 'text' } },
  emits: ['update:modelValue'],
  template: `
    <div class="input-group">
      <label v-if="label" class="input-group__label">{{ label }}</label>
      <input class="input" :class="{ 'input--error': error }" :type="type"
        :placeholder="placeholder" :value="modelValue"
        @input="$emit('update:modelValue', $event.target.value)">
      <span v-if="error" class="input-group__error">{{ error }}</span>
      <span v-else-if="helper" class="input-group__helper">{{ helper }}</span>
    </div>`
});
```

## Production Mapping: Mockup → Vue SFCs

The single shared `<style>` block maps to a global stylesheet. Components become `.vue` SFCs.

```
Mockup                              Production
──────────────────────────          ──────────────────────────
<style>                             src/client/styles/
  :root { tokens }                    tokens.css     (design tokens)
  .btn { ... }                        base.css       (reset + base)
  .badge { ... }                      components.css (shared styles)
  .session-card { ... }
</style>

<script>                            src/client/components/
  AppBadge = defineComponent(...)     AppBadge.vue   (<style scoped> for overrides only)
  AppButton = defineComponent(...)    AppButton.vue
  SessionCard = defineComponent(...)  SessionCard.vue
</script>
```

In production SFCs, `<style scoped>` is used sparingly — only for component-specific overrides. Shared styles (tokens, component base classes) are global CSS files imported in `main.ts`.

## Representing States

Show interactive states by rendering each state as a separate component instance. Use a showcase wrapper:

```js
const StateShowcase = defineComponent({
  props: { label: String },
  template: `
    <div class="state-row">
      <span class="state-label">{{ label }}</span>
      <slot/>
    </div>`
});
```

```css
.state-row { display: flex; align-items: center; gap: var(--space-4); }
.state-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  min-width: 80px;
  text-transform: uppercase;
  letter-spacing: 0.12em;
}
```

For hover/focus states, add explicit modifier classes that mirror the pseudo-class:
```css
.btn--primary:hover, .btn--primary-hover { /* same styles */ }
```

## Responsive Breakpoints

```css
/* Mobile first */
@media (min-width: 768px)  { /* tablet */ }
@media (min-width: 1280px) { /* desktop */ }
@media (min-width: 1440px) { /* wide */ }
```

Mobile adjustments:
- Stack horizontal layouts vertically
- Single-column card grids
- Touch targets minimum 44x44px
- Reduce horizontal padding: `var(--space-4)` instead of `var(--space-6)`

## Visual Verification Checklist

Before handing off any design, verify in browser (via Playwright or Chrome MCP) at **both viewports**:

### Desktop (1280px wide)
1. All text is readable — no clipping, overflow, or invisible-on-background
2. Interactive states are distinct — hover, focus, active, disabled all visually different
3. Alignment — elements in a row share a baseline, columns align their edges
4. Spacing consistency — same gaps between same-level siblings
5. Grid layouts fill space well — no excessive whitespace or cramped columns
6. Token coverage — **zero** raw hex/px/rgba values outside `:root`

### Mobile (375px wide)
1. No horizontal overflow — nothing extends beyond the viewport
2. Layouts stack correctly — horizontal rows become vertical stacks
3. Touch targets are at least 44x44px
4. Text remains legible — no truncation that hides meaning
5. Card grids collapse to single column
6. Padding reduces appropriately (`var(--space-4)` instead of `var(--space-6)`)

Take a screenshot at each viewport and include both in the handoff.
