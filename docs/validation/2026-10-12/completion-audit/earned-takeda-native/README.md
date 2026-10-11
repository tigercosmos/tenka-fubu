# Earned Takeda alliance and native aid request

The test passes with a CPU-earned Miyoshi day-300 checkpoint, public native save import, an ordinary paid native month, an actual Takeda alliance and a legal reinforcement request. Takeda refuses the request. This proves the interaction required by `plan/18-roadmap.md:466`; it does not prove successful military dispatch or complete M6 acceptance.

## Contract and scope

`18:466` names Takeda alliance followed by a reinforcement request. It does not require Oda as player or a ten-month deadline. `plan/08-diplomacy.md:124,129` requires 60 credit for alliance, and 20 credit plus a live alliance/marriage for a reinforcement request. Acceptance and dispatch remain AI decisions (`08:770,816`). The earlier failed Oda probe and exploratory CPU controls remain unchanged in `../takeda-route-feasibility/`.

Runtime is the isolated sim1 checkout of `e65fbbc8401c5fe96d0f887c78a13e4803e12f02`. Its complete 2,259-file source manifest is `../earned-proposal-native/source-e65fbbc-sha256.json.gz`. Test-only commits are `6430a8b` (CPU helper and acceptance) and `fa43b73` (native tail). Exact final test sources are preserved here, along with their earlier failed versions. No core or BAL changes were made for this route.

| Stage               | Preserved result                                                                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPU days 0–300      | Fresh s1560 Miyoshi seed 42; normal bridge commands and daily core; all 300 day hashes/events, ten complete monthly states and command log                        |
| Ordinary work       | Legal Enkokinko and Nagayoshi work; ten monthly 16-gold charges and 7.81 credit gains; day-300 credit 78.1                                                        |
| Actual owners       | Generated proposals rejected normally; the actual Ashikaga envoy is answered with `respondPact(false)` at state day 224; legal authored event choices are handled |
| Public import       | Native save chooser → import preview → manual slot → load; complete decoded persistent state equals the native state before any decision                          |
| Native days 301–330 | Production Worker/RAF clock, every completed daily state and schedule, invariant checks; actual month-330 fee 16 and gain 7.81, credit 85.91                      |
| Native day 331      | Enabled alliance button queues a validated command without immediate state mutation; actual alliance forms and deducts 60 credit                                  |
| Native day 332      | Enabled aid form targets Nagao; validated legal request has the actual AI refusal, unchanged credit 25.91, retained alliance and cooldown until day 422           |

Miyoshi's historical ju4ge rank and shobanshu title are existing initial data. The paid mission uses Nagayoshi's effective politics 92: `(2 + 92/25) × 1.25 × 1.1 = 7.81`. The title makes the monthly fee 16. These are policy/court effects, not a facility grant. The helper issues ordinary commands rather than assigning resources, credit, power, policies or alliances.

The CPU state has 1,024 entries in the intentionally nonpersistent `ai.intentLog`; the normal save codec omits them. The proof checks that clearing only this log produces exactly the saved state, and that this complete saved state equals the native imported state. Native command logs correctly report `incompleteReasons: ['loadedGame']`; they are not presented as a replay from day zero. The CPU and native logs together preserve the route. Native aid commands have relative log days 31 and 32.

The controlled browser clock runs ordinary RAF slices at production ×5 speed. It does not write calendar state or inject proposals. A ten-second setup margin is used while already paused at day 300. Known modal owners are handled through native buttons; unknown owners fail the test. This is functional acceptance, not real-time performance evidence. The route ends before the unresolved day-450 no-heir invariant failure.

## RED, GREEN and provenance

The original CPU test incorrectly expected the Ashikaga response at day 223. The event is generated with that timestamp, but becomes visible at state day 224; its normal command is submitted at 224. The original assertion failure, source and initial TypeScript errors are preserved. The corrected CPU acceptance passes 1/1 (20.04 seconds).

The first native attempt completes the paid month and actual alliance, then times out on the test's incorrect `getByLabel` selector. The retained accessibility context names the actual aid combobox. The final test uses that accessible role/name and passes 1/1 (the raw reporter prints 1.2 minutes). This RED is a locator defect, not a gameplay defect. Its complete stage record stops at day 331 and does not claim a request result. Both attempts preserve completed stages incrementally; the final `finally` block does not query a closed browser.

Node 22.23.3, locked/installed Playwright 1.61.1 and Chromium Headless Shell 149.0.7827.55 revision 1228 were used. Dependencies were reused from an existing locked sim1 installation; no fresh `npm ci` run is claimed for the measurement. The isolated runtime production build passed. Final typecheck, ESLint, Prettier and diff checks passed. Empty raw typecheck logs are preserved as such; they do not by themselves encode exit status.

The 77,964,529-byte failed-selector Playwright trace remains at `/tmp/tenka-miyoshi-native-selector-red-results/earned-takeda-alliance-CPU-9f908--lawful-refused-aid-request-chromium/trace.zip` on sim1, SHA256 `e102c915d5aa21050104c9756273dc91ecfa53a6e241c55d5f8c356e6744ca15`. It is excluded from this bounded bundle. Complete RED and GREEN state observations, command logs and test sources are included. Gzip files preserve the original bytes; `manifest.json` records compressed and decompressed hashes. The evidence verifier checks these hashes and the full-state/value claims without changing the game or replacing the native test.

## Reproduce

Create a separate checkout of the frozen runtime, install Node 22 and its locked dependencies, then copy the three preserved final test files into it:

```sh
git worktree add --detach /tmp/tenka-takeda-repro e65fbbc8401c5fe96d0f887c78a13e4803e12f02
# From this bundle; replace the destination if you chose another worktree.
gzip -dc earnedMiyoshiTakeda.ts.gz > /tmp/tenka-takeda-repro/tests/helpers/earnedMiyoshiTakeda.ts
gzip -dc earnedMiyoshiTakedaJourney.spec.ts.gz > /tmp/tenka-takeda-repro/tests/app/earnedMiyoshiTakedaJourney.spec.ts
gzip -dc earned-takeda-alliance.spec.ts.gz > /tmp/tenka-takeda-repro/e2e/earned-takeda-alliance.spec.ts
cd /tmp/tenka-takeda-repro
npm ci
npx playwright install chromium --only-shell
npm run build
npx vitest run --project app tests/app/earnedMiyoshiTakedaJourney.spec.ts --minWorkers=1 --maxWorkers=1
npx playwright test e2e/earned-takeda-alliance.spec.ts --workers=1
```

The native test itself creates a fresh earned CPU checkpoint through the helper. No retained `/tmp` save or archive is needed to run it. To check this evidence bundle independently, run `python3 verify-evidence.py` from this directory.
