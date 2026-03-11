#!/bin/bash
# Whitelist-based command validation for reviewer agents.
# Only allows read-only git, test/lint commands, and basic shell inspection.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Extract the first command token (handles pipes, &&, ;, etc.)
# We check ALL tokens in the command to prevent chaining bypasses.
# Split on pipe, &&, ;, || and check each segment's first word.
SEGMENTS=$(echo "$COMMAND" | grep -oE '[^|&;]+')

while IFS= read -r segment; do
  # Trim leading whitespace and get first token
  TOKEN=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $1}')

  [ -z "$TOKEN" ] && continue

  case "$TOKEN" in
    # Read-only git (validated further below)
    git)
      SUBCOMMAND=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $2}')
      case "$SUBCOMMAND" in
        diff|log|show|status|branch|ls-tree|ls-files|rev-parse|describe|shortlog|name-rev)
          ;; # allowed
        *)
          echo "Blocked: Only read-only git commands allowed (diff, log, show, status, branch, ls-tree, ls-files)." >&2
          exit 2
          ;;
      esac
      ;;
    # Test and lint commands
    npx|npm)
      SUBCOMMAND=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $2}')
      case "$SUBCOMMAND" in
        vitest|playwright|tsc)
          ;; # allowed
        run)
          ;; # npm run lint, npm run lint:fix, etc.
        *)
          echo "Blocked: Only test/lint commands allowed (vitest, playwright, tsc, npm run)." >&2
          exit 2
          ;;
      esac
      ;;
    # Read-only shell inspection
    ls|cat|head|tail|wc|find|file|stat|du|tree|echo|printf|sort|uniq|diff|grep|rg|awk|sed|tr|cut|tee|xargs|basename|dirname|realpath|readlink)
      ;; # allowed
    # Allow test/true/false for shell conditionals
    test|\[|true|false)
      ;; # allowed
    *)
      echo "Blocked: Command '$TOKEN' is not in the reviewer allowlist. Allowed: read-only git, npx vitest/playwright/tsc, npm run, and basic shell inspection (ls, cat, head, tail, wc, find, grep, sort, etc.)." >&2
      exit 2
      ;;
  esac
done <<< "$SEGMENTS"

exit 0
