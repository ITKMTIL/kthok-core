#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="${IMAGE:-kthok-core}"
TAG="${TAG:-latest}"
PLATFORM="${PLATFORM:-linux/amd64}"

docker build --platform="$PLATFORM" --target runner -t "$IMAGE:$TAG" .
docker build --platform="$PLATFORM" --target migrate -t "$IMAGE-migrate:$TAG" .

if [ "${PUSH:-0}" = "1" ]; then
  docker push "$IMAGE:$TAG"
  docker push "$IMAGE-migrate:$TAG"
fi

echo "Built $IMAGE:$TAG and $IMAGE-migrate:$TAG for $PLATFORM"
