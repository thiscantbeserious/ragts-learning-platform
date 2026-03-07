# Architecture Review: Vision Challenge & Proposed Directions

Branch: `cursor/architecture-review-proposals-fb67`
Date: 2026-03-07
Status: Draft (v2 — expanded with vision challenge and forward-looking analysis)

---

## Methodology

Seven independent review agents analyzed the project across two phases:

**Phase 1 — Implementation Review** (4 agents):

| Agent | Scope | Focus |
|-------|-------|-------|
| **Server** | `src/server/`, `packages/vt-wasm/` | Processing pipeline, DB layer, API surface, WASM bridge |
| **Client** | `src/client/`, `src/shared/` | Component design, state management, performance, accessibility |
| **Domain** | Cross-cutting | Domain model, data flow, schema evolution, deployment topology |
| **DevOps** | CI/CD, build, testing | Test strategy, build system, production readiness, observability |

**Phase 2 — Strategic Review** (3 agents):

| Agent | Scope | Focus |
|-------|-------|-------|
| **Vision Skeptic** | `VISION.md`, competitive landscape | Demand validation, behavioral assumptions, feedback loop validity |
| **Alignment Analyst** | Architecture ↔ Vision gap | Path to curation, retrieval, collaboration; bounded context validity |
| **Strategist** | Forward trajectory | Ecosystem positioning, format evolution, threats, unconventional opportunities |

---

## Part 1: Challenging the Vision

### 1.1 The Core Thesis

From `VISION.md`:

> *Instead of requiring humans to supervise agents in real-time, Erika captures every session and makes it reviewable after the fact. Humans browse what happened, understand why, mark what mattered, and annotate what should have gone differently — on their own time, at their own pace. Those curated insights feed back to agents as structured context for future sessions.*

The claimed loop:

```
Agent works → Session captured → Human reviews → Human curates
  → Curated context feeds back → Agent works better → repeat
```

### 1.2 Where the Vision Is Strong

**The diagnosis is genuinely insightful.** Steps 1-4 of `VISION.md` build a compelling argument:

- Humans learn through reflection between attempts — not through repetition alone
- AI compresses the cycle by replacing reflection with speed — but loses understanding
- RAG/memory adds more context, not better context — the agent decides what to load
- The human's judgment about what matters is absent from the loop

This is a real problem that experienced agent users feel. The observation that "nothing the human learned carries over" and "corrections stay trapped in the session" resonates.

**Self-hostable positioning is defensible.** Enterprises with sensitive codebases (defense, finance, healthcare) will never send terminal sessions to a SaaS. The AGPL license protects the open-source core while enabling self-hosted deployments.

### 1.3 Where the Vision Is Weak

#### The Behavioral Bet

The vision makes a high-stakes behavioral assumption: humans WILL do asynchronous review and curation. This is manual, effortful work with diffuse, delayed rewards.

Evidence against adoption:
- Google's code review research shows median review time of ~4 hours — and that's for code that MUST be reviewed before merging. Voluntary session review has no forcing function.
- Even error monitoring tools (Sentry, DataDog) struggle to get engineers to review incidents unless there's a notification forcing their hand.
- Developers already have AGENTS.md, `.cursorrules`, thumbs up/down on responses, and re-prompting — all lower effort than browsing terminal sessions and writing annotations.

**The curation tax:** Browse a session (potentially thousands of lines) → identify segments that matter → write annotations → tag for retrieval → repeat. This is high-effort, low-immediate-reward work. The payoff is diffuse: "your agent might work better next time, maybe."

**Survival condition:** Curation must be radically low-friction — "highlight a section, click a reaction, done" — not "write a paragraph about what should have been different." AI-assisted curation (auto-suggest, human validates) is likely necessary for adoption.

#### The Feedback Loop Gap

The vision claims curated insights "feed back to agents" but the mechanism is hand-wavy. Four credible technical paths exist:

| Mechanism | Viability | Status in Erika |
|-----------|-----------|-----------------|
| **MCP retrieval** — Agent calls Erika to get relevant curated segments | Medium-High | Mentioned, zero implementation |
| **Rules/AGENTS.md export** — Curated insights exported as structured rules | High | Not mentioned at all |
| **RAG** — Semantic search over curated segments | Medium | Mentioned, no embedding strategy |
| **Fine-tuning** — Curated data as training pairs | Low | Not mentioned |

The hardest unsolved question: **how does a human's annotation on a terminal session become an actionable instruction that changes agent behavior?** A highlighted segment with "this was wrong" doesn't help an agent. You need "when you encounter X, do Y instead of Z." That transformation is either done by the human (high effort — contradicts low-friction goal) or by AI summarization (then why does the human need to curate?).

#### Demand Validation

The vision oscillates between three audiences without committing:
- **Individual developers** — referenced implicitly in README
- **Teams** — the collaboration diagrams in VISION.md
- **Companies** — the architecture's multi-tenancy and OIDC plans

These are radically different products. The codebase targets individuals (no auth). The architecture targets companies (6 bounded contexts, OIDC). The vision targets an ideal world. Zero evidence of demand is cited anywhere — no user research, no survey, no community discussion.

#### Temporal Relevance

- Agents are moving toward structured tool-use traces (OpenTelemetry for AI, LangSmith traces). Terminal recordings are a low-fidelity capture format compared to structured traces with tool calls, reasoning steps, and token usage.
- Agent frameworks (Cursor, Claude Code, Windsurf) are building native session history and observability. If Erika stays at "terminal session viewer," it gets absorbed into native tooling.
- Built-in reflection (extended thinking, self-evaluation loops) may close the gap between "what the agent did" and "what it should have done" without human intervention.

**Counter-argument:** The audit trail need is real, CLI agents aren't dying, and complexity is increasing. The underlying need — "understand and learn from what agents did" — is durable. The specific format (asciicast) may not be.

#### The asciicast Lock-In

The entire codebase is built around asciicast v3. The VT WASM bridge, section detection (terminal-specific signals), and scrollback dedup (TUI redraw cycles) are all terminal-specific. This misses:

| Agent type | Primary artifact | Capturable by asciicast? |
|-----------|-----------------|------------------------|
| Claude Code / aider / Codex CLI | Terminal session | Yes |
| Cursor / Windsurf / Copilot | IDE interactions + file diffs | No |
| Playwright/Puppeteer agents | Browser actions + DOM state | No |
| API-calling agents (CrewAI, AutoGen) | Structured traces | No |

The vision's "Adapter" concept (`VISION.md:115`) hints at format-agnosticism, but it's fiction in the architecture.

#### The White-Label Ambition

"Self-hosted, white-label platform for Individuals, Teams and Companies" — but who white-labels a terminal session review tool? The design system has a separate Elastic License 2.0, protecting against a scenario with vanishingly small probability for a pre-MVP project. The white-label framing is premature by 2+ years.

### 1.4 Architecture ↔ Vision Misalignment

#### The MVP Sequence Problem

| Cycle | Focus | Advances vision? |
|-------|-------|-----------------|
| MVP v1 | Upload + browse | Infrastructure |
| MVP v2 | Render + dedup + sections | Infrastructure |
| MVP v3 | Snapshots + perf + search | Infrastructure |
| Post-v3 step 1 | Authentication | Infrastructure |
| Post-v3 step 2 | Curation UX | **First vision-aligned feature** |
| Post-v3 step 3 | Retrieval API | **Second vision-aligned feature** |

The core differentiator — curation — is at minimum cycle 5. The project is building a terminal session viewer, not a curation platform. Two full MVP cycles have produced a technically sophisticated viewer, but the features that would make the vision compelling haven't been started.

#### Missing Architectural Concepts

Six concepts the vision requires that the architecture doesn't address:

1. **Annotation model** — How do you annotate on a character grid? Sections are coarse (~50 per session). Sub-section selection has no mechanism. Line-anchored annotations break when dedup algorithms change.

2. **Segment serialization** — When a curated segment is stored, what format? Reference-only (`session_id + line_range`) is fragile. Content snapshot is stable but diverges. No spec exists.

3. **Feedback mechanism** — How do curated segments become agent context? The entire curation-to-retrieval chain is undesigned. No serialization format for agent consumption. No embedding strategy. No relevance ranking.

4. **Curation quality signals** — How do you know which curations are good? No votes, no usage tracking, no outcome correlation. Without quality signals, the retrieval corpus fills with noise.

5. **Session comparison** — Did the agent improve? No diff mechanism, no way to link related sessions, no outcome tracking.

6. **Cross-session patterns** — Identifying recurring mistakes across sessions requires pattern aggregation. Each session is currently an isolated artifact.

#### Bounded Context Validity

The 6 declared bounded contexts mix domain concerns with infrastructure:

| Context | Assessment |
|---------|-----------|
| **Session** | Valid — core domain object |
| **Transform** | Not a bounded context — it's a processing step within Session. No separate data model, API, or lifecycle. |
| **Identity** | Valid — auth, users, workspaces |
| **Retrieval** | Valid concept, but premature — its input (curated segments) doesn't exist |
| **Index** | Infrastructure, not domain — search indexing is cross-cutting |
| **Cache** | Not a bounded context. No system models "Cache" as domain. |

**What's missing:** **Curation** — the platform's core differentiator — is not even a bounded context. It has its own lifecycle (create → refine → publish → retire), entities (CuratedSegment, Annotation, Tag), access patterns (team collaboration, quality signals), and API surface. It warrants its own context more than Transform, Index, or Cache.

Proposed revision:

| Context | Responsibility |
|---------|---------------|
| **Session** | Ingestion, processing (VT/dedup), storage, browsing |
| **Curation** | Human annotation, tagging, quality signals, segment serialization |
| **Identity** | Auth, users, workspaces, RBAC, agent tokens |
| **Retrieval** | Agent-facing API (MCP + REST), relevance ranking, usage tracking |

Infrastructure concerns (not bounded contexts): search indexing, caching, file storage, VT processing.

---

## Part 2: Implementation Weakness Inventory

### Critical (blocks production use)

| # | Finding | Evidence |
|---|---------|----------|
| C1 | **No production server build** — `npm run start` expects `dist/server/start.js` which is never compiled. `tsconfig.json` blocks emit. | `package.json` start script vs missing build step |
| C2 | **Synchronous file I/O** — `FsStorageImpl` uses `readFileSync`/`writeFileSync`. 250MB reads block the event loop. | `src/server/db/fs_storage_impl.ts:6-7` |
| C3 | **No authentication** — Every endpoint is public. Security ranked #1 quality attribute, 0% implemented. | `ARCHITECTURE.md` §3 vs codebase |
| C4 | **No virtual scrolling** — 40,000+ DOM nodes for large sessions. | `TerminalSnapshot.vue` |
| C5 | **Full in-memory event buffering** — Pipeline + upload validation: ~500MB+ RAM for a 250MB file. | `session-pipeline.ts:59`, `asciicast.ts:47` |

### High (will break under real use)

| # | Finding | Evidence |
|---|---------|----------|
| H1 | **No pipeline concurrency control** — Unbounded parallel pipelines. 10 uploads = OOM. | `pipeline-tracker.ts` |
| H2 | **No transaction boundaries** — 5+ sequential DB ops without transaction. | `session-pipeline.ts:55-264` |
| H3 | **WASM resource leak on error** — No `try/finally` on `vt.free()`. | `session-pipeline.ts:121-269` |
| H4 | **No rate limiting** — 250MB uploads with no throttling. | All routes |
| H5 | **API types not shared** — Client and server types drift independently. | `useSession.ts` vs `sessions.ts` |
| H6 | **No real-time processing status** — Client never polls. Stale state after upload. | `useSession.ts` |
| H7 | **Zero ARIA accessibility** | All `.vue` components |
| H8 | **Fire-and-forget pipeline** — Errors logged, never stored/surfaced/retried. | `upload.ts:96-98` |
| H9 | **Monolithic 227-line pipeline function** | `session-pipeline.ts:43-270` |
| H10 | **Toast non-singleton** — Per-instance state, silent breakage with multiple consumers. | `useToast.ts:12` |

### Medium (19 items — summarized)

Key items: anemic domain model (M1), no migration framework (M2), upload parses file 3x (M3), unbounded `findAll()` (M4), dead CSS (M6), design system disconnected (M7), silent error swallowing (M8), error details leak internals (M9), no HTTP client abstraction (M10), dead code (M11), no coverage thresholds (M12), no `tsc` in CI (M13), no Dockerfile (M14), no dependency automation (M15), redetect race condition (M16), no network error recovery (M17), no upload progress (M18), composables untested (M19).

---

## Part 3: Threat Analysis

### Existential Threats

| # | Threat | Probability | Impact |
|---|--------|-------------|--------|
| T1 | **Agent frameworks build native curation** — Anthropic ships session review in Claude Code with annotation and retrieval. | Medium | Fatal — eliminates differentiation |
| T2 | **Agents become good enough** — Reliability reaches 99%+. Nobody reviews sessions because agents rarely fail. | Low-Medium (2yr) | Fatal — eliminates need |
| T3 | **Well-funded competitor** — A startup builds the same vision with structured traces, AI-assisted curation, and hosted free tier. | Medium | Severe — can't compete on velocity |

### Mitigations

- **T1:** Be multi-framework. The moment Erika only works with one agent, it's vulnerable. Support Claude Code, Cursor, aider, Codex.
- **T2:** Position curation as "aligning agent behavior with intent," not "catching mistakes." Intent alignment remains valuable even as execution improves.
- **T3:** Double down on self-hosted + privacy-first. Enterprises with sensitive codebases need on-premise. AGPL protects the core.

### What a Well-Funded Competitor Would Do

1. Skip terminal recordings — start with structured traces, support all frameworks day one
2. Build AI-assisted curation from the start — not "human reviews raw text" but "AI pre-digests, human validates"
3. Integrate with workflow tools — Slack notifications, Jira ticket creation, GitHub PR links
4. Offer a generous free tier hosted SaaS to capture developers before monetizing teams
5. Hire a dedicated ML team for retrieval quality, pattern detection, anomaly flagging

---

## Part 4: Three Strategic Directions

These variants are not about fixing bugs — they're about **where the product goes**. Each assumes the critical implementation fixes (C1-C5) as table stakes. They differ in what gets built next and why.

---

### Variant A: "Curation-First"

**Philosophy:** Stop perfecting the viewer. The core differentiator — the curation-to-retrieval loop — is at minimum 4 cycles away on the current roadmap. Flip the priority: ship a working curation UX + retrieval API as fast as possible, even if the viewer is imperfect. **Validate the thesis before perfecting the plumbing.**

**Strategic bet:** The vision is right, but only if humans actually curate. Find out fast.

**Risk:** Medium — ships an imperfect product to test a hypothesis. May discover curation doesn't work.

**Timeline:** 3-5 focused cycles to a working loop.

#### What Changes

```
Current roadmap                       Curation-First roadmap
────────────────────────────────────────────────────────────────
v3: snapshot tests                    v3: curation UX spike
v3: improved dedup                       (section-level annotation,
v3: virtual scrolling                     tags, retrieval intent)
v3: pagination                        v3: MCP retrieval server
v3: search/filter                        (curated segments as resources)
v3: metadata editing                   v3: critical fixes (C1-C3, H1-H3)
then auth...                           v4: AI-assisted curation
then curation...                          (auto-detect patterns,
then retrieval...                          suggest annotations)
                                       v4: auth + teams
                                       v5: viewer polish
                                          (virtual scrolling, search)
```

#### Curation Data Model (Proposed)

```typescript
interface CuratedSegment {
  id: string
  sessionId: string
  sectionId?: string
  anchor: {
    startLine: number
    endLine: number
    contentHash: string       // stability when dedup changes
  }
  title: string
  tags: string[]
  notes: string               // human-written context
  retrievalIntent: 'pattern' | 'anti-pattern' | 'reference' | 'debugging'
  agentGuidance?: string      // "when you encounter X, do Y instead of Z"
  serializedContent: string   // plain text, stripped ANSI, for retrieval
  createdBy?: string          // user_id when auth exists
  workspaceId?: string        // workspace_id when multi-tenancy exists
  qualitySignals: {
    upvotes: number
    retrievalCount: number
    lastRetrievedAt?: string
  }
  createdAt: string
  updatedAt: string
}
```

#### MCP Retrieval Interface (Proposed)

```typescript
// MCP resources
"erika://segments?tags=refactoring&intent=anti-pattern"
"erika://segments?session={sessionId}"
"erika://playbooks?task=migration"   // team-level patterns from aggregated curations

// MCP tools
search_curations(query: string, tags?: string[], intent?: string): CuratedSegment[]
get_segment(id: string): CuratedSegment
report_usage(segmentId: string, outcome: 'helpful' | 'not_helpful'): void
```

#### Stages

| Stage | Scope | Validates |
|-------|-------|-----------|
| 0 — Critical Fixes | Async I/O, pipeline guards, production build, auth stub | Table stakes (C1-C3, H1-H3) |
| 1 — Curation Schema | `curated_segments` table, `CurationAdapter` interface, CRUD API | Data model |
| 2 — Curation UX | Section-level annotation slide-over. Highlight section → add title, tags, notes, guidance. Minimal effort. | **Will humans curate?** |
| 3 — MCP Retrieval | Curated segments as MCP resources. `search_curations` tool. Agent can query by tag/intent. | **Does retrieval work?** |
| 4 — AI-Assisted Curation | Auto-detect interesting segments (errors, retries, long pauses). Suggest annotations. Human validates. | **Does AI reduce curation effort?** |
| 5 — Team Features | Auth, workspaces, shared curations, basic RBAC | Collaboration |
| 6 — Viewer Polish | Virtual scrolling, pagination, search/filter (deferred from current v3) | Performance |

#### Trade-offs

| Pro | Con |
|-----|-----|
| Tests the core thesis in 2-3 cycles instead of 5+ | Ships with known performance issues (no virtual scrolling initially) |
| If curation works → the product has a moat | If curation doesn't work → the project needs to pivot or become "just a viewer" |
| MCP retrieval gives immediate integration with Claude/Cursor | Curation UX on imperfect viewer may frustrate early users |
| AI-assisted curation addresses the behavioral adoption risk early | Auth is deferred — single-user until stage 5 |
| Forces the hardest product question first | Dedup and rendering improvements pause |

#### When to Choose

Choose Variant A if you believe the vision is right but needs validation, and you'd rather find out early whether humans will curate than spend 4 more cycles building infrastructure for a hypothesis.

---

### Variant B: "Agent Work Reviewer"

**Philosophy:** Evolve from "terminal session viewer" to "agent work reviewer." Break the asciicast lock-in by defining a format-agnostic internal model. Add adapters for structured traces (OpenTelemetry, LangSmith), IDE logs, and terminal recordings. The curation and retrieval features operate on the unified internal model, not on raw terminal data. This is the **platform play** — broader capture surface, same curation loop.

**Strategic bet:** Terminal sessions are one input format among many. The real value is reviewing and curating ALL agent work, regardless of how it was captured.

**Risk:** High — requires significant upfront design of the internal model. The current terminal-specific processing (VT rendering, scrollback dedup) becomes one adapter among many.

**Timeline:** 6-9 cycles to multi-format ingestion + curation.

#### What Changes

```
Current state                         Target state
────────────────────────────────────────────────────────────────
asciicast v3 only                     Unified internal model
                                      + asciicast adapter (v2, v3)
                                      + OTel trace adapter
                                      + structured log adapter

Terminal-specific processing          Format-agnostic segments
  (VT rendering, dedup, sections)       with format-specific renderers

Single viewer                         Multi-format viewer
                                        (terminal, structured trace,
                                         diff view, timeline)

No curation, no retrieval             Format-agnostic curation
                                      + MCP retrieval on unified model
```

#### Unified Internal Model (Proposed)

```typescript
interface AgentSession {
  id: string
  source: SessionSource
  metadata: SessionMetadata
  segments: AgentSegment[]        // replaces "sections"
  timeline: TimelineEvent[]       // normalized event sequence
}

interface SessionSource {
  format: 'asciicast-v3' | 'asciicast-v2' | 'otel-trace' | 'langsmith' | 'structured-log'
  rawArtifactId: string           // reference to original file
  adapter: string                 // which adapter produced this
}

interface AgentSegment {
  id: string
  type: 'command' | 'tool-call' | 'reasoning' | 'output' | 'error' | 'interaction'
  title: string
  startTime: number
  endTime: number
  content: SegmentContent         // polymorphic by format
  annotations: CuratedAnnotation[]
}

type SegmentContent =
  | { kind: 'terminal'; lines: StyledLine[]; foldable: boolean }
  | { kind: 'tool-call'; tool: string; input: unknown; output: unknown; duration: number }
  | { kind: 'reasoning'; text: string; tokenCount?: number }
  | { kind: 'diff'; files: FileDiff[] }
  | { kind: 'error'; message: string; stackTrace?: string; recovery?: string }
```

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Ingest Layer                             │
│                                                                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────────┐ │
│  │ asciicast   │ │ OTel Trace │ │ LangSmith  │ │ Structured   │ │
│  │ Adapter     │ │ Adapter    │ │ Adapter    │ │ Log Adapter  │ │
│  └──────┬─────┘ └──────┬─────┘ └──────┬─────┘ └──────┬───────┘ │
│         └──────────┬───────────────┬───────────────┘            │
│                    ▼               ▼                              │
│            ┌───────────────────────────┐                         │
│            │  Unified Internal Model   │                         │
│            │  (AgentSession + Segments) │                         │
│            └───────────┬───────────────┘                         │
└────────────────────────┼────────────────────────────────────────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
     ┌───────────┐ ┌──────────┐ ┌──────────┐
     │  Browse   │ │  Curate  │ │ Retrieve │
     │  (viewer) │ │  (human) │ │  (agent) │
     └───────────┘ └──────────┘ └──────────┘
```

#### Stages

| Stage | Scope | Prerequisite |
|-------|-------|-------------|
| 0 — Critical Fixes | Same as Variant A stage 0 | — |
| 1 — Internal Model | Define `AgentSession`, `AgentSegment`, `SegmentContent` types. Migration from current `Session`/`Section` to new model. | Stage 0 |
| 2 — Asciicast Adapter | Refactor current VT processing into an `AsciicastAdapter` that produces `AgentSession`. Existing viewer works on new model. | Stage 1 |
| 3 — Multi-Format Viewer | Renderer that dispatches on `SegmentContent.kind`. Terminal segments get existing VT renderer. Tool-call segments get structured view. | Stage 2 |
| 4 — Second Adapter | OTel trace adapter OR structured log adapter. Proves multi-format ingestion works. | Stage 3 |
| 5 — Curation on Unified Model | Curation UX that works on `AgentSegment` regardless of source format. MCP retrieval. | Stage 4 |
| 6 — AI-Assisted Curation | Pattern detection across segments and sessions. Suggested annotations. | Stage 5 |
| 7 — Auth + Teams | Identity, workspaces, shared curations | Stage 5 |

#### Trade-offs

| Pro | Con |
|-----|-----|
| Breaks the asciicast lock-in — future-proofs against format evolution | Substantial upfront design cost for the internal model |
| Same curation UX works across all formats | Current terminal-specific work (2 MVPs of VT/dedup) becomes one adapter |
| Positions as "agent work reviewer" not "terminal viewer" — bigger TAM | Second adapter (OTel/LangSmith) requires understanding external formats |
| Structured traces give richer curation targets than terminal text | Model migration risks breaking existing functionality |
| Attractive to teams using multiple agent tools | Delays curation validation — model comes first |

#### When to Choose

Choose Variant B if you believe the future is multi-format agent observability and want to position Erika as the universal agent work review platform, not just a terminal viewer.

---

### Variant C: "Refinement Engine"

**Philosophy:** Accept the terminal-session scope but go deep on the intelligence of the feedback loop. AI-assisted curation, retrieval with quality signals, agent outcome tracking, team-level playbooks that emerge from curated sessions. The differentiator is not breadth of formats but depth of the refinement loop. **Own one ecosystem deeply (Claude Code first) before going broad.**

**Strategic bet:** The loop's intelligence matters more than the capture format. A deeply intelligent refinement engine for one ecosystem beats a shallow multi-format reviewer.

**Risk:** Medium — concentrated bet on one ecosystem. If Claude Code changes fundamentally or adds native curation, the moat evaporates.

**Timeline:** 5-8 cycles to a learning refinement loop.

#### What Changes

```
Current state                         Target state
────────────────────────────────────────────────────────────────
Passive viewer                        Active refinement engine
No curation                           AI-assisted curation
                                        (auto-detect, suggest, validate)
No retrieval                          Intelligent MCP retrieval
                                        with quality signals
No outcome tracking                   Retrieval → outcome → learning loop
                                        (did the curated context help?)
No patterns                           Cross-session pattern detection
                                        (recurring mistakes, team playbooks)
No team knowledge                     Emergent team playbooks
                                        from aggregated curations
asciicast only (for now)              asciicast optimized (deepen, not broaden)
                                        + Claude Code specific detection
```

#### The Learning Loop

```
     ┌─────────────────────────────────────────────────────┐
     │                                                       │
     │  Session → AI Auto-Detect → Suggest Annotation        │
     │     ↓                            ↓                    │
     │  Human Validates              Human Corrects          │
     │     ↓                            ↓                    │
     │  Curated Segment stored with quality signals          │
     │     ↓                                                 │
     │  Agent retrieves via MCP (relevance-ranked)           │
     │     ↓                                                 │
     │  Agent reports: helpful | not helpful                 │
     │     ↓                                                 │
     │  Retrieval ranking adjusts (quality signal feedback)  │
     │     ↓                                                 │
     │  Next session → better retrieval → better agent       │
     │     ↓                                                 │
     └─────────── loop ────────────────────────────────────┘
```

#### Pattern Detection (Proposed)

```typescript
interface DetectedPattern {
  id: string
  type: 'anti-pattern' | 'best-practice' | 'recurring-error' | 'regression'
  title: string                       // auto-generated, human-editable
  sessions: string[]                  // sessions where this pattern appears
  segments: string[]                  // specific segments exhibiting it
  confidence: number                  // 0-1, increases with more observations
  frequency: number                   // how often it recurs
  lastSeen: string
  suggestedGuidance: string           // AI-generated "when X, do Y instead"
  teamEndorsements: number            // team members who confirmed
  status: 'suggested' | 'confirmed' | 'dismissed' | 'playbook'
}

interface TeamPlaybook {
  id: string
  workspaceId: string
  title: string
  description: string
  patterns: string[]                  // confirmed patterns
  agentGuidance: string[]             // compiled guidance for agents
  effectivenessScore: number          // measured via outcome tracking
  lastUpdated: string
}
```

#### Claude Code Specialization

Instead of being format-agnostic, go deep on Claude Code session intelligence:

- **Claude Code-specific section detection** — Recognize prompt/response/tool-use boundaries from terminal patterns (the 108 clear-screen redraw cycles, the conversation headers)
- **Tool call extraction** — Parse Claude Code's terminal output to identify which tools were called, what files were edited, what commands were run
- **Reasoning chain reconstruction** — Extract the agent's reasoning from terminal output, even though it's rendered as text
- **Cost estimation** — Infer token usage from output volume and session duration
- **Session comparison** — "This refactoring session vs. last week's: fewer retries, different approach to testing"

#### Stages

| Stage | Scope | Validates |
|-------|-------|-----------|
| 0 — Critical Fixes | Same as Variant A stage 0 | Table stakes |
| 1 — Curation Core | Schema + CRUD + basic section-level annotation UX | Can we ship curation? |
| 2 — MCP Retrieval | Curated segments as MCP resources. Basic tag/intent matching. | Does retrieval integrate? |
| 3 — AI-Assisted Curation | Auto-detect interesting segments in Claude Code sessions. Suggest annotations. Human validates. | Does AI reduce effort enough for adoption? |
| 4 — Outcome Tracking | Agent reports retrieval usage + outcome. Quality signals accumulate. | Does the loop learn? |
| 5 — Pattern Detection | Cross-session pattern analysis. Recurring anti-patterns surface automatically. | Do patterns emerge? |
| 6 — Team Playbooks | Aggregated patterns → compiled guidance documents. Auto-updated. | Does team knowledge compound? |
| 7 — Auth + Teams | Identity, workspaces, shared curations + playbooks | Scale beyond single user |

#### Unconventional Opportunities This Enables

| Opportunity | Value | When |
|------------|-------|------|
| **Agent onboarding** — New team members learn from curated sessions | High | Stage 2 (curated libraries exist) |
| **Agent compliance/audit** — Immutable records + human review attestations | High | Stage 4 (outcome tracking exists) |
| **Training data curation** — Export human-validated traces as fine-tuning datasets | Very High | Stage 5 (quality signals exist) |
| **Agent cost optimization** — Identify expensive patterns, suggest efficient alternatives | Medium | Stage 5 (pattern detection exists) |

#### Trade-offs

| Pro | Con |
|-----|-----|
| Deepest moat — intelligent refinement loop is hard to replicate | Concentrated bet on terminal sessions + Claude Code ecosystem |
| AI-assisted curation addresses the adoption risk directly | If Claude Code adds native curation, the specialization becomes a liability |
| Outcome tracking creates a genuine learning system | Pattern detection + playbooks require ML investment |
| Team playbooks have clear enterprise value | Narrow format scope limits TAM until broadened later |
| Training data curation is a unique monetization path | Multi-format support deferred — may miss market window |

#### When to Choose

Choose Variant C if you believe depth beats breadth, the Claude Code ecosystem is your beachhead, and you want to build a genuinely intelligent refinement engine rather than a broad-but-shallow platform.

---

## Part 5: Comparison Matrix

| Dimension | A: Curation-First | B: Agent Work Reviewer | C: Refinement Engine |
|-----------|-------------------|----------------------|---------------------|
| **Core bet** | The loop works, prove it fast | Multi-format is the future | Intelligence is the moat |
| **Risk** | Medium | High | Medium |
| **Time to loop validation** | 2-3 cycles | 5-6 cycles | 3-4 cycles |
| **Format scope** | asciicast only (for now) | Multi-format from stage 4 | asciicast deep (broaden later) |
| **Ecosystem scope** | All CLI agents | All agents (CLI + IDE + API) | Claude Code first, then expand |
| **Curation effort** | Manual initially, AI-assisted in stage 4 | Manual on unified model | AI-assisted from stage 3 |
| **Retrieval intelligence** | Tag/intent matching | Tag/intent on unified model | Quality-ranked + outcome tracking |
| **Team features** | Basic (stage 5) | Basic (stage 7) | Playbooks + patterns (stage 6) |
| **Viewer polish** | Deferred (stage 6) | Multi-format viewer (stage 3) | Existing viewer + Claude specialization |
| **Biggest win** | Proves the thesis works | Future-proofs the platform | Creates learning system |
| **Biggest risk** | Curation doesn't resonate | Model design delays everything | Claude Code dependency |
| **What a failure looks like** | Humans don't curate → nice terminal viewer | Model too complex → never ships curation | Claude adds native curation → game over |

---

## Part 6: Strategic Recommendation

### The Central Tension

The engineering is ahead of the product thinking. Two full MVP cycles produced a technically sophisticated terminal session browser — but the features that make the vision compelling (curation, retrieval, feedback loop) haven't been started. The roadmap prioritizes technical debt over differentiating features.

**The product is not the viewer. The product is the loop.**

### Recommended Path: Variant A (Curation-First) with Elements of C

**Why:**

1. **Validate the thesis first.** The behavioral assumption (humans will curate) is the highest-risk element. Every other decision depends on it. Ship curation in 2-3 cycles, not 5+.

2. **AI-assisted curation is essential.** Pure manual curation won't be adopted. Borrow Variant C's AI-assisted curation (stage 4) and move it earlier.

3. **MCP retrieval closes the loop.** Without retrieval, curation is a write-only database. Ship retrieval in the same cycle as curation.

4. **Defer format broadening.** Terminal sessions have enough surface area for the next 3-4 cycles. Multi-format (Variant B) is the right evolution once the loop is proven, but it's premature to design a unified internal model before understanding what curation actually needs.

5. **Viewer polish can wait.** Virtual scrolling, pagination, and search are important but not differentiating. Ship them after the loop exists.

### Proposed Sequence

```
Cycle 1:  Critical fixes (C1-C3, H1-H3) + curation schema + CRUD API
Cycle 2:  Curation UX (section-level annotation slide-over)
          + MCP retrieval server (curated segments as resources)
Cycle 3:  AI-assisted curation (auto-detect patterns in sessions)
          + outcome tracking (agent reports usage)
Cycle 4:  Auth + workspaces + shared curations
Cycle 5:  Viewer polish (virtual scrolling, search, pagination)
Cycle 6:  Pattern detection + team playbooks
Cycle 7+: Multi-format adapters (Variant B's internal model) — when needed
```

### Honest Assessment

The vision identifies a real gap. The diagnosis is strong. The proposed solution (asynchronous refinement loop) is compelling in theory. But the project is 4 cycles deep into infrastructure without any validation that humans will curate or that curated context improves agent behavior.

The strongest move is to find out fast. Ship the loop — even crude, even imperfect — and see if it works. If it does, everything else (multi-format, scaling, enterprise) follows naturally. If it doesn't, better to know now than after 8 more cycles of plumbing.

---

## Appendix A: Aspiration vs Reality

| Claim | Reality | Gap |
|-------|---------|-----|
| "Multi-user" platform | No auth, no user model | Critical |
| "Security" = Priority #1 | Zero security implementation | Critical |
| "Multi-tenancy from day one" | No workspace, no tenant isolation | Critical |
| "Curated Segments" — core differentiator | No model, no API, no UI | Critical |
| "Same application code at every scale" | Single-process, fs-coupled, in-memory tracking | High |
| Docker Compose with PostgreSQL + Redis + AGR | Zero Docker Compose, PostgreSQL, Redis, AGR | High |
| AGR "runs as a service within the platform" | Zero AGR code | High |
| Database abstraction "fully implemented" | Correct — adapter pattern complete | Match |
| 6 bounded contexts | 2 partially implemented, 4 at 0% | Acknowledged |

## Appendix B: Competitive Landscape

| Tool | What it does | Threat level |
|------|-------------|-------------|
| **LangSmith / LangFuse / Helicone** | Agent observability with traces, annotation, dataset creation | Critical — already have teams, integrations, human annotation |
| **Braintrust / Humanloop** | Human-in-the-loop evaluation, prompt management | High — already solve "human curates, agent improves" |
| **Cursor session history** | Built-in conversation replay | High — could add curation natively |
| **asciinema** | Terminal recording and playback | Low — different purpose, owns the format |

**Where Erika differentiates (if curation ships):**
1. Self-hostable (on-prem for sensitive sessions)
2. Human-curated feedback loop (not just viewing)
3. Terminal-native document browsing (not video playback)
4. Multi-framework (not locked to one agent)

## Appendix C: Implementation Weakness Details

Full per-agent analyses with file paths and line references were produced by the Phase 1 review agents:

- **Server agent**: `FsStorageImpl` sync I/O, pipeline memory model, WASM lifecycle, upload triple-parse, API security surface
- **Client agent**: Virtual scrolling math (40K nodes), toast singleton bug, ARIA audit, design system disconnect, composable lifecycle coupling
- **Domain agent**: Schema evolution risk matrix, deployment topology blockers, AGR integration fiction, transaction boundary gaps
- **DevOps agent**: Missing production build chain, CI gap analysis, dependency risk matrix, deployment readiness checklist
