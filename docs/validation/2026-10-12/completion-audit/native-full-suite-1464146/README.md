# Native Playwright suite on frozen `1464146`

The original full Chromium suite **did not pass**. It discovered 363 tests, used
the configured 16 default workers, and reached the unchanged 300-second global
limit. The exact source revision was
`146414688dc2ceceb81042aeed6984ddf0687926`. The command used
`CI=1 VISUAL_GPU=1`, unique output/report paths, no worker or timeout override,
and the existing per-case timeout overrides where tests define them. The run
started `2026-10-12T09:03:54.495Z`; reporter duration was `300015.168` ms.

The raw JSON gives **226 passed, 15 failed, three timed out, 119 skipped**.
Of the skipped cases, 36 have a `skipped` result, including seven that the
terminal log identifies as actively interrupted at the global cap. The other
29 are ordinary skipped-result cases. The remaining 83 have `results: []` and
were never dispatched. The terminal also printed two errors outside a test;
they remain in the raw log and are not counted as additional test cases.

This package corrects a classification error in the earlier immutable
`native-full-suite-8ea965a/README.md`. Its **raw report** has 34 skipped-result
cases, including the seven terminal-interrupted cases, plus 85 cases with no
result. Thus the prior split is 27 other skips + seven interrupted + 85 never
dispatched, not 34 + seven + 78. Both reports and all 14 interrupted title
matches are independently checked in `current-skip-audit.json.gz`,
`prior-skip-audit.json.gz`, `skip-audit.py` and `verify.py`. The old report and
README remain unchanged.

The source changes since `8ea965a` added one Battle accessibility test, which
passed. Three formerly failing titles passed: actor body-depth order, a real
army plate body-anchor/far-LOD case, and the Ise inlet coastal layout case.
The first earned regional Ending test still failed: its one shared child Vitest
generator took 6.719 seconds under 16 workers and hit the existing 5,000 ms
case limit. The other two Ending workflows were skipped after that hook
failure, so they are not cleared. Two formerly passing cases newly failed:
`army-plate-material` and `context-panel-focus`, each reporting that the map
renderer was not mounted. `status-delta.json.gz` preserves every per-title status
change; this comparison alone does not assign causes to other failures.

The sim4 runtime began with the exact 1,632-file `ccc31e8` source inventory
except for the already pinned Ending test overlay. A scoped Git archive from
`ccc31e8` to `1464146` changed exactly
`e2e/actor-depth-layout.spec.ts` and `e2e/earned-regional-ending.spec.ts`.
All 1,632 final allowlisted blobs matched with no extras before and after the
run. Build passed. Package-lock, Playwright, Vitest and Pixi package hashes
matched before and after. No project Playwright, Vite, Vitest or preview-port
process remained in the final process inspection. The original browser output
tree remains on sim4 at
`/tmp/tenka-battle-79682cd/runs/full-native-146-original-c1/browser-results`:
27,398 files, 5,373,903,660 bytes. `artifact-inventory.json.gz` records each
relative path, byte size and SHA-256; the large files were not copied into Git.

The complete 160,280,993-byte JSON report is preserved as `report.json.gz`
(SHA-256
`4f8d326a8d4abbe8e483c47e72a226a20504bff39a83cb03608bc8360e2150a5`).
`stdout-stderr.log.gz` is the exact raw terminal log. `remote-meta.tar.gz`
contains the original command/result, build log, scoped source manifest and
archive, and the failed Ending child log. `local-captures.tar.gz` retains
setup, inventory, dependency, postprocess and analysis command/result logs.
The five archive hashes are pinned in `verify.py`; run
`python3 verify.py` from this directory to check the report, source, child
log, external inventory totals and both-run corrected skip classifications.
The verifier cannot re-read the external 5.37 GB browser output tree after it
leaves sim4.

The complete suite remains an open gate. No retry or timeout change was made
after this result.
