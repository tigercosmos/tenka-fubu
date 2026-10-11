# Fixed experimental castle candidate integration

Detached checkout `6795ed7` runs the full suite after both natural earned-checkpoint tests and the castle zero-objective candidate are committed. All 1,471 tracked source/test/tool/spec/Rust/root-config inputs match Git blobs before testing and remain byte-identical afterward. This manifest excludes public assets, installed dependencies and binary outputs. The checkout uses a symlink to the existing local installed dependencies; it is not an independent dependency installation or native-runtime freeze.

681 files: 679 pass, one fails, one skips. 6,300 tests pass, one fails, one skips (127.69 seconds). The only failure remains no-heir s1560 day450 territory ownership INV-02/INV-22. Typecheck, complete lint, production build and bundle budget pass. Original warnings remain in the full raw logs. No invariant, timeout or test oracle is changed.

The initial checkout setup was still copying files when the first npm command started; package.json did not yet exist and no tests ran. The invalid empty-input probe and ENOENT log are preserved separately. After checkout completion, the positive 1,471-file Git-blob verification precedes the actual full run above. Setup failure is not a failing code test or a replacement full-suite verdict.

After independent native controls show no clear overall FPS benefit, `e72bde9` withdraws the castle candidate and its six experimental parity tests. This integration verdict describes the fixed experimental source, not the later restored runtime. The subsequent restored-source full suite is preserved separately. Geographical-index experiments and both rollbacks remain in commit history and their original evidence packages.
