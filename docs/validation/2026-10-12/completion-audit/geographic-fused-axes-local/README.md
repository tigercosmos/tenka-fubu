# Fused geographic axes local candidate

This package freezes candidate `5224c06bcbaf87ba8a84543837037a99e7d0d0d2` and its local correctness checks.
The candidate combines horizontal and vertical axis preparation into one reservation scan.
It keeps separate Sets, each axis's four original expressions and insertion order, stable sorting, and the cap of sixteen.
The initial parse failure and later accepted runs remain separate raw payloads.
The fixed-source full suite is terminal: 6,362 passed tests, one known no-heir failure, and one skip.
Its 687 files record 685 passes, one failure, and one skip; duration is 131.34 seconds.
All 1,486 tracked inputs match Git blobs and the before/after manifests match byte-for-byte.
The isolated worktree uses the root node_modules symlink; this is not fresh dependency provisioning.
Full types, lint, build, and bundle checks exited zero. The build completed in 4.19 seconds.
The existing large-chunk warning remains verbatim in the raw log.
The after-checks manifest also matches the original 1,486-input manifest byte-for-byte.
No native performance improvement is claimed in this package.

## Focused results

| Run                                                  | Recorded result                                                              |
| ---------------------------------------------------- | ---------------------------------------------------------------------------- |
| `focused-first.log`                                  | Parse-stage RED: one failed file, two passed files, 21 existing tests passed |
| `focused.log` and `focused-before-count-batches.log` | First corrected run: three files, 23 tests passed                            |
| `focused-final.log`                                  | Three files, 26 tests passed                                                 |
| `types.log`                                          | Full UI/core typecheck completed without diagnostics                         |
| `lint.log`                                           | Scoped ESLint completed with empty output                                    |
| `format.log`                                         | Both source and test passed formatting                                       |

The parse-stage failure came from the invalid unary exponent expression `-2 ** -40` in the new test.
Its new assertions did not execute. Parenthesizing the expression corrected the parse error.
The final test adds an explicit eleven-valid-extreme-scene assertion.
It also partitions the same 320-scene stream into four batches of eighty, without increasing deadlines.
Each scene consumes 87 random values; the batch offset preserves the original stream.

The immutable existing reference is `tests/helpers/geographicWasmReference.ts`, frozen from the original `239f300` layout.
Its exact file hash is `bda5b757e2bd8a2e82c5a42fde825ebe9c846337b8a578f8413938624899d9b2`.
The test checks this hash and adds one read-only observation call before the original scoring loop.
The reference source itself remains unchanged; no separate replacement algorithm supplies expected axes.

The new test captures every prepared scorer argument and compares numbers through SameValue, including signed zero and NaN, plus property order, arrays, and complete offset sequences.
The actual path executes the committed Rust scorer.
Outputs, serialized Maps, and computed/reused/entry diagnostics match at every transition.
The transitions cover initial layout, structural-clone hits, blocker changes, road slack changes, rectangle changes, and ID eviction.
Additional controls cover signed zero, stable absolute-value ties, the axis cap, radius/gap epsilon, and valid extreme finite arithmetic.
Invalid padded endpoints remain excluded under the original validation contract.

## Source and runtime scope

Only `src/ui/map/geographicLabelLayout.ts` and the focused test changed in the candidate commit.
The original absolute snapshot is `/tmp/tenka-geo-fused-axis/geographicLabelLayout-before.ts`.
Its SHA-256 is `fbf127f31dbb5d8318acdf1ff1dd8bc56b77e808ba23247b779ad74ed28c3bdd`.
This snapshot matches the candidate parent's source and the earlier same-cohort profile's geographic source byte-for-byte.
The intervening parent documentation commit does not change this runtime body.

The earlier separate profile attributes 14.36 ms inclusive per completed render to geographic layout and 3.846 ms to `edgeAxis`.
The add callback's 1.248 ms self time is already inside the axis inclusive value; these costs must not be added.
The profile identifies the candidate's target. It does not predict an accepted speedup.
The native campaign must preserve the same dependency cohort and remain separate from these local unit results.

`source/` preserves exact candidate Git blobs, the compiled binary, its manifest, and the bounded source patch.
`raw/` preserves original absolute source and log bytes, plus the unchanged fixed-input manifest producer.
`manifest.json` records raw and gzip SHA-256 values for each payload.
Run `python3 check.py` to verify bytes, reference identity, source/artifact provenance, and recorded terminal summaries without executing tests.
