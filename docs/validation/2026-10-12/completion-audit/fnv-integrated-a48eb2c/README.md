# Frozen FNV arithmetic integration — a48eb2c

The adopted commit is `a48eb2c2a139108f3ff9fcc4e2c3e11a0bf6a875`. It changes only the FNV64 multiplication, adds an independent exact legacy BigInt fixture and differential regression, and records the arithmetic equivalence in plan17. The UTF-8 encoder, canonical serializer, simulation rules, and golden snapshots are unchanged.

The frozen local run passed all 135 tests in 13 files: core serialization and limb compatibility; helper hash vectors; determinism; mini, AI, and diplomacy golden trajectories; replay and event replay; save, save metadata, fixture compatibility, and commands. Vitest reported 2.00 seconds. Type checking, full ESLint (zero errors, two existing warnings), production build, bundle budget, and touched formatting also passed. The runner continues separate checks after a failure rather than hiding later results; this run had none.

The 1,652 tracked scoped Git inputs (including the two new test files) and 29 patched Pixi targets matched before and after. Every subprocess has an exclusive preopened merged log and command/result records. This package contains those completed captures and their producers; no browser or full-core run is claimed.

The separate measured route remains labeled b1a8fc8 plus exact candidate overlays, not a later full-commit native run. Its byte parity and timing evidence belong to that package. Existing long no-heir failure, full native 300-second gate, strict60, whole-heap, long-run, and pending rule/art decisions remain open. No snapshot, timeout, or baseline was changed.

Run `python3 docs/validation/2026-10-12/completion-audit/fnv-integrated-a48eb2c/verify.py` to check archived bytes, source/dependency proof, and all scoped results.
