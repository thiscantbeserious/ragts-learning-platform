#!/bin/bash
# Restricts Write/Edit to backend-scoped paths only.
# Allowed: src/server/, src/shared/, packages/, tests/, .state/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)(src/server/|src/shared/|packages/|tests/|\.state/)'; then
  exit 0
fi

echo "Blocked: Backend engineer may only write to src/server/, src/shared/, packages/, tests/, and .state/." >&2
exit 2
