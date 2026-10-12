#!/usr/bin/env bash
set -euo pipefail
RUN_DIR=$1
TEST_FILE=$2
RUNTIME=/tmp/tenka-court-runtime-1649-v1
NODE_BIN=/home/anchi/.nvm/versions/node/v25.9.0/bin
BROWSERS=/tmp/tenka-20261012-sim2-browser/runtime/browsers
[[ -x "$NODE_BIN/node" && -x "$BROWSERS/chromium-1228/chrome-linux64/chrome" && -x "$RUNTIME/node_modules/.bin/playwright" ]]
export PATH="$NODE_BIN:/usr/local/bin:/usr/bin:/bin"
export PLAYWRIGHT_BROWSERS_PATH="$BROWSERS"
export VISUAL_GPU=1
exec python3 /tmp/tenka-validation-capture-961f0ae.py --run-dir "$RUN_DIR" --cwd "$RUNTIME" --browser -- "$RUNTIME/node_modules/.bin/playwright" test "$TEST_FILE" --project=chromium
