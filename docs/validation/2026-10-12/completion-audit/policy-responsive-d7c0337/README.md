# Policy panel responsive acceptance at the minimum viewport

The policy portion of M8-23/11-T8 now has a native 1280×720 acceptance test across every supported `uiScale` setting, 0.8 through 1.5 in 0.05 steps. On clean source `d7c0337`, all 15 scale cases pass: 180 actual policy-card visits, each selecting its detail, scrolling to the action, and checking the panel, content, and action remain inside reachable viewport bounds. No production UI change was needed. This is a policy-panel subgate, not a completion claim for all M8-23 screens, full keyboard table, accessibility, or M8 checkpoint.

## Source and run

The sim2 runner at `/tmp/tenka-policy-responsive-d7c0337` was extracted from `git archive d7c0337`. It overlaid only [this final test](accepted-test.spec.ts.gz). A fresh locked `npm ci` applied the original 25-target Pixi patch. The [Git-blob inventory](d7-tracked-inputs.json.gz) covers 1,545 tracked source, test, public, plan, tool, Rust, and root-config files. [Post-run verification](source-verification.json) reports zero mismatches, confirms the final test SHA-256 `87055d92ecca106c7a17c587ea2dd23da18949c4c00da421aa7a6398a886aa86`, and confirms all 25 installed Pixi files matched the pinned patch before and after. The [installed before](runtime-pixi25-before.json.gz) and [after](runtime-pixi25-after.json.gz) hashes are retained. The Playwright full Chromium binary was reused from an existing sim2 runtime; this is a fresh dependency installation but not a fresh browser download.

The original spec is [11 §3.16.2](../../../../../plan/11-ui-screens.md): 1280×720 must keep panels within the viewport and allow overflowing content to scroll without forcing a lower scale. [11-T8/T15](../../../../../plan/11-ui-screens.md) require the policy card grid and whole screen to avoid overflow. [16 §3.8](../../../../../plan/16-save-and-settings.md) sets the supported 0.8–1.5 range and 0.05 step. The test enters a real s1560 Oda game, changes scale using the actual Settings slider, pauses, and opens Policy through F5. It checks document width ≤1280, panel bounds ≤1280×720, zero horizontal overflow of card grid, card names/summaries and detail, scrollable vertical overflow, and every action rectangle after scrolling. It uses real Tab/Enter from F5 to open the first detail, reverse Tab from the final card to the first and then to close the panel. Disabled policy actions are checked for visible placement; their command behavior is outside this geometry test.

Run on sim2 with the existing full Chromium runtime on `PLAYWRIGHT_BROWSERS_PATH`:

```sh
npm ci
npm run build
CI=1 VISUAL_GPU=1 npx playwright test e2e/policy-responsive.spec.ts --workers=1
```

[Fresh install](npm-ci.log.gz), [build](build.log.gz), and [final native run](policy-native-final.log.gz) each have exit 0 in their adjacent `.exit` files. The final native suite has 15/15 passing cases in 1.2 minutes. [All 180 raw geometry rows and 15 initial/reverse keyboard focus paths](policy-evidence-files.tar.gz) retain the original test output bytes. All 15 initial keyboard paths reached the first card after 16 Tabs, and both the grid and detail had zero horizontal excess in all 180 observations. The grid needed vertical scrolling in all 180 visits; detail needed it in 147. The maximum document width was exactly 1280 CSS px.

The original three endpoint screenshots are [0.8](policy-responsive-0.8.png), [1.0](policy-responsive-1.png), and [1.5](policy-responsive-1.5.png). Visual inspection shows card text and detail controls readable and available through scrolling. At 1.5 the persistent mini-map covers only the blank lower-right part of the broad panel, below the active detail section. The screenshots are review aids; they are not protected visual baselines or an OCR/contrast audit.

## Retained rejected runs

The first `npm ci` invocation used an absolute npm path without putting Node on `PATH`, exited 127, and its raw output was overwritten before preservation; it is not represented as a successful attempt. The corrected fresh install log is retained. The first native invocation [failed at browser launch](policy-native-missing-browser.log.gz) because the default Playwright cache lacked full Chromium; all 15 cases failed at 0 ms, before any UI assertion. The matching browser was then selected through `PLAYWRIGHT_BROWSERS_PATH` without changing source or test behavior.

The first real browser run [failed two scales then was interrupted](policy-native-baseline.log.gz), exit 130, because an exploratory assertion sent up to 100 forward Tabs from the _last_ card and expected focus to wrap to the first. Its focus trace showed that forward traversal reached two disabled-action reason spans, then Report Center and document BODY; on BODY, the documented MainScreen Tab hotkey changes the map analysis view. This was a rejected keyboard test path, not a demonstrated policy-panel defect. The final test instead validates real keyboard entry from F5 and reverse navigation within the panel. The rejected partial run is not counted toward the final 15-scale acceptance.

`manifest.json` records SHA-256 and byte count for every evidence file here except itself and this README. No protected screenshots, thresholds, plans, BAL values, or production source were changed.
