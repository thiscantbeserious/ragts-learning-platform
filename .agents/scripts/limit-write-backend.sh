#!/bin/bash
# Restricts Write/Edit to backend-scoped paths only.
# Allowed: src/server/, src/shared/, packages/, tests/, .state/

# Portable realpath -m (works on macOS + Linux)
_resolve() { python3 -c "import os,sys; print(os.path.realpath(sys.argv[1]))" "$1"; }

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

# Resolve repo root and canonicalize the target path
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null || _resolve .)
RESOLVED=$(_resolve "$FILE_PATH")

# Must be inside the repo and under an allowed directory
if [[ "$RESOLVED" == "$REPO_ROOT/src/server/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/src/shared/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/packages/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/tests/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/.state/"* ]]; then
  exit 0
fi

echo "Blocked: Backend engineer may only write to src/server/, src/shared/, packages/, tests/, and .state/." >&2
exit 2
