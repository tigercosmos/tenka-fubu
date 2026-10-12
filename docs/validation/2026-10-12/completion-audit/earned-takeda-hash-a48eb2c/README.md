# Earned Takeda state-hash cost and equivalent FNV implementation

The earned day-300 Takeda callback spent most of its observed time hashing state. Commit `a48eb2c2a139108f3ff9fcc4e2c3e11a0bf6a875` changes only the per-byte FNV-1a multiplication to two 32-bit limbs. It retains the existing UTF-8 byte encoder and canonical state serialization. The original and candidate earned routes passed the same assertions and produced byte-identical save and evidence files.

## Scope and result

Both serial runs used the isolated sim4 runtime at base `b1a8fc8b21119bc3e540a6d5c5a83f1bd9911353`, the same final test-only census overlays, and the same 29 pinned dependency outputs. The candidate added only the new `serialize.ts` implementation and differential/benchmark tests. The strict runtime inventory checked 1,650 scoped inputs and 29 dependencies before and after each route. This was **not** a run of committed `a48eb2c` or the full native suite; the committed function bytes are the reviewed candidate function, and the coordinator owns committed-tree integration.

| Measure                    | Legacy BigInt | Limb candidate |
| -------------------------- | ------------: | -------------: |
| Earned callback wall time  | 19,215.606 ms |  11,660.149 ms |
| 300 daily state hashes     | 12,205.648 ms |   5,918.445 ms |
| 60 command-boundary hashes |  2,419.410 ms |   1,170.789 ms |
| 300 `runOneDay` calls      |  3,224.768 ms |   3,158.451 ms |
| 300 `validateState` calls  |  1,036.345 ms |   1,126.846 ms |
| Evidence JSON bytes        |    25,263,056 |     25,263,056 |

These are one serial pair of instrumented callbacks. Their observer buckets exclude nested wall-time buckets from the disjoint sum. `callbackWallMs` ends before the `finally` metrics print; the Vitest test duration includes that print. The shorter callback is an observed result, not a full-suite or performance-gate result. The separate alternating day-300 whole-state hash diagnostic made 12 equal-result pairs; median BigInt time was 40.618239 ms and median limb time was 19.1201905 ms. It is a scratch diagnostic, not an acceptance threshold.

The save was 868,744 bytes, SHA-256 `f58901048b720abfcb012f3e22f0264b21f537c0a22ebd29d215332f04438d41`. The evidence JSON was 25,263,056 bytes, SHA-256 `a80e52e2db2842cb234d6e547bec9115e3bf7340770b0d878e89f34fb30a7fe6`. Both hashes match the control, candidate, and archived earlier earned route in [`earned-takeda-native`](../earned-takeda-native/). This proves equality of the complete **serialized** output, including its recorded 300 daily hashes, events, command log, and saved state. It cannot reconstruct transient values omitted by that serialization.

The scratch differential checked 67,766 inputs, including every single UTF-16 code unit, lone surrogates, pairs, long Unicode text, and actual evidence text. The committed regression independently compares the frozen legacy BigInt functions against the limb implementation and the full s1560 state. The frozen legacy function extraction matches source SHA `4d8243c5b3023d5102f1bd9eba43eb1f76ae6368247f1d54f5043da5e5ba48ca`. Existing golden and replay checks are part of the coordinator's separate committed-tree integration.

## Evidence and reproduction

Run `python3 verify.py` in this directory. It checks the archive and all 121 member hashes, source/dependency proof results, test statuses, measured buckets, benchmark count, and the three output-hash inventories. `manifest.json` lists every archived member. `raw.tar.gz` holds exact captured stdout/stderr, command/result metadata, source manifests, executed overlay source, scripts, and fixture extraction proof. It contains source files inside the archive so repository lint and discovery do not parse evidence copies.

The 25 MB evidence JSON and save remain in the isolated sim4 paths `/tmp/tenka-takeda-census-save-b1-c1.tfusave{,.evidence.json}` and `/tmp/tenka-takeda-limb-save-b1-c1.tfusave{,.evidence.json}`. This compact package records their byte counts and SHA-256 values; the earlier archived baseline files are retained in the linked package. The package producer capture is `/tmp/tenka-takeda-hash-pack-c1`; the first verifier capture is `/tmp/tenka-takeda-hash-verifier-c1`, both exit 0.

The initial scratch Prettier check was run without a capture log and failed before formatting. Its tool transcript was retained outside this package; the subsequent captured touched-file Prettier, ESLint, TypeScript, exact legacy extraction, and diff checks passed. No extra Takeda timing runs followed the one control/candidate pair and 12-pair diagnostic.
