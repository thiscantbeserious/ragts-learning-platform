# Project Overview

## Context

- RAGTS = Real Agentic Terminal Sessions
- Self-hostable, white-label web platform for browsing agent terminal sessions
- Vertical document-style browsing (not horizontal video-like playback)
- Markers as fold/unfold anchors for collapsible sections
- Sessions serve as curated long-term memory for humans and agents

## Architecture

See `ARCHITECTURE.md` for the full architectural baseline including:
- 6 bounded contexts: Identity, Session, Retrieval, Index, Transform, Cache
- Container topology: Single container -> Docker Compose -> Orchestrated
- Built-in authentication with optional OIDC integration
- DB abstraction layer (SQLite <-> PostgreSQL)

## Related Projects

- **AGR (Agent Session Recorder)** - MIT-licensed CLI/service for recording agent terminal sessions using asciicast v3 format. RAGTS consumes recordings produced by AGR.

## References

- asciicast v3 spec: https://docs.asciinema.org/manual/asciicast/v3/
- AGR repository: https://github.com/thiscantbeserious/agent-session-recorder
- RAGTS repository: https://github.com/thiscantbeserious/ragts-learning-platform
