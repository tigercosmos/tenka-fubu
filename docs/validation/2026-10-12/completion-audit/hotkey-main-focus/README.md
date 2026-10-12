# MainScreen Home and M focus correction

The MainScreen `Home` and `M` shortcuts now work when a non-control panel item has focus. The change follows the conditions in [11 §3.16.1](../../../../../plan/11-ui-screens.md) and keeps the input, native-control, dialog, modal, and viewport guards from [11-D25/D27](../../../../../plan/11-ui-screens.md). The resource strip still owns `Home` for local scrolling.

## Source and reproduction

`7d37c28` is the source before the correction. `f03ba63` contains the four-file correction and permanent [native test](../../../../../e2e/hotkey-focus.spec.ts). [source-hashes.json](source-hashes.json) gives the SHA-256 of each file in both commits. [source.patch](source.patch) is the exact diff. [static-build-hashes.json](static-build-hashes.json) records the separate static build files used by the real browser probe. The build directories stayed outside the checkout and are not part of this package.

The [probe script](tenka-home-m-native.mjs.gz) starts a real s1560 Oda game, pauses time, and focuses Nobunaga's trait span in the officer detail panel. That span is a focusable MainScreen item, not a text input or native control. The script presses real browser keys and reads the published map selection. Its [baseline](tenka-home-m-native-baseline.json) and [candidate](tenka-home-m-native-candidate.json) outputs show:

| Focus and key            | Before                                   | After                                               |
| ------------------------ | ---------------------------------------- | --------------------------------------------------- |
| Trait span, `m`          | Minimap stays visible; key not prevented | Minimap hides; key prevented                        |
| Trait span, `Home`       | Selection stays null; key not prevented  | Home castle `castle.kiyosu` selected; key prevented |
| Search input, `m`/`Home` | Minimap visible; selection null          | Same                                                |
| Rail button, `m`/`Home`  | Minimap visible; selection null          | Same                                                |
| Resource strip, `Home`   | Selection null                           | Same                                                |

Both browser outputs contain zero console errors. The separate builds use the same game flow. The table reports one run per build, not a performance result.

## Checks

The new router and hook assertions fail against the unchanged source in an isolated `7d37c28` worktree: 2 failed, 18 passed. The same assertions pass on `f03ba63`: 20 passed. The raw outputs are [RED](tenka-hotkey-red-vitest.log.gz) and [GREEN](tenka-hotkey-green-vitest.log.gz).

The [serial cross-screen Chromium run](tenka-hotkey-crossscreen-serial.log.gz) passed all seven selected cases. It covered this fix, camera and rail keys, local battle speed, dialog Escape and Enter, dirty F9 loading, and battle viewport ownership. [Typecheck](tenka-hotkey-typecheck.log.gz), [targeted ESLint](tenka-hotkey-eslint.log.gz), and [Prettier](tenka-hotkey-prettier.log.gz) passed. The production build completed with Vite's large-chunk warning; its file hashes are recorded above.

An earlier seven-worker run passed six cases. The camera/rail case ended with `SyntaxError: Unexpected end of JSON input` before its camera assertion. Its raw stdout was not saved. The exact seven cases passed in the serial rerun; the earlier result remains a recorded limitation, not a passing run.

Run `python3 verify.py` from this directory to check package hashes, committed source hashes, and the recorded test and browser outcomes.

The orchestrator subsequently ran full `npm run lint` at source `f03ba63`, including all new evidence files. ESLint and Prettier passed with exit 0; [the complete log](final-full-lint.log.gz) is archived. This does not extend the full Vitest result beyond `7d37c28`.
