## RAGTS Learning Platform - Human reinforcement

> Reinforce the human part in the agentic loop. 

**Real Agentic Terminal Sessions** - Just like RAG, but more useful for humans and agents to learn from the unfolded mess when the refactoring deleted half your codebase again and the subagents thought it would be smart to skip the tests.



- **Read sessions like documents.** Generate optimized RAG retrieval on-the-fly.
- **Context you control.** Understand, curate, and feed back to your agents.
- **Fold/unfold with markers.** Collapse noise, expand what matters - powered by asciicast v3.
- **Self-hostable & white-label.** Your sessions, your infrastructure.

## Problem

**Agent sessions are fire-and-forget. Thousands of lines of terminal output** - commands, reasoning, errors, recoveries - generated and never looked at again (or if autonomous, never). When something goes wrong, you're left digging through raw logs with no structure, no context, no way to search.

Up until now it was always about reinforcing the agents. But what about the humans?

## Solution

**RAGTS puts you back in the loop. Every session becomes a browsable document you can fold, search, and understand**. Curate what matters into retrievable context for the next sessions so that your agents learn from next time - so the same mistake doesn't happen twice. 

Didn't work out? Adjust and repeat! Reinforce to the max. Your knowdlege, your power, your control.

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
