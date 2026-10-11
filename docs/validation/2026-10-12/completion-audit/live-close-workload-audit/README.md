# CLOSE live-workload audit

The retained Oda run cannot pass the additional 40-army live gate as executed. Its first proposal pause occurs after 3,566.6 ms, at day 150. No timing-only correction is established. This read-only audit does not prove that every possible campaign lacks a valid window, and it does not promote this additional diagnostic to a required milestone blocker.

## Two separate acceptance contracts

| Workload                     | Source contract                                                                                                                                                                | Measurement                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 20 moving armies             | `plan/18-roadmap.md:439`: 1920×1080, continuous pan/zoom for 30 seconds, ≥55 FPS; renderer remount cache and heap steady state                                                 | `e2e/visual.spec.ts:352–400`; `src/app/debug.ts:566–580` generates synthetic view entries and camera poses. Canonical strategy advancement is not required.      |
| 40 canonical marching armies | `e2e/live-national-map-perf.spec.ts:199–238`: uninterrupted ordinary ×5 strategy for 30 seconds, ≥60 average FPS, frame-time p95 ≤1000/60, and a valid mounted/marching cohort | `src/app/liveMapFrameMeasurement.ts:63–100` rejects every paused or blocked sample. Camera is set before this window, rather than continuously driven during it. |
| National renderer target     | `plan/04-map-and-movement.md:408`: 1080p, roughly 500 nodes, 120 armies and 700 edges, stable 60 FPS                                                                           | This statement does not prescribe the 40-army fixture, a 30-second ×5 campaign window, or owner-free play. Neither smaller test proves the full 120-army target. |

The 20-army result cannot establish the 40-army result or the national target. The failed live window cannot establish failure of the required 20-army renderer contract. Its descriptive 56.40 average FPS and 19.80 ms p95 include paused modal rendering and remain invalid for the live test.

## Exact day-150 proposals

The retained run starts measurement at day 121 and stops advancing at day 150. Forty canonical armies remain marching. The three newly generated proposals are:

| Proposal      | Officer           | Ordinary saved command                       |
| ------------- | ----------------- | -------------------------------------------- |
| `prop.000033` | Shibata Katsuie   | Kiyosu → Nagashima; 1,670 troops, 2,004 food |
| `prop.000034` | Takigawa Kazumasu | Kiyosu → Nagashima; 1,670 troops, 2,004 food |
| `prop.000035` | Mori Yoshinari    | Inuyama → Nagashima; 560 troops, 672 food    |

All three are serving, sufficiently ranked, and not in an army. Their dominant leadership/valor stats qualify. Their officer cooldowns are exactly day 150; `proposalGen.ts:35–54` excludes only cooldowns greater than the current day. Warmup ordinary rejection commands recorded under day 91 explain these cooldowns: command settlement occurs before the time increment, so the 60-day cooldown begins at state day 90 (`proposalCommands.ts:58–61`; `plan/00-foundations.md:188–189`). They become eligible again at day 150.

The before snapshot also contains three day-120 pending proposals. Warmup queues rejection, but the test pauses before the next normal tick applies it. After that tick their cooldowns are 181. This is not a synthetic proposal injection. Atomic confirmation that warmup decisions have settled would make the pre-measurement record clearer, but would not prevent the newly eligible day-150 batch.

`audit.json` retains the exact proposal objects, officer stats, cooldowns, prior rejection commands, interruption timing, and source hashes. The six relevant test, router, generator, settlement, measurement and workload files are byte-identical between frozen `505d96a` and inspected `ef2f5c1`.

## Why timing alone does not repair this run

`plan/00-foundations.md:175` defines ×5 as 120 ms per day. At nominal cadence, 30 seconds spans 250 game days; a month spans 3.6 seconds and the 60-day officer cooldown spans 7.2 seconds. Starting immediately after one monthly council cannot establish a 250-day window without future arrivals. This arithmetic describes nominal cadence, not a measured lower bound on actual advancement.

The fixture disables only the monthly summary pause (`live-national-map-perf.spec.ts:110–113`). `plan/11-ui-screens.md:593` prescribes the paused proposal inbox; D37 at line 1489 retains proposal interactions when the monthly summary is disabled. `src/ui/hooks/useM6Dialogs.ts:57–65` independently opens fresh proposals with `pausesTime: true`. The proposal preference in `src/app/autoPause.ts:26–40` filters the arrival pause, not this independently queued inbox. Thus disabling that preference alone does not prove an owner-free window in current code. The higher-level configurable-arrival rule in `plan/00-foundations.md:177` does not explicitly settle the separate decision-modal policy.

Keep the original live result invalid. Shortening the window, joining separated valid segments, changing ×5, admitting paused frames, freezing the calendar, deleting proposals or automatically dismissing owners during measurement would change its acceptance contract. A different ordinary-play fixture would first need to prove that candidate predicates remain absent throughout the window while retaining the real marching cohort and all monthly systems. No such campaign preparation was executed here. Run and report the required 20-army renderer gate independently.

## Evidence boundaries

The complete native artifact remains in the sibling `native-gates-sim2-505d96a/live-national-close.json.gz`. This bundle references it and records its uncompressed SHA256; it does not duplicate the capture. `audit.raw.json.gz` preserves the exact original diagnostic bytes before formatting. No new GPU measurement, full future trajectory, source patch, setting-policy change or test change accompanies this audit.
