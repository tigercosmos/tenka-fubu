# Restored geographic preparation local validation

Commit `3d6a95335dce862765e0eb46f0c97073c5398988` withdraws the fused-axis candidate after its native control showed no clear benefit.
The geographic layout source is byte-identical to the original `04c7b60` body.
Its exact SHA-256 is `fbf127f31dbb5d8318acdf1ff1dd8bc56b77e808ba23247b779ad74ed28c3bdd`.
The five focused preparation tests remain as generic regression coverage under `geographicPreparationParity.spec.ts`.
The fixed restored-source full suite is terminal: 6,362 passed tests, one known no-heir failure, and one skip.
Its 687 files record 685 passes, one failure, and one skip; duration is 128.23 seconds.
All 1,486 tracked inputs match the fixed Git blobs and their before/after manifests match byte-for-byte.
The isolated worktree uses the root node_modules symlink; no fresh dependency provisioning is claimed.
Full types, lint, build, and bundle checks exited zero; the build completed in 4.20 seconds.
The after-checks manifest also matches the original 1,486-input manifest byte-for-byte.
Existing build warnings remain verbatim in the raw log.

## Retained focused coverage

The withdrawal run records three files and 26 passed tests.
Scoped lint and formatting completed; their original logs remain separate gzip payloads.
The retained test compares complete prepared arguments, ordered offsets, and cache diagnostics with the hash-locked frozen reference.
It executes actual Rust scoring across the same 320 seeded scenes and eleven valid extreme scenes.
No thresholds, deadlines, assertions, or protected baselines were weakened by the withdrawal.

## Bounded compiled-assets comparison

The independent producer compares the emitted 04 and restored builds directly.
All eight `dist/assets` JS/CSS files have identical filenames, byte lengths, hashes, and bytes.
Both served WASM binaries contain 63,073 bytes and share SHA-256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`.
The raw producer, output, and proof retain the absolute build paths.
The old directory name contains `6795`, but its independently reverified source manifest records the actual `04c7b60` HEAD and 1,485 fixed Git-blob inputs.

This comparison excludes sourcemaps, other public assets, source-manifest metadata, and dependencies.
It does not establish equality of every build file and is not a native FPS rerun.

## Source scope

`candidate/` preserves the source and test from `5224c06`.
`pre-withdrawal/` preserves the exact preceding commit's source and test.
`restored/` preserves the restored source, renamed generic test, reference, helper, artifact identity, and withdrawal patch.
`original04/` supplies the independently pinned original geographic source for the byte-equality check.

The earlier `geographic-fused-axes-local` package remains unchanged and records validation of the candidate source.
It is not relabeled as restored-source validation.
Native observations, dependency identity, and timing attribution belong to their separate campaign package.
The local focused pass establishes correctness coverage, not an accepted speedup.

`manifest.json` records each original path, length, raw SHA-256, and gzip SHA-256.
Run `python3 check.py` to verify bytes and restored geographic source equality without running tests or native timing.
