# Geographic preparation capacity evidence

The nine original native snapshots give a maximum frame-plus-preparation requirement of 4,376 f64 words, or 35,008 bytes. It occurs at day 1 close view with 386 ordinary rectangles, 237 hard rectangles, and 112 admitted candidates (95 districts and 17 roads). These are actual geographic diagnostic inputs, not the world's 344 districts or final visible labels.

The ordinary filter excludes only `hud` and `canvasEdge`. Hard inputs include `castle`, `castleBody`, `castleDurability`, `castleWarning`, `hud`, and `canvasEdge`. Every `geographic.labels` entry represents an admitted input candidate, including final priority-hidden labels. The complete original nine payload remains pinned to SHA256 `af4ddbc9c9232041f23b3cd37fdb802681d1ffce7a4709eaa7dc5031f6cebe29`. Full geographic objects are extracted and explicitly named as decoded data; no diagnostic field or new counter exclusion is removed.

| Valid scene                 | Ordinary P | Hard H | Candidate C | Frame words | Prep capacity | Total words |     Bytes |
| --------------------------- | ---------: | -----: | ----------: | ----------: | ------------: | ----------: | --------: |
| Actual native maximum       |        386 |    237 |         112 |       2,956 |         1,420 |       4,376 |    35,008 |
| 8,192 distant reservations  |      8,192 |      0 |           1 |      32,788 |        16,447 |      49,235 |   393,880 |
| 32,768 distant reservations |     32,768 |      0 |           1 |     131,092 |        65,599 |     196,691 | 1,573,528 |

The two large scenes execute the original `fc464a4` JavaScript and existing frozen reference, with complete preparation fields and winner matching by float64 bits. Their full input/result arrays and producer source are archived. No new Rust implementation, GPU, or timing supplies these results. The existing 1,963 valid original oracle frames also have their largest requirement at the 8,192-reservation scene; the original producer's final packaging RED remains unchanged.

The formulas are `frameWords = 16 + 4(P+H+C)` and `prepCapacity = 62 + 2P + 2H + C`. The retained allocation guard uses `max(newFrameWords, oldFrameCapacity) + max(newPrepCapacity, oldPrepCapacity)`. Replaying the nine captured input counts in original order yields the same 4,376-word high-water target. The formula is a conservative bound for near-index and axis storage, not a semantic input-count limit.

A proposed 131,072-word policy is exactly 1,048,576 bytes (1 MiB). It is 29.952 times the observed native maximum and 2.662 times the valid 8,192-reservation requirement. It would select capacity mode for the valid 32,768-reservation scene, preserving original JavaScript preparation and the original Rust scorer. This mode choice is a policy inference from counts, not an observed adapter execution, a malformed-input fallback, or a new geometric domain rejection. Both modes still require actual compiled parity tests before adoption.

The policy counts only retained frame/prep arenas. It excludes road and legacy scorer arenas, temporary old/new allocation overlap, WASM page/allocator overhead, and JavaScript objects, signatures, and copied indices. Exact road-capsule counts are not exposed by the archived native geographic diagnostics. The existing valid-road safety rule permits at most 255 capsules, implying a separate maximum road packet of 1,283 words or 10,264 bytes; ordinary no-winner guards for invalid road structure must precede bulk allocation.

Frozen renderer source, the uncommitted adapter bytes read during counting, counts producer, complete native geographic data, complete large-scene bit arrays, and original output logs are preserved with dual raw/gzip hashes. Source-at-counting is a provenance record and does not freeze the adapter for benchmarking. Extract `verify-evidence.py.gz` and run it with this directory to check all bytes and independently recalculate the counts and memory formulas.
