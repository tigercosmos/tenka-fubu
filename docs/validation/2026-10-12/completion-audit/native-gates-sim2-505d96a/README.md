# M6-V14 native gate evidence

The original color-vision and road restoration tests remain RED. Two earned-ending tests pass. The live FPS window is invalid.

| Check                          | Result                                      | Scope                                                                        |
| ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------- |
| Color-vision restoration       | RED: 11 changed page pixels                 | Achromatopsia, overview only                                                 |
| Road restoration               | RED: 8 changed page pixels                  | Operational view only                                                        |
| Independent canvas restoration | Exact pixels, state, command log and camera | Both failing views; valid captures inside requestAnimationFrame              |
| Earned regional ending         | 2 passed                                    | Supported nine-castle subset, day 373; continue/save/reload and title routes |
| Real forty-army CLOSE FPS      | Invalid                                     | Mandatory council interrupts ordinary x5 play after 3.57 seconds             |

## Fixed source and environment

The tests use snapshot `505d96a` on isolated host `sim2`, with an NVIDIA RTX5070Ti and Node 22.23.3. Chromium runs headlessly.
No profiler or concurrent timing workload runs during the FPS window. All 1,389 original source files match the staged snapshot after diagnostics.
Root subsequently advances to `9dad6a6`; this bundle does not validate that newer source.

`reproducer.json` records commands, environment, timeouts and remote paths. `505d96a-source-verification.json.gz` records source checksums.
`summary.json` records outcomes. `coverage-audit.json` distinguishes native coverage from remaining manual and national-route requirements.

## Restoration diagnosis

The exact changed page pixels lie at rounded speed/system button corners. Their coordinates span x1120–1225 and y16–47.
The road failure has eight changed pixels; the color-vision failure has eleven. The original assertions and thresholds remain unchanged.

The first canvas probe returns one color outside requestAnimationFrame. That cleared raster cannot prove restoration and is rejected.
Valid captures contain 18,467 distinct colors at overview and 48,390 at operational view. Each before/after canvas matches exactly.
Game state, command logs and observed camera geometry also match exactly. Computed control facts match before and after the rejected probe.

A browser/compositor cause remains a hypothesis. No unambiguous product defect or corrected whole-page oracle is established.
The other color-vision cameras and modes, and the near road phase, remain untested in this bounded run.

## Interrupted performance window

The original thirty-second CLOSE gate reports `valid: false`. A mandatory three-proposal council pauses play after 3.57 seconds.
The record spans days 121–150, includes 1,582 interruptions and retains forty marching armies.
Its descriptive average is 56.40 FPS and frame-time p95 is 19.80 ms. These metrics include paused modal rendering and fail acceptance.
This bundle makes no accepted FPS, memory-stability or full-national earned-victory claim.

## Raw records and storage

`manifest.json` retains every capture identity, source path, byte count and checksum. Identical complete byte streams share one stored file.
Each row records SHA-256 for stored bytes and uncompressed bytes. Gzip archives preserve original bytes before JSON formatting.

The bundle retains original failures, invalid captures and valid captures. Large traces remain on the remote host at paths in `reproducer.json`.
No production source, original test, screenshot baseline or tolerance changes accompany this evidence.
