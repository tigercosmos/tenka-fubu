# Pinned image parser preference regression

Commit `29da33d` adds three cases against the real Pixi 8.19.0 texture parser.
The tests use controlled fetch and bitmap decoding with real Texture and ImageSource objects.
Both local and sim3 GREEN runs pass all three cases.
ESLint and the full project typecheck pass.

The positive control enables worker preference and verifies worker routing.
The two GREEN cases disable worker preference and verify asynchronous main-thread fetch and decoding.
They preserve bitmap identity, resolution, mipmap options, alpha handling, texture dimensions, and unload ownership.
Neither worker support probing nor worker decoding runs in the GREEN cases.

The isolated RED control changes only the test preference from false to true.
Both main-fetch assertions fail because the worker route bypasses main fetch.
The positive worker control still passes.
This mutation tests regression sensitivity; it does not assert a failure in unchanged production code.
The accepted test bytes are restored before the sim3 GREEN run.

`summary.json` records versions, source hashes, results, and uncompressed hashes for the gzip logs.
The decoder stub does not prove browser pixel decoding, memory stability, or performance.
Separate native tests supply browser decoding acceptance.

The pinned [texture parser](https://raw.githubusercontent.com/pixijs/pixijs/v8.19.0/src/assets/loader/parsers/textures/loadTextures.ts)
selects the worker path through `preferWorkers` and retains the main bitmap path otherwise.
[Assets.setPreferences](https://raw.githubusercontent.com/pixijs/pixijs/v8.19.0/src/assets/Assets.ts)
updates registered parser configuration.
The [WorkerManager](https://raw.githubusercontent.com/pixijs/pixijs/v8.19.0/src/assets/loader/workers/WorkerManager.ts)
provides the separate support probe and image decode operations observed by the tests.
