# Road-label capsule allocation reduction

`dec6b8a` removes temporary axis arrays, corner arrays and Point objects from repeated segment/rectangle distance calculations. It retains the original x-then-y clipping, all six minimum operands in x-major corner order, point/segment arithmetic, validation, radius threshold and epsilon. The test reference matches the original Git blob after only import/export/header normalization.

All 33 related road/geography tests pass. Exact reference comparison covers 600 seeded scenes, 100 radius/epsilon/corner combinations and existing invalid-input guards. Full typecheck, focused ESLint and Prettier pass. Raw local logs and source identity are preserved separately from native timing.

[Native validation](native-README.md) preserves all nine complete published-view/canonical/label/art geometry observations exactly against `8cdd7db`. On the same isolated GPU and unchanged dependency bytes, close renderer FPS improves 18.49→23.99 and p95 interval 70.3→50.4 ms; operational 42.98→42.81 is not a gain. All strict 60 FPS controls still fail. These are single-sample paused-strategy renderer controls, not a live-campaign or physical-display benchmark.

The local current Pixi cache patches are outside that isolated native comparison. Their separate parser/lifecycle/remount controls remain valid within their own scope. This package does not establish combined current native 60 FPS, protected baseline approval, whole-heap stability or complete game acceptance. Raw gzip artifacts preserve exact original bytes, with compressed/uncompressed SHA256.
