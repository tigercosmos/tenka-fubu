# Corps tick-boundary integration at `bf6638e`

The corps tests now call the original `debug.stepDays` and wait for the exact requested day with zero pending Worker ticks before inspecting state. The existing five-second expectation limit and every original UI, treasury, dissolution and manual-pause assertion remain. The different `stepDaysAsync` API was not substituted because its blocking checks differ.

All 1,633 allowlisted inputs matched committed Git blobs and executable modes before and after the final local checks. Type checking, full ESLint, five-file Prettier and unchanged `chromium` discovery passed: 364 tests in 103 files. [Native evidence](../ai-corps-stepdays-bf6638e/README.md) separately preserves two original failures, pending-Worker observations and both exact candidate cases passing.

The first integration attempt stopped at its source precheck, before running any validation command: the coordinator had already added a handoff paragraph to `CLAUDE.md`, which is in the source inventory. The failed proof is preserved and identifies that file as the sole mismatch. The paragraph was saved, its committed text restored, and the separate `v2` run passed. The handoff edit was restored only after the successful source-after proof.

The complete 4/8-worker native diagnostics remain pinned to earlier `ecba08b`, before both readiness and corps test fixes. No full native or core result is relabeled to this commit. Dependencies and generated files are outside the local inventory.

`raw/` retains preopened logs, arguments, statuses and both source proofs. Run `python3 verify.py` to check hashes, the Git inventory, exact full-ESLint command and discovery count. The producers are retained alongside the evidence.
