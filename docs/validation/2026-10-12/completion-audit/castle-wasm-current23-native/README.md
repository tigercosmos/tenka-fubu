# Same-cohort castle WASM native controls

The combined `04c7b60` runtime shows higher observed operational and close FPS than the frozen current23 geographic baseline. All three controls still fail the unchanged strict 60 FPS gate. These single paired windows do not establish repeatability or isolate the castle kernel as the sole cause: the runtime also contains the shared WASM owner hook and Worker ready changes.

| Camera      | Baseline FPS | Combined runtime FPS | Observed change | Baseline p95 |   New p95 |
| ----------- | -----------: | -------------------: | --------------: | -----------: | --------: |
| Overview    |     59.83336 |             59.93091 |          +0.16% |    17.700 ms | 17.500 ms |
| Operational |     42.93288 |             49.73817 |         +15.85% |    25.500 ms | 22.000 ms |
| Close       |     24.61326 |             29.11552 |         +18.29% |    48.700 ms | 41.500 ms |

Each camera runs once for 30 seconds, serially on sim3, with the original byte-exact FPS control and unchanged thresholds. The workload has 120 canonical armies at 1920×1080 through RTX 5070 Ti Vulkan rendering in headless Chrome 149. Strategy stays paused. These render-only prerequisites do not establish live campaign acceptance or physical GPU presentation. No FPS retry applies.

All nine settled day 0–2 camera snapshots match the complete pinned reference byte for byte: SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`. The observer retains its original four named nonvisual counter exclusions. Canonical before/after JSON is extracted from both exact Playwright trace results for each timing window. All three windows preserve canonical bytes and resources. Remote trace paths and hashes remain in `state-resource-proof.json.gz`.

The new replica shares only the original fresh current23 `node_modules` through an explicit symlink. All 14,765 installed dependency files and all 23 patch target hashes match the baseline before, after the functional observation, and after the completed measurements. All 1,404 frozen source, public, Rust, tool, test, and root configuration files match `04c7b60` at those same checkpoints. Those source directories contain no extra files; public assets are real files. The final build succeeds and checks the 63,073-byte WASM SHA256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`. The c05 baseline replica's 1,396 source files are independently rechecked and remain unchanged. Baseline evidence stays immutable in commit `3bbc10f`.

One separate 10-second close CPU profile follows all three timing controls. It completes 290 renders (289 postrender intervals) with zero workload driver ticks and equal actual canonical and resource hashes. The compiled export map identifies `castle_ribbon_solve` as function 27 and `geo_score` as function 44. The profile records both actual WASM frames. Castle solve inclusive sampled time is 933,326 µs, about 3.22 ms per completed render. JavaScript planner `layout` self time is 12,604 µs, about 0.043 ms per render; its 953,283 µs inclusive time contains child WASM and cannot be counted as packing alone. Geographic label layout inclusive time remains 4,165,075 µs, about 14.36 ms per render. These samples provide attribution within the combined runtime. No current23 baseline CPU profile exists; old dependency cohort profiles cannot provide a fair quantitative comparison.

`summary.json` records exact metrics, scope limits, export mappings, profile attribution, and both raw and compressed SHA256 values. Gzip artifacts preserve complete raw snapshots, all original RED logs and frame samples, actual canonical state, profiles, scripts, frozen source markers, environment, GPU driver hashes, build outputs, and source/dependency proofs.
