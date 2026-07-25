#!/bin/sh
set -eu

if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  NODE_BIN="/Users/qiren.zhao/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
fi

if [ ! -x "$NODE_BIN" ]; then
  echo "Node.js 22.6+ was not found."
  exit 1
fi

exec "$NODE_BIN" --env-file-if-exists=.env --experimental-strip-types src/chat.ts
