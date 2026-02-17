#!/bin/bash
set -euo pipefail

# Auto-detect container engine: prefer podman, fall back to docker
if command -v podman &>/dev/null; then
  CONTAINER_ENGINE="podman"
elif command -v docker &>/dev/null; then
  CONTAINER_ENGINE="docker"
else
  echo "Error: No container engine found. Install podman or docker." >&2
  exit 1
fi

echo "Using container engine: $CONTAINER_ENGINE"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

mkdir -p pkg

$CONTAINER_ENGINE build -t ragts-vt-build .
$CONTAINER_ENGINE run --rm -v "$(pwd)/pkg:/output/pkg" ragts-vt-build

echo "WASM build complete -> pkg/"
