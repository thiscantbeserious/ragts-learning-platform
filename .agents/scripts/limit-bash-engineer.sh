#!/bin/bash
# Bash guardrail for engineer agents (frontend/backend).
# Engineers need broad bash access for builds, tests, and git workflow.
# This hook blocks patterns that bypass Write/Edit scope hooks:
# - Direct file modification (sed -i, perl -pi, tee, dd)
# - Subshell injection ($(), backticks)
# - File redirections (>, >>)
# File writes must go through Write/Edit tools where scope hooks apply.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Allow git commands that use subshells for commit messages (heredoc pattern)
if echo "$COMMAND" | grep -qE '^git\s+(commit|tag)'; then
  exit 0
fi

# Block subshell injection and redirections
if echo "$COMMAND" | grep -qE '\$\(|`|>[^&]|>>'; then
  echo "Blocked: Subshell expansion (\$(), backticks) and file redirections (>, >>) are not allowed. Use Write/Edit tools for file modifications." >&2
  exit 2
fi

# Block commands that modify files in-place (bypassing Write/Edit hooks)
# Check each segment in chained commands
SEGMENTS=$(echo "$COMMAND" | grep -oE '[^|&;]+')

while IFS= read -r segment; do
  TRIMMED=$(echo "$segment" | sed 's/^[[:space:]]*//')
  TOKEN=$(echo "$TRIMMED" | awk '{print $1}')

  [ -z "$TOKEN" ] && continue

  case "$TOKEN" in
    # Block in-place file editors
    sed)
      if echo "$TRIMMED" | grep -qE '\s-i|\s--in-place'; then
        echo "Blocked: 'sed -i/--in-place' modifies files in-place. Use the Edit tool instead." >&2
        exit 2
      fi
      ;;
    perl)
      if echo "$TRIMMED" | grep -qE '\s-[a-zA-Z]*p[a-zA-Z]*i|\s-[a-zA-Z]*i[a-zA-Z]*p|\s--inplace'; then
        echo "Blocked: 'perl -pi/--inplace' modifies files in-place. Use the Edit tool instead." >&2
        exit 2
      fi
      ;;
    # Block write-capable commands
    tee)
      echo "Blocked: 'tee' writes to files. Use the Write tool instead." >&2
      exit 2
      ;;
    dd)
      echo "Blocked: 'dd' writes to files. Use the Write tool instead." >&2
      exit 2
      ;;
  esac
done <<< "$SEGMENTS"

exit 0
