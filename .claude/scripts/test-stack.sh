#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
CORE="$ROOT/kthok-core"
CLIENT="$ROOT/kthok-client"
WORK="${KTHOK_TEST_DIR:-/tmp/kthok-test}"
CORE_PORT=3056
CLIENT_PORT=3055

stop() {
  pkill -f "$WORK/core/main.js" 2>/dev/null || true
  pkill -f "next start -p $CLIENT_PORT" 2>/dev/null || true
}

wait_port() {
  for _ in $(seq 1 30); do
    if lsof -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  echo "port $1 did not open" >&2
  return 1
}

start_core() {
  rm -rf "$WORK/core"
  (cd "$CORE" && pnpm exec tsc -p tsconfig.build.json --outDir "$WORK/core" --incremental false)
  (cd "$CORE" && PORT=$CORE_PORT CLIENT_ORIGIN="http://localhost:$CLIENT_PORT" \
    GOOGLE_CLIENT_ID= DATABASE_URL= PREFERENCE_GRACE_MS="${PREFERENCE_GRACE_MS:-8000}" \
    NODE_PATH="$CORE/node_modules" nohup node "$WORK/core/main.js" >"$WORK/core.log" 2>&1 &)
  wait_port $CORE_PORT
}

start_client() {
  mkdir -p "$WORK/client"
  rsync -a --delete --exclude node_modules --exclude .next --exclude '.env*' --exclude .git \
    "$CLIENT/" "$WORK/client/"
  ln -sfn "$CLIENT/node_modules" "$WORK/client/node_modules"
  (cd "$WORK/client" && NEXT_PUBLIC_CORE_URL="http://localhost:$CORE_PORT" NEXT_PUBLIC_GOOGLE_CLIENT_ID= \
    pnpm exec next build --webpack >"$WORK/client-build.log" 2>&1) || {
    tail -30 "$WORK/client-build.log" >&2
    return 1
  }
  (cd "$WORK/client" && nohup pnpm exec next start -p $CLIENT_PORT >"$WORK/client.log" 2>&1 &)
  wait_port $CLIENT_PORT
}

mkdir -p "$WORK"
case "${1:-}" in
  up) stop; start_core; start_client; echo "core http://localhost:$CORE_PORT  client http://localhost:$CLIENT_PORT  logs $WORK" ;;
  core) pkill -f "$WORK/core/main.js" 2>/dev/null || true; start_core; echo "core http://localhost:$CORE_PORT" ;;
  client) pkill -f "next start -p $CLIENT_PORT" 2>/dev/null || true; start_client; echo "client http://localhost:$CLIENT_PORT" ;;
  down) stop; echo stopped ;;
  node) shift; cd "$CLIENT" && NODE_PATH="$CLIENT/node_modules" node "$@" ;;
  *) echo "usage: $0 up|core|client|down|node <script.cjs>" >&2; exit 1 ;;
esac
