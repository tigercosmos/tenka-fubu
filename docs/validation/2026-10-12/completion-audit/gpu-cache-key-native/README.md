# Native evidence for renderer cache keys

The renderer cache key fix passes the original resource-lifecycle test and a separate 240-remount diagnostic. The measured heap still grows. These results support the targeted cache fix, not whole-heap acceptance.

The isolated source uses `2d872d7` plus the three exact overlays in `source-origin.json.gz`. Those files are the patch manifest and two Pixi test files adopted in `89acc88`. The independent town-label fix is excluded from this campaign. Three checkpoints verify all 1,555 inventoried inputs before testing, after the original test, and after the diagnostic.

The sim4 run uses a fresh `npm ci` with 25 pinned Pixi patches, then a production build. Both complete successfully. Node is 22.17.0 and Chromium is 149.0.7827.55. The diagnostic captures the page's NVIDIA RTX 5070 Ti Vulkan renderer. The original page has no GPU identity capture; matching launch flags do not prove its renderer identity. Executable hashes and the 14,765-file dependency inventory were collected after testing.

The original unchanged test uses ten warmups and twenty measured remounts. It passes in 34.4 seconds. Its 21 post-GC samples rise from 20,531,856 to 21,937,804 bytes: a gain of 1,405,948 bytes. The test asserts resource counts and context-loss behavior, but has no numeric heap assertion.

The separate diagnostic preserves the original test and production source. It uses ten warmups and 240 measured remounts, with an additional snapshot at remount 120. Its 600-second case timeout and 660-second global timeout do not replace the original acceptance limits. It passes in 4.3 minutes.

| Diagnostic observation        | Post-GC main-page heap |
| ----------------------------- | ---------------------: |
| Before measured remounts      |       20,642,824 bytes |
| After 120 remounts            |       24,297,696 bytes |
| After 240 remounts            |       24,652,892 bytes |
| Second 120-remount increase   |          355,196 bytes |
| Last 20 samples, 19 intervals |           17,656 bytes |

Font atlas canvases, 2D contexts, and BitmapText counts remain 10, 16, and 60. The original resource assertions pass, with no context loss. The earlier fixed-source baseline's second 120-remount increase was 709,796 bytes. Each version has one extended run; this comparison does not establish a stable plateau or a general performance effect.

The midpoint and final snapshots contain 833 `_gpuData` owners each. None has indexed keys, indexed backing bytes, or null values. The 454 live named keys change from `-131` to `-251`. This confirms removal of the specific renderer-index storage growth found in the earlier baseline.

Snapshot self size still increases by 364,503 bytes. A separate `BatchTextureArray.ids` cache retains the same 63 owner/map pairs, with backing storage rising from 73,476 to 128,772 bytes. Its indexed null entries rise from 2,941 to 5,574. InstructionStream and TrustedByteArray groups grow by 186,944 and 72,060 bytes. Ground and coast graphics backing sizes remain unchanged. These groups describe snapshot self size, not retained-size dominators or Runtime heap usage. The analysis scripts and complete per-owner data are archived; no additional texture-cache fix is included.

All five heap snapshots, all raw samples, raw command logs, diagnostic producers, source proofs, and dependency hashes are preserved. `summary.json` records compressed and uncompressed hashes. Run `python3 verify.py` from this directory to check the artifacts and source checkpoints.

The candidate snapshot scripts import the parser at the original remote path `/tmp/tenka-heap-2d872d7/post-cap-analysis.py`. Its exact source is archived as `../heap-current-2d872d7/post-cap-analysis.py.gz`. To rerun locally, extract that parser and the candidate snapshots, then adjust only the parser and snapshot paths in the archived scripts. These path changes do not alter the analysis.
