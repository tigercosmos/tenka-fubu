# M6-V11 Blob transport controls on sim2

The original native renderer lost elevated, foothill, and projected canopy resources after 41 remount calls.
The shared loader preference correction passed two independent 130-remount controls on sim2.
The second control used the exact loader from `2cfb2d6` and omitted explicit garbage collection between remounts.
This evidence directory changes no production source, tests, screenshot baselines, or thresholds.

## Original failure

The original trace contains 12 PNG requests with status 200 and nested `net::ERR_FAILED` errors.
Their body sizes and receive timings are unavailable.
Failures affected terrain and model textures in the same final acquisition cohort.
The renderer reported `Elevated terrain ground texture unavailable` before creating elevated surfaces.
The loader has no acquisition timeout or fixed attempt limit.

[Parsed failed records](original-failed-network-records.json.gz), [native log](original-red-extended-remount-native.log.gz), and [error context](original-red-error-context.md.gz) retain the RED evidence.
[Original trace metadata](external-original-trace.json) records its external path and SHA-256.
The trace does not show browser Blob internals or disk paging.

## Transport controls

Each standalone control used a fresh headless Chromium process and 28 original PNG URLs.
Each wave read 54,550,599 encoded bytes.
Controls ran serially within sim2, without a profiler.
These controls test acquisition and resource lifetime without the renderer.

| Control                                   | Operations | Failed operations | First failing wave | Qualification                                    |
| ----------------------------------------- | ---------: | ----------------: | -----------------: | ------------------------------------------------ |
| Blob only, trace off, cache off           |      1,960 |               855 |                 40 | Valid plain-message control                      |
| Blob only, trace off, cache on            |      1,960 |               851 |                 40 | Valid plain-message control                      |
| Blob only, trace on, cache off            |      1,960 |               855 |                 40 | Valid plain-message control                      |
| Blob only, trace on, cache on             |      1,960 |               853 |                 40 | Valid plain-message control                      |
| Blob only, explicit Worker GC             |      1,960 |                 0 |                  — | Each image Worker collected after each wave      |
| Bitmap transfer with explicit close       |      1,960 |               855 |                 40 | Receiver owns and closes the bitmap              |
| Bitmap transfer with ordinary page GC     |      1,960 |               855 |                 40 | Page GC does not collect image Workers           |
| Blob only, ordinary page GC               |      1,960 |               855 |                 40 | No bitmap creation or transfer                   |
| ArrayBuffer only                          |      1,960 |                 0 |                  — | No image decoding; not a production fix          |
| ArrayBuffer → Blob → bitmap               |      1,960 |               842 |                 10 | Temporary recovery; unreliable alternative       |
| Main-thread Blob → bitmap, close, page GC |      3,360 |                 0 |                  — | Standalone acquisition control                   |
| HTMLImageElement.decode                   |      3,360 |               248 |                  7 | EncodingError; differs from pinned parser onload |
| Blob only, FD diagnostic                  |      1,960 |               854 |                 40 | Chromium FD limit was 1,048,576                  |

The four valid matrix controls fail without bitmap creation, renderer calls, HTTP caching, or Playwright tracing.
Explicit Worker garbage collection prevents the standalone Blob failure.
Closing transferred bitmaps does not prevent it.
The FD diagnostic found browser, renderer, and network counts of 128, 42, and 38 near the failure boundary.

The first 39 complete waves read 2,127,473,361 bytes, approximately 1.98 GiB.
[Chromium's Blob documentation](https://chromium.googlesource.com/chromium/src/+/HEAD/storage/browser/blob/README.md) describes a 2 GB memory limit on x64 and disk paging.
That threshold supports a quota inference; this experiment does not prove the runtime quota or paging behavior.
[Primary source metadata](primary-source.json.gz) preserves the fetched document hash and its unpinned HEAD qualification.

The initial four transfer probes are rejected because their transfer lists omitted the bitmap from the message fields.
The receiver could not own or close that bitmap.
Those probes failed 854, 855, 854, and 852 operations, respectively.
Their raw files remain available, but they support no production-equivalence claim.
[All control rows](matrix-summary.json) distinguish rejected probes, accepted diagnostics, and native controls.

## Native renderer controls

Both native controls performed 10 warmup remounts and 120 measured remounts, using one Playwright worker.
Both retained resource equality, one-canvas checks, cache equality, zero context losses, and boundary heap snapshots.
The existing 180,000 ms test timeout remained unchanged.
The simulation Worker, decoder choice, texture bytes, and render behavior remained unchanged.

| Native control               | Result            | Explicit GC between remounts | Heap samples | First / last sampled bytes |
| ---------------------------- | ----------------- | ---------------------------- | -----------: | -------------------------: |
| Temporary module preference  | PASS, 2.3 minutes | Yes                          |          121 |    20,746,244 / 25,265,636 |
| Formal loader from `2cfb2d6` | PASS, 2.2 minutes | No                           |          121 |    21,855,588 / 30,889,264 |

Both controls started and ended with 10 font atlas canvases, 16 canvas contexts, and 60 bitmap texts.
The module control preserves complete detailed evidence from the first temporary preference change.
The formal control removes only `sampleHeap`'s explicit garbage-collection call; its patch is archived separately.
Boundary heap snapshots remained enabled in both controls.
The sampled heap sizes do not establish whole-heap stability, FPS, or universal performance improvement.

[Module log](native-module-native-120.log.gz) and [121 samples](native-module-remount-heap-samples.json.gz) retain the first GREEN result.
[Formal automatic-GC log](automatic-gc-native-120.log.gz) and [121 samples](automatic-gc-remount-heap-samples.json.gz) retain the independent second result.
[Summary](summary.json) records the unchanged cache counters and acceptance limits.

## Provenance and storage

[Reproducer metadata](reproducer.json) records the frozen source archive, commands, runtime versions, remote paths, and exact diagnostic changes.
The formal loader hash matches the archived source from `2cfb2d6`.
Raw scripts, logs, source copies, patches, JSON rows, and samples were compressed before formatting derived metadata.
[Manifest](manifest.json) records compressed and uncompressed SHA-256 values and byte counts for every raw file.
All manifest hashes were checked after copying this directory into the repository.

[External snapshot metadata](external-snapshots.json) records all four complete native boundary snapshots and both checksum forms.
Large traces, heap snapshots, source archives, and HTML reports remain outside this bounded commit.
The standalone trace hashes and exact source patch hashes are included as compressed raw logs.
Parent completion records and final production adoption evidence remain separately owned.
