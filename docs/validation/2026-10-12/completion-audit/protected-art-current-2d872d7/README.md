# Protected art review at `2d872d7`

The original three-camera Linux screenshot gate remains RED on the current source. The required drawable-layer test passes. This package keeps the original expected images, the current actual images, the Playwright diffs, and the unmodified failure logs together for review. No baseline, tolerance, fixture, renderer source, or Art Bible envelope was changed.

## Exact run

The source is a fresh `git archive HEAD` from clean local `2d872d7`, copied to `/tmp/tenka-art-gate-2d872d7` on sim2. The archive included `src`, `public`, `e2e`, `tools`, `rust`, `tests`, and the build/test configuration. [Git blob manifest](source-git-blobs.json.gz) and [post-run verification](art-source-post-verification.json) check all 1,524 archived files against their exact `2d872d7` bytes, with zero mismatch. The archive command itself establishes the initial source; a separate pre-run per-file manifest was not taken. The reused `node_modules` and Node/Chromium runtime are symlinks to the earlier isolated `latest-native-visual-sim2` cohort; the package-lock SHA-256 matched (`63f021d39b353a70831accbfc50b714a09767b900ce23157fbf4ecce1dda7be1`). The sorted dependency-file-content fingerprint was `5f301b7032ed54ced77f50cb3ee80bd52096bf60f2d960c5582e0041ee30a0e6` both before and after. The first build attempt failed because `tests/fixtures/tiny` was absent from the initial scoped archive; its raw failure output was overwritten by the later build log and is not retained in this package. The missing tracked `tests` directory was then copied from the same HEAD and the unchanged build passed. [Build log](art-build.log.gz) records the successful run.

Commands, in the fresh copy with the reused runtime on `PATH` and `PLAYWRIGHT_BROWSERS_PATH`:

```sh
npm run build
CI=1 VISUAL_GPU=1 npx playwright test e2e/visual.spec.ts --grep 'three camera baselines|required renderer layers' --workers=1
CI=1 VISUAL_GPU=1 npx playwright test e2e/settlement-material.spec.ts --workers=1
```

Playwright used Chromium 149 headlessly, 1280×720, DPR 1, and reduced motion. Its GPU flags were `--enable-gpu --use-angle=vulkan`. A separate page with the same visual-map fixture read the WebGL debug extension and reported `ANGLE (NVIDIA, Vulkan 1.4.312 (NVIDIA NVIDIA GeForce RTX 5070 Ti (0x00002C05)), NVIDIA)`; [GL probe](art-gl-check.mjs.gz) and [output](art-gl.log.gz) are retained. This identity probe was a separate page, not an assertion embedded in the screenshot test. No other browser/GPU work was active on sim2 at preflight.

## Protected comparison

The original comparison is `e2e/visual.spec.ts:41–59`: `maxDiffPixels: 100`, `threshold: 0.15`, and all three required baseline files must exist. The three copied expected PNGs have the same SHA-256 as the protected files under `e2e/visual.spec.ts-snapshots/`; the six protected Darwin/Linux files remained unchanged. The run produced one layer-presence PASS and one screenshot test FAIL. [Raw visual log](art-visual.log.gz) contains each stable capture and original failure.

| Camera      | Expected protected image                            | Current actual                            | Playwright diff                       | Changed pixels / 100 allowed |
| ----------- | --------------------------------------------------- | ----------------------------------------- | ------------------------------------- | ---------------------------: |
| Overview    | [expected](strategy-overview-chromium-linux.png)    | [actual](strategy-overview-actual.png)    | [diff](strategy-overview-diff.png)    |                      186,777 |
| Operational | [expected](strategy-operational-chromium-linux.png) | [actual](strategy-operational-actual.png) | [diff](strategy-operational-diff.png) |                      270,334 |
| Close       | [expected](strategy-close-chromium-linux.png)       | [actual](strategy-close-actual.png)       | [diff](strategy-close-diff.png)       |                      291,556 |

Visual review: the current images show textured terrain and developed mountain/forest forms, a compact dark HUD/rail, terrain-grounded castle models, and expanded army plates. The expected images show flat paper terrain, larger light HUD/rail, and earlier compact labels. The scene-wide differences cannot be attributed to one raster defect. The exact changed-pixel counts happen to match the older `2544b30` capture, but the actual PNG bytes differ; this package is the current `2d872d7` capture.

The direction of the changes follows the project's own [Art Bible](../../../../visual/art-bible.md) terrain, HUD, model and label hierarchy, and the original abstract [reference board](../../../../visual/references.md) R01/R02/R05/R11. Those references explicitly prohibit importing another game's imagery or layout. The older [M6-V11 review](../../../../visual/m6-v11-review.md) approved an earlier set of screenshots, before these broad scene changes. It does not approve this replacement. Plan 17 §3.9.3 item 1 requires any baseline update in an independent commit with before/after images, Art Bible rationale and reviewer approval. This package supplies the images and rationale for that decision but does not change the accepted baseline or mark the gate green.

## Separate current art defect

The current headless [settlement-material run](art-settlement.log.gz) still fails `e2e/settlement-material.spec.ts:469`: the first fixed view, Sunpu close, has zero individually unobscured town-wall sample pixels, while the assertion requires more than zero. [Sunpu close](town-castle.sunpu-near.png), [Sunpu mid](town-castle.sunpu-mid.png), [Kiyosu close](town-castle.kiyosu-near.png), and [Kiyosu mid](town-castle.kiyosu-mid.png) are the test's original four screenshots. The [original current trace observation](art-sunpu-near-observation.json.gz) shows one Sunpu house at approximately x441–461/y350–377, with both wall facets completely rejected by actor overlays. Army `army.000002` has a plate at x421–484/y358–383, offset `(0, -80)` from its original frame, already at the Art Bible's 80 CSS pixel displacement radius. The earlier [settlement projection record](../settlement-projection/summary.json) identified the same zero-wall view. Art Bible §10.4 permits bounded label avoidance with unresolved overlap; satisfying this material assertion requires a separate, demonstrated visual correction rather than relaxing the screenshot threshold or hiding required army information.

This review package establishes the present screenshot mismatch and the present Sunpu material failure. It does not establish three-second human recognition, all-label readability, the national 120-army FPS gate, or whole-heap stability.

`manifest.json` lists the SHA-256 and byte count of every file in this evidence directory except itself and this README. `art-input-sha256.txt` records the source copy's package lock, WASM, visual spec, and six protected PNGs before the browser run.
