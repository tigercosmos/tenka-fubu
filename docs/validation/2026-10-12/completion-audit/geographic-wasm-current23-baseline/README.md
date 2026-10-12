# Current23 native geographic WASM baseline

All nine settled native snapshots match the pinned reference byte for byte: SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`.
The comparison includes complete published payloads and canonical hashes for days 0–2 and all three cameras. Only the four original named nonvisual counters are excluded.

| Camera      | Average FPS | Slow FPS | Frame p95 |
| ----------- | ----------: | -------: | --------: |
| Overview    |    59.83336 | 56.49718 | 17.700 ms |
| Operational |    42.93288 | 39.21569 | 25.500 ms |
| Close       |    24.61326 | 20.53388 | 48.700 ms |

All three single 30-second controls fail the unchanged strict 60 FPS gate. They run serially on sim3 with 120 canonical armies at 1920×1080 through RTX 5070 Ti Vulkan rendering. No retries, new thresholds, or profile captures apply. Strategy stays paused; postrender cadence does not establish live campaign acceptance or physical GPU presentation.

This replica starts with a fresh `npm ci` and all 23 frozen Pixi patches. Each installed patch SHA matches its manifest. The full installed dependency tree contains 14,765 hashed files. The source transfer contains no `node_modules`; the new dependency directory has a distinct inode from the retained old replica. All 1,396 frozen source, public, Rust, tool, test, and root configuration files match `c05a46c`, with no extra files in those tracked directories. Public assets are real files. The WASM is 27,147 bytes, SHA256 `2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df`.

The initial build fails because the transfer omitted a production-imported test fixture. Transferring frozen tests fixes it; the final build succeeds and checks WASM freshness. Both build logs remain archived. The environment records Node 22.23.3, npm 10.9.9, Chromium 1228 / Chrome 149, and NVIDIA driver 580.178.04. Browser, driver scripts, configuration, patch sources, dependencies, build artifacts, and transferred source have hash proofs.

Exact canonical before/after JSON comes from the retained Playwright trace results. All three controls preserve canonical bytes and resources. Remote traces remain at the paths recorded in `state-resource-proof.json.gz`, with their hashes. Raw payloads, frame samples, logs, and scripts are byte-preserving gzip artifacts; `summary.json` records both raw and compressed SHA256 values.

This is the current23 baseline for future castle Rust measurements with the same dependencies and runtime. Differences from the old dependency cohort cannot identify geographic Rust effects. The original old replica and its RED evidence remain intact.
