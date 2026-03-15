#!/bin/bash
# Blocks Write tool calls to paths outside .state/
# Used by story-writer, product-owner, architect to restrict file creation.

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

# Must be inside the repo and under .state/
if [[ "$RESOLVED" == "$REPO_ROOT/.state/"* ]]; then
  exit 0
fi

if [[ "$RESOLVED" == "$REPO_ROOT/VISIONBOOK.md" ]]; then
  exit 0
fi

# Allow agent memory system (memory: project/user/local in agent frontmatter)
# .claude is a symlink to .agents, so _resolve() canonicalizes to .agents/
if [[ "$RESOLVED" == "$REPO_ROOT/.agents/agent-memory/"* ]] || [[ "$RESOLVED" == "$REPO_ROOT/.claude/agent-memory/"* ]]; then
  exit 0
fi

echo "Blocked: Write is restricted to .state/, VISIONBOOK.md, and .claude/agent-memory/ within the repo." >&2
exit 2
