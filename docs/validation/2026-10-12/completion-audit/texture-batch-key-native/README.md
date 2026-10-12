# Native texture-batch cache verification

The texture-batch cache fix removes the measured sparse ID storage. All 63 stable `BatchTextureArray.ids` maps have zero keys and zero indexed backing bytes at remounts 120 and 240. The original lifecycle test passes, and three fresh map images are byte-identical before and after the fix. Whole-heap stability remains unproved.

The baseline is exact `d7c0337`, with 1,555 inventoried inputs. The candidate adds the three exact overlays adopted in `f5d8969`: the patch manifest, its installer test, and the new texture-cache regression. The new test increases the candidate inventory to 1,556 inputs. Two baseline checkpoints and four candidate checkpoints verify unchanged source bytes. The later policy acceptance test is outside this isolated campaign.

Both isolated checkouts use fresh locked `npm ci` installations and production builds on sim4. The baseline installs 25 Pixi targets; the candidate installs 29. Final dependency inventories contain 14,765 files each. The candidate's post-run environment records Node 22.17.0 and Chromium 149.0.7827.55 executable hashes. The baseline's separate map-fixture probe identifies NVIDIA RTX 5070 Ti Vulkan rendering. The candidate's separate probe exits 1 because it calls `waitMapIdle` before the renderer mounts. Its raw failure is preserved. The candidate visual test itself does not capture GPU identity; matching launch flags alone do not establish that identity. The extended diagnostic records RTX 5070 Ti Vulkan identity in its actual tested page.

## Original tests and image comparison

The unchanged three-view screenshot test remains RED against its protected references in both versions. The required-layer test passes in both versions. Comparing the fresh baseline actuals with the fresh candidate actuals gives byte-identical overview, operational, and close images. All six source images and their original protected-reference diffs are archived. Protected references and thresholds remain unchanged.

The original remount test uses ten warmups and twenty measured remounts. It passes in 34.3 seconds. Its 21 post-GC samples increase from 20,581,264 to 22,067,432 bytes, a gain of 1,486,168 bytes. The original test asserts resource counts and context-loss behavior; it has no numeric heap assertion.

## Separate extended diagnostic

The diagnostic copies the original test, preserves its resource assertions, and measures 240 remounts after ten warmups. It adds a midpoint snapshot and uses separate 600-second case and 660-second global limits. Those limits do not replace the original gate. The diagnostic passes in 4.4 minutes.

| Observation                   | Post-GC main-page heap |
| ----------------------------- | ---------------------: |
| Before measured remounts      |       20,643,968 bytes |
| After 120 remounts            |       24,217,876 bytes |
| After 240 remounts            |       24,426,460 bytes |
| Second 120-remount increase   |          208,584 bytes |
| Last 20 samples, 19 intervals |            4,480 bytes |

Font atlas canvases, 2D contexts, and BitmapText counts remain 10, 16, and 60. Resource assertions pass and no context loss occurs. The final twenty samples' small increase does not establish a stable plateau.

The 63 stable texture-ID maps have no indexed, named, or null keys at either snapshot. Their earlier 25-target counterpart had 73,476 and 128,772 bytes of indexed backing. The 833 `_gpuData` owners also retain zero indexed keys or indexed backing, preserving the preceding renderer-cache fix.

Snapshot self size still rises from 51,599,469 to 51,821,356 bytes, an increase of 221,887 bytes. InstructionStream, TrustedByteArray, and ProtectedFixedArray groups contribute 113,664, 36,508, and 21,736 bytes of growth. Timing objects add 14,784 bytes. The aggregate object-elements group decreases by 20,692 bytes, and ground/coast graphics backing remains unchanged. These are snapshot self sizes, distinct from Runtime heap usage and retained-size dominators.

## Evidence limits and reproduction

The package preserves all five full heap snapshots, raw samples, original failure logs, screenshot actuals/references/diffs, source proofs, dependency inventories, and analysis scripts. `summary.json` records compressed and raw hashes. Two approximately 60 MB Playwright traces remain at their original remote paths; the summary records their hashes and their omission from this local archive.

Run `python3 verify.py` in this directory to check artifacts, six source checkpoints, candidate overlays, five snapshots, sample deltas, and all three image pairs. Snapshot scripts import the parser archived at `../heap-current-2d872d7/post-cap-analysis.py.gz`; their remote paths are recorded in the raw scripts. Extract that parser and the candidate snapshots, then adjust only those paths for a local rerun. The cache correction does not complete the original whole-heap or strict 60 FPS gates.

The initial artifact verifier incorrectly required both standalone GPU probes to exit zero. Its source and reproduced failure are archived as `packaging__verifier-initial*`. The corrected verifier requires the baseline probe's success, the preserved candidate probe failure, and the extended diagnostic's actual-page GPU identity. This correction does not change the original browser results.

An independent orchestrator rerun of the texture-map analysis on the original remote snapshots produced byte-identical JSON (202,566 bytes). `texture-parser-reproduction.json` records the command and hash. This checks the 63-map attribution; it is not a new browser measurement.
