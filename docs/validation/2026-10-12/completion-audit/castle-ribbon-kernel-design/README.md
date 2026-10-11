# Castle ribbon kernel boundary design

The next candidate is the complete pure `layoutCastleRibbons` solve, not its overlap helper alone.
The existing geographic WASM close profile attributes 2.141 seconds inclusive to this function across 243 completed renders.
That is 8.809 ms per render; its self samples account for 6.577 ms per render.
The smaller overlap helper accounts for 1.534 ms per render of self samples.
These samples identify a boundary to evaluate; they do not predict a speedup.

The remaining geographic layout costs 14.590 ms per render inclusive, including existing Rust execution.
Its `edgeAxis` accounts for 3.891 ms per render inclusive.
Moving only that helper would introduce another ABI crossing without covering the larger castle solve.
The first proposed migration therefore retains the complete castle solve in one synchronous renderer-owned Rust call.
Compact admission, Pixi measurements, the current signature cache, and painting remain in JavaScript.

## Approved numeric contract

The proposed `castle_ribbon_solve(pointer, words)` uses the existing float64 allocator arena.
Success returns the candidate count; malformed input returns `-2`.
Work exhaustion remains a normal placement result with the original budget flags.
A separate `castle_ribbon_abi_version()` returns `1`.

The header contains 16 float64 words: version, candidate count, ordinary count, hard count, leader count, output row width, output work, and nine reserved zeros.
The version is 1, output row width is 16, and initial output work is zero.
Each candidate uses eight words: baseline rectangle, anchor pair, leader start, and leader count.
Ordinary, hard, and leader rectangles each use four words.
Leader rectangles remain independent because the public function permits leaders outside the hard list.
Outputs immediately follow all inputs.

Each output row preserves these 16 fields in order:
`offset.x`, `offset.y`, rectangle x/y/width/height, final overlap, final baseline overlap, unresolved, tried placements, budget limited, leader start x/y, leader end x/y, and leader visibility.
Header word 6 returns total work; the caller invokes the existing `onWork` callback once after decoding.

JavaScript retains the current validation and candidate priority/UTF16 ID sorting.
It also retains the stable ordinary-rectangle sort; hard and leader ordering remain untouched.
Rust retains every axis proposal, disk proposal, guard, proposal charge, comparison, and final diagnostic reduction.
No zero-objective fast path, new cache, or reduced diagnostic work applies.

Float64 arithmetic must preserve operand and reduction order without reassociation or fused operations.
Axis sets use SameValueZero and canonicalize negative zero to positive zero.
Offset pairs preserve first insertion order while replacing duplicate values with the last occurrence.
The two clipping axes stay in x-then-y order; all min/max operations preserve JavaScript NaN and signed-zero behavior.
Invalid nonfinite anchors remain rejected; valid large finite anchors remain supported.
The original rectangle guard still requires coordinates within 1e9 and positive dimensions at most 4096.

## Data and ownership

One retained settled close observation contains 64 ribbon candidates, 168 ordinary rectangles, and 341 hard rectangles.
It records 341 obstacle entries in total; some participate in both hard and ordinary scoring.
The base input arena is 20512 bytes plus 32 bytes per leader rectangle; outputs use 8192 bytes.
The raw observer does not record leader-list counts, so their actual packet size is unknown.
The full admitted-input maximum, including output, is 245888 bytes.

The current cache belongs to `MapRenderer` and compares the original input and compact-context signatures.
A hit keeps the previous complete placements and avoids solving.
A miss passes one immutable numeric snapshot to its own Rust instance.
The kernel has no cross-request cache or shared game state.
Destroy releases that owner's arena and prevents late publication.

## Worker follow-up boundary

A dedicated layout Worker could remove planning from the main thread while drawing continues.
It must consume one coherent frame input and return one complete annotation bundle.
The current order is castle seed plates, castle solve/admission, seed plate publication, then geographic placement and visibility decisions.
Geographic blockers depend on resolved ribbons and plates, so those stages cannot become independent concurrent jobs.
Glyph measurements stay on the main owner; their numeric results and the exact affine operand order must enter the planning snapshot.

Requests need owner epoch, monotonically increasing revision, camera/LOD, viewport, asset/paint, HUD, selection, and geometry revisions.
At most one request is in flight and one latest unsent input is retained.
Replaced inputs and destroyed owners must release buffers and reject pending settlement waits.
A result cannot apply old offsets to newly positioned armies, camera transforms, or glyph bounds.

The retained performance workload changes every army fraction and camera pose on every rAF.
Dropping every reply whose geometry revision is already older would starve a planner that takes longer than a frame.
A usable asynchronous design must atomically publish the corresponding complete geometry bundle, with an explicit presentation-latency contract.
Alternatively it can serve only periods where the complete collision signature remains unchanged.
Coalescing alone does not resolve this choice or guarantee 60 FPS.
Structured clone, buffer packing, publication, and rendering costs require separate later validation.

`design.json` records exact profile costs, source locations, packet bounds, and the approved ABI.
This step is read-only research; implementation starts in an isolated temporary Rust crate.
