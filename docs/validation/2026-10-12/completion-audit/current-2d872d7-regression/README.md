# Current scalar and dual-WASM regression

Fixed source `2d872d74dda8f7dac4697bfdffd3a471418e4135` passes 6,441 tests and skips one. The existing national inheritance test fails at day 450. The suite covers 693 files and takes 128.49 seconds. This is a new complete run of the current scalar-default implementation and dual WASM artifacts.

The failure still reports four castles and sixteen districts owned by the extinct Saito clan, against INV-02 and INV-22. The run preserves this failure and all frozen assertions. It does not settle the missing inheritance rule or complete the project.

General and core type checks, data validation, asset validation, production build, and bundle checks pass. The first lint run fails on an untracked browser collector in the parallel art evidence package. ESLint rejects that `.mjs` file because it is outside the TypeScript project. The original lint log remains archived; any later check has a separate record.

The source inventories contain 1,555 tracked runtime, test, public, plan, tool, and root configuration files. Every SHA-256 matches the fixed Git source before the suite and after all checks. Documentation evidence directories are outside this inventory. The local installed dependencies are reused; this run is not a fresh dependency installation.

The driver runs `npm test`, then independently runs `typecheck`, `lint`, `validate:data`, `validate:assets`, `build`, and `validate:bundle`. A failed command does not suppress later checks. `status.json.gz` records each command and exit code. `summary.json` records the byte count and SHA-256 for both each gzip file and its decompressed original.
