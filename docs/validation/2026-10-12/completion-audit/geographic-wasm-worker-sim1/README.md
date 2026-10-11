# New WASM cross-platform and Worker compatibility: sim1

The Linux rebuild of the new Rust module is byte-identical to the Mac artifact, including its manifest. A fresh locked install applies all 23 current Pixi patches and the production build passes. The unchanged six native Worker cases finish **5 PASS / 1 RED**, exit 1; the suite is not reported green.

## Frozen source and installation

Runtime is `fb9fd7f885f3569bc819a3957a67f734f9f7b123`, isolated at `/tmp/tenka-fb9fd7f-wasm-worker-sim1`. A complete `git archive` snapshot contains 2,814 files and no AppleDouble files. `source-manifest.json.gz` records every path, byte count and SHA256, plus the 371,568,640-byte archive hash. After installation, Rust rebuild, production build and native execution, all 2,814 remote source hashes still match with zero mismatches. No shared source, assertion, timeout, dependency lock or fallback behavior was changed.

Node 22.23.3 / npm 10.9.9 installs 359 packages through fresh `npm ci`; the isolated `node_modules` is a real local directory, not the earlier shared dependency symlink. Postinstall records `validated:23,written:23`. `runtime-dependency-proof.json.gz` independently records every installed Pixi patched-file hash, Pixi 8.19.0 and Playwright 1.61.1. Original npm warnings and audit output remain in the raw log; no audit fix was run.

Rust 1.97.1 Linux (`8bab26f4f68e0e26f0bb7960be334d5b520ea452`, LLVM 22.1.6) rebuilds through the unchanged `npm run wasm:build` recipe: locked release target `wasm32-unknown-unknown`, disabled incremental compilation and the existing crate-path remap. Mac and Linux binary and manifest comparisons both succeed. The artifact is 27,147 bytes, SHA256 `2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df`; path ABI and geographic ABI are both 1. Preserved Mac, Linux and actually served WASM bytes have the same hash. The observed preview process has this isolated checkout as its working directory. Production build passes in 4.17 seconds.

## Original native result

Command: `DEBUG=pw:browser npx playwright test e2e/worker-simulation.spec.ts --workers=1`, using the original configuration and deadlines. No retry or unchanged-source rerun was performed. Execution is headless Chromium, and the full actual browser flags, GPU warnings and console output are preserved in `native-worker-tests.log.gz`. No visible browser was opened. This host is separate from sim3's old-dependency performance cohort; their timings are not combined.

| Original case                                                 | Result                                                                              |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Seeded queued command, complete state and replay log          | RED, 12.8s: only final `wasmLoaded === true` diagnostic assertion fails             |
| Public save/reload preserves unconsumed command               | PASS, 23.5s                                                                         |
| Same-host 60 additional days, complete state and log          | PASS, 26.8s; both final states day 61                                               |
| Same-host 120 additional days, complete state and log         | PASS, 35.6s; both final states day 121                                              |
| Pause already posted day, preserve command and new generation | PASS, 5.5s                                                                          |
| Native ×5 versus paced synchronous reference                  | PASS, 24.9s; actual 29 additional days, ending day 30 at the ordinary monthly pause |

The raw reporter totals 5 passed / 1 failed in 2.2 minutes. Complete state/log attachments for all five passing cases are retained, including body-only attachments extracted from the original HTML report metadata. The native ×5 row must not be relabeled as 60 completed days. These are compatibility and parity results, not a frame-rate, total-heap or general speedup acceptance claim.

## Exact RED attribution

The first test passes its command validation, complete state equality, complete replay-log equality, real Worker creation, HTTP-200 WASM response and actual `rust-wasm` reply checks before failing at `e2e/worker-simulation.spec.ts:205`. `failed-error-context.md.gz` preserves that exact assertion and accessible page state.

The preserved trace supplies the actual values:

- `call@54`: four Workers created; tick requests 1–4 sent; three complete replies, all `backend:'rust-wasm'`, with no inconsistent threat totals.
- `call@56`: generation 4, completed Worker ticks 3, pending ticks 0, dropped stale responses 0, `wasmLoaded:false`, `pathfinderBackend:null`.
- `call@26`, `call@30` and `call@50`: complete original initial, queued-but-unmutated and final day-3 snapshot JSON strings, extracted verbatim. Actual replay logs and diagnostics are decoded into separately labeled derivative JSON; the original serialized trace entries remain intact.

This matches the existing cancellation contract: `src/app/bridge.ts:314–327` cancels a posted day and reports the current client's `backendReady`; `src/app/worker/client.ts:149–161` terminates the old Worker, creates a new epoch and resets readiness to false. It is not a historical “Rust was used” flag. Main-thread geographic WASM initialization is independent (`src/ui/map/MapRenderer.ts:775`, `wasmGeographicScorer.ts:72–96`), and cannot set simulation-client readiness. The simulation module is initialized lazily in its own Worker (`simulation.worker.ts:14–26`). This is a source-backed explanation of the recorded generation change, not permission to make the old assertion pass by reporting historical readiness.

## Evidence boundaries and reproduction

Raw JSON/log bytes are gzip-preserved before formatting. The complete HTML report metadata, original failure trace metadata (`.trace`, `.network`, `.stacks`), all passing state/log attachments, extracted failed snapshots and exact-source manifest are committed here. The independent verifier checks hashes, binary equality, all five passing parity records and the contradictory current-generation diagnostic without changing the game.

The exact 55,498,974-byte full failure trace, including screenshots, HTML snapshots and static resource bodies, remains in the separately preserved sim1 path recorded by `retained-trace.json`, SHA256 `0a247ec60b7ddf156c78625f1848b842dafc8dbc2b0189a84c087cc05b56d3b5`. Those resource bodies are excluded from this bounded bundle; all trace metadata and extracted full state/diagnostics are included. The complete original test-results and HTML-report directories are also preserved remotely. No later run overwrote them.

Reproduce with a clean checkout of the frozen source and Node 22:

```sh
git worktree add --detach /tmp/tenka-worker-repro fb9fd7f885f3569bc819a3957a67f734f9f7b123
cd /tmp/tenka-worker-repro
npm ci
rustup toolchain install 1.97.1 --profile minimal --target wasm32-unknown-unknown
npm run wasm:build
npm run build
npx playwright install chromium --only-shell
DEBUG=pw:browser npx playwright test e2e/worker-simulation.spec.ts --workers=1
```

The original readiness assertion can remain timing-sensitive; the preserved result is the actual 5/1 run, not a promise that every reproduction fails identically. To verify this immutable evidence independently, run `python3 verify-evidence.py` in this bundle.
