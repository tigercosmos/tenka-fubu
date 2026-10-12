# Standalone strict SIMD Chromium probe

Two headless browser runs passed the same 884-byte overlap probe. The first used Playwright's default headless launch. The second explicitly selected the installed Chromium 1228 executable. Its CDP product was `Chrome/149.0.7827.55`, JavaScript version `14.9.207.21`, with Playwright `1.61.1` on Darwin arm64 / Node `v22.17.0`. Both full user agents and executable inventory are retained in the raw result files.

Each run validated and instantiated the actual probe binary, then compared JavaScript Math, scalar WASM, and strict SIMD WASM across 100,352 grid cases and five additional explicit controls. NaN results were compared by classification; all other results were compared by f64 bits. The grid included signed-zero inputs, subnormals, finite extremes, Infinity, and NaN. It produced 40,529 NaN, 56,962 finite, and 2,861 infinite outputs; 48,897 outputs were zero, with no negative-zero output observed.

The complete per-case stream was **not retained**. The producers enumerate every case and throw on a mismatch. Each raw result retains counts, four selected grid rows, and five explicit controls. Original producer, stdout, version/UA, probe source/binary, compile command/toolchain, and separate prior Node proof are archived without changing their bytes. The original Node 871,200-case result is not browser coverage.

Firefox 1532 and WebKit 2311 expected executables were absent. Neither was installed or launched. There is no Safari coverage, full-game integration, GPU/FPS result, performance claim, or formal scalar/SIMD variant selection in this package. The browser probe ran separately from sim3 timing work.

`manifest.json` records source paths and both raw/gzip SHA-256 values. Run `python3 check.py` to verify the retained evidence. This checks archives and claims only; it does not rerun a browser. To reproduce the explicit Chrome run, decompress `raw/check.cjs.gz` into the original scratch directory shown by the manifest, then execute it with Node while the referenced Playwright installation and probe still exist.
