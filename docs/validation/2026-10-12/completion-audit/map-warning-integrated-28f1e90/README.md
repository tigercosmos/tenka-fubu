# Map preview and warning integration

The frozen `28f1e9084c37d1c68eb01b9328b8eecb5d99d230` run includes the new clan territory preview and uprising warning. All 1,646 scoped Git inputs and 29 patched Pixi targets match before and after execution. Each command opens its unique complete log before spawning; checks continue after a failed command.

| Check                                           | Result                                                   |
| ----------------------------------------------- | -------------------------------------------------------- |
| Focused UI, renderer, scene parts and App flows | 207 passed, 2 failed, 209 total; 11.61 s Vitest duration |
| Typecheck and full ESLint                       | PASS                                                     |
| Data, assets, build and bundle                  | PASS                                                     |
| Production discovery                            | 440 tests in 106 files                                   |
| Gallery discovery                               | 7 tests in 3 files                                       |
| Changed-file formatting                         | PASS                                                     |

Both focused failures were the existing `DaimyoSelect.spec.tsx` metadata fixture: its two castles and three districts had no connected roads and lacked geometry/color data needed by the real territory preview. The production graph validator correctly rejected the fixture. `e775a2fec46cb3d60b9a70c5a987b2d85e839390` changes only that test file: valid positions/colors and four connecting land roads, plus a scoped jsdom canvas-context spy restored after each test. The original metadata assertions remain. Its separate two tests, typecheck, touched ESLint and formatting pass. The retained Git diff, blob and clean tracked-source proof establish this test-only correction; the earlier 209-test run remains pinned to 28f and remains RED.

The source/dependency manifests, complete command logs, original failed result, correction source and later checks are retained under `raw/`. The first correction formatting capture name collided and was rejected before a child ran; the successful uniquely named c2 capture is retained here. This package does not contain a raw transcript of that rejected launcher call.

Native results are independently scoped in [territory preview](../new-game-territory-map/README.md) (15 map cases plus 16 unchanged wizard cases) and [uprising warning](../uprising-motion-28f1e90/README.md) (two DEV fixture cases). Their precise source overlays and native limitations are not replaced by this local integration check. No full core or full native suite was repeated. Discovery is not execution; the five-minute full native gate, strict 60 FPS, whole-heap, long-run and remaining M6–M9 requirements stay open.

Run `python3 verify.py` in this directory to validate package hashes, source/dependency equality, the preserved failed check, passing companion checks and the fixture-only correction.
