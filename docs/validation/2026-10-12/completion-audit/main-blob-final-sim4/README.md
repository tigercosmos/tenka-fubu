# Final shared-loader native validation

`2cfb2d6` applies the stable supported Pixi `preferWorkers:false` policy before each uncached shared load. Asynchronous page fetch/Blob/ImageBitmap decoding remains enabled. The independent Rust simulation module Worker is unchanged. The two original failures and their raw network evidence remain in `../extended-remount`; the causal Worker-GC/transport matrix and independent automatic-GC native proof remain in `../blob-worker-transport-sim2`.

The exact final runtime source passes 130 headless GPU renderer remounts (10 warmup plus 120 measured; 2.3 minutes). The original resource, global-font-cache and context-loss assertions remain unchanged; only the diagnostic measurement count is increased. The production loader bytes appear identically in the built source map. Of 714 checked src/tools files, 712 match current bytes; the two differences are the local mock-only loader and MapCanvasHost specs. Runtime source matches throughout. Public assets, configuration and E2E files are outside that manifest comparison; the actual diagnostic E2E bytes are archived separately.

All 121 post-GC page Runtime heap samples and complete before/after V8 snapshots are preserved. Heap rises 20,890,576→25,438,644 bytes (+4,548,068). Font caches remain 10 atlas canvases, 16 2D contexts and 60 BitmapTexts. This does not establish whole-heap stability or measure Worker/GPU/browser Blob memory. Forced page GC is part of this original heap diagnostic; the independent sim2 formal-loader run additionally passes without per-cycle forced GC.

The final six native simulation Worker tests pass in 42.3 seconds. All three synchronous/Worker complete states and logs agree, and equal the preceding geographic-allocation run without normalization. Published maps and every geographic label also agree. For 120 warm days the longest frame gap is synchronous 982.6 ms versus Worker 101.1 ms, with total durations 926.3 ms versus 2,469.5 ms; Worker throughput remains slower. Normal x5 completes 29 days before the intended monthly pause: longest gaps 106.8 ms versus 61.6 ms, and durations 3,545.7 ms versus 3,574.9 ms. Each backend/scenario has one unprofiled sample; no stable 60 FPS claim. Cold and 60day rows remain in `worker/summary.json`, with every original row in gzip archives.

Four unchanged native controls pass in 27.5 seconds: placard material, castle obstruction, name/troop readability and quiet river material. Raw observations are in `visual/`. This is not complete artistic, protected-baseline, colorvision or national-ending acceptance.

The preliminary temporary module-placement run passed, but later Playwright output cleanup replaced its detailed result directory before capture; only its exact build/native logs remain. Final branch snapshots/samples are complete, and sim2 independently preserves complete temporary-control evidence. The first Worker CLI attempt used a nonexistent filename and failed discovery; that log is retained separately from the successful six-test run.

Reproduce the diagnostic with the archived E2E file installed as `e2e/visual.spec.ts`, the standard headless GPU configuration and an isolated built replica:

```sh
VISUAL_GPU=1 VISUAL_HEAP=1 npx playwright test e2e/visual.spec.ts --project=chromium --workers=1 --grep 'renderer remount'
VISUAL_GPU=1 npx playwright test e2e/worker-simulation.spec.ts --project=chromium --workers=1
```

The required plan 18 M6 renderer gate also passes unchanged: 1920×1080, 20 moving render-only armies, 30,016.5 ms of pan/zoom, 1,794 frames and 16.8 ms p95 frame interval (limit 1000/55 ms). The same isolate reports NVIDIA RTX 5070 Ti/Vulkan. The debug fixture renders synthetic armies; this does not prove a canonical live national campaign or the separate 120 army 60 FPS target. The stronger 40 army live diagnostic remains invalid after its legitimate monthly proposal pause; see `../live-close-workload-audit` for the explicit distinction.

Raw gzip files preserve exact bytes; nested manifests record compressed and uncompressed SHA256. Large heaps are included here. Independent native controls and timings ran serially on sim4.
