# 原命令與執行順序

Scratch：`/tmp/tenka-c5c7e55-endpoint-hoist-sim1`。固定 archive commit：`c5c7e551da0e39f4bdca55e5b92d415a57c67dc7`。Node_modules symlink 指向既有 `/Users/tigercosmos/tenka-fubu/node_modules`。

Baseline 先於候選修改執行原 producer：

```sh
npm run wasm:build > evidence/baseline-build.log 2>&1
```

封存 baseline WASM／manifest 後，只套用 `candidate.patch`，再執行：

```sh
rustfmt +1.97.1 --edition 2021 rust/engine/src/geographic_preparation.rs
npm run wasm:build > evidence/candidate-build.log 2>&1
cargo +1.97.1 test --manifest-path rust/engine/Cargo.toml > evidence/original23-tests.log 2>&1
rustc +1.97.1 --edition=2021 --test evidence/overlap-parity.rs -o evidence/overlap-parity > evidence/direct-parity-compile.log 2>&1
evidence/overlap-parity --nocapture > evidence/direct-parity-test.log 2>&1
npx tsx evidence/compiled-parity.ts > evidence/compiled-parity.log 2>&1
cargo +1.97.1 clippy --manifest-path rust/engine/Cargo.toml --all-targets -- -D warnings > evidence/candidate-clippy.log 2>&1
rustfmt +1.97.1 --check --edition 2021 rust/engine/src/geographic_preparation.rs > evidence/candidate-fmt.log 2>&1
```

加入 actual-helper 永久測試的初次 test／clippy 編譯失敗，原 log 另存 `permanent24-*-first-red.log`。首次 build 仍產生原候選 binary，因 release 不編譯 `cfg(test)`。修正型別後採 fail-fast 順序：

```sh
set -e
rustfmt +1.97.1 --edition 2021 rust/engine/src/geographic_preparation.rs rust/engine/src/geographic_preparation_tests.rs
cargo +1.97.1 test --manifest-path rust/engine/Cargo.toml -- --nocapture > evidence/permanent24-tests-final.log 2>&1
cargo +1.97.1 clippy --manifest-path rust/engine/Cargo.toml --all-targets -- -D warnings > evidence/permanent24-clippy-final.log 2>&1
rustfmt +1.97.1 --check --edition 2021 rust/engine/src/geographic_preparation.rs rust/engine/src/geographic_preparation_tests.rs > evidence/permanent24-fmt-final.log 2>&1
npm run wasm:build > evidence/permanent24-build-final.log 2>&1
cmp evidence/candidate.wasm public/wasm/tenka_engine.wasm
```

這些命令是原執行紀錄，不是效能 benchmark。原 producer 保留 locked release build、pinned toolchain 與 remap recipe；沒有另加最佳化 flags。
