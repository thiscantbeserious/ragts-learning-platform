#!/bin/bash
# Blocks Write tool calls to paths outside .state/
# Used by story-writer to restrict file creation to state directories.

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

if [ -z "$FILE_PATH" ]; then
  exit 0
fi

if echo "$FILE_PATH" | grep -qE '(^|/)\.state/' ; then
  exit 0
fi

echo "Blocked: Write is restricted to .state/ directories." >&2
exit 2
