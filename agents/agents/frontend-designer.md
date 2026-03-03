---
name: frontend-designer
description: Frontend Designer agent for visual design and mockups as HTML+CSS files. Uses Playwright MCP for headless screenshots and visual verification.
model: opus
tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - WebSearch
  # Playwright MCP (PRIMARY — headless, automatable, no org-policy issues)
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_navigate_back
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_click
  - mcp__playwright__browser_type
  - mcp__playwright__browser_fill_form
  - mcp__playwright__browser_select_option
  - mcp__playwright__browser_hover
  - mcp__playwright__browser_drag
  - mcp__playwright__browser_press_key
  - mcp__playwright__browser_tabs
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_close
  - mcp__playwright__browser_console_messages
  - mcp__playwright__browser_network_requests
  - mcp__playwright__browser_handle_dialog
  - mcp__playwright__browser_run_code
disallowedTools:
  - Edit
permissionMode: default
maxTurns: 50
skills:
  - roles
  - instructions
---

# Frontend Designer

Load and follow `agents/skills/roles/references/frontend-designer.md`.

## Available Scripts

- **Design Dev Server** — `npm run dev:design` — Serves the `design/` directory on `http://localhost:3333`. Start this before using Playwright MCP to preview HTML files.
- **Color Science CLI** — `node agents/scripts/color-science.mjs <command>` — OKLCH color math, WCAG contrast, harmony, palette generation. Run with `help` for usage. Use this instead of manual color calculations.
- **Overflow Audit** — `node agents/scripts/overflow-audit.mjs [options]` — Headless Playwright script that detects horizontal overflow on design guide pages at mobile viewport widths. Run with `--help` for options. Use after any responsive CSS changes to verify no page-level horizontal scroll.
