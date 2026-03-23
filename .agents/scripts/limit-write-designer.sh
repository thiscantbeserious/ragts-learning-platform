#!/bin/bash
# Restricts Write to design-scoped paths only.
# Allowed: design/, .state/

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
if [[ "$RESOLVED" == "$REPO_ROOT/design/"* ]] ||
   [[ "$RESOLVED" == "$REPO_ROOT/.state/"* ]] ||
   [[ "$RESOLVED" == "/tmp/"* ]] ||
   [[ "$RESOLVED" == "/private/tmp/"* ]]; then
  exit 0
fi

echo "Blocked: Frontend designer may only write to design/ and .state/." >&2
exit 2
