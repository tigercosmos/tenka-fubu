# Battle controls at the minimum viewport

The real Battle fixture passed 15 UI scales from 0.8 through 1.5 at **1280 × 720**. A separate case passed native focus, Space, Escape, and local speed-key ownership at 1.5 scale. Test-only commits `8d0a040` and `8bcb9fd` change no Battle production code.

The scale cases load `debug-battle-01` through the actual Battle screen. They set each scale through the Settings slider. Each case checks the root viewport width, visible title bounds, native header controls, map nodes, unit buttons, unit cards, and tactic buttons. Interactive targets must measure at least 32 × 32 CSS pixels. Settings changes must leave the `GameState` unchanged. The keyboard case checks focused native Space, log Space, and Escape menu behavior. It also checks Battle speed keys without advancing the strategic day.

| Captured run                 | Result                        | Scope                                                         |
| ---------------------------- | ----------------------------- | ------------------------------------------------------------- |
| `battle-scale-baseline-v2`   | 15/15 passed                  | Initial geometry checks at all 15 scales.                     |
| `battle-controls-v3`         | 14/16 passed                  | Two new title-height assertions failed at 1.45 and 1.5.       |
| `battle-title-diagnostic-v4` | 1 expected diagnostic failure | The 1.5 screenshot and computed geometry show the full title. |
| `battle-controls-final-v5`   | 16/16 passed                  | Final geometry, visible title, and keyboard checks.           |
| `battle-controls-final-v6`   | 16/16 passed                  | Adds header and footer button vertical viewport bounds.       |

The v3 assertion compared the title's integer `scrollHeight` with its rounded `clientHeight`. At 1.5 scale, these values were 33 and 31 pixels. The title uses visible overflow. Its text range was within the 72-pixel header, and the captured screenshot shows the full title. The final check tests the visible text range and its separation from the first control. This corrects the test oracle; it does not change CSS.

`sim4-runs.tar.gz` contains the full captured command, result, stdout/stderr, browser reports, screenshot attachment, and three failure traces. `local-captures.tar.gz` contains the setup and local validation captures. `manifest.json` pins the archives, source files, final test commit, and expected exit codes. Run `python3 docs/validation/2026-10-12/completion-audit/battle-controls-79682cd/verify.py` to check these files, all 15 scale reports, the 16 final passes, and every trace hash.

The setup streamed the full tracked `79682cd` archive to sim4, including validation docs and output. This exceeded the intended scoped setup. Its command and successful exit are preserved in the local capture. No second source transfer occurred. Two early source-proof commands exited 1 because they named the wrong dependency manifest path; `source-proof-v3` and `final-source-proof-v6` succeeded. Fresh `npm ci`, build, final typecheck, ESLint, and Prettier checks passed.

The P5 smoke test uses a debug-only abort button. It does not verify the production voluntary retreat described in plan/11 §3.11.1. Plan/07 does not specify that retreat's penalty or command contract, so this batch leaves production retreat unresolved. These tests also do not cover Battle result rewards, tactical extinction, or full visual approval.
