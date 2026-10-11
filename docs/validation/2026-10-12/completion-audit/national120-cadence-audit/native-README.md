# National120 cadence method audit

The blank hardware control observes about 60 Hz; it does not establish game acceptance or a hard scheduling ceiling.
The same headless Chrome 149, Vulkan, viewport, DPR, and trace settings apply to the game controls.
The visible 1920×1080 canvas clears through actual NVIDIA RTX 5070 Ti WebGL rendering without loading the game.

Over 30.015 seconds, 1801 callbacks produce 60.003 average FPS.
Both scheduler timestamp and post-clear frame-time p95 are 16.8 ms.
The mean 60 FPS probe passes; the derived p95≤1000/60 probe fails.
No game code, artist channel, or performance threshold changes in this control.

[Plan04 §3.10](../../../../../plan/04-map-and-movement.md) states stable 60 FPS for the approximate 500-node/120-army/700-edge national workload at 1080p.
It does not define a p95 metric.
Its older T11 acceptance uses 55 FPS for generated 500-node/120-army data.
[Plan17 §3.9.2–3.9.3](../../../../../plan/17-testing.md) uses 55 FPS and an explicit p95≤1000/55 condition for the separate 20-army scope.

The national 40 and 120 tests interpret the nominal 60 target conservatively as mean≥60 and frame-time p95≤1000/60.
The p95 condition is an additional measurement method, not a literal definition in Plan04 §3.10.
This audit preserves those gates and their failures.
The close game control remains substantially below the nominal 60 target regardless of this method distinction.

Two separate 10-second close CPU captures follow the timing controls.
The second adds exact canonical and resource hashes to the observer output; the first remains preserved.
Both use the unchanged capsule build and preserve canonical state and resource counts.
The recorded hashes match the actual before and after frame-window hashes in the capsule evidence.

The final close profile samples 10.299 seconds across 240 completed renders.
Geographic layout accounts for 3.527 seconds inclusive; castle ribbon layout accounts for 2.094 seconds inclusive.
These sampled costs identify further work and do not supply acceptance FPS.

`native-summary.json` records exact metrics, authority locations, limitations, and raw uncompressed hashes.
Gzip files preserve cadence intervals, both profiles, scripts, and logs.
The native transfer manifest records the remote blank-control trace hash and path.
