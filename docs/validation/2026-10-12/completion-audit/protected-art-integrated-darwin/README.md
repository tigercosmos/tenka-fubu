# Integrated Darwin protected-art review

The original three-camera screenshot gate remains RED on the integrated local source. Build and required drawable-layer checks pass. This package preserves the three unchanged protected Darwin references, fresh final actuals and Playwright diffs, the original failure log, an independent WebGL identity read, and before/after source and runtime fingerprints. It does not change a baseline, comparison threshold, renderer fixture, or Art Bible envelope.

## Exact run and source

The current checkout was `89acc88c6cf0f11801f0b3d701020857ddcdea21`, containing the bounded Sunpu art correction and the pinned Pixi renderer cache-key patch. The 25 patched Pixi runtime targets were already installed. The [pre-run](source-before.json.gz) and [post-run](source-after.json.gz) inventories cover 1,543 Git-tracked runtime, test, public, plan, tool, and root configuration files; their SHA-256s are identical before and after. They also show all 25 installed Pixi targets matching the pinned patched hashes before and after. These inventories exclude concurrent documentation work and do not claim the whole checkout was unchanged. The [proof script](source-proof.py.gz) is retained for audit. Each protected Darwin reference still matches its `HEAD` Git blob byte for byte.

Commands on the local Apple M3 Max, with the original `playwright.config.ts` headless Chromium/Metal configuration and one worker:

```sh
npm run build
CI=1 npx playwright test e2e/visual.spec.ts --grep 'three camera baselines|required renderer layers' --workers=1
```

[Build log](build.log.gz) has [exit 0](build.exit). The original [visual log](visual.log.gz) has [exit 1](visual.exit): required layer presence PASS, three-camera screenshot assertion FAIL. This is the expected RED protected gate, not a green acceptance. The [error context](error-context.md.gz) is retained; the large generated Playwright trace was not added to this evidence package. A separate page with the same `?debug=visual-map` fixture, 1280×720 viewport, DPR 1, reduced motion, headless Chromium channel, and `--use-angle=metal` read the WebGL debug extension. Its [raw output](art-gl.log.gz) reports `ANGLE (Apple, ANGLE Metal Renderer: Apple M3 Max, Unspecified Version)`; [probe](art-gl-check.mjs.gz) and [exit 0](art-gl.exit) are retained. This GPU identity read was separate from the screenshot test, not an assertion inside that test.

## Protected comparison

The unchanged `e2e/visual.spec.ts:41–59` test requires all three baseline files and uses `maxDiffPixels: 100`, `threshold: 0.15`, 1280×720, DPR 1, reduced motion. The copied expected files below have exactly the same bytes as the protected `e2e/visual.spec.ts-snapshots/*-chromium-darwin.png` files and their `HEAD` Git blobs.

| Camera      | Protected expected                                   | Final actual                              | Playwright diff                       | Changed pixels / 100 allowed |
| ----------- | ---------------------------------------------------- | ----------------------------------------- | ------------------------------------- | ---------------------------: |
| Overview    | [expected](strategy-overview-chromium-darwin.png)    | [actual](strategy-overview-actual.png)    | [diff](strategy-overview-diff.png)    |                      185,057 |
| Operational | [expected](strategy-operational-chromium-darwin.png) | [actual](strategy-operational-actual.png) | [diff](strategy-operational-diff.png) |                      268,586 |
| Close       | [expected](strategy-close-chromium-darwin.png)       | [actual](strategy-close-actual.png)       | [diff](strategy-close-diff.png)       |                      290,445 |

The separate [Linux candidate package](../protected-art-candidate-one-one/README.md) records the Sunpu material fix and its original native controls. This Darwin package is a fresh review of the integrated source on Apple Metal, not a replacement for Linux GPU evidence. The [pre-fix protected-art review](../protected-art-current-2d872d7/README.md) links the Art Bible, abstract reference board, and rationale for the broad current-versus-protected presentation change. Plan 17 §3.9.3 item 1 requires a separate baseline commit with before/after images, Art Bible rationale, and reviewer approval. This package supplies the Darwin images for that review and leaves the protected gate RED.

`manifest.json` records SHA-256 and byte count for every evidence file here except itself and this README.
