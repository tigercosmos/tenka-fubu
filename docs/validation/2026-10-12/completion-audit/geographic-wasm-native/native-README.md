# Native geographic WASM controls

The single-window controls do not demonstrate a clear overall rendering benefit from `fb9fd7f`.
All nine settled native snapshots match the post-capsule reference exactly.
Both outputs share SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`.
The comparison covers complete published views, canonical hashes, labels, plates, ribbons, artwork, elevation, and settlement geometry.
Only the previously named nonvisual run and placement-cache counters are excluded.

| Camera      | Capsule FPS | WASM FPS | Capsule p95 | WASM p95 |
| ----------- | ----------: | -------: | ----------: | -------: |
| Overview    |       59.87 |    59.96 |     17.6 ms |  17.4 ms |
| Operational |       42.81 |    43.17 |     25.5 ms |  25.3 ms |
| Close       |       23.99 |    24.47 |     50.4 ms |  48.8 ms |

All three 30-second controls fail the unchanged strict 60 FPS gate.
Every control mounts all 120 canonical armies at 1920×1080 through actual RTX 5070 Ti Vulkan rendering in headless Chrome 149.
Strategy remains paused; these renderer prerequisites do not establish live campaign acceptance.
Postrender cadence does not measure physical GPU presentation.
No FPS retries or acceptance-threshold changes apply.

One separate 10-second close CPU profile follows the three timing controls.
The previous capsule profile completes 240 renders; the WASM capture completes 243.
Geographic layout inclusive cost changes from 14.698 to 14.590 ms per completed render, about 0.74% lower.
Castle ribbon inclusive cost changes from 8.725 to 8.809 ms per completed render.
These single captures do not establish a clear overall improvement.

The profile records actual Rust execution.
The module's export section maps `geo_score` to function index 10, matching V8's `wasm-function[10]` frame.
Its inclusive sampled cost is 1.412 seconds; its self cost is 0.208 seconds.
Internal WASM functions 2 and 6 account for another 0.895 and 0.316 seconds of self samples.
The JavaScript adapter's `score` method accounts for 0.068 seconds of self samples and 1.497 seconds inclusive.
That inclusive adapter cost contains child WASM execution and must not be counted as packing alone.
The analysis preserves original V8 names and decodes indices according to the [WebAssembly binary export schema](https://webassembly.github.io/spec/core/binary/modules.html#export-section).
Profiling supplies attribution rather than acceptance FPS.

The replica restores the original castle ribbon source and excludes both withdrawn JS candidates.
Only approved renderer and scorer files, the compiled binary, and freshness prerequisites are transferred.
All 760 recorded source, tool, public, and Rust hashes match the expected tree without extra files.
The original four dependency module hashes remain unchanged; later root Pixi cache fixes are absent.
The build verifies source freshness and both geographic and pathfinding ABI exports.
Exact transferred sources, binary, manifest, observer, FPS control, and profile scripts are preserved as gzip files.

Exact strategy JSON is extracted from both `page.evaluate` results in each retained Playwright trace.
All three windows preserve 816643 bytes with matching canonical and resource hashes.
The independent profile records actual matching before and after hashes and zero driver ticks.
`native-summary.json` records full metrics, normalized profile comparisons, export mapping, limitations, and raw uncompressed hashes.
The transfer manifest preserves remote trace paths and hashes; all original failures remain intact.
