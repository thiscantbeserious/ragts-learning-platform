# Penpot Technical Utilities

Penpot Plugin API methods and patterns for building designs programmatically. Available in `mcp__penpot__execute_code` via the `penpot` and `penpotUtils` objects

Official references:
- Plugin API types: https://doc.plugins.penpot.app/
- User guide (layouts): https://help.penpot.app/user-guide/designing/flexible-layouts/
- Plugin samples: https://github.com/penpot/penpot-plugins-samples

---

## Undo Blocks (State Pinning)

Wrap multi-step operations in undo blocks so the user can revert with a single Ctrl+Z. ALWAYS use this for any batch of changes

```javascript
const blockId = penpot.history.undoBlockBegin();
// ... all your changes here ...
penpot.history.undoBlockFinish(blockId);
```

There is no programmatic undo/redo — only the user can trigger Ctrl+Z. There are no state snapshots or rollback. Undo blocks are the only safety mechanism

---

## Sizing: Container vs Child (CRITICAL DISTINCTION)

These look similar but have DIFFERENT allowed values. Mixing them up causes silent failures

| Context | Property | Values |
|---|---|---|
| Layout container (flex/grid) | `flex.horizontalSizing` | `"fit-content"` / `"fill"` / `"auto"` |
| Board itself | `board.horizontalSizing` | `"auto"` / `"fix"` |
| Child inside layout | `shape.layoutChild.horizontalSizing` | `"auto"` / `"fill"` / `"fix"` |

Child sizing:
- **`"fill"`** — stretches to consume available space. Multiple fill children share space equally
- **`"auto"`** — sizes based on content. For text with `growType: "auto-height"`, width = text content width. For rectangles, keeps current size
- **`"fix"`** — fixed pixel size set via `resize()`. Layout does not alter this dimension

Container sizing:
- **`"fit-content"`** — shrinks/grows to exactly fit children + padding + gaps ("hug content")
- **`"fill"`** — expands to fill parent layout space
- **`"auto"`** — automatic sizing

IMPORTANT: Set `board.horizontalSizing = "auto"` and `board.verticalSizing = "auto"` when creating boards with layouts, otherwise the layout may not control the board size properly

---

## Text Inside Layouts

Text has a `growType` property that interacts with layout child sizing. Getting this wrong causes overflow, clipping, or collapsed text

### growType values

| Value | Behavior |
|---|---|
| `"auto-height"` | Width is fixed/layout-controlled. Height grows to fit wrapped text. **USE THIS** |
| `"auto-width"` | Width grows to fit text on one line. Height fixed. Buggy in flex — avoid |
| `"fixed"` | Both dimensions fixed. Text may overflow/clip |

### Text + Layout interaction matrix

| growType | layoutChild.hSizing | layoutChild.vSizing | Result |
|---|---|---|---|
| `"auto-height"` | `"fill"` | `"auto"` | **CORRECT COMBO.** Width fills container, height auto-adjusts to wrapped text |
| `"auto-height"` | `"fill"` | `"fix"` | Width fills container, height fixed — text may overflow |
| `"auto-height"` | `"fix"` | `"auto"` | Width fixed at resize() value, height adjusts to wrapping |
| `"auto-width"` | any | any | Buggy in flex (GitHub #7589, #7227). Avoid |
| `"fixed"` | `"fill"` | `"fill"` | Both fill container. Text may overflow the box |

### Correct pattern for text in flex layouts

```javascript
const text = penpot.createText("Hello world");
text.growType = "auto-height";
text.fontSize = "14";
text.fontFamily = "Work Sans";
text.fills = [{ fillColor: "#E8E8E8", fillOpacity: 1 }];

board.appendChild(text);
// layoutChild is ONLY available AFTER adding to a layout board
text.layoutChild.horizontalSizing = "fill";
text.layoutChild.verticalSizing = "auto";
```

IMPORTANT: `layoutChild` is `undefined` until the shape is added to a layout container. Always `appendChild` first, then configure `layoutChild`

### Text properties are strings

`fontSize`, `lineHeight`, `letterSpacing`, `fontWeight` are all `string` type: `text.fontSize = "16"` not `text.fontSize = 16`

---

## Flex Layout

Based on CSS Flexbox. For single-axis layouts (one row or one column)

```javascript
const board = penpot.createBoard();
board.horizontalSizing = "auto";  // IMPORTANT: let layout control size
board.verticalSizing = "auto";
const flex = board.addFlexLayout();
flex.dir = "column";
flex.rowGap = 8;
flex.columnGap = 8;
flex.alignItems = "stretch";     // cross-axis: "start" | "center" | "end" | "stretch"
flex.justifyContent = "start";   // main-axis: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly" | "stretch"
flex.wrap = "nowrap";            // "wrap" | "nowrap"
```

### Axes

For `dir: "row"`: main axis = horizontal, cross axis = vertical
- `justifyContent` controls horizontal distribution
- `alignItems` controls vertical alignment
- `columnGap` = gap between items, `rowGap` = gap between wrapped lines

For `dir: "column"`: main axis = vertical, cross axis = horizontal
- `justifyContent` controls vertical distribution
- `alignItems` controls horizontal alignment
- `rowGap` = gap between items, `columnGap` = gap between wrapped lines

### Padding (two systems)

Shorthand (symmetric): `flex.horizontalPadding = 16` sets both left AND right
Individual (asymmetric): `flex.leftPadding = 12; flex.rightPadding = 16`

Padding applies to ALL children equally — text, rectangles, ellipses, nested boards. It creates inset space from container edges

### Per-child alignment override

```javascript
child.layoutChild.alignSelf = "center";  // overrides parent alignItems for THIS child
// values: "auto" | "start" | "center" | "end" | "stretch"
```

### Margins on children

Margins and padding stack additively. Container leftPadding=20 + child leftMargin=10 = 30px from container edge

Margins also create space between children — child A rightMargin=8 + child B leftMargin=4 = 12px gap between them, PLUS any columnGap

### Children array order

For `dir="column"` or `dir="row"`, children array order is REVERSED relative to visual order

- Use `board.appendChild(shape)` to add in visual order (inserts at array front)
- NEVER use `flex.appendChild(shape)` — it is broken
- Use `penpotUtils.addFlexLayout(container, dir)` when container already has children (preserves visual order)

### Overflow

- `board.clipContent = true` — overflowing children are visually clipped (hidden)
- `board.clipContent = false` (default) — overflowing children are visible beyond board edges
- Use `flex.verticalSizing = "fit-content"` to make the container grow to fit content instead of overflowing

---

## Grid Layout

Based on CSS Grid. For 2-dimensional layouts with rows and columns

```javascript
const board = penpot.createBoard();
board.horizontalSizing = "auto";
board.verticalSizing = "auto";
const grid = board.addGridLayout();

grid.addColumn("fixed", 200);
grid.addColumn("fixed", 200);
grid.addRow("auto");
grid.addRow("auto");

grid.columnGap = 16;
grid.rowGap = 16;
grid.horizontalPadding = 24;
grid.verticalPadding = 24;

grid.alignItems = "start";
grid.justifyItems = "stretch";

// Place children — row/column are 1-based
grid.appendChild(shape1, 1, 1);
grid.appendChild(shape2, 1, 2);
```

Track types: `"fixed"` (px), `"flex"` (fr units), `"percent"`, `"auto"` (content-sized)

Cell properties via `shape.layoutCell`: `row`, `column`, `rowSpan`, `columnSpan`, `position` ("auto"|"manual"|"area")

BUG: Setting margins on grid children breaks child ordering (GitHub #7206). Use grid padding instead of child margins

---

## Alignment and Distribution

Align multiple shapes to shared edges:

```
penpot.alignHorizontal(shapes, "center" | "left" | "right"): void
penpot.alignVertical(shapes, "center" | "top" | "bottom"): void
```

Distribute with equal spacing:

```
penpot.distributeHorizontal(shapes): void
penpot.distributeVertical(shapes): void
```

Workflow for a grid of cards:
1. Group by row → `penpot.alignVertical(rowCards, "top")`
2. Per row → `penpot.distributeHorizontal(rowCards)`
3. One card per row → `penpot.distributeVertical(columnCards)`
4. Verify visually

---

## Known Bugs

| Bug | Impact | Workaround |
|---|---|---|
| Padding left/right inversion (#11152) | `leftPadding` and `rightPadding` appear visually swapped | Use `horizontalPadding` (same value both sides) when possible |
| Grid child margins (#7206) | Margins on grid children break visual ordering | Use grid padding, not child margins |
| Text auto-width in flex (#7589, #7227) | `growType: "auto-width"` gets silently reset in flex | Use `growType: "auto-height"` with `horizontalSizing: "fill"` |
| `flex.appendChild` broken | Unpredictable insertion position | Use `board.appendChild(shape)` instead |
| Grid fit-content lost on instance (#7797) | Grid component instances lose fit-content sizing | Re-apply after instantiation |

---

## Practical Patterns

### Card with swatch + text labels (color token card)

Due to the padding/margin inversion bug (#11152), individual `leftMargin`/`rightMargin` on children reduce width but don't shift position. The workaround is a nested inner board with `horizontalPadding`:

```javascript
const card = penpot.createBoard();
card.resize(240, 128);
card.fills = [{ fillColor: "#141414", fillOpacity: 1 }];
card.clipContent = true;

const flex = card.addFlexLayout();
flex.dir = "column";
flex.alignItems = "stretch";
flex.topPadding = 0;        // swatch goes edge-to-edge at top
flex.bottomPadding = 12;
flex.leftPadding = 0;       // no card-level horizontal padding
flex.rightPadding = 0;
flex.rowGap = 4;

// Swatch — fills full width in outer card (no padding)
const swatch = penpot.createRectangle();
swatch.resize(240, 48);
swatch.fills = [{ fillColor: "#00FF9F", fillOpacity: 1 }];
card.appendChild(swatch);
swatch.layoutChild.horizontalSizing = "fill";
swatch.layoutChild.verticalSizing = "fix";

// Inner text container — horizontalPadding works correctly (symmetric)
const textBoard = penpot.createBoard();
textBoard.name = "text-content";
textBoard.fills = [];  // transparent
textBoard.horizontalSizing = "auto";
textBoard.verticalSizing = "auto";
const innerFlex = textBoard.addFlexLayout();
innerFlex.dir = "column";
innerFlex.rowGap = 4;
innerFlex.alignItems = "stretch";
innerFlex.horizontalPadding = 12;  // symmetric padding works!

card.appendChild(textBoard);
textBoard.layoutChild.horizontalSizing = "fill";
textBoard.layoutChild.verticalSizing = "auto";

// Text labels inside inner board — no margins needed
const name = penpot.createText("token-name");
name.growType = "auto-height";
name.fontSize = "12";
textBoard.appendChild(name);
name.layoutChild.horizontalSizing = "fill";
name.layoutChild.verticalSizing = "auto";
```

**Retrofitting existing cards:** To fix cards that have text children with broken margins, create the inner `text-content` board, reparent text children into it, and remove their margins.

### Row with icon + text (chrome dot card)

```javascript
const card = penpot.createBoard();
const flex = card.addFlexLayout();
flex.dir = "row";
flex.alignItems = "center";    // vertically center everything
flex.columnGap = 8;
flex.leftPadding = 12;
flex.rightPadding = 12;
flex.topPadding = 8;
flex.bottomPadding = 8;

const dot = penpot.createEllipse();
dot.resize(20, 20);
card.appendChild(dot);
dot.layoutChild.horizontalSizing = "fix";
dot.layoutChild.verticalSizing = "fix";

const textBoard = penpot.createBoard();
// ... add text children to textBoard
card.appendChild(textBoard);
textBoard.layoutChild.horizontalSizing = "fill";
```

---

## Viewport Control

```javascript
penpot.viewport.center = { x: 500, y: 300 };
penpot.viewport.zoom = 2;
```

Use before Chrome MCP screenshots to frame the area of interest

---

## Converting Existing Boards

Grid conversion:
1. Wrap in undo block: `const blockId = penpot.history.undoBlockBegin()`
2. Audit all children positions and dimensions
3. Add grid layout, configure tracks and gaps
4. Re-insert children into cells
5. Finish undo block: `penpot.history.undoBlockFinish(blockId)`
6. Verify visually — if wrong, user can Ctrl+Z to revert the entire block

Flex conversion:
1. Wrap in undo block
2. Use `penpotUtils.addFlexLayout(board, dir)` to preserve visual order
3. Set gap, padding, alignment
4. Finish undo block
5. Verify visually

IMPORTANT: Adding a layout to a board with existing children repositions them. Always wrap in undo block and verify visually
