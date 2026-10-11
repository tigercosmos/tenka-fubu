# National120 broadphase controls

Commit `8cdd7db` reduces army plate collision scans without changing placement rules.
The full proposal lists remain intact.
Collision reductions retain the original order and include previously placed plates.
The broadphase includes the complete 48-pixel movement envelope and existing four-pixel overlap gap.

The strict 60 FPS target remains unmet.
The same frozen dependency tree supplies all before and after measurements.
Later root cache patches do not apply to these controls.

| Camera      | Baseline FPS | Optimized FPS | Baseline p95 | Optimized p95 |
| ----------- | -----------: | ------------: | -----------: | ------------: |
| Overview    |        38.73 |         59.61 |      27.1 ms |       17.6 ms |
| Operational |        25.91 |         42.98 |      42.5 ms |       25.3 ms |
| Close       |        16.34 |         18.49 |      78.1 ms |       70.3 ms |

Each 30-second hardware control keeps 120 armies mounted and passes canonical byte equality and resource equality.
Every control still fails the unchanged 60 FPS gate.
These paused renderer controls do not establish live campaign acceptance or physical GPU presentation cadence.

The frozen algorithm reference matches 320 seeded scenes, 24 boundary variants, and a dense 120-army scene.
The related suite passes 49 tests.
Typecheck, ESLint, and build checks pass.

Nine native snapshots match exactly across three camera presets and days 0–2.
The comparison covers the complete published view, canonical hashes, plates, ribbons, geography labels, castle artwork, elevation, and settlement geometry.
It excludes only the named nonvisual run and cache counters.
The initial capture observes a pending tick too early; both original raw captures remain archived with exact hashes.
The corrected observer waits for simulation idle and verifies actual and published days without adding ticks.
Manual paused stepping loses the marching cohort at day 2 in both implementations; observation stops there.

Separate CPU profiles follow the acceptance controls.
Overview army layout falls from about 16.67 to 5.30 sampled inclusive milliseconds per completed render.
This normalization accounts for 383 baseline renders and 599 optimized renders.
The optimized close profile identifies road capsule distance calculations as a separate major cost.
Profile timings do not supply acceptance FPS.

`summary.json` records precise metrics, scope, dependency hashes, and raw uncompressed hashes.
Gzip files preserve accepted native outputs, profiles, scripts, and logs.
The complete archive also preserves the original observation-race outputs.
The source proof matches 754 files against the frozen base and owned changes.
