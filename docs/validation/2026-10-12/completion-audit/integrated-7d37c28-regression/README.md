# Integrated regression at 7d37c28

The complete suite passes 6,445 tests, fails the existing no-heir case, and skips one test. The 694 files comprise 692 passing files, one failing file, and one skipped file. The run takes 125.15 seconds and includes the 29-target Pixi texture-cache patch.

The failure remains `tests/golden/s1560.spec.ts`, at seed 15600519, day 450. Saito becomes extinct while retaining four castles and sixteen districts, violating INV-02 and INV-22. The missing ownership rule was not replaced with an invented expected result.

Type checking, full ESLint and Prettier, data validation, asset validation, production build, and bundle checks all pass. Each command has its own raw log and exit code. The pipeline continues after the known full-suite failure.

All 1,557 inventoried source inputs match exact Git source `7d37c28` before and after the pipeline. The policy browser test is included in that source inventory, but Vitest does not execute it. Its separate 25-target and integrated 29-target native results are documented in the policy evidence packages. Dependencies were reused locally; this package does not claim a fresh local installation.

`summary.json` records each archived file's compressed and raw hash and each command's exit. Run `python3 verify.py` in this directory to check the evidence and both source inventories. These results remain scoped to `7d37c28`, including if later source fixes are committed.
