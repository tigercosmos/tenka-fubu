# Native castle ribbon zero-objective controls

The three single-window FPS controls do not demonstrate an overall rendering benefit from `6795ed7`.
The evaluated candidate preserves all nine settled native snapshots exactly against the post-capsule reference.
The candidate will be withdrawn from the current runtime because the measured overall benefit does not justify its added budget fast path.
The original `6795ed7` source and raw observations remain preserved.
Both outputs share SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`.
The comparison includes complete published views, canonical hashes, labels, plates, ribbons, artwork, elevation, and settlement geometry.
Only the existing named nonvisual run and placement-cache counters are excluded.

| Camera      | Capsule FPS | Candidate FPS | Capsule p95 | Candidate p95 |
| ----------- | ----------: | ------------: | ----------: | ------------: |
| Overview    |       59.87 |         59.90 |     17.6 ms |       17.5 ms |
| Operational |       42.81 |         44.20 |     25.5 ms |       24.8 ms |
| Close       |       23.99 |         23.86 |     50.4 ms |       51.1 ms |

All three 30-second controls fail the unchanged strict 60 FPS gate.
Every control mounts all 120 canonical armies at 1920×1080 through actual RTX 5070 Ti Vulkan rendering in headless Chrome 149.
Strategy remains paused; these renderer prerequisites do not establish live campaign acceptance.
Postrender cadence does not measure physical GPU presentation.
No FPS retries or acceptance-threshold changes apply.

One separate 10-second close CPU profile follows the three timing controls.
The previous capsule profile completes 240 renders; the candidate capture completes 241.
Castle ribbon inclusive cost changes from 8.725 to 8.433 ms per completed render, about 3.35% lower.
Castle ribbon self cost changes from 4.091 to 6.481 ms per completed render, about 58.4% higher.
Geographic layout inclusive cost changes from 14.698 to 14.826 ms per completed render.
These single captures do not establish an overall rendering improvement.
The sampled self attribution change does not establish an actual runtime regression.

The isolated sim3 replica first restores the original geographic layout with SHA256 `3d7796705fbc82053feb7946f2f2b0c772c00ce01e45a3e06ba108eef9da0fae`.
It then receives only `src/ui/map/sceneParts/castleRibbonLayout.ts` from `6795ed7`.
All 754 source, tool, and public hashes match the expected post-capsule tree with this single candidate change.
The same four dependency module hashes remain unchanged; later root Pixi cache fixes are absent.
The withdrawn geographic edge index does not participate in this comparison.
Exact candidate source, observer, FPS control, profile script, and source-map analysis are preserved as gzip files.

Exact strategy JSON is extracted from both `page.evaluate` results in each retained Playwright trace.
All three windows preserve 816643 bytes with the same canonical and resource hashes.
The independent profile records actual matching before and after hashes and zero driver ticks.
`native-summary.json` records full metrics, normalized profile comparisons, limitations, and raw uncompressed hashes.
The transfer manifest preserves remote trace paths and hashes; all original failures remain intact.
