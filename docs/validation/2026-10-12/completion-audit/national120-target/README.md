# National120 target controls

The strict 60 FPS target remains unmet in these sim3 controls.
Commit `07efa67` adds legal 120-army workloads without changing balance values or game rules.
The unchanged scenario supplies 120 validated march commands and passes all state invariants.
The focused suite passes 41 tests; typecheck, ESLint, and builds pass.

| Renderer-only camera | Average FPS | Frame-time p95 | Minimum mounted |
| -------------------- | ----------: | -------------: | --------------: |
| Overview             |       38.73 |        27.1 ms |             120 |
| Operational          |       25.91 |        42.5 ms |             120 |
| Close                |       16.34 |        78.1 ms |             120 |

Each 30-second renderer control uses 1920×1080 with actual NVIDIA RTX 5070 Ti Vulkan rendering in headless Chrome 149.
Each control fails the unchanged 60 FPS gate.
All 120 armies remain mounted, canonical state stays byte-for-byte equal, and resource counts match before and after.
The paused driver does not advance strategy.
Only view fractions and camera positions animate.

Postrender cadence does not measure physical GPU presentation.
Mounted armies can be outside the visible camera rectangle.

The separate live overview control advances from day 121 to 150, then a mandatory owner pauses the campaign.
All 120 armies remain marching and mounted, but 1535 recorded interruptions invalidate the live window.
Its 56.23 FPS and 18 ms p95 do not establish live acceptance.
The other live presets do not run after the serial failure.

The raw scope string retains the earlier forty-army label; preparation and cohort fields record 120.
The committed workload corrects that metadata.

A separate 10-second overview CPU profile samples 10.218 seconds.
`layoutArmyPlates` accounts for 6.385 seconds inclusive.
Its overlap functions account for 4.345 seconds of self time.
The profile does not supply acceptance FPS.
The profile confirms canonical byte equality and zero driver ticks.

`summary.json` records precise results, source applicability, limitations, and raw uncompressed hashes.
The source proof matches 754 frozen source, tool, and public files against `e65fbbc` plus the owned workload changes.
Gzip files preserve exact logs, measurements, source manifests, and profile bytes.
The transfer manifest records remote trace paths and hashes.
The complete live failure archive remains on sim3 at the recorded path and hash.
No performance threshold, artist channel, scenario, or invariant changes in this step.
