# Frozen E2E integration at `1464146`

The combined source contains the Ending fixture change `5500bc0` and actor-depth oracle correction `1464146`. Both change E2E tests only. No game code, Playwright project, worker setting, assertion deadline or protected reference changed.

All 1,632 allowlisted source inputs matched their Git blobs and executable modes before and after the local checks. Type checking, full ESLint, explicit `chromium` test discovery, and formatting of both changed tests passed. Discovery found 363 cases in 103 files. The additional case compared with the earlier `8ea965a` full run is the Battle accessible-name/group regression added in `b867014`; neither change in this batch adds a test case.

This is a local static and discovery check, not another full core or browser run. The [Ending controls](../ending-fixture-5500bc0/README.md) and [actor-depth controls](../actor-depth-projection-1464146/README.md) retain their separate exact-source native evidence. The combined original full native run uses the same frozen commit and is reported separately. Earlier full core results remain pinned to `7d37c28`.

`raw/` contains the complete preopened command logs, results and source inventories. The runner records each check independently and takes the final source proof after all checks. The inventory excludes validation documents, generated output and installed dependencies; it does not claim a fresh dependency install. Run `python3 verify.py` to check retained hashes and the source inventory against an independent Git readback.
