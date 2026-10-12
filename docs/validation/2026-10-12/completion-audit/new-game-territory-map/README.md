# New-game territory preview evidence

Commit `f31284d6a4301b65ef9fded0ff3364efa2651c10` adds the 1560 national
territory preview to the clan step. It uses the existing 1024-cell Voronoi grid,
the canonical coastline, and each district's castle owner. A pointer press on
colored land and Enter on a roster button update the same selected clan. The map
draws a selected boundary and names the clan in text. The Oda card has the
novice label supported by plan/16 §3.9. The six recommendation slots and star
ratings in the plan/11 sketch still lack authored data; this evidence does not
close that part of M8-17. Decision D67 records the boundary.

The executed runtime was a scoped archive of parent
`cb717d2466a21daa29aa15843c0de22abb8b91ce` plus the eight files changed
by `f31284d`. Local and sim4 SHA-256 rows for all eight files were identical.
The source verifier checked 1,641 base entries and eight overlay paths (1,645
distinct files) after both browser campaigns and found zero mismatches. The
package lock matched the retained sim4 dependency install. Build preflight
validated all 29 pinned Pixi patch targets and wrote none. The production build
and bundle budget passed; measured gzip sizes were 634,966/819,200 bytes for
initial JS, 100,845/1,228,800 for scenario JS, and 355,728/2,097,152 for the
font. Typecheck, touched ESLint, Prettier, font coverage, and the focused grid
test passed.

| Captured run      | Result                         | What it establishes                                                                                                                                                                                  |
| ----------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `c1-selector-red` | 2 unexpected timeouts, 121.5 s | The first test draft used the wrong Settings button name (`關閉`). Neither case reached the map. This is a test-harness failure, retained in full.                                                   |
| `c2-endpoints`    | 2/2 passed, 3.4 s              | At scales 0.8 and 1.5, the square map fit the viewport, pointer selection and roster Enter agreed, the selected raster boundary and name appeared, and returning from difficulty retained selection. |
| `c3-all-scales`   | 15/15 passed, 18.9 s           | The same map checks passed at every supported 0.8–1.5 scale in 0.05 steps; a sea click left selection intact.                                                                                        |
| `wizard16`        | 16/16 passed, 84.4 s           | The original four-step wizard and deterministic-state assertions passed unchanged on the committed map source.                                                                                       |

The focused unit test builds the real scenario grid. It checks that all 41
selectable clans own at least one visible cell and samples grid cells against
an independent district→castle→clan lookup. The browser test uses scenario
district seed coordinates to select Imagawa on the map, then selects Oda with
the keyboard roster. It checks square geometry, a minimum 180 px map side,
viewport containment, horizontal roster overflow, selected border pixels,
backtracking, and sea behavior. It does not measure frame rate or approve the
remaining recommendation data.

Each run directory contains the complete Playwright JSON report, command,
result, and combined stdout/stderr. `images/` has the six reviewed endpoint
screenshots from `c2-endpoints`. The compressed `proofs/local-captures.tar.gz`
contains setup and focused-check commands/results, scoped archive manifest,
overlay hashes, and producer scripts. Its first self-including draft is retained
as `local-captures-first-incomplete.tar.gz`; the final archive excludes its own
active capture. The first post-run process check failed from shell quoting and
is retained there; the corrected check found no owned Playwright, Chromium, or
Vite jobs.

The full browser-result directories remain on sim4 at
`/tmp/tenka-daimyo-map-native-{c1,c2,c3}/browser-results` and
`/tmp/tenka-daimyo-map-wizard-c1/browser-results`. Their complete file SHA-256
inventories are `proofs/remote-artifacts-*.txt.gz`; no browser trace or
unselected screenshot was copied into Git. The exact scoped source archive is
`/tmp/tenka-battle-79682cd/runs/daimyo-map-cb-c1/source.tar` on sim4 with
SHA-256 `c498b92e2d9207b2b3bf86951603bbb9654f0968d621bb495514fe01f78b104c`.
