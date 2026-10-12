# Existing geographic score profile: overlap target

This package analyzes the unique frozen feab close profile already preserved in `../geographic-preparation-native` (commit44c3b30). It adds no GPU workload, tests or timing. Parent profile, binary, mapped nodes and source-summary files are linked with both compressed and raw hashes; they are not duplicated here.

The actual binary has no custom/name/DWARF sections. Internal Rust names below are strong inferences from exact instruction bodies and frozen source patterns, not retained symbol proof. Full LLVM22.1.6 disassembly and exact function snippets are preserved.

| Score-context sampled WASM leaf    |    Own µs | Own samples |  Share |
| ---------------------------------- | --------: | ----------: | -----: |
| function44, overlap-like           | 1,249,004 |       1,188 | 53.49% |
| function51, capsule-clearance-like |   451,088 |         429 | 19.32% |
| function33, internal score body    |   232,396 |         221 |  9.95% |
| function27, padding2 fold-like     |   169,217 |         161 |  7.25% |
| function26, padding0 fold-like     |   127,229 |         121 |  5.45% |

These shares use 2,335,044 µs of exclusive WASM sampled leaf time under the mapped TS scorePrepared caller (2,221 samples). They do not use flat export-frame totals. Actual export58 invokes internal33. Function44 reads two four-f64 rectangles, performs padding-aware endpoint arithmetic with NaN/signed-zero-aware min/max, clips X/Y extents and multiplies them, matching frozen `geographic::overlap`. Function51 checks the five-word capsule limit/finite inputs and contains capsule distance arithmetic matching `clears_capsules` with inlined distance helpers.

Function26 iterates indexed rows and sums function44 with padding0; function27 does the same with padding2. Their callsites and frozen score source strongly suggest primary and reserved folds. Function44 own samples split by immediate parent:27 539,195 µs/513 samples;26 397,334/378;33 306,182/291;25 5,241/5;63 1,052/1. Adding disjoint helper-own samples gives 708,412 µs (30.34%) for27 and its44 child, and 524,563 µs (22.46%) for26 and its44 child. These are existing CPU samples, not isolated loop benchmarks.

Overlap-family dominance is supported. Hard-only or reserved-only dominance is not established. Direct33 overlap samples cannot distinguish hard checks from baseline/other inlined callsites; no instruction-PC distribution or symbolic debug provenance exists. LTO and inline/merged bodies limit Rust-name attribution. Inclusive parents overlap children and must not be added to these exclusive totals.

`summary.json` records byte counts and raw/gzip SHA256 for every artifact. `provenance.json.gz` pins the frozen source Git blobs, parent artifacts, LLVM executable/version and trace-mapping0.3.31 library. Decompress `verify.py.gz` and run it with this package path to verify hashes, source blobs, exact snippet extraction and all leaf/caller counts using the existing profile.
