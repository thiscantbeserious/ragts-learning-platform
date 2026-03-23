# Web Performance Benchmarks for Content-Heavy Web Applications

> Research context: RAGTS terminal session viewer — a content-heavy web app that renders large amounts of pre-formatted text with ANSI colors. Think: xterm.js-style output, potentially thousands of lines per session, with scrollback.
>
> Research date: 2026-03-23

---

## Research Brief

The caller requested industry-standard web performance benchmarks applicable to a terminal session viewer that renders large amounts of pre-formatted text with ANSI colors. Specific questions:

- Good/acceptable/poor thresholds for FCP, LCP, TTI, FID/INP
- Google Core Web Vitals thresholds
- What GitHub code view, VS Code web, Monaco editor target
- Recommended max DOM node count and Lighthouse flagging thresholds
- DOM depth and children-per-node limits
- Performance impact per 1000 DOM nodes
- Virtual scrolling library max rendered count recommendations
- Scroll FPS targets, jank measurement methods, acceptable CLS during scroll
- Reasonable JS heap for a web app; Chrome tab memory limits
- Acceptable API response times; response size recommendations; cache hit ratio targets

---

## 1. Load Performance

### 1.1 Google Core Web Vitals (Official — 2024-2026)

These are Google's official binding thresholds. INP replaced FID as a Core Web Vital in March 2024. Thresholds apply at the **75th percentile** of all page views to be classified as "good" for a site.

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| **LCP** — Largest Contentful Paint | ≤ 2.5s | 2.5s – 4.0s | > 4.0s |
| **INP** — Interaction to Next Paint | ≤ 200ms | 200ms – 500ms | > 500ms |
| **CLS** — Cumulative Layout Shift | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |

**Note:** FID (First Input Delay) was retired in March 2024. INP is the replacement.

Additional diagnostic metrics tracked but not part of the Core Web Vitals pass/fail:

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| **FCP** — First Contentful Paint | ≤ 1.8s | 1.8s – 3.0s | > 3.0s |
| **TTFB** — Time to First Byte | ≤ 800ms | 800ms – 1800ms | > 1800ms |
| **TBT** — Total Blocking Time (Lighthouse lab) | ≤ 200ms desktop / ≤ 300ms mobile | 200–600ms | > 600ms |

**Note on TTI:** Time to Interactive was removed as a scored metric from Lighthouse 10. The modern replacement is TBT (Total Blocking Time), which accounts for 30% of the Lighthouse Performance score. The historical "good" TTI threshold was ≤ 3.8s; "poor" was > 7.3s — these remain useful reference points for regression testing but are no longer official.

### 1.2 Lighthouse Performance Score Composition (2025)

| Metric | Weight in score |
|---|---|
| LCP | 25% |
| TBT | 30% |
| CLS | 25% |
| FCP | 10% |
| Speed Index | 10% |

Target Lighthouse Performance score for a developer tool: **≥ 75** (good zone). Competitive apps like Linear, GitHub code view, and Vercel Dashboard target ≥ 85 on desktop lab conditions.

### 1.3 GitHub Code View — Direct Benchmark

GitHub's code view engineering work is the single most relevant reference case for RAGTS:

- **Problem:** Naively rendering large files caused LCP and TTI to degrade noticeably at 2,000 lines. On very large files, initial render time reached **27 seconds**.
- **Solution:** DOM virtualization — only the ~75 visible lines are in the DOM at any time.
- **Result:** Initial render dropped to **under 1 second**, independent of file size, including artificially large files of hundreds of megabytes.

This is the gold standard for our use case. Pre-formatted text at scale is solved by virtualization — not by optimizing a fully-rendered tree.

---

## 2. DOM Performance

### 2.1 Lighthouse "Avoid Excessive DOM Size" Thresholds

Lighthouse issues warnings and errors using three criteria:

| Criterion | Threshold |
|---|---|
| Total DOM node count — warning | > 800 nodes |
| Total DOM node count — error | > 1,500 nodes |
| Maximum DOM depth — error | > 32 levels |
| Max child nodes per single parent — error | > 60 children |

These are diagnostics, not direct Lighthouse score inputs, but they correlate strongly with poor INP and layout thrashing in practice.

### 2.2 Performance Impact Per DOM Node

From web.dev research on DOM size and interactivity:

- Style calculation cost is **non-linear** — each additional node adds to the cost of every CSS selector match pass across the entire tree.
- Layout/reflow cost scales with tree size — any geometry-changing property change cascades through all descendant nodes.
- Memory cost is direct — every node in the DOM is kept in memory regardless of visibility.
- Practical threshold: past **~1,000 nodes**, INP degrades measurably on mid-range hardware. Past **~3,000 nodes**, the degradation is perceptible on desktop.

### 2.3 ANSI Color Rendering — DOM Node Multiplier

This is RAGTS-specific:

- Each ANSI color segment becomes a `<span>` element when rendered as HTML.
- A single line with moderate color usage (e.g. colored prompt, status codes, highlighted output) can produce **20–50 DOM nodes per row**.
- A nominal 200-line naively-rendered session with ANSI output could produce **4,000–10,000 DOM nodes** — well above Lighthouse error thresholds.
- This makes **virtual scrolling non-negotiable** for RAGTS, even for modestly sized sessions.

### 2.4 Virtual Scrolling — Recommended Rendered Count

TanStack Virtual and similar libraries recommend:

- **Visible nodes in DOM at any time:** 15–20 list items (visible viewport) plus a small buffer
- **Total DOM elements managed at once:** approximately 60 elements (visible + overscan)
- **Default overscan:** 1 item above/below the viewport. Increasing overscan reduces blank flash during fast scroll but increases render cost.

For a terminal session viewer rendering fixed-height text rows: render ~60 rows at any time regardless of session length. The full scrollback buffer must never enter the DOM.

---

## 3. Scroll Performance

### 3.1 Frame Rate Targets

| Target | Frame budget | Context |
|---|---|---|
| 60fps | 16.6ms per frame | Standard display — the industry minimum for smooth scroll |
| 90fps | 11.1ms per frame | Modern mobile and high-refresh monitors |
| 120fps | 8.3ms per frame | Gaming monitors, newer iPads, Apple ProMotion displays |

**Practical browser budget:** ~10ms of usable work per frame, as browsers consume ~6ms for overhead. Any JavaScript executing during scroll that exceeds 10ms risks a dropped frame.

### 3.2 Measuring Scroll Jank

- **Long tasks:** Any main-thread task > 50ms is a long task. Detected via the Long Tasks API or Chrome DevTools Performance panel. Fewer than 25% of production websites keep all tasks under 50ms.
- **Long Animation Frames (LoAF):** The 2024 replacement for Long Tasks. Any animation frame > 50ms produces a LoAF entry. LoAF captures rendering time in addition to script time, making it the authoritative tool for diagnosing INP and scroll jank.
- **Forced reflows (layout thrashing):** Reading layout properties (`.offsetHeight`, `.getBoundingClientRect()`) inside scroll handlers forces the browser to recalculate layout synchronously — a common cause of scroll jank.

Best practices:
- Use `transform` and `opacity` for all visual motion — never `top`/`left`/`width`/`height` (these trigger layout)
- Use `will-change: transform` for layers that animate or scroll independently
- Debounce or avoid layout reads inside scroll handlers
- Keep all scroll handler work under 10ms total

### 3.3 CLS During Scroll

- CLS ≤ 0.1 is the "good" Core Web Vitals threshold
- For a terminal viewer: layout shifts during scroll are almost always caused by variable-height rows being measured lazily as they enter the viewport
- **Recommended approach:** fix row height for the virtual list (monospace terminal lines are naturally constant height unless wrapping is enabled) — this eliminates all scroll-related CLS
- If variable-height rows are required: pre-measure and cache heights before virtualizer rendering begins

---

## 4. Memory

### 4.1 Browser JS Heap — Platform Limits

| Platform | Practical JS heap ceiling |
|---|---|
| Desktop 64-bit (Chrome/Edge, V8 default) | ~1.4 GB old-space; effective per-tab practical limit ~500 MB for well-behaved apps |
| Desktop (conservative production target) | 300–500 MB |
| Mobile (Android/iOS) | 300 MB is a common OOM boundary; tab kills begin at ~300–500 MB depending on device |

These are V8 engine defaults; browsers apply safety caps that vary by platform version. Exceeding mobile limits causes tab kills.

### 4.2 What Heavy Web Apps Use

| App | Reported JS heap (working state) |
|---|---|
| Figma (complex design file) | 500 MB – 2 GB (design data in WASM memory; JS heap itself is smaller) |
| VS Code Web (medium project) | 200–600 MB (Node.js worker default 512 MB heap) |
| Google Docs (large document) | 150–400 MB |
| xterm.js (large scrollback) | Scales with scrollback buffer size; 100,000-line buffer ≈ 50–100 MB for raw buffer data |

### 4.3 Reasonable Targets for RAGTS

| Scenario | Target JS heap |
|---|---|
| Idle (session list, no session open) | < 50 MB |
| Small session (< 1,000 lines) | < 100 MB |
| Large session (10,000+ lines) | < 200 MB |
| Very large session (100,000+ lines) | < 400 MB (with virtual scroll discarding off-screen parsed data) |
| After closing a session (return to list) | Within 10% of idle heap (no memory leaks) |

Recommended strategy: only hold parsed and colorized data for the visible window plus a small buffer. Do not accumulate parsed rows for the entire session in memory if the session is very large; use windowed caching with eviction.

---

## 5. Network

### 5.1 API Response Time Thresholds

| Classification | Threshold | User perception |
|---|---|---|
| Excellent (target) | ≤ 100ms | Instantaneous — no perceived latency |
| Very good | 100–250ms | Smooth, responsive |
| Acceptable | 250–500ms | Slight delay, still interactive |
| Mediocre | 500ms–1s | Noticeable wait, disrupts flow |
| Poor | > 1s | Perceived as slow; bounce risk increases |
| Critical | > 2s | Significant bounce risk; user frustration |

For RAGTS specifically:
- **Session list API:** Target ≤ 200ms p95
- **Session metadata fetch:** Target ≤ 200ms p95
- **Session data (content):** First byte ≤ 800ms (TTFB); streaming preferred over blocking on full payload
- **Streaming/chunked delivery** is the correct pattern for large session files — deliver the first viewport's worth of content in the first chunk; continue streaming the remainder while the user reads

### 5.2 Response Payload Size Recommendations

| Payload type | Recommendation |
|---|---|
| JSON list endpoint | ≤ 50 KB uncompressed; paginate beyond that |
| JSON single-item metadata | ≤ 10 KB |
| Session content (terminal output) | Stream; no upper limit if chunked |
| JavaScript bundle | ≤ 250 KB gzipped (Lighthouse budget guidance) |
| CSS | ≤ 50 KB gzipped |

Apply Brotli compression to all JSON API responses. Brotli achieves 20–30% better compression than Gzip for JSON text. Gzip is acceptable as a fallback.

### 5.3 Cache Hit Ratio Targets

| Asset type | Target cache hit ratio |
|---|---|
| Static assets (JS, CSS, fonts, images) | ≥ 95% |
| Session content files (immutable after upload) | ≥ 90% — set `Cache-Control: immutable` with content-addressed URLs |
| Session list API (frequently updated) | 20–60% — varies by update frequency; acceptable |
| Session metadata (rarely updated) | ≥ 70% with short TTL |

A cache hit ratio below 80% on static files indicates a configuration problem, not a load problem.

---

## 6. Terminal / Text Viewer — Specific Patterns

### 6.1 xterm.js Rendering Strategies (Reference Implementation)

xterm.js is the de-facto reference for browser-based terminal rendering and documents three rendering backends:

| Renderer | Approach | Use case |
|---|---|---|
| DOM renderer (default) | Creates HTML elements per visible row | Interactive terminals with moderate output; simple, accessible |
| Canvas 2D renderer (addon) | Off-screen canvas with glyph caching | Medium-to-large output; no individual DOM nodes per character |
| WebGL renderer (addon) | GPU-accelerated, texture atlas | Sustained high-throughput streaming (build logs, CI output); best FPS |

On mid-2014 hardware: copying a 160-column × 5,000-line buffer took 30–60ms per operation — above the 16.6ms frame budget. This is why the DOM renderer is inadequate for large scrollbacks without virtualization.

For a **read-only viewer** (RAGTS use case): DOM virtualization + DOM renderer per visible row is appropriate. For live streaming sessions, Canvas or WebGL avoids per-DOM-node cost.

### 6.2 ANSI Span Density — The Key Design Constraint

- ANSI escape sequences inflate raw text size by 10–40% before parsing
- Parsed ANSI output rendered as HTML creates `<span>` elements per color segment — not per character
- A single highly-colored terminal line can produce 20–50 `<span>` nodes
- A 100-row viewport with ANSI-heavy output could produce 2,000–5,000 DOM nodes from color spans alone

Mitigation options ranked by effectiveness:
1. **Canvas-based rendering** — avoids DOM entirely; most performant, least accessible
2. **CSS custom properties** — color information as CSS variables instead of inline styles reduces selector recalculation cost
3. **Segment collapsing** — merge adjacent same-color text into single spans before rendering; reduces node count by 30–60% in typical terminal output
4. **Virtual row rendering** — regardless of spans-per-row, keep total rendered rows low

---

## 7. Acceptance Criteria Recommendations

Based on the research above, these are the recommended acceptance criteria for RAGTS:

### Load Performance
- FCP ≤ 1.8s (application shell rendered; session content does not block FCP)
- LCP ≤ 2.5s (first visible session content or session list)
- INP ≤ 200ms for all user interactions (open session, scroll, search, navigate)
- TBT ≤ 200ms (desktop lab conditions)
- CLS ≤ 0.1

### DOM Budget
- Maximum DOM nodes in session viewer at any time: ≤ 1,500 (Lighthouse error threshold; target ≤ 800)
- Maximum DOM depth: ≤ 15 levels (well below Lighthouse 32-level limit)
- Virtual list rendered rows: visible viewport rows + overscan of 3–5 rows above/below

### Scroll Performance
- No dropped frames (< 60fps) during normal scroll on desktop mid-range hardware
- No long tasks > 50ms during scroll
- CLS during scroll: 0 (achieved by fixed-height rows in virtual list)

### Memory
- Idle state: < 50 MB JS heap
- Active session (≤ 10,000 lines): < 200 MB JS heap
- Active session (≤ 100,000 lines): < 400 MB JS heap
- Return to idle after closing session: heap within 10% of idle baseline (no leaks)

### Network
- Session list API p95: ≤ 200ms
- Session metadata p95: ≤ 200ms
- Session data TTFB: ≤ 800ms
- Static assets cache hit ratio: ≥ 95%
- Session content cache hit ratio: ≥ 90%

### Lighthouse Score (Desktop Lab)
- Overall Performance: ≥ 75 (good zone minimum)
- Stretch target: ≥ 85 (competitive with GitHub, Linear, Vercel Dashboard)

---

## 8. Sources

- [Web Vitals — web.dev](https://web.dev/articles/vitals)
- [How Core Web Vitals thresholds were defined — web.dev](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Interaction to Next Paint (INP) — web.dev](https://web.dev/articles/inp)
- [Time to First Byte (TTFB) — web.dev](https://web.dev/articles/ttfb)
- [Total Blocking Time — web.dev](https://web.dev/articles/tbt)
- [How large DOM sizes affect interactivity — web.dev](https://web.dev/articles/dom-size-and-interactivity)
- [Avoid an excessive DOM size — Chrome for Developers (Lighthouse)](https://developer.chrome.com/docs/lighthouse/performance/dom-size)
- [Lighthouse performance scoring — Chrome for Developers](https://developer.chrome.com/docs/lighthouse/performance/performance-scoring)
- [Lighthouse Total Blocking Time — Chrome for Developers](https://developer.chrome.com/docs/lighthouse/performance/lighthouse-total-blocking-time)
- [Rendering performance — web.dev](https://web.dev/articles/rendering-performance)
- [Crafting a better, faster code view — GitHub Blog](https://github.blog/engineering/architecture-optimization/crafting-a-better-faster-code-view/)
- [TanStack Virtual documentation](https://tanstack.com/virtual/latest)
- [Speed up long lists with TanStack Virtual — LogRocket](https://blog.logrocket.com/speed-up-long-lists-tanstack-virtual/)
- [TanStack Virtual DOM node count issue thread](https://github.com/TanStack/virtual/issues/1024)
- [xterm.js benchmark tool](https://github.com/xtermjs/xterm-benchmark)
- [xterm.js performance testing wiki](https://github.com/xtermjs/xterm.js/wiki/Performance-testing)
- [Buffer performance improvements — xterm.js issue #791](https://github.com/xtermjs/xterm.js/issues/791)
- [V8 heap size limit — V8 blog](https://v8.dev/blog/heap-size-limit)
- [Core Web Vitals Metrics And Thresholds — DebugBear](https://www.debugbear.com/docs/core-web-vitals-metrics)
- [Time to Interactive — Chrome for Developers](https://developer.chrome.com/docs/lighthouse/performance/interactive)
- [Lighthouse 10: TTI removal — Search Engine Journal](https://www.searchenginejournal.com/lighthouse-10-tti-removal/479789/)
- [Long Animation Frames and INP — DEV Community](https://dev.to/viniciusdallacqua/long-frames-and-inp-understanding-post-load-performance-2maa)
- [API Response Time Standards — Odown](https://odown.com/blog/api-response-time-standards/)
- [What is a Cache Hit Ratio — Cloudflare](https://www.cloudflare.com/learning/cdn/what-is-a-cache-hit-ratio/)
- [Cache Hit Ratio targets — StormIT](https://www.stormit.cloud/blog/cache-hit-ratio-what-is-it/)
- [Fix memory problems — Chrome DevTools](https://developer.chrome.com/docs/devtools/memory-problems)
- [Optimizing Core Web Vitals in 2024 — Vercel Knowledge Base](https://vercel.com/kb/guide/optimizing-core-web-vitals-in-2024)
