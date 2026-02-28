# Penpot Technical Utilities

These are Penpot Plugin API methods that implement the visual design principles. Use them instead of manual pixel calculations wherever possible. They are available in `mcp__penpot__execute_code` via the `penpot` global object

---

## Alignment

Align multiple shapes to each other along an axis. Use these to enforce cross-element alignment without manual coordinate math

```
penpot.alignHorizontal(shapes: Shape[], direction: "center" | "left" | "right"): void
penpot.alignVertical(shapes: Shape[], direction: "center" | "top" | "bottom"): void
```

- `"left"` / `"top"`: aligns all shapes to the leftmost/topmost edge in the set
- `"right"` / `"bottom"`: aligns all shapes to the rightmost/bottommost edge
- `"center"`: centers all shapes on the midpoint of the set

When to use:
- Cards in a row must share top edges → `penpot.alignVertical(rowCards, "top")`
- Text elements inside a card must left-align → `penpot.alignHorizontal(textElements, "left")`
- Section headers must align with card content left edges → collect both, align left

## Distribution

Distribute shapes with equal spacing between them. Use these to enforce uniform gutters without manual gap calculations

```
penpot.distributeHorizontal(shapes: Shape[]): void
penpot.distributeVertical(shapes: Shape[]): void
```

- Positions shapes so the distance between each adjacent pair is equal
- The outermost shapes stay in place, inner shapes are repositioned
- Works with any number of shapes (minimum 3 for meaningful distribution)

When to use:
- Cards in a row need equal horizontal gaps → `penpot.distributeHorizontal(rowCards)`
- Card rows need equal vertical gaps → `penpot.distributeVertical(rowFirstCards)`
- Any time you see uneven spacing between like elements

## Recommended Workflow: Align Then Distribute

For a grid of cards, apply in this order:

1. Group cards by row (same intended Y position)
2. Per row: `penpot.alignVertical(rowCards, "top")` — snap all to same top edge
3. Per row: `penpot.distributeHorizontal(rowCards)` — equalize horizontal gaps
4. Collect one card per row (e.g. first column): `penpot.distributeVertical(columnCards)` — equalize row gaps
5. Verify visually via Chrome MCP screenshot

This replaces manual position arithmetic and eliminates off-by-one errors

## Grid Layout

Convert a board to CSS Grid for automatic card placement. Preferred over manual positioning for any grid of uniform elements

```javascript
const board = penpot.createBoard();
const grid = board.addGridLayout();

// Configure grid structure
grid.addColumn("fixed", 200);   // 200px fixed column
grid.addColumn("fixed", 200);   // second column
grid.addColumn("fixed", 200);   // third column
grid.addRow("auto");             // auto-height row
grid.addRow("auto");             // second row

// Spacing and padding
grid.columnGap = 16;            // gap between columns
grid.rowGap = 16;               // gap between rows
grid.topPadding = 24;
grid.rightPadding = 24;
grid.bottomPadding = 24;
grid.leftPadding = 24;

// Alignment within cells
grid.alignItems = "start";      // "start" | "center" | "end" | "stretch"
grid.justifyItems = "stretch";  // "start" | "center" | "end" | "stretch"

// Content distribution when grid is larger than content
grid.alignContent = "start";    // "start" | "center" | "end" | "stretch" | "space-between" | "space-around" | "space-evenly"
grid.justifyContent = "start";

// Place children
grid.appendChild(childShape, 1, 1);  // row 1, column 1 (1-based)
grid.appendChild(childShape2, 1, 2); // row 1, column 2
```

Track types for rows and columns:
- `"fixed"` — exact pixel size (e.g. 200px)
- `"flex"` — flexible size (like CSS `fr` units)
- `"percent"` — percentage of available space
- `"auto"` — size to content

Cell properties (on child shapes via `shape.layoutCell`):
- `row`, `column` — 1-based position
- `rowSpan`, `columnSpan` — span multiple tracks
- `position` — `"auto"` | `"manual"` | `"area"`

When to use grid layout:
- Color token swatches arranged in a uniform grid
- Any board with repeating card elements in rows and columns
- When manual positioning has led to alignment bugs

When NOT to use grid layout:
- Boards with mixed element types at different sizes
- Free-form layouts where elements don't follow a grid pattern
- Single-row or single-column layouts (use flex layout instead)

## Flex Layout

For single-axis layouts (one row or one column of elements). Already documented in the Penpot High-Level Overview but key points repeated here

```javascript
const board = penpot.createBoard();
const flex = board.addFlexLayout();
flex.dir = "column";         // "row" | "column" | "row-reverse" | "column-reverse"
flex.rowGap = 8;
flex.columnGap = 8;
flex.alignItems = "start";   // cross-axis alignment
flex.justifyContent = "start"; // main-axis distribution
```

CRITICAL reminders:
- For `dir="column"` or `dir="row"`, the children array order is REVERSED relative to visual order
- Use `board.appendChild(shape)` to add children in visual order (it inserts at the array front)
- NEVER use `board.flex.appendChild(shape)` — it is broken
- Use `penpotUtils.addFlexLayout(container, dir)` when the container already has children (preserves visual order)

When to use:
- Card internals: title + subtitle + content stacked vertically → flex column
- Section headers: icon + label + badge in a row → flex row
- Any single-axis arrangement with consistent spacing

## Converting Existing Boards

To convert a board with manually positioned children to grid or flex layout:

Grid conversion:
1. Audit all children — record their positions and dimensions
2. Identify the grid pattern: how many columns, how many rows, what gaps
3. Add grid layout to the board
4. Re-insert children into grid cells in the correct row/column order
5. The grid will now control positioning — verify visually

Flex conversion:
1. Use `penpotUtils.addFlexLayout(board, dir)` — this preserves existing visual order
2. Set gap, padding, and alignment properties
3. Verify visually — flex may reflow children

IMPORTANT: Adding a layout to a board that already has children will reposition them. Always verify visually after conversion

## Viewport Control

To inspect specific areas programmatically before taking Chrome MCP screenshots:

```javascript
penpot.viewport.center = { x: 500, y: 300 };  // center viewport on coordinates
penpot.viewport.zoom = 2;                       // 2x zoom
```

Use this before Chrome MCP screenshots to ensure the area of interest is visible and large enough to verify details like text legibility, dot alignment, and spacing
