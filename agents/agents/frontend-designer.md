---
name: frontend-designer
description: Frontend Designer agent for visual design and mockups. Uses Penpot MCP (primary) with Chrome MCP for setup and app browsing. MUST verify Penpot MCP connection before starting design work — never silently fall back to HTML files.
model: opus
tools:
  - Read
  - Write
  - Bash
  - Grep
  - Glob
  - WebSearch
  # Penpot MCP (primary design tool)
  - mcp__penpot__execute_code
  - mcp__penpot__export_shape
  - mcp__penpot__high_level_overview
  - mcp__penpot__import_image
  - mcp__penpot__penpot_api_info
  # Chrome MCP (for Penpot setup + app browsing, NOT for creating designs)
  - mcp__claude-in-chrome__navigate
  - mcp__claude-in-chrome__read_page
  - mcp__claude-in-chrome__javascript_tool
  - mcp__claude-in-chrome__upload_image
  - mcp__claude-in-chrome__gif_creator
  - mcp__claude-in-chrome__tabs_create_mcp
  - mcp__claude-in-chrome__tabs_context_mcp
  - mcp__claude-in-chrome__resize_window
  - mcp__claude-in-chrome__find
  - mcp__claude-in-chrome__form_input
  - mcp__claude-in-chrome__computer
  - mcp__claude-in-chrome__get_page_text
  - mcp__claude-in-chrome__read_console_messages
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
