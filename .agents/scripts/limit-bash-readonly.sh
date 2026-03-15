#!/bin/bash
# Whitelist-based command validation for read-only agents.
# Used by reviewer and architect to restrict shell access.
# Only allows read-only git, test/lint commands, and basic shell inspection.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block subshell injection and redirections that can embed arbitrary commands.
# Catches: $(...), `...`, > file, >> file
if echo "$COMMAND" | grep -qE '\$\(|`|>[^&]|>>'; then
  echo "Blocked: Subshell expansion (\$(), backticks) and file redirections (>, >>) are not allowed." >&2
  exit 2
fi

# Split on pipe, &&, ;, || and check each segment's first word.
SEGMENTS=$(echo "$COMMAND" | grep -oE '[^|&;]+')

while IFS= read -r segment; do
  # Trim leading whitespace and get first token
  TOKEN=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $1}')

  [ -z "$TOKEN" ] && continue

  case "$TOKEN" in
    # Read-only git
    git)
      SUBCOMMAND=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $2}')
      case "$SUBCOMMAND" in
        diff|log|show|status|ls-tree|ls-files|rev-parse|describe|shortlog|name-rev)
          ;; # allowed
        *)
          echo "Blocked: Only read-only git commands allowed (diff, log, show, status, ls-tree, ls-files, rev-parse, describe, shortlog, name-rev)." >&2
          exit 2
          ;;
      esac
      ;;
    # Test and lint commands
    npx)
      SUBCOMMAND=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $2}')
      case "$SUBCOMMAND" in
        vitest|playwright|tsc|vue-tsc)
          ;; # allowed
        *)
          echo "Blocked: Only test/lint commands allowed for npx (vitest, playwright, tsc, vue-tsc)." >&2
          exit 2
          ;;
      esac
      ;;
    npm)
      SUBCOMMAND=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $2}')
      SCRIPT=$(echo "$segment" | sed 's/^[[:space:]]*//' | awk '{print $3}')
      case "$SUBCOMMAND" in
        run)
          case "$SCRIPT" in
            lint|test|test:unit|test:integration|test:snapshot|test:visual|test:all|test:migrations)
              ;; # allowed
            *)
              echo "Blocked: npm run only allowed for: lint, test, test:unit, test:integration, test:snapshot, test:visual, test:all, test:migrations." >&2
              exit 2
              ;;
          esac
          ;;
        *)
          echo "Blocked: Only 'npm run <script>' allowed." >&2
          exit 2
          ;;
      esac
      ;;
    # Read-only shell inspection (no write-capable commands)
    ls|cat|head|tail|wc|find|file|stat|du|tree|echo|printf|sort|uniq|diff|grep|rg|awk|tr|cut|basename|dirname|realpath|readlink)
      ;; # allowed
    # Allow test/true/false for shell conditionals
    test|\[|true|false)
      ;; # allowed
    *)
      echo "Blocked: Command '$TOKEN' is not in the readonly allowlist. Allowed: read-only git, npx vitest/playwright/tsc, npm run <safe-scripts>, and basic shell inspection (ls, cat, head, tail, wc, find, grep, sort, etc.)." >&2
      exit 2
      ;;
  esac
done <<< "$SEGMENTS"

exit 0
