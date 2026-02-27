#!/usr/bin/env bash
# Ensures the Penpot design stack is running before MCP tool calls.
# Used as a PreToolUse hook for mcp__penpot__* tools.
# Idempotent: no-op if Penpot is already responding.

set -euo pipefail

COMPOSE_DIR="${CLAUDE_PROJECT_DIR:-.}"
PENPOT_URL="http://localhost:9001"
MAX_WAIT=90
POLL_INTERVAL=3

# Quick check: is Penpot already responding?
if curl -sf --max-time 2 "$PENPOT_URL" > /dev/null 2>&1; then
  exit 0
fi

# Penpot not responding — check if Docker Compose services are running
cd "$COMPOSE_DIR"

RUNNING=$(docker compose ps --services --filter status=running 2>/dev/null | wc -l | tr -d ' ')

if [ "$RUNNING" -lt 6 ]; then
  echo "Starting Penpot design stack ($RUNNING/6 services running)..." >&2
  docker compose up -d 2>&1 >&2
fi

# Wait for Penpot to become ready
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

echo "Penpot ready (waited ${WAITED}s)." >&2
