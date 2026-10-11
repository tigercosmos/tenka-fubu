# Native geographic edge index controls

The three single-window FPS controls do not demonstrate a performance benefit from `a381b7d`.
The evaluated geographic edge index preserves all nine settled native snapshots exactly.
The candidate will be withdrawn from the current runtime because the measured overall benefit does not justify its added indexing and sorting complexity.
The original `a381b7d` experiment source and raw observations remain preserved.
The post-capsule reference and new output share SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`.
The comparison includes complete published views, canonical hashes, labels, plates, ribbons, artwork, elevation, and settlement geometry.
Only the existing named nonvisual run and placement-cache counters are excluded.

| Camera      | Capsule FPS | Edge-index FPS | Capsule p95 | Edge-index p95 |
| ----------- | ----------: | -------------: | ----------: | -------------: |
| Overview    |       59.87 |          57.59 |     17.6 ms |        17.5 ms |
| Operational |       42.81 |          42.91 |     25.5 ms |        25.7 ms |
| Close       |       23.99 |          24.14 |     50.4 ms |        50.5 ms |

All three 30-second controls fail the unchanged strict 60 FPS gate.
Every control mounts all 120 canonical armies at 1920×1080 through actual RTX 5070 Ti Vulkan rendering in headless Chrome 149.
Strategy remains paused; these renderer prerequisites do not establish live campaign acceptance.
Postrender cadence does not measure physical GPU presentation.
No FPS retries or acceptance-threshold changes apply.

One separate 10-second close CPU profile follows all three timing controls.
Both the previous capsule profile and this capture complete 240 renders.
Geographic layout inclusive cost changes from 14.698 to 14.545 ms per completed render, about 1% lower.
The `edgeAxis` self cost changes from 3.385 to 2.489 ms per completed render, about 26.5% lower.
Castle ribbon inclusive cost changes from 8.725 to 8.800 ms per completed render.
These single profiles suggest lower edge scanning cost but do not establish an overall rendering improvement.

The isolated sim3 replica receives only `src/ui/map/geographicLabelLayout.ts` after the validated capsule build.
All 754 recorded source, tool, and public hashes match the expected frozen tree.
The same four dependency module hashes remain unchanged; later root Pixi cache fixes are absent.
The exact transferred source, observer, FPS control, profile script, and source-map analysis are included as gzip files.

Exact strategy JSON is extracted from both `page.evaluate` results in each retained Playwright trace.
All three windows preserve 816643 bytes with the same canonical and resource hashes.
The independent profile records actual matching before and after hashes and zero driver ticks.
`native-summary.json` records full metrics, normalized profile comparisons, limitations, and raw uncompressed hashes.
The transfer manifest preserves the remote trace paths and hashes; original failures remain intact.
