#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-kthok-core}"
TAG="${TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

docker build --platform="$PLATFORM" -t "$IMAGE:$TAG" .

if [ "${PUSH:-0}" = "1" ]; then
  docker push "$IMAGE:$TAG"
fi

echo "Built $IMAGE:$TAG for $PLATFORM"
