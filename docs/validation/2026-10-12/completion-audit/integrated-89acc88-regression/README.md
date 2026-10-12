# Integrated regression at 89acc88

The complete suite passes 6,442 tests, fails the existing no-heir case, and skips one test. The 693 files comprise 691 passing files, one failing file, and one skipped file. The run takes 118.88 seconds. It includes both the town-label budget fix and the renderer cache-key fix.

The failure remains `tests/golden/s1560.spec.ts`, at seed 15600519, day 450. Saito becomes extinct while retaining four castles and sixteen districts, violating INV-02 and INV-22. No gameplay rule or expected result was changed to hide the failure.

Type checks, data validation, asset validation, production build, and bundle checks pass. The pipeline records every exit separately and continues after the expected full-suite failure. Its first lint attempt fails on the raw Darwin error-context markdown and an existing WASM test's formatting. The original lint log is retained. The raw markdown was compressed without changing its bytes; commit `0b4b1c1` applies only Prettier formatting to the test. The subsequent full ESLint and Prettier run passes; its log and exit are preserved as `lint-final`.

The complete suite and its before/after source proof remain pinned to `89acc88`. All 1,555 inventoried files match their Git source at both checkpoints. The later formatting commit was not followed by another complete suite. `format-proof.json.gz` proves that the before/after test has the same parsed JavaScript AST after TypeScript transpilation. Emitted bytes differ because TypeScript preserves formatting and a trailing comma; the unsuccessful byte and token checks are retained. This is a syntax-preserving formatting change, not a new gameplay implementation.

Dependencies were reused from the local installation. The separate Darwin package verifies all 25 installed Pixi target hashes before and after its integrated browser run. This package does not claim a fresh local dependency install or a native FPS acceptance result.

`summary.json` lists raw-log hashes and command exits. Run `python3 verify.py` in this directory to check all archived bytes and both fixed-source inventories. The production source remains unchanged after the test-format commit; later handoff edits affect documentation only.
