# Full native concurrency diagnostics at `ecba08b`

Both complete runs reached the original 300-second deadline and failed the suite gate. Eight workers completed more cases in this observation, but 110 cases were never dispatched and one case that passed with four workers timed out with eight. No worker cap was adopted.

The two serial, headless sim4 runs used the same frozen `ecba08b76b772a598a6e6ceb61615b648c765170` source, build and dependencies. Each selected all 364 cases in the existing `chromium` project. The only scheduling change was an explicit CLI `--workers=4` or `--workers=8`; existing assertion, case and global timeouts, skip conditions, thresholds and protected baselines remained unchanged. Source checks covered 1,632 scoped Git inputs with no extras. Source and dependency checks bracket the runs, with process/port observations between runs. The build finished before Playwright started, as in the existing procedure; the Ending fixture generation stayed inside Playwright's global deadline.

## Complete outcomes

| Outcome                        |  4 workers |  8 workers |
| ------------------------------ | ---------: | ---------: |
| Passed                         |        162 |        218 |
| Failed                         |          9 |          9 |
| Case timed out                 |          0 |          1 |
| Other skipped                  |         20 |         23 |
| Interrupted at global deadline |          2 |          3 |
| Never dispatched               |        171 |        110 |
| Total                          |        364 |        364 |
| Report duration, ms            | 300000.645 | 300000.846 |

The report start times are `09:20:55.552Z` and `09:26:31.159Z` on 2026-10-12. Both processes exited 1. `w4-analysis.json` and `w8-analysis.json` retain every project, file, full title path, raw result status and derived category. Interrupted cases are matched by exact terminal title to report results; empty result arrays identify cases never dispatched. The terminal reporter's abbreviated skipped summary is not the complete JSON partition above.

The first parser attempt failed because report test records lacked the assumed `id` field; the second failed on terminal title decoration. Both failures remain in the captured evidence. The corrected parser removes only the recognized decoration, requires a unique title match and reconciles every case. Original reports and terminal logs were not edited.

## Same-case comparison

`transition-map.json` compares the same 364 project/file/title identities:

| 4-worker → 8-worker outcome         | Cases |
| ----------------------------------- | ----: |
| Passed → passed                     |   161 |
| Passed → timed out                  |     1 |
| Failed → failed                     |     9 |
| Never dispatched → passed           |    53 |
| Never dispatched → other skipped    |     5 |
| Never dispatched → interrupted      |     3 |
| Never dispatched → never dispatched |   110 |
| Other skipped → passed              |     2 |
| Other skipped → other skipped       |    18 |
| Interrupted → passed                |     2 |

The nine shared failures are two `ai-corps`, four `color-vision-map`, `court-work`, `earned-alliance` and `earned-hojo-aid` cases. `earned-rice-trade` passed with four workers and timed out with eight. This is one observation per configuration, not a repeated reliability study or proof that all failures arise from concurrency. The [later corps fix](../ai-corps-stepdays-bf6638e/README.md) and [map readiness fix](../mapboot-readiness-c74a46c/README.md) have focused validation; neither is included in these frozen full runs.

## Ending fixture and browser workflows

All three earned Ending browser cases passed in both runs. Each run produced one fresh earned save, in worker 7 and worker 14 respectively. The saved bytes were identical (155,056 bytes); retained provenance and hashes identify them. There was no cross-run fixture reuse.

| Measurement                                | 4 workers | 8 workers |
| ------------------------------------------ | --------: | --------: |
| Generator Vitest test phase                |    2.09 s |    3.64 s |
| Generator total Vitest duration            |    4.04 s |    6.69 s |
| Parent-observed generator process duration |   4.281 s |   7.068 s |
| Ending browser case 1                      |   1576 ms |   2820 ms |
| Ending browser case 2                      |   4950 ms |   7402 ms |
| Ending browser case 3                      |   1708 ms |   2029 ms |

Each generator log reports one passed and one skipped test. Both test phases stayed below the unchanged five-second test limit. The longer total process duration includes other work and is not the test's timeout measurement. These successful fixture observations do not close the full-suite gate. The earlier 16-worker run at `1464146` had different source and 363 cases, so it is historical context rather than a third identical-source comparison.

## Retained evidence and limits

The complete JSON reports are locally gzip-compressed without filtering, alongside terminal logs, source/dependency/process captures, generator artifacts, analysis producers and per-file output inventories. The unique browser output trees remain on sim4:

- `/tmp/tenka-battle-79682cd/runs/concurrency-ecba-w4-c1/browser-results`: 10,021 files, 3,023,689,751 bytes.
- `/tmp/tenka-battle-79682cd/runs/concurrency-ecba-w8-c1/browser-results`: 25,733 files, 5,159,178,578 bytes.

Their inventories record each file's size and SHA-256. Local verification can check the retained inventory and report bytes; it cannot prove the remote browser files still exist without reading that host again. No same-page GPU or rendering-performance conclusion is inferred from the launch flags. Setup, validation and transfer commands have unique preopened logs; no full-suite retry replaced either result.

Run `python3 verify.py` to check package hashes, original report classification, exact title transitions and retained source/fixture evidence. Full native acceptance, strict60, whole-heap, long-run and the remaining M6–M9 gates remain open. Gameplay decisions and protected visual baselines were unchanged.
