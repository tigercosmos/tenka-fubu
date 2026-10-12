# Original full native Chromium run at `9550e397`

The complete 440-case production-preview Playwright suite reached its unchanged 300-second global limit. With the default 16 workers, 257 cases passed. The exact report partition is 11 failed assertions, three per-case timeouts, 31 other skips, five cases interrupted at the global deadline, and 133 cases never dispatched. These six categories sum to 440. The raw terminal summary (`14 failed`, `18 skipped`, `257 passed`) does not distinguish all skipped, interrupted, and undispatched records. The full report records a 300,002.108 ms duration beginning `2026-10-12T12:39:36.806Z`.

This run used the frozen `9550e397568ff448689bc5904ec0651b04bfe717` source, built production assets, and the pinned Pixi dependency. The earlier one-case census derivative was removed only after its evidence archive and hash were verified. Source checks before and after this run matched all 1,648 tracked Git blobs with no extra test source; the lockfile and all 29 pinned Pixi target hashes also matched before and after. Captured discovery found `440 tests in 106 files`. The command used `CI=1 VISUAL_GPU=1` and the original config and Chromium project; no worker count, timeout, retry, grep, visual threshold, or baseline was changed. Unique `--output` and `--reporter=line,json` settings captured the complete result. `VISUAL_PERF`, `VISUAL_HEAP`, `UPDATE_VISUAL`, and `SIMULATION_PROFILE` were asserted absent. The banner reported 16 workers. The launch flag alone is not a GPU identity proof.

The 14 unexpected results are preserved with exact file, full title, duration, status, and error in `analysis.json` and the complete `report.json.gz`:

| Group | Observed failure |
| --- | --- |
| Army orders | One case exceeded its existing 60-second case limit. |
| Army plate layout | Three cases failed the shared `boot()` poll after 5 seconds. That helper catches every `waitMapIdle()` exception, so the underlying exception is not known from these reports. The layout assertions were not reached. |
| Color vision map | Four modes failed exact restored RGBA equality, with observed pixel differences of 11, 17, 11, and 10. The existing exact-zero gate remains unchanged. |
| Earned alliance | Its child Vitest test exceeded its existing 15-second limit. |
| Earned Hojo aid | `drain()` expected the paused day to remain 30 and observed day 32. The original day invariant remains asserted. |
| Earned regional ending | The child test phase lasted 6,980 ms and exceeded its existing 5-second limit. Its retained generator log reports 13.93 seconds for the full Vitest process, including transform and collection. A jsdom canvas warning appears, but the reported test failure is the timeout. |
| Earned rice trade | One case exceeded its existing 60-second case limit. |
| Earned Takeda alliance | Its child Vitest test exceeded its existing 60-second limit. |
| Geographic label hierarchy | One case exceeded its existing 60-second case limit. |

Both AI corps cases, earned court rank, all 15 four-step wizard scales, the same-seed state comparison, and both geographic label layout cases passed. The separate geographic hierarchy case timed out. The four viewport SystemMenu cases were never dispatched. The selection-pulse gallery test is outside this ordinary Playwright discovery and is not revalidated here.

`report.json.gz` and `terminal.log.gz` are lossless captures. `analysis.json` contains every one of the 440 exact project/file/title identities, raw result statuses, durations, and title-matched interruption classification. `metadata.tar.gz` contains the pre/post source and dependency proofs, discovery, command/result/process captures, parser and inventory producers, and the regional generator log. The 25,033 browser output files (5,091,172,298 bytes) remain on sim4 at `/tmp/tenka-fullnative-9550-full-c1/browser-results`; `browser-inventory.json` records every relative path, size, and SHA-256. The local inventory cannot prove that the remote files still exist without reading sim4 again. The post-terminal process snapshot found no owned Playwright, Chromium, Vitest, or preview process; its only matching processes were the concurrent short proof captures.

Run `python3 verify.py` in this directory for the archive hashes, all 440 result identities and categories, terminal interruption matching, source/dependency checks, and inventory totals. This is one complete RED run. No failure was rerun to replace it, and no production source or acceptance rule changed.
