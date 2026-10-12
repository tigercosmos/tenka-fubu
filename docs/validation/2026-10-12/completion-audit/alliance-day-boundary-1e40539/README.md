# Earned alliance native day boundary

The earned alliance browser case now reaches day 300 through the normal x5 speed control and completes all existing alliance, payment, report, save and reload assertions. The original case failed at day 299 on the same sim4 host. This package records one original failure, one diagnostic failure, and two passing candidate runs. It does not claim that the full native suite passes.

## Observed failure and cause

The original run used frozen `1649c6516e7cb2cbaf0f9bdf08859b510e8b922b` source. Its earned-save generator passed, but `normalDay` read day 299 after 120 ms of x5 clock time and expected day 300. The diagnostic run kept the failing assertion and recorded `pendingTicks: 0`, `completedWorkerTicks: 30`, a ready Rust-WASM Worker, and no dropped response. No 31st tick was in flight. The earlier child-generator failure hypothesis was false.

The modal queue pauses and restores speed in `src/ui/hooks/uiStore.ts:161-180,217-243,245-309`. The strategy loop clears its accumulator on paused frames in `src/app/gameLoop.ts:152-161` and dispatches a day only after enough x5 frame time in `:163-175`. `plan/03-game-loop.md:54-70` sets x5 to 120 ms per day. The existing earned Takeda case uses bounded extra native frames for the same owner boundary.

Commit `1e40539` keeps the original 32/152/120 ms slices and UI speed clicks. After each slice, the case joins a dispatched Worker day. If the day has not started, it advances at most three 16 ms frames while x5 remains selected and no dialog owns input. It stops after the first committed day. It then requires exactly one new day and zero pending ticks. No debug day step, test timeout, global deadline, balance value or protected baseline changed.

## Run identities

| Run          | Test source SHA-256 | Case                                 | Report duration | Child result                 |
| ------------ | ------------------- | ------------------------------------ | --------------: | ---------------------------- |
| `original`   | `1457bd1d…`         | 1 failed; expected 300, received 299 |        29.389 s | Earned-save generator passed |
| `diagnostic` | `36f93527…`         | 1 failed; day 299, pending 0         |        24.826 s | Earned-save generator passed |
| `candidate`  | `501a0c72…`         | 1 passed                             |        21.332 s | Earned-save generator passed |
| `final`      | `b97e4f5e…`         | 1 passed                             |        21.384 s | Earned-save generator passed |

All four runs used the existing single Chromium project, 60-second case timeout, 300-second global deadline, `CI=1`, `VISUAL_GPU=1`, and unique output and JSON report paths. The first build and original run matched all 1,633 scoped Git inputs at `1649c65`. The final native run used that source plus only the final `earned-alliance.spec.ts` overlay; its overlay manifest matched all 1,633 inputs before and after the run. Dependency hashes remained unchanged. The current local commit also contains the unrelated court test commit `a98046e`; the sim4 alliance run does not claim that combined source identity. The coordinator owns combined validation.

The four compressed JSON reports and terminal logs remain under their run directories. `sources/` retains byte-identical test source variants. The temporary diagnostic and preformat sources were reconstructed from Git and checked against their contemporaneous SHA-256 records. The final source matches commit `1e40539`.

The browser output inventories cover the original and diagnostic trace trees (83,689,786 and 83,575,146 bytes) and both passing outputs (1,428,017 bytes each). Those complete trees remain on sim4 at `/tmp/tenka-battle-79682cd/runs/alliance-{original,diagnostic,candidate}-1649-c1/browser-results` and `/tmp/tenka-battle-79682cd/runs/alliance-final-1649-c2/browser-results`. The inventory files list each path, size and SHA-256; local verification cannot prove remote retention without reading sim4 again. The earned fixture and its generation evidence are copied locally.

`host-launcher.py` is a reusable preflight for later sim4 jobs. It pins the verified Node v22.17.0 runtime and Chromium 1228 cache, then executes the requested command. The four runs above used the equivalent explicit Node path and environment shown in their captured commands; they did not use this new launcher. `host-launcher.py --check` passed under the captured remote runtime. Run it inside `tenka-validation-capture-961f0ae.py` so the complete preflight and child output enter an exclusive log.

Run `python3 verify.py` from this directory to check package hashes, source variants, four complete reports, exact failure and diagnostic values, source/dependency proofs, fixture bytes, and browser output inventories. The full native suite, strict 60 FPS gate, and other project gates remain open.
