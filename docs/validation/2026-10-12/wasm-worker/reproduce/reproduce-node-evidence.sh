#!/usr/bin/env bash
set -euo pipefail
# Run from a checked-out repository with npm ci completed and built WASM.
repo_dir="${TENKA_REPO_DIR:-$PWD}"
evidence_dir="$(cd "$(dirname "$0")" && pwd)"
run_dir="$(mktemp -d "${TMPDIR:-/tmp}/tenka-worker-evidence.XXXXXX")"
export TENKA_REPO_DIR="$repo_dir" TENKA_EVIDENCE_DIR="$evidence_dir" TENKA_RUN_DIR="$run_dir"
python3 - <<'PY'
import os
from pathlib import Path
repo=Path(os.environ['TENKA_REPO_DIR']).resolve()
evidence=Path(os.environ['TENKA_EVIDENCE_DIR'])
run=Path(os.environ['TENKA_RUN_DIR'])
for name in ['tenka-worker-stage-benchmark.ts','tenka-worker-stage.worker.ts','tenka-cloned-state-parity-assert.ts']:
    source=(evidence/(name+'.txt')).read_text().replace('/Users/tigercosmos/tenka-fubu',str(repo))
    # Runtime bundling resolves absolute imports; no dependence on the source artifact location.
    (run/name).write_text(source)
PY
cd "$repo_dir"
./node_modules/.bin/esbuild "$run_dir/tenka-worker-stage.worker.ts" --bundle --platform=node --format=esm --outfile="$run_dir/worker.mjs"
./node_modules/.bin/esbuild "$run_dir/tenka-worker-stage-benchmark.ts" --bundle --platform=node --format=esm --outfile="$run_dir/benchmark.mjs"
./node_modules/.bin/esbuild "$run_dir/tenka-cloned-state-parity-assert.ts" --bundle --platform=node --format=esm --outfile="$run_dir/parity.mjs"
export TENKA_WORKER_FILE="$run_dir/worker.mjs" TENKA_WASM_FILE="$repo_dir/public/wasm/tenka_engine.wasm"
TENKA_OUTPUT_FILE="$run_dir/worker-stage-benchmark-v2.json" node "$run_dir/benchmark.mjs"
TENKA_OUTPUT_FILE="$run_dir/cloned-state-parity-assert.json" node "$run_dir/parity.mjs"
printf 'Reproduced results and generated sources: %s\n' "$run_dir"
