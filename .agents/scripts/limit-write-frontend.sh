#!/bin/bash
# Restricts Write/Edit to frontend-scoped paths only.
# Allowed: src/client/, src/shared/, tests/, .state/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)(src/client/|src/shared/|tests/|\.state/)'; then
  exit 0
fi

echo "Blocked: Frontend engineer may only write to src/client/, src/shared/, tests/, and .state/." >&2
exit 2
