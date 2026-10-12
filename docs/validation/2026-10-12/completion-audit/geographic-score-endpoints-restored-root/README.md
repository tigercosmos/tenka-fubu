# Root endpoint candidate and withdrawal checks

Root reviewed and copied the two scratch Rust files, rebuilt the candidate with the original pinned recipe, and committed `c2302c4`. Actual main build output was89,761bytes SHA69af4226d451a71211b209101cc4223045b1aeca2f1178d16e9beaa91166b736. Rust24 tests, clippy/fmt and11actualWASM suites80tests passed (7.55s). Original logs are retained. These focused checks do not replace a full suite. Build/test/clippy/fmt processes all ended exit0.

After the single native campaign showed no overall benefit, `45a5384` restored four source/artifact files to accepted scalar `feab20c` blobs. Root generated the current1494trackedinput inventory against45a Gitblobs and compared every row to the exact pre-FULL feab inventory. All paths/bytes/SHA match; both public WASM/manifest also match feabGitblobs, with88475-byte binary64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b and1466-byte manifest09483b9c0d9ddcd7ec57673a6a17380dc7ca2385a095872f710b020451413ca3. Restored wasm:check exited0.

Inventory scope is tracked src/tests/tools/e2e/plan/rust and root configs, excluding public/dependencies and binary outputs. The two public WASM blobs are a separate explicit check. These rows do not prove dependency trees or all public assets. The latest FULL remains6392PASS/1knownFAIL/1skip at feab; no new FULL or FPS was run after withdrawal.

`verify-evidence.py` checks byte hashes, original logged counts, source-row equality and current Gitblob compatibility. It does not run build/tests/browser/timing.
