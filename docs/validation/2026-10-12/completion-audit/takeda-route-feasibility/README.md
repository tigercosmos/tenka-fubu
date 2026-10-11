# Takeda route feasibility controls

The simple Oda paid-work hypothesis does not earn a Takeda alliance in ten months. A separate ordinary Miyoshi route reaches valid alliance eligibility before the unresolved day-450 succession issue. This bundle preserves the failed native probe and the CPU controls before any new acceptance test is adopted.

## Source and required scope

Runtime source is frozen `e65fbbc8401c5fe96d0f887c78a13e4803e12f02`, the same isolated sim1 runtime used for the earned proposal test. Its complete tracked-file SHA256 list is in `../earned-proposal-native/source-e65fbbc-sha256.json.gz`.

`plan/18-roadmap.md:466` requires a manual Takeda alliance followed by a reinforcement request. It specifies neither Oda as player nor ten paid months. `plan/08-diplomacy.md:124,129` requires 60 credit for alliance and 20 credit plus a live alliance/marriage for aid. Actual aid dispatch remains an AI decision. The acceptance formula in `08:770,816` uses global power and sentiment as well as credit. Reaching 60 credit does not guarantee alliance acceptance.

## Native Oda probe remains RED

Fresh Oda seed 42 selects the naturally eligible Nobunaga and submits paid work through the actual diplomacy form. The existing court-rank ordinary RAF helper drives every day through the real Worker. Native buttons handle generated proposals and authored historical choices. Daily invariants pass for the completed prefix.

The first attempt hits the court helper's one-second `clock.pauseAt` setup race before campaign progress. Its failure and finally-captured empty-prefix record are retained. The second attempt uses a ten-second setup margin while strategy is already paused at day zero, then advances only regular RAF days. This changes test-clock setup, not the game calendar or tick contract.

The second probe times out at its unchanged 270-second bound after eight completed paid months. At day 240 it has 49.28 credit, neutral sentiment and alliance score 19.9694. All eight monthly rows record the actual 20-gold work charge. Takeda's refreshed aid score is zero in those rows. No alliance or aid is claimed.

The finally block then tries to read the already closed browser before writing its observations file. Consequently, no full native checkpoint/final-state JSON survives from that probe. The raw monthly stdout and 242,785,622-byte Playwright trace survive. The trace was copied to a separate remote path before another browser run could overwrite it; its exact checksum is in `summary.json`. It is excluded from this bounded bundle. This storage failure is not represented as complete native state evidence.

## Incremental CPU controls

Both controls use fresh full-world s1560 seed 42 through the ordinary bridge command queue and daily core driver. Commands are validated before dispatch, and dispatch is checked not to mutate core state before a tick. Each completed day checks exact calendar advancement, invariants and absence of fatal errors. Actual generated proposals are rejected through commands, and pending historical choices use the first legal authored choice. Initial and full monthly states, all emitted tick events, daily hashes and the actual command log are written incrementally.

| CPU route                                                      | Result                                                                                                                                                 |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Oda, Nobunaga work only                                        | Day 300: credit 61.6; alliance legally proposable, score 27.5602 <60. No acceptance proposal is submitted.                                             |
| Miyoshi, ordinary legal Enkokinko enactment and Nagayoshi work | Day 330: credit 85.91; alliance legally proposable, score 60.7389 ≥60. Takeda aid score remains zero. No alliance or aid is submitted in this control. |

The Miyoshi policy and mission are actual initial queued commands; they do not grant credit or edit stats/resources. The policy command deducts its ordinary costs and applies its specified effects. Miyoshi's already owned facilities and the policy explain the observed 7.81 credit per paid month; the untouched officer's effective politics is 92. See `05` facility/policy effects and `src/core/systems/diplomacy.ts:31–100` for the actual multiplier chain.

The first eight Oda CPU rows exactly match the native stdout for trust, sentiment, both powers, evaluation score, aid score, gold and active mission. `summary.json` records each compared field. This is scalar agreement, not full native-state parity. The CPU controls pass 2/2; their completion does not turn the native timeout into a pass.

## Reproduction and next boundary

The original observer source and all raw JSON/log bytes are gzip-preserved. Place `cpu-observer.spec.ts.gz` into `tests/app/earnedTakedaObserver.spec.ts` in the frozen runtime, with Node 22 and locked dependencies, then run:

```sh
npx vitest run --project app tests/app/earnedTakedaObserver.spec.ts --minWorkers=1 --maxWorkers=1
```

It writes incremental `/tmp/tenka-takeda-cpu-clan.oda.json` and `/tmp/tenka-takeda-cpu-clan.miyoshi.json` files. The native diagnostic source is a separate `e2e/earned-takeda-observer.spec.ts` copy and runs with `npx playwright test ... --workers=1`; its failed route is not installed in the accepted test suite.

The separately approved next test uses a CPU-earned Miyoshi day-300 save, public native save import, one ordinary paid native month, actual Takeda alliance, and a legal native aid request with its real refusal result. That native tail is not yet evidenced here. Existing earned Hojo tests cover the separate successful AI march path. No core, BAL, receiver policy, parent README or wip file changes accompany this diagnosis.
