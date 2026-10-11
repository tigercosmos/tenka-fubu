# Naturally earned Imagawa poach

Fresh full-world s1560 Miyoshi seed 42 earns the prerequisites through ordinary rumors and completes an actual Imagawa poach. A CPU prefix ends at day 240; public native save import, the actual plot form and 60 normal native days finish the route. Miura Masatoshi joins Miyoshi on day 300 and appears in the native retainer list and detail panel. No core, BAL, resource, loyalty, calendar, proposal or RNG changes were made for this acceptance.

## Required behavior and natural prerequisites

`plan/18-roadmap.md:466` requires one successful poach of an Imagawa officer. It specifies neither Oda as player nor a preliminary rumor. `plan/08-diplomacy.md:267–274` permits poach at loyalty below 75, with the ordinary investment choices and monthly costs. The receiving rule in `plan/06-officers.md:291–308` multiplies that base probability by `clamp((40 − loyalty)/40, 0, 1)`. A legal initial poach of Miura at loyalty 61 therefore has zero probability. This test proves earned prerequisites instead of installing the previous debug fixture's low loyalty.

Miyoshi naturally starts with 8,900 gold and available Matsunaga Hisahide (intelligence 100, Chiebukuro), Miyoshi Nagayoshi (88) and Shinohara Nagafusa (82). The three ordinary missions target distinct eligible Imagawa retainers: Miura Masatoshi, Ichinomiya Muneyoshi and Yui Masanobu. All start at loyalty 61, are adult serving officers, and have neither kin nor Chushin protection. Only validated `startPlot`, `resolveProposal`, `respondPact` and authored event-choice commands are submitted; dispatch is checked not to mutate core state before a daily tick.

| Stage                | Actual observations                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU days 0–240       | Three distinct rumor missions, normal monthly costs and ordinary handling of actual proposals/envoy owners; every daily invariant, event and state hash retained                                                                      |
| Day 120              | The authored Okehazama outcome kills Yoshimoto; actual succession chooses the eligible kin Sekiguchi Chikanaga. Ordinary tozama succession shock is −10 (`06:277,438`), not a newly invented inheritance rule                         |
| Earned target        | Miura rumors succeed on days 120, 180 and 240. Full monthly loyalty sequence through day 240 is 61, 61, 61, 41, 43, 33, 35, 25; this includes succession and normal monthly drift, not rumors alone                                   |
| CPU checkpoint       | Day 240 Miura remains serving Imagawa at loyalty 25. No Miura poach is yet queued. Yui's earlier ordinary poach is still active                                                                                                       |
| Public native import | Title save list → file chooser → import preview → manual slot → load. Every persistent field equals the normal decoded CPU save before any decision                                                                                   |
| Native plot form     | At day 240 Hisahide starts Miura poach with the ordinary 1,000-gold investment; Nagayoshi starts the next Ichinomiya rumor. Start probability is 0.31875, not a promise of success                                                    |
| Native day 270       | Yui's existing poach genuinely fails and is exposed. The actual +10 warning effect remains; the normal Shinohara rumor restarts through the native form                                                                               |
| Native day 300       | Miura actually emits `officer.recruited(source='poach')` and `plot.succeeded`, transfers to Miyoshi's Akutagawa castle, and appears in the retainer UI. Initial poach loyalty 45 becomes 47 in the same tick's ordinary officer drift |

The initial exploratory CPU route succeeds on the first tested seed, 42; no seed search was performed. Its complete original events, RNG checkpoints, monthly states and command log remain unchanged. The final helper saves at day 240 and continues its CPU control from the decoded save. Original and control states match exactly at day 240 and day 300 after clearing only the intentionally nonpersistent `ai.intentLog`.

The native test compares every complete persistent state on days 241–300 with this independent CPU control. All 60 comparisons pass, including the full RNG state, armies, AI data, events, resources and counters. Only `ai.intentLog` is cleared, as the normal save codec does; no other field is normalized. Actual native plot commands are logged at relative days 1, 1 and 31. Native logs correctly declare `incompleteReasons: ['loadedGame']`; the original CPU log and explicit validated submitted-command history preserve the earlier route rather than claiming a native replay from day zero.

## Clock, source and validation boundaries

The native tail uses the existing court-rank/Takeda acceptance's controlled ordinary RAF clock at production ×5 speed. The ten-second setup margin occurs while already paused at day 240. Each schedule must advance exactly one day. Month summaries and actual proposal owners pause the game normally; native buttons dismiss summaries and reject the three generated proposal batches. Unknown owners fail the test. No debug calendar jump or runtime state injection is used. This proves functional behavior, not frame rate or real-time performance.

Runtime source is `f1082f503394a581532fc0ce02046e343b26b511`, before the subsequent geographic experiments. The sim1 isolated copy is `/tmp/tenka-imagawa-f1082f5-sim1`. The recorded manifest covers every tracked `src`, `public` and `rust` file plus execution configuration: all 725 hashes match the actual remote files with zero mismatches. Node 22.23.3, installed/locked Playwright 1.61.1 and Chromium Headless Shell 149.0.7827.55 revision 1228 were used. An existing locked dependency installation was reused; no fresh installation timing is claimed.

| Validation                                                     | Result                               |
| -------------------------------------------------------------- | ------------------------------------ |
| Initial eligibility observation                                | 1/1, unchanged natural data          |
| Original full CPU diagnostic                                   | 1/1, 21.99 seconds                   |
| Final CPU helper/acceptance (`043b561`)                        | 1/1, 21.47 seconds                   |
| Native form and 60-day tail (`e207b4d`)                        | 1/1, raw reporter prints 1.9 minutes |
| Production build                                               | Passed, 4.70 seconds                 |
| Final local typecheck / scoped ESLint / Prettier / diff checks | Passed                               |

The initial helper/spec used incorrect branded ID casts and failed TypeScript checks. Their exact sources and original RED log are preserved. The first native run passes; its scoped ESLint check then identifies one redundant non-null TypeScript assertion. The final source removes that assertion and applies repository formatting. esbuild 0.28.1 produces byte-identical executable JavaScript from the actual GREEN run source and final committed source; both sources, the complete transformed bytes and the equivalence record are retained. No failed native route is fabricated. Yui's actual gameplay failure remains visible in the successful journey.

Raw JSON and logs are gzip-preserved before any formatting. `manifest.json` records both stored and decompressed hashes; the evidence verifier checks the original/control agreement, complete public import parity, all 60 native full states, the actual failure and actual recruitment. Empty typecheck logs are preserved as empty; their text alone does not encode exit status. The native trace is not needed for these full-state claims and is excluded from this bounded bundle. This closes the specified Imagawa interaction only; it does not certify the entire milestone or resolve the known no-heir policy gap.

## Reproduce

From this bundle, create the frozen runtime checkout and copy the three final source files:

```sh
git worktree add --detach /tmp/tenka-imagawa-repro f1082f503394a581532fc0ce02046e343b26b511
gzip -dc earnedImagawa.ts.gz > /tmp/tenka-imagawa-repro/tests/helpers/earnedImagawa.ts
gzip -dc earnedImagawaJourney.spec.ts.gz > /tmp/tenka-imagawa-repro/tests/app/earnedImagawaJourney.spec.ts
gzip -dc earned-imagawa-poach.spec.ts.gz > /tmp/tenka-imagawa-repro/e2e/earned-imagawa-poach.spec.ts
cd /tmp/tenka-imagawa-repro
npm ci
npx playwright install chromium --only-shell
npm run build
npx vitest run --project app tests/app/earnedImagawaJourney.spec.ts --minWorkers=1 --maxWorkers=1
npx playwright test e2e/earned-imagawa-poach.spec.ts --workers=1
```

Use Node 22. The native test creates its own fresh earned checkpoint through the helper; retained `/tmp` saves are not prerequisites. To verify the preserved bundle independently, run `python3 verify-evidence.py` from this directory.
