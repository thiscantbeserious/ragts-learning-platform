# RAGTS Learning Platform

**Real Agentic Terminal Sessions** - Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests.

- **Read sessions like documents.** Generate optimized RAG retrieval on-the-fly.
- **Context you control.** Understand, curate, and feed back to your agents.
- **Self-hostable & white-label.** Your sessions, your infrastructure.

## Features

- **Vertical browsing** - Read sessions like documents, scroll to what matters
- **Marker-based folding** - Collapse and expand sections for quick navigation
- **On-the-fly RAG generation** - Transform sessions into curated, optimized retrieval context
- **Human + agent readable** - Humans browse and curate, agents retrieve and learn
- **Self-hostable & white-label** - Your infrastructure, your branding
- **asciicast v3 native** - Built on the asciicast v3 format with native marker support

## How It Works

```
 Record         Upload              Serve
┌───────┐      ┌────────┐      ┌────────────────┐
│  AGR  │─────>│ RAGTS  │─────>│ Humans: Browse │
└───────┘      │Platform│      └────────────────┘
               └───┬────┘      ┌──────────────────┐
                   └──────────>│ Agents: Retrieve │
                               └──────────────────┘
```

Powered by [Agent Session Recorder (AGR)](https://github.com/thiscantbeserious/agent-session-recorder) - the recording and transformation engine that captures sessions, removes silence, and prepares them for browsing and retrieval.

## Getting Started

> TODO

## License

AGPL-3.0 - see [LICENSE](LICENSE)
