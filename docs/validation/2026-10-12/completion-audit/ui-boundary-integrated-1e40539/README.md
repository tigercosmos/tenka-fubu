# Normal-day integration at `1e40539`

The court and earned-alliance cases retain the normal x5 speed controls and their original assertions. Court waits for the requested Worker tick to commit before reading state. Alliance also handles a modal boundary where the next tick was not dispatched: it admits at most three guarded 16 ms RAF slices, joining any pending tick after each slice, and still requires exactly one completed day. Neither case uses debug day injection or longer deadlines.

The combined source at `1e405399a2f750bbc7fc9db6e9a440372732ced1` passed type checking, full ESLint, two-file Prettier and unchanged `chromium` discovery: 364 cases in 103 files. All 1,633 scoped inputs matched the committed Git blobs and executable modes before and after the checks. Dependencies and generated files are outside this local inventory.

The [court evidence](../court-work-normalday-a98046e/README.md) and [alliance evidence](../alliance-day-boundary-1e40539/README.md) retain their separate original failures, diagnostic observations and passing native cases. The alliance native run used `1649c65` plus its exact test overlay; it did not include the unrelated court test change. This package verifies the combined local source without relabeling either native run.

The most recent complete native diagnostics remain pinned to `ecba08b`, and both failed the original global deadline. No full native or core suite was repeated for these E2E-only changes. Hojo and color investigations remain separate diagnostics, with no production change included in this pin.

`raw/` retains preopened logs, command arguments, statuses and source proofs. Run `python3 verify.py` to check the artifact manifest, independent Git readback, exact full-ESLint command and discovery count. The runner and package producer are retained alongside the evidence.
