# M6-V11 fresh protected-baseline and layer gates

The fresh native drawable-layer gate passes at overview, operational, and close LODs.
The protected screenshot gate remains RED at all three Linux camera views.
The six protected baseline files remain unchanged.
No rendering source, test, screenshot tolerance, or baseline was changed in this step.

## Exact tested snapshot

The capture records HEAD `2544b30` plus the working changes listed in the [raw source manifest](tenka-m6-latest-source-manifest.json.gz).
This is an exact captured working snapshot, not a clean HEAD-only checkout.
All 1,444 copied runtime/test/config files and 40 public files matched recorded hashes before build and after native testing.
[After-run verification](tenka-m6-latest-source-verification.json.gz) includes all six protected PNG identities.
Current Pixi patch metadata and WASM bytes were included in the source overlay.
The isolated repository is `/tmp/tenka-m6-native-latest-2544b30` on sim2.

Chromium 149.0.7827.55 ran headlessly on an NVIDIA RTX5070Ti with Node 22.23.3.
The native window had no profiler or concurrent native workload on that host.
The canonical test retained its reduced-motion fixture, 1280×720 viewport, DPR one, and existing timeouts.
[Reproducer](reproducer.json) records commands, launch flags, source archive, and remote result paths.

## Native results

| Gate                               | Result | Scope                                                  |
| ---------------------------------- | ------ | ------------------------------------------------------ |
| Production build                   | PASS   | Exact captured runtime inputs                          |
| Required renderer layers           | PASS   | Positive drawable content at all three LODs            |
| Protected three-camera screenshots | RED    | Every Linux view exceeds the unchanged pixel threshold |

| Camera      | Changed pixels | Maximum allowed | Artifacts                                                                        |
| ----------- | -------------: | --------------: | -------------------------------------------------------------------------------- |
| Overview    |        186,777 |             100 | [Actual](strategy-overview-actual.png), [diff](strategy-overview-diff.png)       |
| Operational |        270,334 |             100 | [Actual](strategy-operational-actual.png), [diff](strategy-operational-diff.png) |
| Close       |        291,556 |             100 | [Actual](strategy-close-actual.png), [diff](strategy-close-diff.png)             |

The screenshot threshold remains 0.15, with at most 100 changed pixels.
Each screenshot comparison obtained stable screenshots after waiting for fonts and disabling CSS animations.
The two-test run finished with one passed and one failed test in 12.7 seconds.
[Native log](tenka-m6-latest-visual.log.gz) preserves every failure and threshold.
[Build log](tenka-m6-latest-build.log.gz) preserves the runtime build result.

## Comparison and approval boundary

The [protected operational image](../../../../../e2e/visual.spec.ts-snapshots/strategy-operational-chromium-linux.png) uses flat terrain and a large light rail.
The actual operational image shows textured terrain, a compact dark HUD/rail, and expanded army labels.
These are broad scene and UI differences, separate from the earlier eleven/eight HUD-corner restoration pixels.
This comparison does not identify a single source clipping correction that would resolve the protected-baseline difference.
The older [restoration diagnosis](../native-gates-sim2-505d96a/README.md) remains independently scoped to its original source.

Plan 17 §3.9.3 requires an independent baseline update with before/after images, Art Bible rationale, and reviewer approval.
No such replacement was authorized or performed here.
The current fixed-baseline acceptance therefore remains RED.
Layer presence does not establish human readability, all-label geometry, or accepted FPS and whole-heap stability.

## Raw evidence

The six actual/diff PNGs retain their original bytes.
[Manifest](manifest.json) records compressed and uncompressed hashes and byte counts for all raw artifacts.
The raw source manifest, build log, failure log, error context, and after-run source verification are compressed without formatting their bytes.
All hashes and local links were checked after repository copying.

The original expected images and failure trace remain on sim2 at [recorded paths and hashes](external-trace-expected-hashes.log.gz).
Large trace and HTML report archives are excluded from this bounded commit.
[Summary](summary.json) records exact differences, unchanged assertions, source identities, and acceptance limits.
Parent completion records remain separately owned.
