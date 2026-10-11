# M6 diplomatic acceptance evidence

Commit `ffcf964` adds seven acceptance tests for M6-3 and M6-8. Production code and BAL remain unchanged. The tests pass on the existing implementation; this is missing acceptance coverage, not a reproduced production defect.

The twelve-month oracle uses literal hand-derived values from 08 §3.3 and current BAL: six months of continuing war, then six months of peaceful border tension. It verifies asymmetric initial feelings, war priority over border tension, fractional drift, and crossings through zero. A separate common-enemy case checks that its positive factor adds before drift.

The large-awe cases use a valid third-clan fixture. They assert loser-to-winner −25, unprotected adjacent neighbor-to-winner −8, unchanged reverse feelings, and exclusions for an active alliance or absent adjacency. All fixtures and resulting states satisfy invariants. Awe does not consume RNG.

The threshold fixtures equalize clan power and hold trust at 60. Target sentiment 29.875 gives evaluation score 59.9; sentiment 30 gives exactly 60. Each repeats pure evaluation ten times, checks full-state identity, then executes ordinary proposal settlement. Score 59.9 is refused without credit spending; score 60 is accepted and spends 60. Neither path consumes RNG. IEEE representation of 59.9 is checked to 12 decimal places; exact 60 uses strict equality.

The related five-file suite passes 33 tests. Focused source/test typecheck, ESLint and formatting pass. Core source hashes for diplomacy and awe match the restored remote implementation.

Four isolated fault controls fail the new assertions: drift away from zero, `>60` instead of `>=60`, the small loser-awe delta instead of the large delta, and the loser delta instead of the neighbor delta. Their RED logs are intentional mutations, not evidence of a preexisting bug. The restored baseline and final related suite are GREEN.

Initial fixture mistakes are retained: an invalid district prefix and missing local graph road, followed by an unlimited alliance end date. The first mutation run still contained that invalid alliance and is archived under `rejected-invalid-fixture-controls`; it does not count as valid fault evidence. The corrected valid baseline passed before the four accepted fault controls ran.

## Reproduction

Use Node 22 and a fresh isolated directory. Extract the existing bounded `../m6-lifecycle-acceptance/source-9dad6a6.tar.gz` archive and run `npm ci`. Its SHA256 appears in `provenance.json`; its 238 source files have verified Git blobs in the sibling evidence.

Decompress `accepted-test.spec.ts.gz` into `tests/core/m6DiplomacyAcceptance.spec.ts`, then run:

```sh
npx vitest run tests/core/m6DiplomacyAcceptance.spec.ts --project core --minWorkers=1 --maxWorkers=1
```

Run `python3 fault-controls.py /absolute/path/to/isolated/source` to repeat the four rejected behavior controls. The script mutates only that isolated source and restores each file in `finally`. Node 22 must already be on PATH. The original remote script is preserved separately as gzip; the runnable copy only accepts the source path as an argument and uses the caller's PATH.

The source archive supplies the new test's dependencies. For the five-file related suite, decompress the four `related-tests/*.spec.ts.gz` files into `tests/core/` and include their paths in the Vitest command. These are exact base-source test files. No unavailable `/tmp` artifact is required for the seven new tests.

The runnable control script was also repeated on a second extraction of the bounded archive. All four fault cases were RED and the restored seven-test suite was GREEN; its raw reproduction log is retained. Installed locked dependencies were reused, so this does not claim a fresh dependency installation.

All raw logs and the original control rows are preserved as gzip. `manifest.json` records evidence SHA256. This evidence does not discharge native M6 flows, heap stability, no-heir territory, tactical cancellation, or the complete milestone gates. Parent completion documents remain unchanged.
