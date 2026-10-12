# Earned Ending fixture validation

Source commit `5500bc0945586376ca6e85145476c996b97d40af` changes only
`e2e/earned-regional-ending.spec.ts`. The file's SHA-256 is
`c2e67596486b4a6af58433c4a7736e1cd18f9e707c078c7595fae49d6a98c160`.
The three Ending browser workflows now generate one genuinely earned save in a
file-local `beforeAll`. `mode: 'default'` keeps that file in one worker despite
the global `fullyParallel` setting. The save and generation log have an exclusive
worker-specific directory. The provenance record contains the generator command,
generator source hash, worker index, duration, save byte count and save hash.
Each test verifies the hash and earned-route facts before its independent
browser context imports the save. The native import performs the production
save validation. The browser assertions and 60-second case, 300-second global,
and 5-second Vitest generator limits are unchanged.

**Scope:** one fresh save per worker lifecycle. A worker restart deliberately
generates a new save. This is a narrower optimization than the earlier proposed
once-per-Playwright-invocation setup. It keeps the single `chromium` project and
explicit `--project=chromium` behavior. Unrelated subsets do not run the hook.
The child and descendants share an owned POSIX process group; a cleanup timer
is derived from the existing hook deadline (TERM one second before, KILL at the
deadline). The exact first TERM delivery time was not measured. The controlled
hang terminated in 59.83 seconds of Playwright report duration, and a post-run
process check found neither observed PID alive.

The isolated sim4 runtime was verified against all 1,632 allowlisted files of
base `8ea965a`, then updated by a 12-file scoped `8ea965a` → `ccc31e8` Git
archive. The complete `ccc31e8` inventory passed before the candidate overlay.
After tests and removal of diagnostic test copies, the inventory had precisely
one expected mismatch, the committed Ending test, with zero extra source files.
The remote/local candidate, `package-lock.json`, Playwright, Vitest and Pixi
package SHA-256 values matched. Build, typecheck, scoped ESLint, Prettier and
Playwright discovery passed. The first typecheck setup attempted `npm` without
remote Node on `PATH` and exited 127; the correctly pinned rerun passed.

Native controls retain their complete JSON reports, stdout/stderr, screenshots,
traces where produced, generation logs, save bytes and provenance:

| Control                                          | Observed result                                                                                             |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Positive Ending, explicit Chromium project       | Three tests passed in 14.2 s; one worker and one earned save.                                               |
| Generator entry missing                          | First `beforeAll` failed; the other two tests did not run; no save existed.                                 |
| Intentional first-test failure after native load | First test failed; two later workflows passed after restart with distinct worker-0 and worker-1 saves/logs. |
| Unrelated accessibility subset                   | One test passed in 3.6 s; no earned fixture directory.                                                      |
| Save corruption before native import             | Explicit hash-change failure before `page.goto`; no fallback.                                               |
| Hung generator and `sleep 120` descendant        | Existing deadline ended the test; leader PID 3486938 and descendant PID 3486945 were both absent afterward. |

Two setup mistakes are also retained. The first positive attempt failed
Playwright discovery because the hook's first parameter was not destructured;
the source was corrected to the required empty object pattern with a targeted
ESLint suppression. The first hang derivative contained a malformed JavaScript
escape and exited immediately; the corrected derivative produced the real
hang/cleanup observation. These are diagnostic failures, not passing runs.

`native-raw.tar.gz` (SHA-256
`9b78c47624ab242c1434d6fe76f0ee2b33f8ffb3a06501537345907beb413358`)
holds the eight uniquely named sim4 Playwright runs. `local-raw.tar.gz`
(SHA-256
`702b65a397bb0092ec5e305cc44046d8cb9f87b955aa974dcd6295bf9e02169b`)
holds capture commands/results, source inventories, the scoped delta manifest
and archive, controlled diagnostic source copies, format/type/build output,
and live/post-run process observations. The archive's source delta SHA-256 is
`e908b99bb04ba3cb7aa907089f72df2cd4fd419e5fb40d53d1979e1e704e4b9e`.
Run `python3 verify.py` here to verify archive hashes, source identity,
provenance hashes, outcomes, inventory scope and process observations.

These focused controls do not establish that the full parallel suite or its
unchanged five-minute gate passes. The previous full-suite failure remains in
`native-full-suite-8ea965a/`; a separate full run on a combined frozen source
is required.
