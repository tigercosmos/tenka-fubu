# Scoped validation snapshots

`tenka-scoped-source-archive.py` creates an immutable runtime snapshot or an exact Git revision delta. It allows only the listed source, test, asset, tool, plan and build configuration paths. It excludes `docs/` and `output/`, including all validation evidence. Each Git subprocess gets exclusive-created stdout, stderr, command and result files before execution.

The captured control restored all 1,630 allowed files from `79682cd`, applied the one-file delta to `8d0a040`, then checked every final Git blob and executable mode. All 1,631 final files matched; no extra file, `docs/` or `output/` directory was present. The separate archive control also checked the delta member's Git blob. This control has no removed files or symlinks; it does not validate those restore cases.

For another validation host, use a new output directory and a fixed commit:

```sh
python3 tenka-scoped-source-archive.py --repo /path/to/repo --revision COMMIT --output /new/capture
```

To update a retained runtime, add `--base BASE_COMMIT`. First verify that every allowed destination file matches the base inventory. Apply the listed deletions and archive, then verify every final entry against the new inventory, including executable modes. Preserve unrelated run evidence. Install dependencies separately when their pinned inputs change; this helper does not prove installed dependencies or generated bundles. It also excludes uncommitted changes.

The helper, original producers, inventories, small delta archive and all control logs are retained here. The full runtime archive and restored disposable source copy remain outside Git under `/tmp/tenka-scoped-full-796` and `/tmp/tenka-scoped-restore-8d0a040`; the full archive hash is in its captured manifest. Git blobs make that input reproducible. The verifier checks archived evidence, not a new restore execution.

The Battle setup in this batch had already streamed a full tracked archive before this helper was introduced. Its successful raw setup result remains in the separate Battle package. This control does not relabel that transfer as scoped.
