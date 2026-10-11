# Geographic Rust/WASM local validation

This package records local validation for production source commit `fb9fd7f885f3569bc819a3957a67f734f9f7b123`.
It preserves original failures, corrected controls, compiled parity, renderer ownership, and fixture migration.
It does not establish an FPS improvement or combine native timing samples.

## Accepted local results

| Evidence                                                | Recorded result                                                           |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `tenka-geo-render-final-fixed.log`                      | 19 files, 262 tests passed                                                |
| `tenka-geographic-wasm-extreme.log`                     | Six compiled parity tests passed                                          |
| `tenka-geographic-rust-tests-green.log`                 | Nine Rust tests passed; zero failed                                       |
| `tenka-geographic-rust-clippy-green.log`                | Clippy completed after the retained original warning failure              |
| `tenka-geo-render-final-types.log`                      | Full UI/core TypeScript command, with no diagnostic output                |
| `tenka-geo-render-lint.log`                             | Retained empty lint output                                                |
| Fixture checker baseline / pre-source / final / confirm | 35 / 35 / 0 / 0 violations                                                |
| Final WASM build / artifact check                       | Same current artifact hash                                                |
| Adapter tests / abort tests                             | 12 / 13 tests passed; original offset identity and owner lifecycle tested |

The final parity suite compares 320 deterministic scenes with the frozen `239f300` JavaScript layout.
It checks ordered offsets, serialized bytes, protected channels, capsule constraints, and cache transitions.
The added extreme test covers 11 valid finite scenes, cache reuse, overflow probes, and a finite positive control.
The renderer suite uses real compiled owner instances, including preparation, disposal, abort, and independent memory.
Existing jsdom canvas warnings remain verbatim in the accepted logs.
Empty logs alone do not encode a process exit status; this package does not invent missing exit records.

## Retained failures and controls

| Original evidence                                   | Failure and correction                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenka-geo-render-focused-helper-url-red.log`       | Ten suites failed during collection. Vite transformed the helper's asset URL into an HTTP URL. The helper now reads the repository artifact path.           |
| `tenka-geo-render-focused-cross-realm-red.log`      | Ten files failed, with 187 failed and 72 passed tests. The ABI check rejected valid cross-realm WASM buffers. The owner now checks the buffer structurally. |
| `tenka-geographic-wasm-invalid-fixture-control.log` | One validation assertion failed. The frozen reference accepted the proposed invalid fixture; it was not a kernel mismatch.                                  |
| `tenka-geographic-wasm-extreme-count-control.log`   | One assertion expected ten valid scenes; the observed count was eleven. The final test records eleven.                                                      |
| Two `tenka-geographic-extreme-js-helper` logs       | Both report `actual:false` and `movedActual:false`. These observations correct the earlier unverified NaN eligibility hypothesis.                           |
| `tenka-geographic-rust-clippy-red.log`              | Strict clippy rejected the manual alignment modulus. The source uses `is_multiple_of` and the retained green run completed.                                 |

The extreme fixture obeys the existing finite padded-endpoint contract before scoring.
Its accepted probes retain JavaScript overflow and rejection behavior; they do not relax geometry validation.
All failed logs remain byte-exact gzip payloads. The intermediate 261-test pass also remains distinct from the final 262-test pass.

## Fixture migration

The archived checker detects zero-argument `new MapRenderer()` calls in `src` and `tests` spec files through the TypeScript AST.
Its unchanged baseline and pre-source control both report 35 violations.
The final and confirmation logs both report zero.
Production files, e2e, dependencies, and generated artifacts remain outside this check.

`raw/checker-probe.spec.ts.gz` preserves one broken call, one owner-injected call, and one comment containing the broken text.
The expected probe count was one. No standalone historical stdout for that probe was retained.
The original checker has an absolute TypeScript dependency path; its raw bytes remain unchanged.
The archived integration patch records the explicit real-WASM fixture injection and production owner wiring.

## Source and artifact identity

| Field                    | Exact value                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| Production source commit | `fb9fd7f885f3569bc819a3957a67f734f9f7b123`                         |
| WASM bytes               | 27,147                                                             |
| WASM SHA-256             | `2f4bde5fab04903790ccc28e507ef2ccd1dd8df8bc9f8de2a4491ff71ca263df` |
| Artifact source SHA-256  | `77320d5c5ec51d0ad19af63f69b66f08a0afefa882e174dfe1a67b6c825ab070` |
| Toolchain / target       | Rust 1.97.1 / `wasm32-unknown-unknown`                             |
| Rust dependencies        | Zero; Cargo.lock contains only the engine package                  |
| Frozen reference SHA-256 | `3d7796705fbc82053feb7946f2f2b0c772c00ce01e45a3e06ba108eef9da0fae` |

`source/` contains exact Git blobs from the production source commit, including the binary and artifact manifest.
The original `/tmp/tenka-geographic-wasm-source.tar` is also retained. Every member matches the production commit byte-for-byte.
`manifest.json` records original paths, raw and gzip lengths, and both SHA-256 forms for every payload.
It distinguishes the source commit from the evidence collection HEAD.
`SHA256SUMS` covers the package files, excluding itself.

Run `python3 check.py` from this directory to verify payloads and source/artifact identity without running project tests.
The checker verifies bytes and provenance fields; it does not reproduce historical test execution.
