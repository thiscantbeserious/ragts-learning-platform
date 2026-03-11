#!/bin/bash
# Restricts Write to design-scoped paths only.
# Allowed: design/, .state/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)(design/|\.state/)'; then
  exit 0
fi

echo "Blocked: Frontend designer may only write to design/ and .state/." >&2
exit 2
