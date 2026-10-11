# Node Worker and pathfinding parity evidence

From the repository root, after `npm ci` and `npm run wasm:build`:

```sh
bash docs/validation/2026-10-12/wasm-worker/reproduce/reproduce-node-evidence.sh
```

Requires Node 22 or newer, Python 3, and the repository's esbuild installation. `TENKA_REPO_DIR` optionally selects another checkout. Run timing experiments serially on an otherwise idle host. The runner rewrites the captured sources' original absolute repository prefix into the selected checkout, bundles with esbuild, and leaves generated sources and results in a fresh temporary directory. It never overwrites the captured raw measurements.

`tenka-worker-stage-benchmark.ts` and `tenka-worker-stage.worker.ts` are the exact sources used for `worker-stage-benchmark-v2.json`. The 60-day national s1560 workload uses seed 1, Oda player, canonical runtime events, and pending AI orders. A synchronous reference runs first; a genuine Node Worker runs second with the production executor, actual Rust WASM installation, pending-order reservations, native postMessage cloning, persistent Worker state, and the production main-side reconciliation function. Each returned day's stateHash must equal the reference before its timing row is appended. Any discrepancy throws and prevents the final result artifact. The output records raw native timings, snapshot/postMessage/compute/reconcile/round-trip timings, and cumulative Rust query/topology-build counts. It excludes browser rendering, and mainBusy sums snapshot, synchronous postMessage, and reconciliation durations. Worker startup is included in the first round trip. These measurements describe blocking work; they do not establish improved simulation throughput.

`tenka-cloned-state-parity.ts` is the original 120-day diagnostic source used for `cloned-state-parity.json`. It calculates the first divergent day for stable Rust state and state cloned before each day against the TypeScript reference. Zero means no divergence. The runner uses `tenka-cloned-state-parity-assert.ts`, which preserves that workload and adds an explicit failure on divergence, an environment-selected output path, and all three complete daily hash arrays. The added assertions do not change gameplay inputs.

`tenka-worker-stage-profile.worker.ts` captures a separate inspector CPU profile of the Worker. It was used for `worker60.cpuprofile` and `worker60-profile-summary.json`; its samples are diagnostic, and its instrumented timing rows are not benchmark evidence. To reproduce it, bundle it instead of `tenka-worker-stage.worker.ts`, set `TENKA_PROFILE_FILE` to a writable output path, and run the same benchmark main bundle.

Captured benchmark environment: sim1 Linux x64, Node v22.23.3, 465 map nodes, 60 days. Exact source snapshots are preserved here because measurements use the then-current shared workspace; rerunning against a later checkout intentionally measures its latest code.

Captured TypeScript sources are stored with `.ts.txt` extensions. The runner restores `.ts` filenames in its isolated run directory; the source bytes remain unchanged.

Original captured JSON results are stored as `.json.gz`; decompress them with `gzip -dc`.
