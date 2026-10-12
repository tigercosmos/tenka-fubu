# Heap retention attribution after bind-group cleanup

The saved remount run still increases the main-page heap. This analysis identifies large positive snapshot groups and their shortest strong root paths. It does not establish a remaining application leak or pass the whole-heap stability gate.

## Inputs and reproduction

The chronological, post-GC snapshots come from the same native run recorded in [batch-bind-group-cache](../batch-bind-group-cache/README.md). The script reads the existing files; this directory does not duplicate the snapshots.

| Input                                                                 | SHA-256 of gzip file                                               |
| --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `../batch-bind-group-cache/native/00-before-remounts.heapsnapshot.gz` | `acf47e41598684a9bf82dd0fea72f31c590df4c3a193b3e0343eec4c25ec76aa` |
| `../batch-bind-group-cache/native/01-after-remounts.heapsnapshot.gz`  | `c1e7568d57b5cf3ebe667cc83c8d1415b37f08d41e24f5e0a5a86d994a32a556` |
| `../batch-bind-group-cache/native/02-remount-heap-samples.json.gz`    | `a20a38fb7d627d38bc232637546176f9f8652d93db9be4ea75b9afb4da8149a4` |

Run `python3 docs/validation/2026-10-12/completion-audit/heap-retention-attribution/analyze.py` from the repository root. It prints the full [analysis.json.gz](analysis.json.gz) data as JSON. The archive contains the exact stdout bytes, compressed with gzip `mtime=0`; its SHA-256 is `29f8b52e4fdce4c687371097c752a15c3f37a82f43aee6004360e1179de15cf6`.

The archived [BitmapFontManager.js.gz](BitmapFontManager.js.gz) is the current installed PixiJS 8.19.0 source used to check the text cache limit. Its gzip SHA-256 is `c0dcfcbce2b16ad12654613a93ff8be841a2486c524e0ac4991f134083d24bd3`; its decompressed SHA-256 is `08f8b9f801b71879fc62c8d677cf18accf99a82f3270dd26822bb959e080a3bf`. Line 51 constructs `tinyLru.lru(1e3)`.

## Observed deltas

The 121 Runtime samples increase from 20,604,640 to 24,374,172 bytes (+3,769,532). The last 20 samples increase 155,208 bytes. The snapshots contain 377,430 then 405,312 nodes. Their summed node self sizes increase from 46,334,301 to 50,558,791 bytes (+4,224,490). Runtime heap usage and snapshot self size are different measurements.

| Snapshot group           | Count change | Self-size change |
| ------------------------ | -----------: | ---------------: |
| V8 `InstructionStream`   |         +616 | +1,686,464 bytes |
| Array object elements    |       +2,693 |   +622,404 bytes |
| V8 `TrustedByteArray`    |       +1,465 |   +581,212 bytes |
| ArrayBuffer backing data |            0 |   +346,356 bytes |
| V8 `ProtectedFixedArray` |         +535 |   +214,196 bytes |

The largest new `InstructionStream` nodes have IDs 1121711 and 1121691. Their paths run through the page's debug `getState` context to function code. These paths support V8 code growth, but the pair cannot show whether code growth stops after warmup.

The old renderer and Pixi application IDs are absent after remount. The snapshot contains one renderer-shaped `K4` and one application-shaped `Li` in each view, with new IDs after remount. This rules out survival of those two identified old instances, not every possible retained object.

The Pixi text layout cache owner ID 691633, manager ID 615867, and `items` ID 615869 survive. The item count rises from 124 to 1,000. A sample value, ID 755739, follows `Window → current MapRenderer → current Pixi Application → BitmapFontManager.measureCache.items[掛川城-4718-0-true]`. The installed Pixi source limits this cache to 1,000 entries, so this pair records cache fill up to its configured limit. It does not prove a post-limit plateau in total heap use.

The largest stable backing store is ID 78051. Its self size rises from 1,572,864 to 2,097,152 bytes (+524,288). Its path runs through the current renderer's `territoryGrid.nearestDistrict` `Uint16Array`. This is an in-place capacity increase in a current-renderer buffer, not retention of the old renderer.

`PerformanceLongAnimationFrameTiming` increases from 17 to 200 nodes, and `PerformanceScriptTiming` increases from 26 to 319. Sample paths run through the browser `Performance` object and DevTools console. These records do not identify an application-owned map cache. The increased DOM element samples follow the current `HTMLDocument`.

The script reports node self size and one shortest strong path. A shortest path is not an exclusive ownership proof. These two snapshots cannot establish monotonic post-warmup growth; the follow-up native campaign must compare later post-GC snapshots under the same workload.
