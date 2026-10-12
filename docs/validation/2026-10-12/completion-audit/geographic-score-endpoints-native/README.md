# Geographic scoring endpoint native evidence

Frozen runtime `c2302c4ad1fa7ad524f79a13084b8ceedc3b4a7e` ran once on sim3 with the same current23 dependency cohort as feab (`44c3b30`):14,765 dependency files and23 installed Pixi patch targets. Three source/dependency checkpoints match. The1,524 source proofs now include full frozen e2e along with src/public/rust/tools/tests and root config. Public files are copied; only node_modules shares the original fresh current23 tree. Actual WASM is 89,761 bytes, `69af4226d451a71211b209101cc4223045b1aeca2f1178d16e9beaa91166b736`.

The parent decided to withdraw this candidate: close FPS fell0.911%, geographic layout parent cost rose1.308%, score WASM cost rose1.618%, and the binary grew1,286bytes. The source revert was pending when this evidence was committed; c230 raw pins remain unchanged. New helper correspondence is useful diagnostic inference, not demonstrated performance benefit.

Nine settled full published payloads match reference `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29` byte for byte, with only the original four named nonvisual counter exclusions.

| Camera | Average FPS | feab baseline | Change | p95 ms | Strict60 |
|---|---:|---:|---:|---:|---|
| overview | 59.9385 | 59.9598 | -0.036% | 17.200 | RED |
| operational | 50.0493 | 49.8850 | +0.329% | 21.900 | RED |
| close | 31.7474 | 32.0392 | -0.911% | 37.700 | RED |

Original120 canonical armies at1920×1080 controls ran once30seconds per camera, sequentially without retry or changed thresholds. No baseline was rerun. Actual controls and profile pre/post guards show RTX5070Ti Vulkan. Canonical state and renderer resources match before/after. These are single-window observations; strict60 remains RED.

One separate close CPUprofile completed 320 renders/319 intervals in 10075.800 ms; sampled span 10277291 µs. Driver ticks0. Geographic layout parent inclusive cost 11.7647 ms/render versus feab 11.6128 (+1.308%). Signature own sampled cost 221937 µs; prepare inclusive 1124693 µs; scorePrepared inclusive 2366963 µs. These inclusive rows contain child work and must not be added. Actual export map, direct export own/inclusive rows, nearest-mapped-JS-caller WASM leaf grouping, current served JS/maps and raw profile are retained. Cache captures span more than the CPU window; no exact per-frame hit-rate claim is made.

The actual stripped binary has no name/DWARF sections. Function26 is inferred as overlap_candidate-like from supplied right/bottom scalar parameters, padding and clipping arithmetic. Its own scoring samples are1,241,988µs/1,183samples (52.83% of score WASM leaf time), or3.8812ms/render versus feab overlap-like44 at3.8669ms/render. Internal capsule-like52 is18.87%; directexport59 calls internal34. Actual binary disassembly/snippets and existing-profile leaf reconstruction are preserved; Rust names remain inference.

The premature source transfer referenced its manifest before the existing archive producer finished. The captured scp missing-file RED and its observed outer-shell exit0 are preserved; the individual scp exit was not captured. The same live archive producer completed; finalized archive and manifest hashes matched before successful setup/build. No measurement had started at that failure. All original FPS failures remain untouched.

Each raw artifact is gzip compressed without byte rewriting; summary records raw and gzip byte counts and SHA256. Decompress verify-evidence.py.gz and run it with this directory to verify source/dependency checkpoints, full payload, original REDs, RTX guards and state/resource/profile proofs. No production source was edited for collection.
