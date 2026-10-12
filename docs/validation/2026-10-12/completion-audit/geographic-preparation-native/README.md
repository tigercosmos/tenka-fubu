# Geographic preparation native evidence

Frozen runtime `feab20cc9c207f37afae7a2f372c437b93232a07` ran once on sim3 with the same current23 dependency cohort as the accepted 04 baseline (`ea1d52b`): 14,765 dependency files and 23 installed Pixi patch targets. Three source and dependency checkpoints match. Public assets are real copied files. The 88,475-byte WASM is `64241ba7fb1e8cc5a5a10205a600bb7b9dbecb59e0f6b2cf71ffe4ebea79870b`.

Nine settled full published payloads match reference `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29` byte for byte. Only the four original named nonvisual counters are excluded; the full 15 MB payload is retained.

| Camera      | Average FPS | 04 baseline |   Change | p95 ms | Strict60 |
| ----------- | ----------: | ----------: | -------: | -----: | -------- |
| overview    |     59.9598 |     59.9309 |  +0.048% | 17.200 | RED      |
| operational |     49.8850 |     49.7382 |  +0.295% | 21.900 | RED      |
| close       |     32.0392 |     29.1155 | +10.042% | 37.200 | RED      |

Each original control ran once for 30 seconds with 120 canonical armies at 1920×1080, sequentially, without retry or threshold changes. Actual control renderer and profile before/after WebGL2 guards show RTX 5070 Ti with Vulkan. Before/after canonical state and renderer resources match. The parent retains the candidate for the observed close improvement; these single windows do not establish repeatability or 60 FPS acceptance.

The one separate close CPU profile completed 323 renders and 322 intervals in 10052.300 ms; sampled span 10248742 µs. Driver ticks were zero. Geographic layout parent inclusive cost was 11.6128 ms/render, versus 14.3623 ms/render in 04 (-19.144%). This parent includes preparation and scoring. Signature own sampled cost was 190,323 µs; prepare inclusive was 1,162,477 µs and scorePrepared inclusive was 2,351,993 µs. Do not add these overlapping rows. Preparation-source own sampled total includes signature, validation and packing; it is not an isolated packing benchmark.

The actual export section maps `geo_prepare` to function 56 and `geo_score_prepared` to 58. The direct geo_prepare export frame has self/inclusive 1,052/347,350 µs (one own sample); geo_score_prepared has 3,159/581,769 µs (three own samples). Direct exported frames do not account for all internal or inline work. Exclusive WASM sampled leaf costs grouped by nearest mapped JS caller are 1,126,614 µs under prepare and 2,335,044 µs under scorePrepared. The raw profile, actual served bundles/maps, full mapped nodes, source positions and export map are retained. All caller groups are exclusive; parent inclusive rows overlap them.

Cache counters changed from computed/reused/entries 1028/10/112 to 42763/131/112. Their capture spans more than the CPU window, so these deltas cannot be divided by measured frame count. All original FPS failures remain in their byte-exact logs. This setup succeeded; the prior shell setup RED remains immutable in the earlier `geographic-fused-axes-native` package and is not relabeled as a failure of this run.

All raw artifacts are gzip-compressed without rewriting bytes. `summary.json` records raw and gzip byte counts and SHA256 values. Verify with `python3` after decompressing `verify-evidence.py.gz`, passing this package directory. No production files were changed by collection or packaging.
