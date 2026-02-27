# SDLC Infrastructure Overhaul — Research Notes

## Design Tool MCP Comparison

| Tool | Create | Modify | Read | Free | Self-host |
|------|--------|--------|------|------|-----------|
| Figma (official MCP) | No | No | Yes | Partial | No |
| Figma (community MCP) | Yes | Yes | Yes | Needs sub | No |
| **Penpot MCP** | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| Pencil.dev | Yes | Yes | Yes | Yes | No |
| Chrome MCP | Via HTML | Via HTML | Screenshots | Yes | N/A |

**Decision:** Penpot MCP as primary design tool, Chrome MCP as fallback for quick prototyping.

## Penpot Self-Hosted Requirements

- 6 services: frontend, backend, exporter, postgres, valkey, mailcatcher
- `enable-access-tokens` flag required for MCP API access
- MCP server setup: `claude mcp add penpot -t http http://localhost:4401/mcp`
- Must keep Penpot browser tab + plugin window open during design sessions
- `disable-email-verification` + `disable-secure-session-cookies` for local dev only

## TBD Placeholders Found

- `commands.md` line 23: "TBD - tech stack not yet decided"
- `verification.md` line 10: "TBD - will be defined once tech stack is chosen"
- `tdd.md` line 43: "Specific frameworks... will be defined once tech stack is chosen"

## Rust Leftovers Found

- `settings.local.json` line 34: `WebFetch(domain:docs.rs)`
- `reviewer.md` line 131: `empty vec` (Rust collection)
- `reviewer.md` line 133: `usize::MAX, i64::MAX` (Rust types)
- `reviewer.md` line 86: `Panic on valid input` (Rust term)
- `decisions.md` line 41: `~/.config/[app]/config.toml` (Rust-style config path)

## AGENTS.md Gap

Current RAGTS AGENTS.md is missing bootstrapping sections present in AGR:
- Section 1: "Your Purpose" — auto-load skills
- Section 2: "Startup Proposal" — SDLC vs Direct Assist
- Section 3: "The Project" — README pointer

## User Decisions

- Designer uses **Penpot MCP** as primary design tool (free, open source, full create/modify/read)
- **Chrome MCP** available as fallback for quick prototyping
- SDLC flow is **dynamic** — Coordinator picks roles per task
- Designer enters **when Coordinator decides** UI work is present
- Split implementer into frontend-engineer, backend-engineer, and frontend-designer
- Add design iteration phase before implementation for UI work
