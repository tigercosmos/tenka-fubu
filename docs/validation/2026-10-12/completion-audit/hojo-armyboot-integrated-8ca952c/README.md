# Frozen Hojo and army-plate boot validation at 8ca952c

The frozen combined source `8ca952c30a8ae007ca988fd9c3294b59d3402b14` passed TypeScript checks, full ESLint, touched-file Prettier, and unchanged production Chromium discovery: **441 tests in 106 files**. ESLint reported zero errors and two existing warnings. All 1,650 scoped Git inputs and all 29 patched Pixi targets matched before and after these checks.

This source combines the Hojo native-pointer pause change `1a6a681` and army-plate boot error discrimination `8ca952c`. Both commits change only E2E source. The additional discovery case is the army-plate one-shot error control. This package contains no core test, production build, browser run, or complete-suite rerun; those were not required for these two test-only changes. Focused browser evidence is separately pinned to `4dd1a55` plus each exact test overlay in [Hojo native pause](../hojo-native-pause-1a6a681/README.md) and [army-plate boot](../army-plate-boot-8ca952c/README.md).

The latest complete native run remains the earlier [440-case 9550 run](../fullnative-current-9550/README.md), which reached its unchanged 300-second limit. The isolated Hojo pass does not establish its loaded deadline, and the army-plate error hardening does not identify or fix the historical pending Evaluate delay. No deadline, threshold, skip, game rule, protected baseline, or milestone changed.

`manifest.json` records 38 losslessly compressed capture files, including every command/result/log, before/after proof, scoped inventory, and the validation runners. Run `python3 verify.py` in this directory to check their hashes and results. The packaging producer capture is separate at `/tmp/tenka-hojo-armyboot-integrated-pack-c2`.
