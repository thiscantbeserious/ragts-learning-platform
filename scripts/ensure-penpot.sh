#!/usr/bin/env bash
# Ensures the Penpot design stack + MCP server are running before MCP tool calls.
# Used as a PreToolUse hook for mcp__penpot__* tools.
# Idempotent: no-op if MCP is already responding.

set -euo pipefail

COMPOSE_DIR="${CLAUDE_PROJECT_DIR:-.}"
MCP_PORT=4401
PENPOT_URL="http://localhost:9001"
MAX_WAIT=180
POLL_INTERVAL=3

# Quick check: is MCP already responding?
# Use a TCP connect check — the /mcp endpoint requires POST with specific headers.
if nc -z localhost "$MCP_PORT" 2>/dev/null; then
  exit 0
fi

# MCP not responding — ensure Docker Compose services are running
cd "$COMPOSE_DIR"

RUNNING=$(docker compose ps --services --filter status=running 2>/dev/null | wc -l | tr -d ' ')

if [ "$RUNNING" -lt 7 ]; then
  echo "Starting Penpot design stack + MCP server ($RUNNING/7 services running)..." >&2
  docker compose up -d --build 2>&1 >&2
fi

# Wait for Penpot UI first (backend must be up before MCP can work)
WAITED=0
echo "Waiting for Penpot at $PENPOT_URL..." >&2
while ! curl -sf --max-time 2 "$PENPOT_URL" > /dev/null 2>&1; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Penpot not responding after ${MAX_WAIT}s. Check 'docker compose logs'." >&2
    exit 1
  fi
  sleep "$POLL_INTERVAL"
  WAITED=$((WAITED + POLL_INTERVAL))
done

# Then wait for MCP server (builds from source, may take longer on first run)
PENPOT_WAITED=$WAITED
WAITED=0
echo "Penpot UI ready (${PENPOT_WAITED}s). Waiting for MCP server on port $MCP_PORT..." >&2
while ! nc -z localhost "$MCP_PORT" 2>/dev/null; do
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "ERROR: Penpot MCP server not responding on port ${MCP_PORT} after ${WAITED}s (Penpot took ${PENPOT_WAITED}s). Check 'docker compose logs penpot-mcp'." >&2
    exit 1
  fi
  sleep "$POLL_INTERVAL"
  WAITED=$((WAITED + POLL_INTERVAL))
done

echo "Penpot + MCP server ready (Penpot: ${PENPOT_WAITED}s, MCP: ${WAITED}s)." >&2
