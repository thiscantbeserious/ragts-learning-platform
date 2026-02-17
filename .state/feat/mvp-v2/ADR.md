# ADR - MVP v2 Architecture Decisions

Branch: feat/mvp-v2
Date: 2026-02-17
Status: Proposed

---

## Decision 1: Rendering Engine

### Context

MVP v1 uses `anser` to parse ANSI SGR (color) codes only. Line 30 of `src/client/components/AnsiLine.vue` explicitly strips all non-SGR escape sequences:

```js
const cleanedLine = props.line.replace(/\x1b\[[\d;]*[A-LNS-Zf-l]/g, '');
```

This produces garbage for real TUI sessions. Analysis of production sessions confirms heavy use of:

- **Claude Code sessions**: cursor movement (`A`, `B`, `C` codes), mode set/reset (`h`, `l`), line erase (`K`), screen clear (`2J`) -- 23 screen clears found across 34,966 events
- **Codex sessions**: cursor positioning (`H` -- 1,588 occurrences in first 200 events), line erase (`K` -- 1,185), mode set/reset (`h`/`l`), alternate screen buffer transitions, scroll regions (`r`)
- **Gemini sessions**: cursor movement (`A` -- 753, `B` -- 87), line erase (`K` -- 761), cursor column absolute (`G` -- 184), heavy screen redraw patterns

These are full TUI applications that maintain a virtual screen buffer. Concatenating their output text and splitting on newlines is fundamentally wrong.

### Options Evaluated

#### Option A: xterm.js (@xterm/xterm)

The standard browser terminal emulator. Used by VS Code's integrated terminal.

**Pros:**
- Most battle-tested VT emulator in the browser ecosystem (1000+ contributors, used by VS Code, Gitpod, etc.)
- Complete VT100/xterm support including alternate screen, mouse events, sixel graphics
- Canvas and DOM rendering backends
- Addon ecosystem (search, webgl, fit, serialize)
- The `@xterm/addon-serialize` addon can export terminal state as HTML

**Cons:**
- Designed for interactive terminals, not static document viewing. It wants to own a live canvas/DOM element per terminal instance.
- Bundle size: 5.9MB unpacked (`@xterm/xterm@6.0.0`). Even treeshaken, the core is heavy.
- Creating one xterm instance per section and feeding events to extract buffer state is possible but architecturally clumsy -- xterm expects to be mounted in the DOM.
- No server-side rendering path. xterm.js requires a browser environment (DOM, canvas).
- Performance concern: instantiating multiple xterm terminals to process a 200K-event session would be slow and memory-heavy.
- The API is oriented around live interaction (onData, onKey, write), not "feed this batch of output and give me the final screen state."

**Verdict:** Technically capable but architecturally mismatched. We would be fighting the library's design assumptions.

#### Option B: asciinema avt crate + custom WASM bridge (modeled on asciinema-player's vt-js)

##### Source Code Analysis: avt crate (v0.17.0)

Cloned and analyzed from `github.com/asciinema/avt`. 6,466 lines of Rust. Apache-2.0 licensed.

**Dependencies (minimal):**
- `rgb = "0.8.33"` -- RGB color representation
- `unicode-width = "0.1.13"` -- Unicode display width

**Public API (`src/lib.rs`):**
```rust
pub struct Vt { parser: Parser, terminal: Terminal }

impl Vt {
    // Construction
    pub fn builder() -> Builder;
    pub fn new(cols: usize, rows: usize) -> Vt;

    // Streaming input (the core API)
    pub fn feed_str(&mut self, s: &str) -> Changes<'_>;
    pub fn feed(&mut self, input: char);

    // Buffer reading
    pub fn view(&self) -> impl Iterator<Item = &Line>;  // viewport only
    pub fn lines(&self) -> impl Iterator<Item = &Line>; // all including scrollback
    pub fn line(&self, n: usize) -> &Line;
    pub fn text(&self) -> Vec<String>;

    // Terminal state
    pub fn cursor(&self) -> Cursor;
    pub fn size(&self) -> (usize, usize);
    pub fn resize(&mut self, cols: usize, rows: usize) -> Changes<'_>;
    pub fn dump(&self) -> String; // serialize state as escape sequence
}

pub struct Changes<'a> {
    pub lines: Vec<usize>,           // dirty line indices
    pub scrollback: Box<dyn Iterator<Item = Line> + 'a>,  // evicted scrollback
}

pub struct Builder {
    size: (usize, usize),              // default: 80x24
    scrollback_limit: Option<usize>,   // None = unlimited
}
```

**Cell data model:**
```rust
pub struct Cell(char, u8, Pen);  // char + display width (0/1/2) + pen

pub struct Line {
    cells: Vec<Cell>,
    wrapped: bool,          // line wraps to next
}

pub struct Pen {
    foreground: Option<Color>,
    background: Option<Color>,
    intensity: Intensity,    // Normal | Bold | Faint
    attrs: u8,               // bitfield: italic(0) underline(1) strikethrough(2) blink(3) inverse(4)
}

pub enum Color {
    Indexed(u8),   // 0-255 palette
    RGB(RGB8),     // 24-bit true color
}
```

**Parser (1,275 lines):** Implements Paul Williams' DEC ANSI parser state diagram with 11 states (Ground, Escape, EscapeIntermediate, CsiEntry, CsiParam, CsiIntermediate, CsiIgnore, DcsEntry, DcsParam, DcsIntermediate, DcsPassthrough, OscString, SosPmApcString). Emits 45+ CSI/escape functions.

**Terminal state machine (1,690 lines):** Manages:
- Primary and alternate screen buffers (`VecDeque<Line>`)
- Cursor position, visibility, and saved context (DECSC/DECRC)
- Scroll regions (top/bottom margins)
- Character sets (G0, G1, DEC drawing)
- Modes: auto-wrap (DECAWM), origin (DECOM), insert, cursor keys (DECCKM)
- Alternate screen buffer transitions (DEC mode 1047/1048/1049)
- Dirty line tracking for incremental updates

**Test coverage:** ~500 lines of unit tests covering auto-wrap, insert mode, wide characters, cursor movement, scrolling, erase functions, tabs, save/restore, resize/reflow, character sets. Property-based fuzz testing with `proptest` for random input and resize sequences.

##### Source Code Analysis: asciinema-player's vt-js WASM bridge

Cloned and analyzed from `github.com/asciinema/asciinema-player`. The WASM bridge lives at `src/vt/`.

**Rust WASM wrapper (`src/vt/src/lib.rs`):**
```rust
#[wasm_bindgen]
pub fn create(cols: usize, rows: usize, scrollback_limit: usize, bold_is_bright: bool) -> Vt;

#[wasm_bindgen]
impl Vt {
    pub fn feed(&mut self, s: &str) -> JsValue;        // returns [changedRowIndices]
    pub fn resize(&mut self, cols: usize, rows: usize) -> JsValue;
    pub fn get_line(&mut self, row: usize, cursor_on: bool) -> JsValue;  // structured span data
    pub fn get_cursor(&self) -> JsValue;               // [col, row] or null
    pub fn get_size(&self) -> Vec<usize>;              // [cols, rows]
}
```

**Critical: The player uses zero-copy WASM memory access, NOT JSON serialization.**

`get_line()` returns structured data with `repr(C)` memory layout read directly via `DataView`:

```rust
#[repr(C)]
struct BgSpan { column: u16, width: u16, color: Color }              // 8 bytes
#[repr(C)]
struct TextSpan { column: u16, text_start: u16, text_len: u16, color: Color, attrs: TextAttrs }  // 12 bytes
#[repr(C)]
struct RasterSymbol { column: u16, codepoint: u32, color: Color }    // 12 bytes
#[repr(C)]
struct VectorSymbol { column: u16, codepoint: u32, color: Color, attrs: TextAttrs }  // 16 bytes

#[repr(C, u8)]
enum Color {
    None = 0,
    DefaultFg = 1,
    DefaultBg = 2,
    Indexed(u8) = 3,    // 0-255 palette index
    Rgb(u8, u8, u8) = 4, // 24-bit RGB
}  // 4 bytes total
```

JavaScript reads these directly from WASM linear memory:
```javascript
function renderRowBg(rowIndex, spans, theme) {
    const view = core.getDataView(spans, 8);  // 8 = sizeof(BgSpan)
    let i = 0;
    while (i < view.byteLength) {
        const column = view.getUint16(i + 0, true);
        const width = view.getUint16(i + 2, true);
        const color = getColor(view, i + 4, theme);
        i += 8;
        // ... render
    }
}
```

**The player uses a 3-layer rendering architecture:**
1. **Canvas** -- block/box drawing characters (U+2580..U+259F, braille, nerd font icons)
2. **SVG** -- vector symbols (powerline separators, geometric shapes)
3. **HTML `<pre>`** -- regular text with CSS for colors/attributes

**Symbol classification:** Characters are classified at render time:
- Raster symbols → drawn on Canvas2D at 8x24 pixel resolution per character
- Vector symbols → SVG `<use>` elements referencing path definitions
- Regular text → `<span>` elements with CSS classes for color/attrs

**Color handling:** Tag-based (4 bytes): `None | "fg" | "bg" | paletteIndex(0-255) | "#RRGGBB"`

**Build config (`Cargo.toml`):**
```toml
[dependencies]
avt = "0.16.0"
wasm-bindgen = "0.2.106"
serde-wasm-bindgen = "0.6.5"
wee_alloc = "0.4"

[profile.release]
opt-level = "z"    # optimize for size
strip = true
```

**Build integration:** `@aspect-build/rollup-plugin-rust` with `inlineWasm: true` embeds the WASM binary directly into the JS bundle.

##### What we take vs. what we don't need

**From avt (take everything):**
- The full VT parser and terminal state machine
- Cell, Line, Pen, Color data structures
- Primary/alternate buffer management
- Scrollback with configurable limits

**From the player's vt-js bridge (use as reference, simplify):**
- The `create/feed/get_line` WASM-bindgen pattern
- The `repr(C)` memory layout approach for zero-copy access

**From the player's renderer (DON'T need for MVP v2):**
- Canvas rendering for block glyphs -- our use case is static snapshots, not pixel-perfect playback
- SVG rendering for vector symbols -- same reason
- The adaptive buffering system -- we're not doing real-time playback
- The playback driver (seek, step, speed control) -- not needed

**Our simplified rendering:** For static terminal snapshots, we only need the text layer. We iterate avt's `view()` lines, read each cell's character + pen attributes, and emit structured JSON spans. The client renders these as `<span>` elements with CSS classes. Block drawing characters render fine as text in a monospace font -- Canvas rendering is a playback optimization we don't need.

#### Option C: Custom Terminal State Machine

Build a minimal VT parser in TypeScript that tracks cursor position, styles, and a screen buffer.

**Pros:**
- No external dependencies or build toolchain changes
- Full control over behavior
- Could be exactly tailored to asciicast patterns

**Cons:**
- Terminal escape code parsing is notoriously complex. The VT100/xterm spec has hundreds of control sequences, many with subtle interactions.
- High implementation risk -- edge cases in real TUI output (alternate screen transitions, scroll regions, character set switching, OSC sequences) would take months to handle correctly
- We would be reimplementing what avt already does (6,466 lines of Rust with property-based fuzz testing), but worse
- Every real session we analyzed uses a different subset of escape codes. A minimal parser would break on some subset of real data.
- Testing burden is enormous -- we would need to validate against every terminal emulator behavior

**Verdict:** Rejected. The problem is well-solved by existing libraries. Building our own parser would be the highest-risk option with no compensating advantage.

### Decision

**Use asciinema's `avt` crate (v0.17.0) via a custom WASM bridge modeled on the player's `vt-js` pattern, simplified for static snapshot rendering.**

Rationale:
1. avt is purpose-built for our exact use case: processing recorded terminal output and maintaining a virtual screen buffer
2. 6,466 lines of battle-tested Rust with property-based fuzz testing -- we get correctness for free
3. The full VT parser handles all escape codes found in our production sessions (45+ CSI functions, alternate screen, scroll regions, all color modes)
4. The API model (`feed_str()` → iterate `view()` → read cells) maps directly to our architecture
5. Works server-side (WASM in Node.js) and client-side (WASM in browser)
6. Minimal dependencies (2 crates: `rgb`, `unicode-width`)
7. Apache-2.0 license compatible with RAGTS's AGPL-3.0
8. The asciinema-player's WASM bridge provides a proven reference implementation we can adapt

**Implementation approach:**
- Create `packages/vt-wasm/` with a simplified WASM bridge wrapping avt
- Use avt's Rust API directly: `Vt::builder().size(cols, rows).scrollback_limit(limit).build()`
- For server-side processing: `feed_str()` → iterate `view()` → serialize cells to JSON spans
- Simplify the player's `repr(C)` memory layout to JSON serialization via `serde-wasm-bindgen` (performance is adequate for one-time server processing; we can optimize to zero-copy later if needed)
- **Don't** replicate the player's 3-layer Canvas/SVG/HTML rendering -- we only need the text/span layer

**Build approach: Containerized WASM compilation, committed binary.**

WASM is platform-independent — one `.wasm` binary runs identically on macOS, Linux, and Windows (it executes inside Node.js/browser, not natively on the OS). No per-architecture builds needed.

The Rust toolchain is isolated inside a Podman/Docker container. Docker/Podman is already an expected project dependency per ARCHITECTURE.md Section 4 (Deployment View: single container → docker-compose → orchestrated). The WASM build container is just another use of infrastructure developers already have.

```
packages/vt-wasm/
├── Dockerfile              # Build container: rust:1.82 + wasm-pack
├── build.sh                # podman/docker build + run → outputs pkg/
├── Cargo.toml              # avt + wasm-bindgen dependencies
├── src/lib.rs              # Thin wasm-bindgen wrapper around avt
├── pkg/                    # COMMITTED TO REPO — build output
│   ├── vt_wasm_bg.wasm     # The WASM binary (platform-independent)
│   ├── vt_wasm.js          # JS glue (generated by wasm-pack)
│   └── vt_wasm.d.ts        # TypeScript types (generated)
└── index.ts                # Our typed wrapper that imports from pkg/
```

Build workflow:
```bash
# One-time or when updating avt version:
cd packages/vt-wasm
./build.sh                  # uses podman (or docker) internally
git add pkg/
git commit -m "chore: rebuild vt-wasm binary"
```

The `Dockerfile`:
```dockerfile
FROM rust:1.82-slim
RUN cargo install wasm-pack
WORKDIR /build
COPY Cargo.toml Cargo.lock src/ ./
RUN wasm-pack build --target nodejs --release
# Output: /build/pkg/
```

The `build.sh`:
```bash
#!/bin/bash
set -euo pipefail
CONTAINER_ENGINE="${CONTAINER_ENGINE:-podman}"
$CONTAINER_ENGINE build -t ragts-vt-build .
$CONTAINER_ENGINE run --rm -v "$(pwd)/pkg:/build/pkg" ragts-vt-build
echo "WASM build complete → pkg/"
```

**Why this approach:**
- No Rust on developer machines — uses the same Docker/Podman already needed for deployment
- WASM output is platform-independent — build once on any OS, runs everywhere
- Binary committed to repo — `npm install` + `npm run dev` just works, no container needed for day-to-day dev
- Reproducible builds — pinned Rust version in Dockerfile
- Update path: bump avt version in Cargo.toml → `./build.sh` → commit pkg/

### Consequences

- **Build toolchain**: Rust is isolated inside a container. Only needed when rebuilding the WASM module (avt version bump or wrapper changes). Uses the same Docker/Podman already required by the project's deployment architecture (ARCHITECTURE.md Section 4).
- **AnsiLine.vue**: Replaced entirely. The new rendering component receives structured span data from avt, not raw ANSI strings.
- **anser dependency**: Removed.
- **Performance**: avt processes events through a compiled WASM state machine -- significantly faster than any JS-based parser for large sessions.
- **Correctness**: We inherit asciinema's years of terminal emulation testing, including property-based fuzzing.
- **Note on avt versions**: The player currently pins avt 0.16.0; we use 0.17.0 (latest). API is compatible.
- **Day-to-day development**: No container needed. Developers use the committed `.wasm` binary. Container only needed for WASM rebuilds.

---

## Decision 2: Section Detection Algorithm

### Context

83% of production sessions have zero markers. Without section detection, these sessions render as walls of text with no fold points. The detection algorithm must work with real TUI output, not shell prompts.

### Analysis of Production Sessions

**Session 1: Claude Code (agnt-ses-rec_260203_171636.cast)**
- 34,966 events, 6.6MB, AGR-processed (timestamps compressed to ~2s total duration)
- 23 screen clears (`\x1b[2J`) at identifiable points
- Screen clears correlate with TUI activity boundaries: tool executions (`Bash(cargo +nightly miri test 2>&1)`), screen redraws after output review
- Heavy cursor movement (A: 197, C: 210 in first 200 events) confirms full TUI operation
- No alternate screen transitions (the TUI manages the primary buffer directly)
- Timing gaps are unreliable in this session because AGR has stripped silence

**Session 2: Codex (codex-pattern-analysis.cast)**
- 10,340 events, 4.3MB, 80x24 terminal
- 9 significant timing gaps (>5s), ranging from 5.1s to 91.9s
- Gaps correlate with user think time or agent processing -- these are natural section boundaries
- 2 alternate screen transitions (event 916 ON, 990 OFF) -- a brief editor/pager interaction
- 69 cursor-home moves -- frequent full-screen redraws typical of Codex's TUI
- After large gaps, events show full TUI redraws (cursor positioning + line erasing patterns)

**Session 3: Claude Code hybrid (fix-grid-field-type-batch-update.cast)**
- 30K+ lines, 13MB, 363x29 terminal (very wide)
- 4 explicit markers with semantic labels: `[PLAN]`, `[SUCCESS]`, `[IMPL]`, `[SUCCESS]`
- Markers are at events 505, 7247, 15619, 20573 -- unevenly distributed
- Large unmarked regions between markers need auto-detection to fill gaps

### Detection Approach: Multi-Signal Heuristic

No single signal reliably identifies section boundaries across all agent types. The algorithm combines multiple signals with weighted scoring:

#### Signal 1: Timing Gaps (Primary Signal)

Large timing gaps between consecutive events indicate natural pauses -- user thinking, agent processing, or session phase transitions.

- **Threshold**: Adaptive, based on session statistics. Compute the median inter-event gap and the 95th percentile. A "significant gap" is one that exceeds `max(5 seconds, 95th_percentile * 3)`.
- **Weight**: High. This is the most reliable signal across all agent types.
- **Limitation**: AGR-processed sessions may have compressed timestamps. If max_gap < 1s across the entire session, timing is unreliable and this signal is disabled.

#### Signal 2: Screen Clear Sequences (Secondary Signal)

`\x1b[2J` (clear entire screen) and `\x1b[3J` (clear screen + scrollback) indicate TUI phase transitions. In Claude Code sessions, these correlate with tool execution boundaries.

- **Detection**: Scan output event data for `\x1b[2J` or `\x1b[3J`
- **Weight**: Medium-high. Very reliable when present, but not all sessions use screen clears.
- **Debounce**: Multiple clears within 10 events of each other are treated as a single boundary (TUI redraw noise). Use the last clear in a cluster.

#### Signal 3: Alternate Screen Buffer Transitions (Secondary Signal)

`\x1b[?1049h` (enter alternate screen) and `\x1b[?1049l` (leave alternate screen) bracket editor/pager interactions. The exit from alternate screen is a natural section boundary. In avt's terminal state machine, this maps to `DecMode::SaveCursorAltScreenBuffer` (1049).

- **Detection**: Track `?1049h` / `?1049l` sequences (also `?1047h/l` for plain alt screen)
- **Weight**: Medium. Rare but very precise when present.
- **Boundary placement**: At the `?1049l` (exit) event. The alternate screen content itself could be a collapsed sub-section.

#### Signal 4: Output Volume Bursts (Tertiary Signal)

Periods of high output volume (many events in rapid succession) followed by silence indicate agent processing phases. The transition from burst to quiet is a potential boundary.

- **Detection**: Compute a rolling window of output bytes per time unit. Boundaries at transitions from high-volume to low-volume.
- **Weight**: Low. Used as a tiebreaker, not a primary signal.
- **Only applicable**: When timing data is available (non-compressed sessions).

#### Boundary Scoring and Merging

1. Each signal produces candidate boundary events with a confidence score (0.0 - 1.0)
2. Candidates within 50 events of each other are merged (take the highest-confidence one)
3. Candidates with combined score below 0.3 are discarded
4. Minimum section size: 100 events. Boundaries that would create sections smaller than this are dropped (merge with the adjacent section).
5. Maximum sections per session: 50. If more boundaries are detected, keep only the top-50 by confidence score.

#### Label Generation

Auto-detected sections get generated labels based on available context:
- If timing data is available: `"Section N (after Xs pause)"` where X is the gap duration
- If screen clear triggered: `"Section N (screen transition)"`
- If alternate screen exit: `"Section N (editor/viewer exit)"`
- Fallback: `"Section N"`

#### Marker Precedence

When a session has both markers and auto-detected sections:
1. Markers are inserted first as fixed anchor points
2. Auto-detection runs only in the gaps between markers
3. If a detected boundary falls within 100 events of a marker, the detected boundary is dropped
4. This ensures markers always take precedence without collision

### Decision

**Implement multi-signal heuristic detection with adaptive thresholds, run server-side during ingestion.**

The algorithm prioritizes timing gaps (when available) and screen clear sequences (always available in TUI sessions). It degrades gracefully: if timestamps are compressed, it falls back to structural signals only. If no signals are found, the session renders as a single block.

### Consequences

- Detection is a best-effort heuristic. Some sessions will have poor boundaries. This is acceptable for MVP v2 -- the re-detection endpoint allows improvement as the algorithm evolves.
- The algorithm is deterministic given the same input -- re-detection produces the same results unless the algorithm itself is updated.
- Server-side processing means detection results are stored in the `sections` table and served to all clients. No per-client computation.

---

## Decision 3: Server-Side vs Client-Side Rendering

### Context

The terminal emulator (avt/WASM) can run in either environment. The question is where the asciicast events are processed into rendered output.

### Options

#### Option A: Fully Client-Side

Browser loads raw asciicast events, feeds them through avt WASM, renders the buffer state.

**Pros:**
- Simple server -- just serves raw `.cast` file chunks
- No server CPU cost for rendering
- Client has full control over rendering (can re-render on resize, theme change)

**Cons:**
- 200MB sessions cannot be loaded into browser memory
- WASM initialization + event processing delays first paint
- Every client repeats the same rendering work
- Cannot do server-side section detection labeling based on rendered content

#### Option B: Fully Server-Side (Pre-render)

Server processes asciicast events through avt, stores pre-rendered HTML/structured output in the database.

**Pros:**
- Client receives ready-to-display content -- instant rendering
- Server can render once, serve to all clients
- Server has access to full session for section detection

**Cons:**
- Significant storage overhead (rendered HTML is larger than raw events)
- Pre-rendering 200MB sessions is expensive and slow on upload
- Theme changes require re-rendering all sessions
- Ties the rendering format to the storage layer

#### Option C: Hybrid -- Server-Side Processing, Client-Side Rendering (Recommended)

Server processes events through avt to extract **structured terminal state** (not HTML) per section. Client renders the structured data to DOM.

**How it works:**
1. On upload/ingestion, the server runs avt over the entire event stream
2. At each section boundary, the server snapshots the terminal buffer state as structured JSON: an array of lines, each line an array of spans with `{text, fg, bg, bold, italic, ...}`
3. These snapshots are stored in the database alongside section metadata
4. The client receives section snapshots and renders them to DOM spans with CSS classes
5. For the "between sections" content, the server also stores the intermediate output so clients can expand sections and see full content

**Snapshot data model (derived from avt's Cell/Pen types):**
```typescript
interface TerminalSnapshot {
  cols: number;
  rows: number;
  lines: SnapshotLine[];
}

interface SnapshotLine {
  spans: SnapshotSpan[];
  wrapped: boolean;
}

interface SnapshotSpan {
  text: string;
  fg?: string | number;   // null=default, number=palette(0-255), string="#RRGGBB"
  bg?: string | number;   // same
  bold?: boolean;
  faint?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  blink?: boolean;
  inverse?: boolean;
}
```

This maps directly to avt's `Cell(char, width, Pen)` → consecutive cells with identical pens are merged into spans.

**Pros:**
- Rendering work done once on the server, amortized across all clients
- Client receives lightweight structured data, not raw escape codes
- Terminal state snapshots are compact (typically a 80x24 or 120x40 grid of styled characters)
- Theme changes are pure CSS (colors are stored as indices, not hardcoded hex values)
- Server has full context for section detection
- Scales to any session size -- the server processes in a streaming fashion, client receives only what it needs

**Cons:**
- More complex server pipeline than pure pass-through
- Storage overhead for snapshots (mitigated by their compact size)
- Server needs WASM runtime (Node.js can load WASM modules natively via `WebAssembly.instantiate`)

### Decision

**Hybrid approach: server-side avt processing with structured snapshots, client-side DOM rendering.**

The server runs avt over the event stream during ingestion, produces terminal buffer snapshots at section boundaries, and stores them. The client renders these snapshots to styled DOM elements. This gives us correct rendering, single-computation amortization, and scalability for large sessions.

### Implementation Detail

The server processing pipeline:

```
Upload .cast file
  -> Stream NDJSON lines (readline, not load-all)
  -> Parse header for cols/rows (feed to Vt::builder().size(cols, rows))
  -> Parse events (timestamp, type, data)
  -> Run section detection (Decision 2) to identify boundaries
  -> Feed output events via vt.feed_str(data)
  -> At each section boundary:
     -> Iterate vt.view() to snapshot the terminal buffer
     -> Merge consecutive cells with identical pens into spans
     -> Store snapshot + section metadata in DB
  -> Store session metadata (event_count, detected_sections_count, etc.)
```

The client rendering:

```
Load session detail
  -> Receive sections array with metadata + collapsed state
  -> For each visible/expanded section:
     -> Render TerminalSnapshot as grid of styled <span> elements
     -> CSS variables for palette colors (theme-able)
  -> Expand/collapse sections by showing/hiding snapshot content
```

### Consequences

- The server ingestion pipeline becomes the critical path. It must handle 200MB sessions without crashing.
- Streaming NDJSON parsing is required -- we cannot load entire sessions into memory.
- avt WASM runs in Node.js (supported natively via `WebAssembly.instantiate`).
- The `sections` table gains a `snapshot` column (JSON blob) for rendered terminal state.
- The client `AnsiLine.vue` is replaced by a `TerminalSnapshot.vue` that renders structured span data.

---

## Decision 4: Migration Strategy for Existing Sessions

### Context

MVP v1 sessions exist in the database with:
- Markers parsed on-the-fly from `.cast` files (not stored in DB)
- No `event_count` field
- No `sections` table
- No pre-rendered snapshots

### Migration Plan

#### Schema Migration

1. Add new columns to `sessions` table: `agent_type`, `event_count`, `detected_sections_count`, `detection_status`
2. Create `sections` table with `id`, `session_id`, `type`, `start_event`, `end_event`, `label`, `snapshot`, `created_at`
3. Create indexes per the REQUIREMENTS.md schema

#### Data Migration (Offline, One-Time)

For each existing session:

1. **Count events**: Stream the `.cast` file, count NDJSON lines minus 1 for the header. Store as `event_count`. This is fast (line counting, no JSON parsing).

2. **Extract markers**: Read the `.cast` file, parse each line, extract `"m"` type events. Insert into `sections` table with `type='marker'`, `start_event` set to the event index. This reuses the existing `extractMarkers()` logic from `src/shared/asciicast.ts`.

3. **Run section detection**: Process the session through the new detection pipeline (Decision 2). Insert detected boundaries into `sections` table with `type='detected'`. Set `detection_status='completed'`.

4. **Generate snapshots**: Process the session through avt, generate terminal buffer snapshots at each section boundary. Store in the `sections.snapshot` column.

Steps 2-4 can be combined into a single streaming pass over the `.cast` file.

#### Migration Performance

- Event counting: O(file_size) -- fast, just count newlines
- Marker extraction + detection + snapshot generation: single streaming pass, O(events)
- For the 207MB Gemini session (199K events): expected ~30-60 seconds
- Migration is idempotent -- can be re-run safely

#### Backward Compatibility

- Existing sessions continue to work throughout migration
- If migration is interrupted, `detection_status='pending'` sessions are picked up on next run
- The API falls back gracefully: if no snapshots exist for a section, the client can request raw events and render client-side (degraded mode)

### Decision

**Single-pass streaming migration that counts events, extracts markers, runs detection, and generates snapshots in one read of each `.cast` file.**

### Consequences

- Migration must run before MVP v2 is fully functional (existing sessions need snapshots)
- Migration script is a CLI command: `npm run migrate:v2`
- Large sessions (>50MB) will take noticeable time -- progress logging is necessary
- The migration is additive only (no data deletion) -- safe to roll back by dropping new columns/tables

---

## Appendix: asciinema-player Source Code Reference

This appendix documents the concrete findings from analyzing the asciinema-player (`github.com/asciinema/asciinema-player`) and avt (`github.com/asciinema/avt`) source code repositories, cloned and read in full.

### A1: Player Architecture Overview

```
Recording File (.cast)
    ↓ src/parser/asciicast.js (supports v1/v2/v3 formats)
Parser → { cols, rows, events: [[time, type, data], ...] }
    ↓ src/driver/recording.js (playback state machine)
Recording Driver → play/pause/seek/step
    ↓ src/buffer.js (adaptive buffering with EMA smoothing)
Buffer → timed event delivery
    ↓ src/vt/ (Rust WASM via avt)
Virtual Terminal → screen buffer state
    ↓ src/components/Terminal.js (SolidJS component)
3-Layer Renderer: Canvas (blocks) + SVG (vectors) + HTML (text)
```

### A2: avt Internal Architecture

**Parser states (11):** Ground, Escape, EscapeIntermediate, CsiEntry, CsiParam, CsiIntermediate, CsiIgnore, DcsEntry, DcsParam, DcsIntermediate, DcsPassthrough, OscString, SosPmApcString.

**Emitted functions (45+):** Cup, Cuu, Cud, Cuf, Cub, Cha, Vpa, Cnl, Cpl, Ich, Dch, Il, Dl, Ech, El, Ed, Cht, Cbt, Hts, Tbc, Su, Sd, Sgr, Sm, Rm, Decset, Decrst, and more.

**DEC modes tracked:** CursorKeys(1), Origin(6), AutoWrap(7), TextCursorEnable(25), AltScreenBuffer(1047), SaveCursor(1048), SaveCursorAltScreenBuffer(1049).

**Memory layout:** `VecDeque<Line>` for efficient front/back operations. Each Cell is ~13 bytes (char:4 + width:1 + Pen:8). An 80x24 screen is ~25KB. A 363x29 wide terminal is ~137KB per snapshot.

### A3: Player Color Pipeline

```
avt Color enum → vt-js Color repr(C) → JavaScript getColor() → CSS string

Rust side:
  Indexed(n) → tag=3, value=n
  RGB(r,g,b) → tag=4, r, g, b

JS side:
  tag 0 → null (no color)
  tag 1 → theme.fg (default foreground)
  tag 2 → theme.bg (default background)
  tag 3 → theme.palette[n] (0-255, includes 16 ANSI + 240 extended)
  tag 4 → `rgb(${r},${g},${b})`
```

### A4: Player Text Attribute Mapping

```rust
// Rust TextAttrs bitmask:
const BOLD: u8 = 1;
const FAINT: u8 = 1 << 1;
const ITALIC: u8 = 1 << 2;
const UNDERLINE: u8 = 1 << 3;
const STRIKETHROUGH: u8 = 1 << 4;
const BLINK: u8 = 1 << 5;
```

```javascript
// JS CSS class mapping:
if (attrs & 1) cls += "ap-bold ";
if (attrs & 4) cls += "ap-italic ";
if (attrs & 8) cls += "ap-underline ";
if (attrs & 16) cls += "ap-strike ";
```

### A5: What We Reuse vs. What We Don't

| Component | Reuse? | Reason |
|-----------|--------|--------|
| avt crate (VT parser + terminal) | YES (direct dependency) | Core functionality, 6.5K lines of tested Rust |
| vt-js WASM bridge pattern | YES (as reference for our wrapper) | Proven WASM-bindgen pattern |
| `repr(C)` memory layout | LATER (start with serde JSON) | Optimization can wait; JSON is fine for server-side one-time processing |
| Canvas block glyph rendering | NO | Static snapshots, not pixel-perfect playback |
| SVG vector symbol rendering | NO | Same reason |
| SolidJS Terminal component | NO | We use Vue, and our rendering is simpler (spans not canvas) |
| Playback driver | NO | We don't do real-time playback |
| Adaptive buffering | NO | Not streaming to client |
| asciicast parser | REFERENCE | We already have our own parser; can cross-reference for v3 format support |

---

## Summary of Decisions

| # | Decision | Choice | Key Rationale |
|---|----------|--------|---------------|
| 1 | Rendering Engine | asciinema `avt` v0.17.0 via WASM | Purpose-built for asciicast, 6.5K lines tested Rust, full VT parser. Source code analyzed in depth. |
| 2 | Section Detection | Multi-signal heuristic (timing gaps + screen clears + alt screen) | Adapts to real TUI data, degrades gracefully |
| 3 | Rendering Architecture | Hybrid: server-side avt processing, client-side DOM rendering | Render once, serve to all; scales to 200MB sessions |
| 4 | Migration Strategy | Single-pass streaming migration | Efficient, idempotent, additive-only |
