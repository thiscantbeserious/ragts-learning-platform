#!/bin/bash
# Restricts Write to design-scoped paths only.
# Allowed: design/, .state/

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve repo root and canonicalize the target path
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || realpath -m .)
RESOLVED=$(realpath -m "$FILE_PATH")

# Must be inside the repo and under an allowed directory
if [[ "$RESOLVED" == "$REPO_ROOT/design/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/.state/"* ]]; then
  exit 0
fi

echo "Blocked: Frontend designer may only write to design/ and .state/." >&2
exit 2
