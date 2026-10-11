# M6 lifecycle acceptance evidence

Commit `38d22b0` strengthens the existing 24-month officers integration test. It proves actual unpaid salary and one complete naturally generated proposal lifecycle. Core code, BAL, and the original fixture initialization remain unchanged.

The base source is `9dad6a6`. The fixture keeps seed 42, Oda, the original regional filter, 90 days of salary stress, scheduled death, inserted debut, and 720 daily invariant checks.

The unchanged original fixture produces 72 proposals, 66 expirations, and 40 unpaid-upkeep events. It produces no accepted proposal. Adding the required accepted-event assertion fails; `missing-acceptance-red.log.gz` preserves that failure.

The repaired test adopts the first legal natural march through `CommandQueue` and `advanceDay`. Step 10 submits `prop.000001` on day 30. Normal dispatch accepts it on day 31. Takigawa departs Kiyosu toward Okazaki with 1,658 soldiers and 1,989 food. Merit rises 0→30, leadership experience 0→30, and loyalty 52→54. The accepted proposal disappears at the next monthly cleanup on day 60. All 720 daily invariant checks, death and debut assertions pass.

The adopted trajectory produces 72 submissions, 65 expirations, one acceptance, and 39 unpaid-upkeep events. These counts differ because executing the real proposal changes the campaign. The observations do not claim trajectory equivalence.

The final complete file passes all 20 tests. Focused source/test typecheck and ESLint pass. Filtered observation runs execute one integration test and exclude 19 unrelated unit tests; those exclusions are not accepted failure skips. Logs preserve both kinds of run.

`original-observations.json.gz` preserves the unchanged run's complete events and relevant proposal snapshots. `adopted-lifecycle-observations.json.gz` preserves all events and five full states: initial, before adoption, after adoption, monthly cleanup, and final. The observer version predates the final stronger exact merit/experience assertions; its campaign commands remain identical. The final accepted test contains those stronger assertions.

`matrix-9dad6a6.md` is the preceding read-only audit. Its M6-18 acceptance gap is now repaired by this test commit. Other matrix gaps and pending design choices remain open. This evidence does not complete M6 or resolve no-heir territory, tactical cancellation, native campaign flows, or total heap stability.

## Reproduction

Use Node 22. Create a fresh directory, extract `source-9dad6a6.tar.gz`, and run `npm ci`. The bounded archive contains current core/data, the original lifecycle fixture, lockfile, test configuration, and required tools. It omits unrelated art sources and golden evidence. `source-git-blobs.txt` records every archived source file's original Git blob.

Replace `tests/core/officerLifecycle.spec.ts` with decompressed `accepted-test.spec.ts.gz`, then run:

```sh
npx vitest run tests/core/officerLifecycle.spec.ts --project core --minWorkers=1 --maxWorkers=1
```

For original observations, the missing-acceptance RED assertion, or adopted observations, use the corresponding archived `.spec.ts.gz` instead. These observers write JSON under `/tmp/tenka-9dad6a6-m6-lifecycle-sim1`. Create that output directory first, or replace only the output path in the decompressed observer with a fresh directory. Do not alter its fixture or command logic.

The original and RED observers include raw observation instrumentation. The RED run intentionally fails the missing accepted-proposal assertion. The adopted observer instruments the normal-command test without synthesizing a proposal or changing RNG. The final accepted test has no file-writing instrumentation.

The bounded archive was extracted into a second isolated sim1 directory and the accepted test rerun. `bounded-archive-reproduction.log.gz` records all 20 passing tests. That run reused installed locked dependencies; it does not claim a fresh `npm ci` run.

`manifest.json` supplies SHA256 for every evidence file. JSON gzip and log gzip preserve original unformatted bytes. `summary.json` is a readable copy of the archived summary. Parent completion documents are unchanged.
