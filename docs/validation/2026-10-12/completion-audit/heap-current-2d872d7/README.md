# Fixed-source native remount memory observations

The original remount test passes its resource, font-cache, and context-loss assertions on fixed `2d872d7`. Its heap samples still increase. A separate extended diagnostic also completes, but does not establish whole-heap stability.

## Original gate and extended diagnostic

Both runs use a fresh `npm ci`, the locked dependencies, and the 23 repository Pixi patches on sim4. The build passes. Node is 22.17.0 and Chromium is 149.0.7827.55. The archived environment contains executable hashes and the package-lock hash. The final dependency inventory contains 14,765 files; it is a final inventory, not a before/after dependency comparison.

The unchanged original test performs ten warmup remounts and twenty measured remounts. It passes in 34.3 seconds. The original test does not assert a numeric heap limit. Its 21 post-GC samples increase from 20,745,892 to 22,271,548 bytes, a gain of 1,525,656 bytes.

The separate diagnostic preserves the production source and original test. It copies the test into `heap-diagnostic.spec.ts`, measures 240 remounts, and adds a snapshot after the first 120. Its timeout is 600 seconds, with a 660-second global limit. Those diagnostic limits do not replace the original gate limits. The run completes in 4.4 minutes and preserves all original resource assertions.

The diagnostic reads the actual rendered page's WebGL identity: NVIDIA RTX 5070 Ti through Vulkan. The original gate used the same launch flags but did not capture its own GPU identity. Both browsers run headlessly. No other browser work runs on sim4 during either campaign.

| Observation                                                     | Post-GC main-page heap |
| --------------------------------------------------------------- | ---------------------: |
| Diagnostic start, after ten warmups                             |       20,646,632 bytes |
| After 120 measured remounts                                     |       24,663,012 bytes |
| After 240 measured remounts                                     |       25,372,808 bytes |
| Increase over the second 120 remounts                           |          709,796 bytes |
| Increase across the final twenty samples, or nineteen intervals |           30,300 bytes |

All 241 diagnostic samples are archived. The final sixty samples span 394,752 bytes. Font atlas canvases, 2D contexts, and BitmapText counts remain 10, 16, and 60. Resource objects remain equal, one canvas remains mounted, and no context loss occurs. These counts do not prove stable heap use.

## Later snapshot attribution

The midpoint and final snapshots contain 406,559 and 408,043 nodes. Their summed self sizes increase by 729,863 bytes. This metric includes snapshot backing sizes and differs from Runtime heap usage.

The text layout cache remains at its configured 1,000-entry limit. The identified midpoint renderer and Pixi application do not survive until the final snapshot. Current-renderer arrays and V8 code still increase. The archived post-cap analysis reports grouped self sizes and shortest strong retaining paths, not exclusive ownership or retained-byte totals.

The later GPU-cache analysis identifies growing numeric-key storage. There are 345 cache maps with one live renderer key each. Their keys increase from 130 to 250. Their V8 element backing grows from 856 to 1,576 bytes per map, adding 248,400 bytes despite unchanged entry counts.

Another 109 shared cache maps retain all earlier numeric keys. Their old values are null; the old GPU objects do not survive through those entries. Those maps add 95,048 backing bytes. Together, GPU-cache backing grows 343,448 bytes, accounting for most of the 377,324-byte array-elements increase. This identifies cache-index overhead and stale null keys, not retained old renderer instances.

## Evidence and source limits

The 1,555 source inputs match the fixed Git source before testing, after the original test, and after the extended diagnostic. The diagnostic script is an explicit additional test file. It does not modify any inventoried source. The source proof includes public assets and the original tests; protected screenshots and thresholds remain unchanged.

`summary.json` records every artifact's compressed and raw SHA-256 and byte count. All five full heap snapshots remain archived: two original and three diagnostic. The package includes raw samples, producer scripts, commands, environment, dependency inventory, source proofs, and analysis output. Run `python3 verify.py` in this directory to check the package.
