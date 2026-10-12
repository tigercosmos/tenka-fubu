# Castle ribbon Rust/WASM local validation

This package freezes formal hook source `04c7b6083df32cc9c1a20d693ef45eddb806ed14` and its committed numeric artifact.
It separates prototype, foundation, adapter, and formal renderer validation.
It preserves original failures and does not combine native performance cohorts.
The fixed `04c7b60` full suite is terminal with 6,357 passed tests, one known no-heir failure, and one skip.
Its 686 files record 684 passes, one failure, and one skip; duration is 133.48 seconds.
The 1,485-input before/after and after-checks manifests match byte-for-byte.
Full types, lint, build, and bundle checks exited zero; the build completed in 5.18 seconds.
The known national no-heir failure remains explicit; no runtime performance improvement is claimed.

## Accepted local runs

| Evidence                                               | Actual scope and result                                                        |
| ------------------------------------------------------ | ------------------------------------------------------------------------------ |
| Prototype `test.log`                                   | Two tests passed: 337 frozen full-word oracle cases and malformed-input guards |
| `tenka-castle-rust-permanent-tests.log`                | Eleven engine Rust tests passed                                                |
| `tenka-castle-wasm-real-first.log`                     | Seven actual compiled parity cases passed, including 320 seeded scenes; 923 ms |
| `tenka-castle-main-focused.log`                        | Six adapter protocol tests plus seven compiled parity cases passed             |
| `tenka-castle-kernel-compat.log`                       | Three files, eighteen geographic/pathfinding/artifact tests passed; 786 ms     |
| `tenka-castle-kernel-final-compat.log`                 | The same three-file compatibility scope passed; 769 ms                         |
| `tenka-castle-render-focused.log`                      | Six files, 66 tests passed                                                     |
| `tenka-castle-render-all-fixtures.log`                 | 33 files, 386 tests passed; 54.07 seconds                                      |
| `tenka-castle-render-ownership-final-tests.log`        | Three actual two-arena ownership tests passed                                  |
| Final scoped types/lint/format and artifact check logs | Retained local checks completed after the preserved failures                   |

The real parity tests compare every output field, Map order, signed-zero bits, callback work, and input immutability.
They cover exact proposal budgets, later zero-charge placements, maximum counts, huge finite anchors, and metadata spread behavior.
The permanent helper reads the committed public binary, without an environment override.
The temporary helper's optional artifact selector remains separately archived.

The initial formal focused command named nonexistent `MapRenderer.dirty.spec.tsx`.
That file did not run. Its actual six-file log contains adapter, geographic, castle, lifecycle, and host tests only.
The later 33-file fixture run explicitly includes `src/ui/map/mapRendererDirty.spec.ts` and its original assertions.
Existing jsdom canvas warnings remain verbatim; empty scoped logs do not provide independent process exit records.

## Original failures

| Raw evidence                         | Cause and disposition                                                                                                                        |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `tenka-castle-wasm-first-build.log`  | npm ran from the temporary test directory and could not find package.json. No real WASM parity test executed in that attempt.                |
| `tenka-castle-rust-main-clippy.log`  | Strict clippy rejected exports placed after a test module. The wrapper order was corrected and subsequent clippy completed.                  |
| `tenka-castle-render-final-lint.log` | Ownership instrumentation returned `any[]`. Typed pointer records replaced that instrumentation; the final lint log is preserved separately. |

The failed attempts remain raw gzip bytes. Corrected results do not replace them.
The first build failure is an invocation failure, not a numerical-kernel failure.

## Prototype and oracle provenance

`prototype/` preserves the complete small crate, generation source, test source, logs, and original manifest.
`fixtures.bin` contains 337 framed records with full f64 input and expected output arenas.
Its raw length is 2,567,560 bytes; SHA-256 is `c0e4bec324077776616636325d7f495abe58acb17752c9669af3d4d2bad92af4`.
The native prototype compares every arena word by bits, including logical work and all placement fields.
Its guard test contains thirteen header/geometry mutations, plus null, alignment, and length controls.

The permanent source contains a 457-line core and an 85-line test module.
Its source SHA differs from the earlier 453-line pure prototype; these identities remain separate.

During this evidence audit, the permanent golden comment incorrectly attributed mixed-sign anchors directly to original cases 321/322.
Original case 321 uses `(+0,+0)`; case 322 uses `(-0,-0)`.
The permanent tests use `(-0,+0)` and `(+0,-0)` instead.
Independent frozen-JavaScript controls were then generated without invoking Rust.
Both controls record work 472 and match all sixteen permanent output fields by bits.
They are new controls derived from the same baseline geometry, not original rows in the 337-case archive.
The original formal-source comment remains preserved in the frozen source.
Commit `2bdb1f3` corrects only that comment and the generated source manifest. Rust tests again record eleven passes.
The corrected WASM binary is byte-identical to the frozen formal-source binary.
Its source hash is `b57de0628e39b2cd62b2fb2a55ca0792576bd033596d7381870e9b1e286acb41`.

The corrected main tree differs from the fixed full-suite inputs in one tracked Rust test file.
The generated public manifest also differs, but lies outside the tracked full-suite manifest scope.
The full-suite result remains attributed to `04c7b60`; it is not relabeled as a run of the corrected tree.

## Source pins

| Phase                           | Commit    |
| ------------------------------- | --------- |
| Kernel/artifact foundation      | `ce827fe` |
| Adapter and actual parity tests | `671602a` |
| Formal renderer hook            | `04c7b60` |

The new binary contains 63,073 bytes and has SHA-256 `4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba`.
The formal artifact source hash is `a9bf64d0b3392f5a1c8bc38db6c53be2b7a2156e8aa14f075f25f7c1014d9ee4`.
The exact frozen JavaScript reference hash is `2c5e8d577598f1204cdcd67dfc0473e29be15ca4f4a3a613c24aa8287c6559ad`.

`source/` contains exact formal-source Git blobs and phase patches.
`manifest.json` identifies every payload's original path, byte lengths, raw SHA, and gzip SHA.
Run `python3 check.py` to verify archived bytes, source/artifact identity, and oracle record structure without running tests.
The verifier does not reproduce engine execution or native FPS measurements.
The separate current23 geographic baseline and Worker readiness packages retain their own scope; they do not establish this local full-suite result.
