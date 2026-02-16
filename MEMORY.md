# Project Memory

Bootstrap session context for continuing work on RAGTS. Read this before starting any task.

## Project Identity

- **Full name:** RAGTS - Reinforced Human Learning Platform
- **Acronym meaning:** Real Agentic Terminal Sessions
- **Core thesis:** Reinforce the human part in the agentic loop. Up until now it was always about reinforcing agents - RAGTS reinforces the human.
- **Repo:** git@github.com:thiscantbeserious/ragts-learning-platform.git
- **License:** AGPL-3.0 (protects against closed-source commercial forks while staying genuinely open source)

## What RAGTS Is

A self-hostable, white-label web platform that transforms agent terminal session recordings into:
1. **Browsable documents** - Vertical scrolling through sessions (not horizontal video playback)
2. **Foldable views** - asciicast v3 markers become fold/unfold anchors to collapse noise
3. **Curated RAG retrieval** - On-the-fly generation of optimized context that humans curate and feed back to agents

The key differentiator: humans control what gets curated. Sessions become long-term memory that agents learn from, but the human decides what matters.

## Relationship to AGR

[Agent Session Recorder (AGR)](https://github.com/thiscantbeserious/agent-session-recorder) is not just a related CLI tool - it's the **recording and transformation engine** (service) behind RAGTS.

- **AGR captures** sessions via transparent shell recording
- **AGR transforms** sessions (silence removal, optimization, format processing)
- **AGR runs as a service** within the RAGTS platform for background processing tasks
- **AGR is MIT licensed** (permissive, maximize adoption) while RAGTS is AGPL-3.0 (protect the platform)

This is intentional: permissive on the tool → wide adoption → more sessions → more value in RAGTS.

The pipeline: Record (AGR) → Upload (RAGTS) → Humans: Curate + Agents: Retrieve

## Technical Context

### Format
- asciicast v3 is the native format
- Markers in asciicast v3 serve as fold anchors (structural, not just annotation)
- Sessions contain: commands, reasoning, output, errors, timing, markers

### Architecture (rough baseline)
See `ARCHITECTURE.md` for the full diagram. Key components:
- **Web UI** - Vertical session browser with fold/unfold, search, theming (white-label)
- **API Server** - Session CRUD, search, transform triggers
- **Storage** - .cast files, search index, metadata
- **Transform Pipeline** - AGR service for background processing (silence removal, memory optimization, indexing)

### Ingestion/Retrieval
The platform needs some form of API/MCP or Graph/VectorDB for agent retrieval - this is not yet decided. Keep it open for now. The gist: agents need to be able to query past sessions as retrievable long-term memory.

### Tech Stack
Not yet decided. The "TS" in RAGTS does NOT stand for TypeScript - it stands for "Terminal Sessions". Tech stack choices are open for future SDLC cycles.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| License | AGPL-3.0 | Prevents closed-source forks, protects platform value |
| AGR license | MIT (unchanged) | Maximize adoption of the recording tool |
| AGR role | Service, not just CLI | Powers background transforms within the platform |
| Browsing model | Vertical scrolling | Sessions are text, text reads vertically |
| Markers | Structural fold anchors | Elevates annotation to navigation/hierarchy |
| Human curation | Core differentiator | Humans control what gets curated into agent memory |
| Skills infrastructure | Not copied from AGR | Bare minimum for now, add when needed |
| Agent instructions | AGENTS.md with symlinks | CLAUDE.md and GEMINI.md symlink to AGENTS.md |

## Decisions NOT Yet Made

- Frontend framework (Next.js, SvelteKit, Astro, etc.)
- Backend language/framework
- Storage backend for sessions and index
- Retrieval mechanism (API, MCP, Graph/VectorDB)
- Authentication/multi-tenancy model
- White-label theming approach
- How exactly AGR integrates as a service (sidecar binary, FFI, API wrapper)

## Project State

As of 2026-02-16, the project is bootstrapped with:
- `README.md` - Project vision, problem/solution, features, how it works
- `ARCHITECTURE.md` - Rough system design baseline (living document)
- `AGENTS.md` - Agent instructions (symlinked as CLAUDE.md, GEMINI.md)
- `MEMORY.md` - This file
- `LICENSE` - AGPL-3.0

No code exists yet. Next step is to start an SDLC cycle for the first implementation phase.

## Voice and Tone

The README has personality. The hook paragraph is intentionally irreverent:
> "Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests."

Keep this voice. Don't sanitize it into corporate speak.
