# RAGTS Learning Platform

**Real Agentic Terminal Sessions** - Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests.

A self-hostable, white-label web platform that transforms terminal session recordings into browsable, searchable learning artifacts for both humans and agents.

## Why RAGTS?

AI agents generate rich terminal sessions - commands, reasoning, output, mistakes, recoveries. These sessions are dense context artifacts that deserve more than a single viewing.

RAGTS makes them **browsable, foldable, and retrievable**:

- **Vertical browsing** - Read sessions like documents. Scroll through what happened at your own pace.
- **Fold/unfold with markers** - Collapse noise, expand what matters. Markers become section anchors for quick navigation.
- **Agent memory** - Sessions aren't just for humans. Agents can retrieve and learn from past sessions to inform future decisions.
- **Self-hostable** - Your sessions, your infrastructure. White-label ready for teams and organizations.

## How It Works

1. **Record** - Capture agent terminal sessions using AGR
2. **Upload** - Import session files into the RAGTS platform
3. **Browse** - Humans explore sessions vertically with fold/unfold navigation
4. **Ingest** - Agents query past sessions as long-term memory

```
 Record         Upload              Serve
┌───────┐      ┌────────┐      ┌────────────────┐
│  AGR  │─────>│ RAGTS  │─────>│ Humans: Browse │
└───────┘      │Platform│      └────────────────┘
               └───┬────┘      ┌──────────────────┐
                   └──────────>│ Agents: Retrieve │
                               └──────────────────┘
```

## Powered by AGR

[Agent Session Recorder (AGR)](https://github.com/thiscantbeserious/agent-session-recorder) is the recording and transformation engine behind RAGTS. It handles:

- **Session capture** - Transparent recording of agent terminal sessions
- **Transformations** - Silence removal, optimization, and format processing
- **asciicast v3** - Native marker support for fold/unfold structure

AGR runs as a service within the platform for background processing tasks.

## Features

- **Vertical session browser** - Scroll through terminal sessions with full output rendering
- **Marker-based folding** - Collapse and expand sections using asciicast v3 markers
- **Session library** - Browse, search, and filter across agents and projects
- **Agent memory** - Agents ingest past sessions as retrievable long-term context
- **White-label ready** - Customizable branding for teams and organizations
- **asciicast v3 native** - Works directly with the asciicast v3 format

## Getting Started

> TODO

## Development

> TODO

## Configuration

> TODO

## License

AGPL-3.0 - see [LICENSE](LICENSE)
