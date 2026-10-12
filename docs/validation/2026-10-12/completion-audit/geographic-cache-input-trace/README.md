# Geographic cache input diagnostic

Two separately authorized traces explain why a paused simulation can miss the geographic placement cache. These are instrumented diagnostics, not FPS acceptance measurements or performance claims. Production sources were not edited.

The first trace observes a settled close scene without the moving-view workload. Its 20 outer signatures are byte-identical; layout runs remain 13 and cache counters remain 514 computed / 10 reused. The outer guard never invokes the inner layouter. This raw does not expose a direct camera snapshot.

The second trace invokes the original `measureNationalMapFrames('close', 1000)` once, the minimum legal diagnostic window. `mapFrameMeasurement.ts` changes the renderer's army `edgeT` and camera on each animation frame even while the simulation driver is paused. All 20 observed outer signatures differ. Among 2,128 inner visits, 20 hit and 2,108 miss. Of the misses, 1,761 change near rows; 347 (16.46%) change only directions/axes, with 161 previous cached offsets at `(0,0)`. A previous zero offset does not establish zero score or continued optimality.

The candidate rect, road line, and capsules do not change in these inner keys. Moving army body/plate x/y dominate outer field changes; some obstacle membership/order also changes. The full consecutive diffs retain numbers and their parsed float64 bits. Camera snapshots show actual transient movement. Original workload cleanup restores the initial camera, so equal endpoints alone would conceal that movement. Core canonical state is byte-identical and driver ticks stay zero in both traces.

The 20-call hook and the full one-second counter bracket have different scopes. Wider second-trace counters are 496/10 to 4,160/42; their deltas must not be equated to the bounded inner visits. JSON signatures cannot recover pre-JSON signed-zero or NaN distinctions. This evidence does not establish a safe numeric memoization or cache certificate.

The isolated fork copies frozen f898 sources and shared current23 dependencies, then overlays three default-scalar policy files from a357 and the two diagnostic hooks. `source-proof.json.gz` and `moving-source-proof.json.gz` bind originals to Git blobs and record patched hashes. Original MapRenderer is byte-identical at f898/a357. Full original/patched source bodies, observers, runners, field-diff producer, logs, and both complete raw traces are gzip-preserved with compressed/raw SHA256 in `manifest.json`. No new dependency validation or native acceptance campaign is claimed here.

The first build launch failed before a browser started because Node was absent from PATH (127); its original error log is retained. The Python runner supplies the existing Node path. Both subsequent build/observer stages exited zero. The second trace is a distinct moving-view diagnostic, not a retry of the static trace.

Verify with `python3 verify.py <package-directory>`. Original remote evidence directories are `/tmp/tenka-geographic-input-trace-evidence` and `/tmp/tenka-geographic-input-trace-moving-evidence` on sim3. Full local original paths are listed in the manifest.
