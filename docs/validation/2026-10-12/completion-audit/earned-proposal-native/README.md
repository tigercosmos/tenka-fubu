# Earned native proposal and monthly queue acceptance

Commit `ccdc409` adds `e2e/earned-proposal.spec.ts`. A fresh full-world s1560 Oda campaign, seed 42, reaches its first monthly inbox through ordinary ×1 play. No proposal, officer, resource or calendar state is injected. No debug step or jump drives the campaign.

This closes the previously unproved earned native proposal path in the 9dad6a6 M6 matrix. It exercises M6-13 and M6-16 (`plan/18-roadmap.md:456,459`) and the one-proposal adoption part of M6 DoD3 (`18:466`). It does not prove the separate Takeda alliance/aid or Imagawa poach journeys, all M6 gates, or project completion.

## Exact observed journey

On day 30, the game generates three legal march proposals. The first is Shibata Katsuie's Kiyosu → Okazaki command with 1,658 troops and 1,989 food. The native card shows those actual locations and its author. The test validates the saved command and the naturally generated submission report.

Native Adopt advances the card to Takigawa. All three proposals and the entire core state still equal the generated snapshot: decisions are queued, not executed. Native bulk rejection handles the other two cards and exposes the real monthly summary. It remains the only dialog; day 30 and the whole core state remain unchanged.

Before Continue, a read-only requestAnimationFrame observer is installed. It records the first ordinary resumed tick without driving or pausing the simulation. On day 31, the command log has exactly three decisions: one acceptance and two rejections. Shibata's one real army matches the saved origin, target and troop count. His merit rises 0→30, leadership experience 0→30 and loyalty 60→62. The army departure appears once. State invariants pass and RNG equals the generated snapshot. Later native pause occurs at day 33; it is not substituted for the first-tick proof.

These assertions follow `plan/00-foundations.md:176,188–189` (next-tick settlement before date increment), `plan/06-officers.md:998–999` (nested payload and rewards), `plan/09-ai.md:317–335` (eligible monthly legal Top-K generation) and `plan/11-ui-screens.md:1484–1489` (queued decisions and monthly pause ownership).

## Validation and controls

| Check                              | Result                                                                |
| ---------------------------------- | --------------------------------------------------------------------- |
| Original untouched native observer | 1 passed; test 34.4 seconds                                           |
| Accepted exact-day-31 test         | 1 passed; test 40.9 seconds                                           |
| Native rejection negative control  | Fails at expected `accepted`, received `rejected`, on captured day 31 |
| TypeScript                         | `npx tsc --noEmit` passes                                             |
| Test ESLint and Prettier           | Pass                                                                  |

The negative control changes only the UI choice from Adopt to Reject in a separate test copy. It uses the same naturally generated state and normal monthly handoff. Its expected failure shows the accepted test distinguishes adoption from merely draining the inbox. This is a test control, not a preexisting production defect. The accepted test has no control flag, skip, expected failure or weaker assertion.

Sim1 initially lacked the matching Playwright headless executable. That launch failure and the browser installation log are preserved separately. The second launch performs the real campaign and passes. The installed and locked Playwright versions are both 1.61.1; Node is 22.23.3. The browser is Chromium headless shell 149.0.7827.55, revision 1228. This is native functional UI evidence, not a hardware FPS measurement.

## Reproduction and scope

The runtime source is exact `e65fbbc8401c5fe96d0f887c78a13e4803e12f02`. The archive's 2,259 tracked files have individual SHA256 records in `source-e65fbbc-sha256.json.gz`. The accepted test is preserved separately. The tested runtime predates subsequent renderer lifecycle changes; no claim is made that those later patches were exercised here.

Use Node 22 in a clean checkout of that commit, or a detached worktree, and copy the accepted test into it:

```sh
gzip -dc /path/to/earned-proposal-native/accepted-test.spec.ts.gz > e2e/earned-proposal.spec.ts
npm ci
npx playwright install chromium --only-shell
npm run build
npx playwright test e2e/earned-proposal.spec.ts --workers=1
```

The recorded run reused an already installed locked dependency directory; it did not run fresh `npm ci`. The reproduction command supplies the clean-checkout prerequisite. To reproduce the negative control, use the preserved separate test copy:

```sh
gzip -dc /path/to/earned-proposal-native/reject-control.spec.ts.gz > e2e/earned-proposal-reject-control.spec.ts
npx playwright test e2e/earned-proposal-reject-control.spec.ts --workers=1
```

The exact original observer and five-stage observations, accepted six-stage observations, rejected control observations and all command logs are gzip-preserved before formatting. These snapshots include retained reports; they are not an independent capture of every emitted GameEvent. The 71 MB negative-control renderer/network trace stays at the remote path in `summary.json`; its checksum is recorded, and it is not required to reproduce or inspect the full state/command proof. Parent README and wip documents are unchanged.
