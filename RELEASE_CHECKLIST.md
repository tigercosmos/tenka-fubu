# Release checklist

This checklist does not certify a release. All boxes remain unchecked until the release candidate has matching evidence.

Requirements: [17 testing](plan/17-testing.md), [18 roadmap](plan/18-roadmap.md),
[15 balance](plan/15-balance.md), and [01 architecture](plan/01-architecture.md).
The current [milestone](milestone.json) remains M6; implementation progress does not advance that marker automatically.

## Candidate and evidence

- [ ] Record the candidate commit, version, date, Node version, operating system, browser, renderer backend, and hardware.
- [ ] Attach raw logs, failures, screenshots, traces, coverage, benchmark samples, and simulation outputs to the release review.
- [ ] Record each command and environment setting with its result.
- [ ] Distinguish production journeys from synthetic fixtures and debug prerequisite setups.
- [ ] Preserve unsuccessful runs; do not count skipped tests as passes.
- [ ] Resolve all release blockers before marking the remaining boxes.

## Current blockers and evidence boundaries

These observations identify unfinished work, not permanent acceptance waivers.
Local `/tmp` evidence is not a durable release artifact; attach it before using it in a release review.

Direct CLI headless Chromium passes both title-load and new-game smoke cases in 2.3 seconds.
The configuration enables headless mode and disables automatic report opening; no Chrome plugin or visible browser is used.
Artifacts: `/private/tmp/tenka-direct-headless-smoke-20261010/`.

The 2026-10-11 complete native run reports 135 passed, five failed and thirteen skipped in 4.6 minutes.
All 153 cases use direct CLI headless Chromium; the existing sixty-second case and five-minute suite deadlines remain unchanged.
The retained built bundle hashes match after the run.
Log: `/tmp/tenka-current-whole-native-20261011.log`; report: `/tmp/tenka-current-whole-native-report-20261011/`.
Failures include three castle-focus observations, the sixty-day Court journey deadline, and the protected camera screenshot baselines.

The three focus tests incorrectly reconstruct the world anchor from locally displaced castle ribbons.
They now observe the actual castle model anchor and retain the one-pixel focus limit and independent HUD-clearance assertions.
Independent original PNG frame dimensions and ground anchors still determine the inspector artwork envelope.
All three cases pass against the same prior built bundle in twenty seconds, without a production camera change.
Log: `/tmp/tenka-model-anchor-native-20261011.log`; report: `/tmp/tenka-model-anchor-native-report-20261011/`.
This narrow result does not clear the Court deadline or protected screenshot gate.

Complete coverage reports 5587 passed, ten failed and one skipped across 559 files in 184.51 seconds.
Core line coverage is 94.81 percent; branch coverage is 91.18 percent.
Eight failures concern core compatibility or national invariants; two concern notification callback timing observations.
Coverage percentages do not clear these failed tests.
Log: `/tmp/tenka-current-whole-game-coverage-20261011.log`.

Lint, normal/core types, data validation and asset validation pass for that prior frozen source candidate.
New town geometry and deterministic notification tests require a separate candidate and fresh checks.

The notification investigation observes the original callback firing with the correct identifier after its unchanged three-hundred-millisecond exit timer.
Host scheduling delays the next assertion poll; the trace shows neither premature cancellation nor a callback ownership defect.
Only two routing tests now use a test-owned clock, with no callback at 299 milliseconds and exactly one correct callback at 300.
All eighty MainScreen and ReportStack cases pass; focused V8 verification also passes eighteen cases.
Production notification behavior remains unchanged; complete candidate coverage remains pending.
Logs: `/tmp/tenka-current-toast-timer-trace-v8.log` and `/tmp/tenka-routing-exit-clock-full-compat.log`.

The first town candidate passes 169 focused cases, types, lint and build.
Its native run passes five existing castle and focus controls but fails the new town material gate.
All four retained views contain zero houses: thirty-six proposed positions fail geographic clearance, without reaching the geometry capacity limit.
This failure remains a production presentation blocker; unit draw commands do not prove visible town architecture.
The 205 protected core/data files and six camera baseline PNGs retain their earlier hashes.
Log: `/tmp/tenka-town-material-native-20261011.log`; raw images and trace: `/tmp/tenka-town-material-native-20261011/`.

Complete coverage for that frozen town candidate reports 5597 passed, eight failed and one skipped in 183.65 seconds across 560 files.
All 1275 source hashes match after the run; both notification routing cases pass under the unchanged coverage gate.
The eight core compatibility and national invariant failures remain unresolved.
Log: `/tmp/tenka-town-material-whole-coverage-20261011.log`.
This result precedes the clearance-aware town placement correction; it does not certify the next candidate.

The revised placement follows actual road stations and tangents, with setbacks derived from castle reserves and full house footprints.
It rejects origins beyond eighty world units and retains all earlier geographic guards and capacity limits.
The preserved compact-map regression fails before repair; 172 focused cases pass after repair, with types, lint, formatting and build.
Logs: `/tmp/tenka-town-compact-red.log` and `/tmp/tenka-town-clearance-final-focused.log`.

The revised native run observes ten houses and passes all full-footprint geographic checks and five existing castle/focus controls.
The town material case still fails because its mid-view sample eligibility finds no entire unobscured house with valid centroid pixels.
This failure does not prove a production color defect; per-pixel geometry and overlay checks remain pending.
Log: `/tmp/tenka-town-grounded-final-native-20261011.log`; all four view images and raw observations remain preserved.

The isolated twenty-army 1080p workload passes on direct headless Chromium with the Apple M3 Max Metal renderer.
It records 1992 frames over 30008.5 milliseconds, with frame-time P95 of 18.1 milliseconds and unchanged resource observations.
The existing limit remains 1000/55 milliseconds; the passing run has little margin and does not establish a speedup.
Both performance flags use one worker after all other CPU and browser jobs finish.
Log: `/tmp/tenka-town-grounded-final-perf-20261011.log`; raw measurements: `/tmp/tenka-town-grounded-final-perf-20261011/`.
This single reference case does not prove forty-army national performance, heap safety or complete art acceptance.

The final town observer selects interior pixels by geometry before reading their colors and excludes actual overlay and later-facet coverage.
It proves visible roof and wall channels per view; separate houses can supply these channels, without a whole-house visibility claim.
All four Sunpu/Kiyosu views pass, with ten safe houses, unchanged contrast thresholds, idle stability, state purity and actual castle picking.
The previous zero-house and centroid/whole-footprint observer failures remain preserved.

The Court helper now returns only a scalar day for four day-only reads, instead of transferring the full national state.
Full post-day state, every daily invariant, exact increments, native inputs, ledgers and existing deadlines remain unchanged.
The sixty-day Court journey passes in twenty-eight seconds; this is not a controlled speedup measurement or parallel-load deadline proof.
Both direct-headless cases pass in 45.9 seconds with one worker.
Log: `/tmp/tenka-town-observed-final-native-20261011.log`; report: `/tmp/tenka-town-observed-final-native-report-20261011/`.

All 1275 final source hashes match before the complete native rerun.
Only the two native test files differ from the passing GPU candidate; production rendering and assets retain that candidate's hashes.
Full lint, normal/core types, data validation and asset validation pass; bundle output also passes before the test-only observer changes.
Full coverage for the latest placement remains pending; the complete native result follows below.

The complete final native run reports 140 passed, one failed and thirteen skipped in 4.3 minutes across all 154 cases.
All 1275 source hashes and built bundle hashes match afterward; all case and suite deadlines remain unchanged.
The Court journey passes under six-worker load in 55.5 seconds; the town material case passes in 25.4 seconds.
The only failure is the protected three-camera screenshot baseline; no expected PNG changes or skipped-case acceptance waivers occur.
Log: `/tmp/tenka-town-observed-whole-native-20261011.log`; report: `/tmp/tenka-town-observed-whole-native-report-20261011/`.

Read-only image review still finds two Sunpu roofs near the Akaishi ridge, above mountain/woodland artwork.
Current town admission checks geographic land, water, roads and nodes, but does not protect elevated ridge terrain.
This is a remaining visual-grounding gap, separate from the ten houses' passing geographic clearance certificates.
Native pixel channels and automated pass counts do not clear complete art acceptance.
Terrain-aware lot admission remains pending; it must retain visible legal foothill houses rather than remove every town.

A read-only probe uses authored mountain masses and the actual eighteen-world ridge width, without changing existing geographic guards.
It rejects four crest-crossing lots and retains six houses: three at Gifu, two at Kiyosu and one at Sunpu.
The rule checks separate mass and ridge-capsule intersections; this conservative rule does not prove their exact shared intersection.
Log: `/tmp/tenka-town-crest-audit.log`; this probe does not prove production integration or native pixels.

The unchanged old bundle fails the new compact count control: ten houses remain; the control expects six crest-safe houses.
All four raw views and screenshots precede that failure; later crest, pixel and picking assertions do not run.
Log: `/tmp/tenka-town-crest-old-dist-red-20261011.log`; no screenshot baseline changes occur.

The national probe retains 104 crest-safe houses, including one at Kiyosu; Sunpu has no accepted position in the existing twelve-slot lattice.
Its sole previously legal lot contains an Akaishi ridge point inside both the house envelope and mountain mass.
The sixty-world station probe still finds no Sunpu lot; an outward-setback experiment changes national placement substantially and remains unapproved.
These finite probes do not prove that every possible Sunpu position is unsafe.
Logs: `/tmp/tenka-town-normal-crest-audit.log`, `/tmp/tenka-town-normal-crest-station60.log`, `/tmp/tenka-town-normal-crest-outward-probe.log`.

The integrated crest candidate passes 173 focused tests, normal/core types, full lint and the bundle build.
Its five-file native collection reports seven passes and one failure in 55.7 seconds with six workers.
The town case fails at Sunpu mid: army.000006's plate covers all nine otherwise eligible wall pixels; both roof channels remain visible.
All four raw views and screenshots precede the failure; no pixel thresholds or overlay guards change.
Log: `/tmp/tenka-town-crest-final-native-20261011.log`; complete native acceptance remains pending for this candidate.

Parallel coverage reports 5594 passed, fifteen failed and one skipped across 5610 cases in 163.45 seconds.
Eight failures match protected core compatibility and succession blockers; seven App/UI cases exceed their unchanged five-second deadlines.
Core coverage remains 94.81 percent statements/lines, 91.18 percent branches and 98.47 percent functions; this does not measure complete UI coverage.
All 1275 source hashes and built bundle hashes match afterward.
Log: `/tmp/tenka-town-crest-final-coverage-20261011.log`; isolated reproduction of the seven timeouts remains pending.

All seven timeout cases pass with isolated V8 coverage, one worker and the same five-second deadlines in 21.62 seconds.
The filter excludes ninety-four other cases; this rerun does not clear the failed complete parallel run.
Log: `/tmp/tenka-town-crest-coverage-timeouts-isolated-20261011.log`; no source changes occur between these runs.

The separate wall-orientation fix selects world-south-facing walls in all four road quadrants, instead of fixed local positive-axis walls.
It retains house feet, roof geometry, complete footprints, heights, placement, counts and draw resources.
The old wall-selection control fails; the corrected geometry and draw collection passes twenty-nine tests, normal/core types, lint and formatting.
Logs: `/tmp/tenka-town-facing-wall-{red,green,types,lint,format-check}.log`; this fix does not yet prove relief from actual army-plate occlusion.

A read-only MID probe confirms army.000006 is an ordinary, unselected candidate, not a locked selection.
An upward move of twenty-four CSS pixels clears its town-model overlap without increasing any original fixed, text, pair or tether overlap.
The other plates, canvas visibility, HUD clearance and existing radius cap remain unchanged.
Log: `/tmp/tenka-town-soft-seed-feasibility.log`; this numeric probe does not prove production integration or native pixels.

The staged, world-facing candidate passes 220 focused tests, current normal/core types, full lint and the bundle build.
All fifteen direct-headless native cases pass in 40.4 seconds with six workers, including unchanged castle-text and army-layout controls.
All four town views retain six crest-safe houses and genuinely exposed roof/wall channels with unchanged contrast and overlay guards.
Sunpu mid's army.000006 plate moves upward twenty-four CSS pixels; its world anchor remains unchanged.
Source and built bundle hashes match; browser processes use headless and no-startup-window flags, without the Chrome plugin.
Log: `/tmp/tenka-town-visible-final-native-20261011.log`; report: `/tmp/tenka-town-visible-final-native-report-20261011/`.

The isolated 1080p GPU case still fails its unchanged frame-time limit: P95 is 18.2 milliseconds, against 18.1818 milliseconds.
It captures 1992 frames over 30007.8 milliseconds on Apple M3 Max Metal; this is not a passing performance result.
The raw resource snapshots match independently, but the failure precedes the test's resource-equality assertion.
Log: `/tmp/tenka-town-visible-final-perf-20261011.log`; current performance acceptance and complete art acceptance remain open.

The next candidate caches frozen roof/wall world extrema once per town build and clears them on replacement, null and destroy.
Projection preserves the original arithmetic, viewport filtering and visible material bounds without changing solver policy.
It passes 221 focused tests, normal/core types, scoped lint, formatting and the bundle build.
All fifteen direct-headless native cases pass in 39.2 seconds; source and built bundle hashes match afterward.
Logs: `/tmp/tenka-town-world-bounds-*.log` and `/tmp/tenka-town-visible-cached-{focused,native}-20261011.log`.

The cached candidate's isolated GPU case also fails: frame-time P95 remains 18.2 milliseconds against the unchanged 18.1818-millisecond limit.
It captures 1975 frames over 30000.1 milliseconds; CPU-update P95 is 2.3 milliseconds on Apple M3 Max Metal.
Raw resource snapshots match independently; this run does not prove a speedup or passing performance acceptance.
Log: `/tmp/tenka-town-visible-cached-perf-20261011.log`; complete art acceptance remains open.

The next candidate reuses one fresh army-input snapshot within each ribbon pass instead of collecting the same bounds twice.
Observer calls and later layout stages still collect fresh inputs; signature contents remain unchanged.
The deterministic call-count control fails on two old calls and passes on one new call.
It passes 222 focused tests, normal/core types, scoped lint, formatting, the bundle build and fifteen direct-headless native cases in 38.7 seconds.
Source and built bundle hashes match afterward; this proves unchanged tested output, not a performance improvement.
Logs: `/tmp/tenka-town-single-snapshot-*.log`; native report: `/tmp/tenka-town-single-snapshot-native-report-20261011/`.

This candidate passes the unchanged isolated 1080p, twenty-army, thirty-second GPU case in 32.3 seconds.
Frame-time P95 is 18.1 milliseconds against 18.1818 milliseconds; CPU-update P95 remains 2.3 milliseconds.
It captures 1984 frames over 30003.9 milliseconds on Apple M3 Max Metal, with matching resource snapshots.
Source and built bundle hashes match afterward; earlier failures remain preserved for their different candidates.
This single passing result has little margin and does not establish a causal speedup or complete game acceptance.
Log: `/tmp/tenka-town-single-snapshot-perf-20261011.log`; the prepared CPU profiler remains unexecuted.

The complete coverage run for this candidate reports 5611 passed, eight failed and one skipped across 560 files in 122.43 seconds.
Core line coverage remains 94.81 percent and branch coverage remains 91.18 percent; these percentages do not clear the failures.
The eight failures concern battle hashes, five golden suites and two replay fixtures; the national golden fails its day-450 succession invariant.
No UI timeout occurs in this run; source hashes match afterward, without a change to test deadlines.
Log: `/tmp/tenka-single-snapshot-complete-coverage-20261011.log`; full native acceptance remains pending.

The complete direct-headless native run reports 139 passed, two failed and thirteen skipped in 4.2 minutes.
The Court work journey exceeds its unchanged sixty-second deadline; all three protected camera images fail their unchanged screenshot limits.
Source and built bundle hashes match afterward; six browser processes use headless and no-startup-window flags, without the Chrome plugin.
The thirteen skips include cold load, both national forty-army configurations, the national soak and twenty-army performance.
The separate passing twenty-army case does not clear national forty-army acceptance or the failed full suite.
Log: `/tmp/tenka-single-snapshot-whole-native-20261011.log`; report: `/tmp/tenka-single-snapshot-whole-native-report-20261011/`.

The next candidate enables certified Shinano inland curves and transports complete Court snapshots as checked JSON strings.
The integrated unit run passes thirty-seven tests; the build passes and 1277 source hashes match afterward.
Direct headless Chromium passes Court work in 18.2 seconds and the existing Kiso bank case in 7.5 seconds.
The Shinano bank case fails its unchanged pixel-to-geometry tolerance; visible-bank acceptance remains unresolved.
The old bundle separately fails the Shinano visible-bank curvature threshold; both failures remain unresolved.
Log: `/tmp/tenka-shinano-court-native-20261011.log`; the three-case run finishes with two passes and one failure in 32.1 seconds.

The Shinano mismatch comes from a disconnected dark-terrain pixel that satisfies the original water-color classifier.
The corrected oracle selects the continuous classified-water run at the emitted river center, with all original stations, colors and limits unchanged.
It preserves all raw samples and rejects missing, ambiguous, clipped or unclassified center runs.
The old first-to-last oracle fails nine semantic controls; the corrected helper passes twelve controls.
The same built river candidate passes both complete-bank native cases in 19.9 seconds; oracle and bundle hashes match afterward.
Log: `/tmp/tenka-river-associated-native-20261011.log`; this result proves local visible banks, not complete map acceptance.

The next candidate adds an original Echigo massif and an authentic earned-alliance save-continuation case.
Its build, complete lint, asset validation and bundle budgets pass; asset validation reports zero errors and warnings.
The integrated direct-headless run reports three passes and two failures in 1.1 minutes, with matching 1284 source and bundle hashes afterward.
Court work, Kiso banks and the three-massif projection/resource case pass; the earned-alliance restored dialog and Shinano pixel-to-geometry tolerance fail.
The identical Echigo crop shows a broader diagonal landform; this comparison does not clear the remaining bank failure or whole-map acceptance.
Log: `/tmp/tenka-echigo-alliance-native-20261011.log`; prior candidates and their failures remain preserved.

The complete coverage run for this candidate reports 5649 passed, eight failed and one skipped across 563 files in 124.97 seconds.
Core line coverage remains 94.81 percent and branch coverage remains 91.18 percent; the same eight protected core failures remain.
All new unit cases pass, with no UI timeout; the 1284 source hashes match afterward.
Log: `/tmp/tenka-echigo-alliance-complete-coverage-20261011.log`; this run does not clear the failed native journey or full game acceptance.

The next candidate restores valid saved proposal and envoy consent from the existing pending command queue before UI presentation.
It preserves core subjects, command order, RNG and tick execution; stale or wrong-owner intents do not hide current decisions.
Forty-six related tests pass, including ten new consent controls; the fixed-bank predicate passes thirty-five controls.
The integrated direct-headless run passes all five cases in 1.2 minutes, including the unchanged earned-alliance reload and paid-month assertions.
The 1285 source hashes and complete bundle hashes match afterward; full game acceptance remains incomplete.
Log: `/tmp/tenka-consent-cyan-native-20261011.log`; all prior failed candidates remain preserved.

The isolated forty-army overview attempt fails after ten seconds, before its thirty-second measurement starts.
A known proposal dialog arrives between separate visibility reads and the final unknown-owner check; this result contains no FPS measurement.
The source and bundle hashes match afterward; no performance deadline or threshold changes.
Log: `/tmp/tenka-consent-cyan-live40-overview-20261011.log`; national forty-army acceptance remains unresolved.

The warmup oracle now reads late modal ownership atomically; unknown, simultaneous or inconsistent owners still fail.
Fourteen controls pass; this test-only change preserves all native decisions, measurement timing and performance limits.
The next isolated overview attempt fails after 8.7 seconds because army.000022 has no accepted physical reversal.
The 1287 source hashes and unchanged production bundle hashes match afterward; this attempt also ends before FPS measurement.
Log: `/tmp/tenka-live-warmup-overview-20261011.log`; the live-cohort failure requires diagnosis before another attempt.

Canonical day-sixteen reproduction identifies a debug-controller assumption, not a core movement failure.
Army.000022 returns to its source, then spends residual movement on the alternate road; it remains marching with one hundred soldiers.
The controller selects that same alternate destination again and rejects the correct forward plan because it expects a reversal.
Log: `/tmp/tenka-live-army22-readonly-reproduction.log`; the reproduction changes no production files or movement state.

The debug controller now chooses the opposite destination from the actual paid road endpoint.
It captures the first route nodes because a final district destination can lie beyond the first road; unexpected targets or endpoints still fail.
The original failure reproduces in one regression; all ten focused controls pass after the fix.
An ordinary command, AI and authored-event diagnostic reaches day 125 with all forty armies marching and no state-invariant failures.
The actual Okehazama event occurs on day 120 and its existing first choice resolves through the normal queue; the diagnostic injects neither movement nor time.
Logs: `/tmp/tenka-live-opposite-leg-red.log`, `/tmp/tenka-live-opposite-leg-focused-final.log`, `/tmp/tenka-live-opposite-leg-catalog-diagnostic.log`.

The rebuilt direct-headless overview attempt passes the previous army failure and resolves the native historical choice.
It fails after 28.2 seconds before measurement: a proposal-rejection click reports completion, then exceeds its navigation-wait timeout.
All 1287 source hashes and all forty-five built-file hashes match afterward; no FPS result is available.
Log: `/tmp/tenka-live-opposite-overview-20261011.log`; native action completion requires trace diagnosis before another attempt.

The rebuilt candidate passes all five headless integration cases in 1.3 minutes; all forty-five bundle hashes match afterward.
The complete source check does not match: the warmup helper and its unit controls changed during this run under parallel authorization.
Those two test-only paths are outside these five cases; production sources and their compiled bundle remain unchanged, but this is not an all-source frozen run.
Log: `/tmp/tenka-live-opposite-native-20261011.log`; repeatable final-source qualification remains separate.

Trace inspection places the proposal click completion before the timeout; the later DOM has no proposal dialog.
The warmup controls now skip only scheduled-navigation waiting for in-document native clicks; actionability and the 750 ms deadline remain unchanged.
Timeout recovery defers only one registered owner after an atomic read; missing, unknown or simultaneous owners still fail.
The handled-owner artifact records only completed clicks, not deferred attempts; it does not certify core command acceptance by itself.
The local installed Playwright implementation honors the navigation-wait option; the thirty-second frame window and performance limits do not change.

The next isolated overview run captures all thirty seconds on Apple M3 Max Metal but fails the uninterrupted-live requirement.
It starts on day 133; ordinary day-150 proposals open their mandatory modal and pause simulation about 2.1 seconds into the window.
All forty armies remain marching, with no driver failure; the remaining render samples are mostly paused and cannot qualify live performance.
Raw output retains 3521 frames, 117.354 average FPS and 9.6 ms frame-time P95; these are not accepted live-game metrics.
The 1287 source hashes and forty-five bundle hashes match afterward; the measurement bypasses no unknown owner.
Log: `/tmp/tenka-live-native-click-overview-20261011.log`; full observations: `/tmp/tenka-live-native-click-overview-20261011/live-national-map-perf-act-d0da3--choice-full-wall-rendering-chromium/live-national-overview.json`.

Existing settings cannot remove this interruption while retaining mandatory proposal decisions.
The proposal-arrival preference controls only notification pauses; `useM6Dialogs` independently opens each fresh proposal inbox with `pausesTime: true`.
At the existing 120 ms daily cadence, a thirty-second uninterrupted ×5 window crosses multiple month boundaries.
This captured window therefore needs an approved acceptance-protocol decision, not an AI or modal bypass; no protocol change has approval yet.

The complete current-source coverage run finishes with 5706 passed, eight failed and one skipped test across 565 files in 130.90 seconds.
Core statements and lines reach 94.82%, branches 91.20% and functions 98.47%; the same eight protected core and baseline failures remain.
The 1287 source hashes match afterward; whole-project lint and formatting also pass.
Logs: `/tmp/tenka-live-native-click-complete-coverage-20261011.log`, `/tmp/tenka-live-native-click-whole-lint-20261011.log`.

The complete headless browser run finishes with 141 passed, two failed and thirteen skipped cases in 4.3 minutes.
The existing three-camera screenshot comparison still fails against unchanged protected baselines.
A separate emitted-corner check finds a real Shinano regression: the maximum turn is 66.9388 degrees against the unchanged thirty-degree limit.
All 1287 source hashes and forty-five bundle hashes match afterward; the river regression requires diagnosis without changing geography or tolerance.
Log: `/tmp/tenka-live-native-click-whole-native-20261011.log`; the mandatory GPU, cold-load and soak cases remain explicitly skipped in this ordinary run.

Trace geometry locates the Shinano regression at authored anchor (2515, 2310), between natural leg two and the untouched final leg.
The natural geometry replacement discards the previous local corner treatment and restores the raw 66.9388-degree join.
The certified inland curve ends 5.22015 world units before this anchor; a bounded corner repair must preserve that curve and all existing protection checks.

The corner repair now uses only the remaining incoming straight collar and the existing eight-chord interpolation.
It reaches the authored anchor along the untouched outgoing direction, preserving the certified inland curve and the entire final river leg.
The same control-hull and width certificate rejects road, body, other-water and sea-edge conflicts; rejected repairs retain the prior natural geometry.
The actual national-geometry regression reproduces the original failure; all forty-one focused controls pass after repair, including the unchanged thirty-degree join limit.
Normal and core types, scoped lint and formatting pass; native qualification still requires the rebuilt candidate.
Logs: `/tmp/tenka-shinano-junction-red.log`, `/tmp/tenka-shinano-junction-focused-frozen.log`.

The rebuilt corner candidate passes build, whole-project lint, asset checks and bundle budgets.
Its complete headless run again finishes with 141 passed, two failed and thirteen skipped cases in 4.3 minutes.
The actual Shinano corner passes the unchanged limit, and both bank-pixel references pass their guarded observations.
The Shinano case instead fails during renderer-remount comparison: one material bounds rectangle changes from (656, 3418, 86, 153) to (2343, 2758, 39, 135).
The other failure remains the unchanged protected screenshot baselines; all 1287 source hashes and forty-five bundle hashes match afterward.
Log: `/tmp/tenka-river-join-whole-native-20261011.log`; remount diagnostics require diagnosis before acceptance.

The test now attaches browser JSON, structured transport values, consecutive reads and independently calculated raw-point bounds before the original remount assertion.
This test-only instrumentation preserves all pixel, geometry, resource, timeout and equality requirements; production code and bundle stay unchanged.
The isolated instrumented Shinano case passes in 10.7 seconds, with 12.1-second total execution and all 1287 source hashes unchanged afterward.

Both attachments agree across all ten rivers; Chikugo and Fuji retain their separate correct bounds before and after remount.
Materials and resources remain identical: ten textures, ten sources, ten listeners and 1078332 RGBA bytes.
This single consistent run neither explains nor clears the earlier full-run mismatch; that failure remains unresolved.
Log: `/tmp/tenka-river-remount-evidence-20261011.log`; report attachments: `/tmp/tenka-river-remount-evidence-report-20261011/index.html`.

The six-context stress diagnostic reproduces the bounds defect: four cases fail and two pass in 15.1 seconds.
Each failed case reaches remount one; Chikugo reports Fuji's bounds while its authored points remain correct.
Both consecutive browser JSON reads already contain the wrong bounds, so the client-side comparison does not cause this mismatch.
The other nine river bounds remain correct; source audits do not establish a specific producer or getter cause.
All 1288 source hashes and forty-five existing bundle hashes match afterward; no unchanged rerun clears this failure.
Log: `/tmp/tenka-river-remount-stress-20261011.log`; report: `/tmp/tenka-river-remount-stress-report-20261011/index.html`.

The captive reload control earns the actual mini-scenario capture through ordinary bridge ticks before release consent and pending-save reload.
Its original source queues two releases; the authentic regression records three failed and five passed controls.
The bridge now restores only currently valid captive consent IDs, preserving every saved command, command order, core state and random-generator state.
All sixty-one related controls pass; normal and core types, scoped lint and formatting pass.
This app-and-DOM proof does not establish native regional capture, national capture or complete game acceptance.
Logs: `/tmp/tenka-captive-consent-reload-red.log`, `/tmp/tenka-captive-consent-green-refrozen.log`.

The layered diagnostic records source scalars, retained bounds, texture matrices and the exact original getter result from each existing read.
Its unchanged six-context stress test records three failed and three passed cases in 16.9 seconds.
The real Chromium processes use headless and no-startup-window flags; no Chrome plugin or visible browser participates.
All 1290 source hashes and forty-five rebuilt bundle hashes match afterward; this instrumentation does not constitute a fix.
Log: `/tmp/tenka-river-bounds-layered-20261011.log`; report: `/tmp/tenka-river-bounds-layered-report-20261011/index.html`.

The three failures reach remount one; Chikugo's source scalars remain correct, while its live surface bounds already equal Fuji's bounds.
Material, retained-entry and getter bounds carry the same wrong values; the construction and live texture matrices remain correct.
Both reads agree, all bounds report frozen, and identity checks find no shared Chikugo-Fuji rectangle.
The other nine river bounds remain correct; the three passing contexts complete all eleven observations.
This locates the first observed wrong layer, not its cause; the correct matrices do not prove displaced paint.

The same compiled candidate also fails all six headless cases with JavaScript optimization disabled through an explicit browser flag.
Every case retains correct baseline bounds and fails at remount one with the same Chikugo surface-bounds substitution.
Source scalars and both matrices remain correct; the other nine bounds remain correct.
All forty-five bundle hashes and the three diagnostic-input hashes match afterward; disabling optimization does not remove the failure.
The first external configuration fails before browser startup because its preview uses the temporary directory; the corrected configuration uses the checkout explicitly.
Logs: `/tmp/tenka-river-no-opt-20261011.log`, `/tmp/tenka-river-no-opt-final-20261011.log`; report: `/tmp/tenka-river-no-opt-final-report-20261011/index.html`.

The interval diagnostic adds original-object allocation, matrix, retention and next-material checkpoints, including native JSON and property descriptors.
The unchanged six-context test records three failed and three passed cases in 16.4 seconds.
All 1293 source hashes and forty-five rebuilt bundle hashes match afterward; the retained bounds defect remains unresolved.
Log: `/tmp/tenka-river-bounds-interval-20261011.log`; report: `/tmp/tenka-river-bounds-interval-report-20261011/index.html`.

The fresh seed42 Takeda regional route naturally captures three officers at Iiyama on day35 in the supported s1560 scenario.
Thirteen related CPU controls pass, including complete repeated-state comparisons and actual recruitment UI release consent through pending-save reload.
Normal and core types, scoped lint and formatting pass; these controls do not establish a native-earned siege popup or national capture.
Log: `/tmp/tenka-earned-regional-captive-unit-final.log`; the separate native continuation requires its actual browser result.

The interval attachments keep Chikugo bounds correct through allocation, matrix construction and initial terrain retention.
The first wrong checkpoint follows the next Fuji material, with matching native JSON and property-descriptor values.
This interval also includes Chikugo paint setup and Fuji geometry preparation; the evidence does not isolate the material constructor.
Frozen flags and reference-equality checks remain true; the underlying cause remains unproved.

The first native regional captive continuation fails its day36 release-report count after the UI, pending reload and officer-state checks pass.
The test expects one release report and observes zero; this still requires report-contract diagnosis rather than acceptance.
All 1293 source hashes and forty-five bundle hashes match afterward.
Log: `/tmp/tenka-earned-regional-captive-native-20261011.log`; report: `/tmp/tenka-earned-regional-captive-native-report-20261011/index.html`.

The core applies commands before time advancement, so release reports retain command day35 while the completed state reaches day36.
The corrected native oracle requires one exact day35 release report, one release command, no rejection on either day and the unchanged day36 state.
The direct-headless native continuation passes in 5.1 seconds, with 6.1-second total execution and all 1293 source hashes unchanged afterward.
All forty-five bundle hashes match; all 211 protected core, data and baseline-image hashes remain unchanged.
This proves native disposal and save continuation from the fresh CPU-earned regional checkpoint, not native-earned capture, national capture or whole-game acceptance.
Log: `/tmp/tenka-earned-regional-captive-native-final-20261011.log`; report: `/tmp/tenka-earned-regional-captive-native-final-report-20261011/index.html`.

The paint-checkpoint headless diagnostic records three failed and three passed cases in 17.7 seconds, with all 1293 source hashes unchanged afterward.
Chikugo bounds remain correct through painting, loop handoff and immediately before Fuji's material factory.
The first wrong checkpoint follows that factory call; native JSON, descriptors and original-reference checks agree across all three failures.
All forty-five bundle hashes match; no audited Pixi constructor receives the project's world-bounds object, and the patch installer does not target these constructors.
The internal cause remains unproved; the new factory-stage observations do not constitute a repair.
Log: `/tmp/tenka-river-bounds-paint-20261011.log`; report: `/tmp/tenka-river-bounds-paint-report-20261011/index.html`.

The next original raster candidate replaces only Chugoku's repeated horizontal mountain artwork, preserving every authored mass, ridge, mask and uniform-fit policy.
Its visible aspect is 3.1829:1, outside the prompt's requested range; the existing fit nevertheless preserves the prior 351.12-world-unit width without stretching.
The taller candidate extends upward by 14.12 world units and requires actual scene review for nearby roads, actors and labels.
The final PNG and complete source chain remain separate from the discarded initial image; source checks alone do not prove visual acceptance.
Source: `assets/generated/terrain-mountain-chugoku-massif-v1.provenance.json`; native four-mass and national-overview observations remain pending.

The combined direct-headless command reports five failed and two passed cases in 32.3 seconds.
The four-mass placement case passes in 20.9 seconds, including actual Chugoku asset admission and retained shader controls.
All 1297 source hashes and forty-six bundle hashes match afterward; all 211 protected hashes remain unchanged.
Log: `/tmp/tenka-chugoku-factory-native-20261011.log`; report: `/tmp/tenka-chugoku-factory-native-report-20261011/index.html`.

All five remount failures first replace Chikugo bounds across Fuji's pure pixel-generation call, before any Fuji Pixi constructor.
Native JSON, property descriptors and original-reference checks agree; disabling optimization previously did not remove the failure.
These observations isolate a narrower interval, not its cause or a repair; the strict remount gate remains unsuccessful.

The actual Chugoku scene shows varied connected wooded ridges and rocky peaks without actor, road-bbox or HUD intersection in this crop.
Its lower forest edge still reads as a separate textured patch against the relatively uniform farmland.
Thirteen conservative coast-segment intersections require separate opaque-pixel review; these rectangles do not establish terrain or coast obstruction.
The national overview still contains repeated mountain forms and crowded red army flags; no whole-map visual acceptance follows from this placement pass.

The independent pure-producer probe performs two consecutive pixel calls without textures, matrices or retained pixel buffers.
Forty-nine focused CPU controls, normal/core types, lint and formatting pass; build passes before the actual browser command.
Twelve direct-headless native cases report nine passed and three failed in 42.6 seconds, with all 1298 frozen source hashes unchanged afterward.

One original material isolation and two pure-producer isolations fail; the original assertions remain unchanged.
Both pure failures retain correct Chikugo bounds before Fuji generation and observe Fuji's values afterward, including native JSON and descriptor values.
Both fail at observation zero before any remount; native intrinsic identities remain unchanged, and existing rendered materials remain correct before and after the probe.

The compiled producer retains fresh local bounds literals with no audited shared allocation or write path.
The pure probe narrows the failure beyond Pixi construction; it does not establish a cause or clear the strict lifecycle gate.
Log: `/tmp/tenka-river-pure-native-20261011.log`; report: `/tmp/tenka-river-pure-native-report-20261011/index.html`.

The frozen candidate's complete CPU coverage command reports 5726 passed, eight failed and one skipped across 568 files in 127.40 seconds.
All UI and App cases pass; the eight failures remain the protected battle, golden, succession and replay blockers.
Core coverage reaches 94.82 percent lines, 91.20 percent branches and 98.47 percent functions; all 1298 frozen hashes match afterward.
Log: `/tmp/tenka-pure-bounds-full-coverage-20261011.log`; this unsuccessful complete collection does not establish release acceptance.

The test-only frozen-sentinel headless control reports three passed and three failed cases in 13.1 seconds.
Two pure-producer failures occur before remount; their independent frozen sentinel, original identity and Map-key identity remain unchanged.
The third failure precedes any probe: the test calls idle waiting before the renderer mounts.
All six retained source/config hashes and forty-six bundle hashes match afterward; these observations do not prove a producer repair.
Log: `/tmp/tenka-river-sentinel-native-20261011.log`; report: `/tmp/tenka-river-sentinel-native-report-20261011/index.html`.

The original Shikoku raster candidate replaces only its repeated horizontal artwork, retaining all authored geography and thirteen other mountain placements.
Its visible 3.40885:1 aspect meets the prompt range; its side margins miss the requested three percent and remain truthfully documented.
The unchanged uniform fit retains a 270.16-world-unit width; actual roads, shoreline and paint quality require native scene review.
Source: `assets/generated/terrain-mountain-shikoku-massif-v1.provenance.json`; source binding and fixed five-mass observations remain separate gates.

The Shikoku binding records genuine missing-binding RED, followed by sixty-three passed pack, raster and provenance controls.
Normal/core types, build, full lint, asset validation and bundle budget pass; all 211 protected and eighteen golden hashes remain unchanged.
The fourteen-case direct-headless command reports nine passed and five failed in 49.0 seconds, with all 1300 source hashes unchanged afterward.
All forty-five recorded bundle hashes match; fixed five-mass placement passes in 28.8 seconds and native regional captive continuation passes in 13.3 seconds.
Log: `/tmp/tenka-shikoku-sentinel-native-20261011.log`; report: `/tmp/tenka-shikoku-sentinel-native-report-20261011/index.html`.

Three material-remount and two pure-producer cases retain genuine Chikugo bounds failures; the independent sentinel remains unchanged and no startup failure recurs.
The fixed Shikoku crop contains fifty-eight conservative coast intersections but no roads or actors in the debug mini fixture.
National road.b7-30 crosses this authored area but is absent from that fixture, so zero recorded road intersections do not prove national road clearance.
The actual forest edge softens toward farmland and meets the northern shoreline; surrounding terrain remains flat and patterned.
Supported national scene review remains separate from this bounded placement pass and from whole-map acceptance.

The separate national five-mass control starts s1560 through actual title, scenario and clan controls, then pauses through the real speed button.
It verifies 121 castles, 495 roads and the presence of road.b7-30 before collecting fixed camera observations.
This direct-headless case passes in 29.8 seconds, with 31.0-second total execution; all 1300 source hashes remain unchanged afterward.
All forty-seven enumerated bundle hashes match the record collected during the live command; no build or bundle write overlaps the browser run.
Log: `/tmp/tenka-shikoku-national-native-20261011.log`; report: `/tmp/tenka-shikoku-national-native-report-20261011/index.html`.

The national Shikoku crop records one Oko body, six road-segment bounding intersections, fifty-nine coast segments and no HUD intersection.
The woodland chain remains coherent and Oko stays distinct, but pale geographic labels and thin road approaches remain difficult to read.
The diagonal road.b7-30 still requires exact paint review; bounding intersections and these screenshots do not certify unobscured route pixels.
No whole-map, reference-GPU performance or whole-game gate follows from this successful fixed scene capture.

The same-source minification comparison ran twelve native cases per build with six workers and unchanged deadlines.
The production build returned two failures and ten passes; the unminified build returned six failures and six passes.
All failures describe the existing river bounds defect, not startup admission errors.
The experiment excludes minification as a necessary condition; it does not identify an engine cause or fix the defect.
The comparison retained 1,300 source hashes and all forty-seven production bundle hashes.
Thirty-three shared CSS and public asset files match byte-for-byte across both builds.

Geographic ink styles strengthen province opacity, district opacity and road opacity, with two-pixel parchment halos.
Three new style controls first failed against the old styles; seven related controls then passed against the new styles.
Font dimensions, placement rules and castle styles remain unchanged.
These CPU controls do not establish native contrast acceptance.

The road paint diagnostic hides only the retained road container and restores its exact prior visibility.
Six visibility and measurement controls passed; type checks, the production build and scoped lint passed.
The actual national headless capture preserves core state, projection and geographic layout across paired road visibility captures.
The restored capture matches the original pixels exactly.
Its fixed station fourteen fails the obstruction guard because the road name intersects the sampled area.
This failure remains open; the test does not move the station or claim complete road legibility.

The earth-road styles increase the width factor to 0.8, retain nominal envelopes and strengthen warm surface colors and opacity.
The change preserves all route geometry, dash phases, sea styles and bridge styles.
The new legibility policy first returned two failures and one pass; sixty-six focused material and painter controls then passed.
Normal and core type checks, scoped lint, formatting, asset validation and bundle validation passed.
The direct headless candidate returned one placement-regression pass and one fixed-road obstruction failure.
The four clear road stations record attributable paint; this observation does not establish sufficient contrast or complete route coverage.

The road-label correction measures the actual text box instead of offsetting only its top-center anchor.
It preserves raw road geometry and adds scale-aware clearance from the local road tangent.
The road-only declutter constraint prevents displacement back across that tangent.
Two legacy-geometry controls first failed; 133 focused helper, layout and renderer controls then passed.
Adjacent bends remain outside this local-tangent guarantee; complete road-label clearance requires native verification.

The corrected production candidate passed all three direct headless cases in 37.9 seconds with unchanged deadlines and fixed sampling stations.
The national road case checks unchanged commands, core state, resources and road rebuild counts, plus exact restored pixels.
All five stations retain unobstructed attributable paint, including the previously obscured station fourteen.
The unchanged geographic placement case and five-region national mountain case also pass.
The 1,306-file source record starts during this native command; all recorded files remain unchanged after completion.
These results do not certify frame rate, all-road contrast, adjacent bends or release readiness.

The complete coverage run returned 5,738 passes, ten failures and one skip across 572 files in 134.36 seconds.
Eight failures retain the existing core and golden blockers.
The two additional failures concern the coast geometry hashes and a five-second event-session timeout.
The isolated rerun returned twenty-two passes and one coast failure; all six event-session cases pass without timeout changes.
The width factor changes road protection footprints and therefore the national and sparse coast display curves.
Mountain artwork and label styles are not inputs to this coast failure.

Whole-project lint passes, and all 211 protected core, data and camera-snapshot files retain their comparison hashes.
All eighteen golden files also retain their comparison hashes.
The 1,306-file source record remains unchanged after the complete coverage run.
The comparison uses the current minification-experiment record, not an older system-menu record with inherited UI and bridge changes.

The retained candidate restores only the 0.6 road width factor and its literal material contracts.
It retains the warmer colors, stronger opacity and measured road-label clearance.
All seventeen coast controls pass again, including the original frozen national and sparse hashes.
The focused rollback run returns eighty-two passes and one failure.
The unchanged minimum-width policy still fails at 0.75 CSS pixels; the candidate does not claim the widening requirement passes.
The wider candidate requires a separate coast design choice and complete geometry validation, not a blind hash update.

The retained-width production candidate passes all three direct headless cases in 36.9 seconds with the same unchanged sampling stations and deadlines.
The fixed road case, geographic placement case and five-region national mountain case all pass.
Normal and core type checks, the production build, asset validation and bundle validation pass.
All 1,306 source records and forty-seven bundle records retain their hashes after the native command.
The source record precedes this native command; the bundle record starts during it.
The minimum-width policy and the existing release blockers remain open.

The original Kii massif now uses its own transparent raster, generated with the built-in image tool.
Its provenance records the full prompt, source hash, content bounds and missed aspect-ratio and margin targets.
The implementation preserves the source bitmap; thirteen other mountain placements retain their previous configuration.

An actual headless capture exposed forest spilling into the sea at three fixed Kii stations.
Their original pixel differences were 77, 89 and 94 against the same scene with only mountain heroes hidden.
The contact-mask correction reuses fourteen existing masks and allows only bounded northward canopy projection.
All three sea differences are now zero; the inland control remains 146 and the Kumano water control remains 64.

The focused mask, raster, pack and renderer suite passes 165 tests.
Normal and core type checks, the build, asset validation and bundle validation pass.
Three direct-headless road, label and six-massif cases pass in 43.1 seconds.
All 1,313 source records and forty-seven bundle records retain their pre-command hashes.
Log: `/tmp/tenka-kii-contact-final-native-20261011.log`; report: `/tmp/tenka-kii-contact-final-native-report-20261011/`.

Independent image review confirms removal of the floating eastern forest tail without losing the principal ridge.
The coastal vegetation transition remains abrupt, and these checks do not accept the whole map or game.
The earlier full-polyline label guard also needed an explicit baseline army-overlap ceiling; its corrected focused suite passes 138 tests.
The existing minimum-road-width policy and release blockers remain open.

The supported national Kii view exposed a complete castle-ribbon fallback: 6,966 leader guards exceeded the existing 4,096 capacity.
The original headless build fails the new non-fallback control; its raw geometry, screenshot and trace remain available.
Log: `/tmp/tenka-castle-leader-cap-red-native-20261011.log`.
Conservative leader envelopes reduce this view to 193 guards without removing any obstacle that a permitted leader can cross.
The full fixed-obstacle arrays, overlap ceilings, forty-eight-pixel displacement limit and one-million-work limit remain intact.

The helper, solver and renderer controls pass 136 tests; type checks, scoped lint, formatting, build and asset budgets pass.
Six direct-headless castle, geography, road and massif cases pass in 57.1 seconds.
All 1,315 source records and forty-seven bundle records retain their pre-command hashes.
An additional 37.0-second native case checks all 7,074 Kii ribbon/obstacle pairs and preserves every individual overlap ceiling.
Its total rectangle obstruction falls from 39,994.2077 to 38,883.7509 square CSS pixels; this is not an opaque-pixel measure.
Logs: `/tmp/tenka-castle-leader-final-native-20261011.log` and `/tmp/tenka-castle-leader-kii-final-native-20261011.log`.

The layout retains all 54 ribbon entries; three move, but six collisions and twenty-nine individual budget limits remain.
Independent image review confirms that Ishiyama clears part of the neighboring roof stack; the central castle cluster remains crowded.
The coastline and Kumano retain their previous appearance.
No whole-map visual or performance acceptance follows from these functional checks.

The next actual-fixture control fails because Shigisan exhausts the proposal budget despite a legal forty-eight-pixel improvement.
Conservative proposal envelopes now exclude only score and hard-guard terms that remain zero throughout the permitted displacement range.
Candidate generation, order, individual ceilings, final accounting and the original one-million-work limit remain unchanged.
The focused controls pass 139 tests; normal/core types, build, asset budgets and whole-repository lint pass.
Six direct-headless cases pass in 57.7 seconds; all 1,316 source records and forty-seven bundle records retain their hashes.

The Kii layout retains 54 entries, moves seven and reports zero unresolved or budget-limited entries.
Shigisan moves forty-eight pixels right; all 7,074 individual hard-obstacle ceilings remain intact.
Total rectangle obstruction falls from 39,994.2077 to 38,689.1213 square CSS pixels; residual body obstruction remains.
Independent image review confirms less buried Shigisan text, but crowded upper rows, competing geographic names and subtle leaders remain.
The Kii crest, Kumano and coastline show no visible regression; whole-map art acceptance remains open.
Logs: `/tmp/tenka-castle-ribbon-budget-red.log`, `/tmp/tenka-castle-ribbon-budget-green.log`, `/tmp/tenka-castle-budget-final-native-20261011.log`.

The actual Takaya control fails against that build: its ribbon covers 189.730 square CSS pixels of the Kishiwada castle frame.
The existing single pass now ranks hard-obstacle area only after ordinary raw and padded overlap tie, before distance.
The sum reuses the hard-guard scan; candidate order, priority, individual ceilings, displacement and work limits remain unchanged.
The focused controls pass 142 tests; type checks, build, asset budgets and whole-repository lint pass.
Six direct-headless UI cases pass in 1.0 minute; all 1,318 source records and forty-seven bundle records retain their hashes.
Log: `/tmp/tenka-castle-hard-tie-final-native-20261011.log`; original failure: `/tmp/tenka-takaya-red-native-20261011.log`.

Takaya moves sixteen pixels right and clears the Kishiwada frame without changing text size.
The Kii layout retains 54 entries, moves twenty and reports zero budget-limited or unresolved entries.
Independent comparisons against the previous accepted layout find no increases across 7,074 hard-obstacle and 2,862 directed ribbon-pair intersections.
Total hard-frame obstruction falls from 38,689.1213 to 30,106.8666 square CSS pixels, not opaque-pixel coverage.
Image review confirms more exposed roof silhouettes; dense geographic names, flags and faint leaders still prevent whole-map art acceptance.
The Kii crest, Kumano and coastal contact show no visible regression.

The integrated CPU suite before this leader correction passes 5,757 tests, fails nine and skips one in 103.20 seconds.
The failures comprise eight existing core/golden/replay cases and the unchanged minimum-road-width policy.
Log: `/tmp/tenka-kii-integrated-cpu-20261011.log`.

After both castle-layout corrections, the integrated CPU suite passes 5,765 tests, fails the same nine cases and skips one in 109.37 seconds.
The failures remain eight protected core/golden/replay cases and the original minimum-road-width policy; no new failure appears.
All 211 protected core/data/screenshot records and eighteen golden records retain their prior hashes.
Log: `/tmp/tenka-castle-budget-integrated-cpu-20261011.log`.

After the hard-overlap tie and runtime diagnostics, the integrated CPU suite passes 5,771 tests, fails the same nine cases and skips one.
The command takes 118.53 seconds; bounded functional browser checks overlap this run, so its duration is not a performance result.
Log: `/tmp/tenka-castle-hard-tie-integrated-cpu-20261011.log`.

The additive SameValue diagnostic does not fix the river-bounds defect.
Six unchanged pure-producer native contexts yield five passes and one failure in 49.9 seconds.
Isolation four retains the original Map identity but observes Fuji values in the frozen Chikugo bounds after the second call.
Same-value property checks return four true values before that call and four false values after it, without changing the observed properties.
The source of this contradiction remains unresolved; the result does not establish a browser-engine cause.
Log: `/tmp/tenka-river-samevalue-native-20261011.log`; its five inputs and forty-seven bundle records retain their hashes.

An unminified standalone page imports the actual producer and canonical terrain without the application or map renderer.
Six fresh headless contexts pass eleven consecutive pairs each in 2.4 seconds.
Seventeen input records, 721 physical modules and eight output files retain their hashes after that command.
The emitted code retains 141 Pixi modules and default texture construction, so this control does not remove all Pixi initialization.
The clean standalone result does not fix or explain the production failure.
Log: `/tmp/tenka-river-standalone-native-20261011.log`; source and output evidence: `/tmp/tenka-river-standalone-build-20261011.log`.

One new standalone bundle compares six cold contexts with six contexts after exactly ten actual canonical river-producer calls.
All twelve direct-headless cases pass eleven strict pairs each in 4.1 seconds.
Seventeen explicit inputs, 721 physical modules and eight outputs retain their hashes; default Pixi initialization remains present.
This bounded mixed-call-history control neither reproduces nor explains the production bounds failure.
Logs: `/tmp/tenka-river-mixed-history-native-20261011.log` and `/tmp/tenka-river-mixed-history-build-20261011.log`.

Same-production-bundle runtime diagnostics compare retained and direct canonical routes in six fresh contexts, with three contexts for each call order.
All six cases pass eleven paired observations each in 12.2 seconds, including strict bounds and actual input/function identity checks.
The unchanged pure-bounds protocol on that bundle still fails isolation one before its first remount; five other contexts pass.
Chikugo bounds again expose Fuji values, while the original scalar tuple, Map identity, sentinel and intrinsic identities remain unchanged.
Both commands retain all source and bundle hashes; neither result repairs the producer or proves a browser-engine cause.
Logs: `/tmp/tenka-river-runtime-identity-native-20261011.log` and `/tmp/tenka-river-pure-hard-tie-native-20261011.log`.

The runtime diagnostic inspects point descriptors and allocates snapshots before its first producer call; the original pure route does not.
Their clean and failing outcomes therefore do not establish identical execution histories, despite equal runtime inputs and imported functions.

An additional same-camera capture stores existing geographic-label diagnostics beside castle ribbons; the unchanged six-massif control passes in 40.6 seconds.
All 1,318 source records and forty-seven retained bundle records keep their hashes.
Its 34 visible geographic labels and 24 visible ribbons have zero rectangle intersections across 816 pairs, before any HUD exclusion.
The only full-board intersection lies entirely outside the viewport; it is not a valid visible improvement target.
Dense visual associations therefore require stronger evidence than an assumed geographic/ribbon collision.
Log: `/tmp/tenka-geography-takaya-observe-native-20261011.log`.

The Hida V2 candidate replaces regular crest intervals with unequal connected groups and a larger central crag.
Its actual frame is `(244,77,582,1376)`; uniform placement retains the 264-world-unit height without changing terrain or castle coordinates.
Independent native review finds a less mechanical ridge but retains sharp forest edges and residual triangular repetition as open art issues.
The image and complete original edit chain remain in repository assets; art-bible section 6.1.8 records the missed prompt dimensions.

The command rail adds three localized section captions without changing button order, accessible labels, hit floors or actions.
Land roads use darker earth edges and lighter warm surfaces without changing widths, paths, sea routes or bridges.
The old build fails the strengthened fixed-station contrast check; the first candidate also fails one station at 29 against the unchanged 32 threshold.
The final minor-road color passes with station differences of 66, 135, 94, 43 and 35 against the same ground pixels.
Each station preserves its exact center, authored road inputs, scale, label exclusions and road-off pixels across the old and final captures.
Comparison: `/tmp/tenka-hida-natural-road-station-compare-20261011.json`.

The final direct-headless Chromium run passes all sixteen scoped cases in 2.4 minutes.
The cases cover two resolutions, three UI scales, keyboard controls, castle labels, geographic labels, roads, Hida and six massif views.
All 1,331 source records and the built bundle retain their hashes after that command.
Direct Playwright launches use no Chrome extension or visible window.
Log: `/tmp/tenka-hida-natural-road-final-native-20261011.log`.

The complete CPU suite passes 5,783 tests, fails the same nine earlier cases and skips one across 579 files in 105.10 seconds.
The failure-title comparison adds or removes zero cases; eight protected core, golden and replay failures and the minimum-road-width failure remain unresolved.
All 211 protected core/data/screenshot records and eighteen golden records retain their prior hashes after both suites.
Normal/core types, scoped lint, formatting, asset validation and build-budget checks pass; this evidence does not clear whole-game or live-performance acceptance.
Logs: `/tmp/tenka-hida-natural-full-cpu-20261011.log` and `/tmp/tenka-hida-natural-cpu-failure-compare-20261011.log`.

The next candidate gives shared Panel and Dialog headers a dark command surface, inverse titles and a gold upper edge.
Paper content remains unchanged; actual settings, consent and historical-event routes use the same frame.
The old built bundle fails all three new frame cases at UI scales 0.8, 1 and 1.5.
The new direct-headless Chromium run passes seven UI cases in one minute and thirteen map cases in two minutes.
The UI cases retain native keyboard ownership, cancel-first consent, historical choices and save/load behavior.
Logs: `/tmp/tenka-surface-panel-ui-native-20261011.log` and `/tmp/tenka-surface-panel-map-native-20261011.log`.

The road change raises only the inner land surface to a 0.8-world-unit base floor before the existing level-of-detail multiplier.
The floor produces at least one CSS pixel at the three reference camera scales; continuous zoom can still produce smaller surfaces.
Paths, casing widths, coastline protection, sea routes and bridges remain unchanged; the wider inner surface stays inside the existing casing.
All 1,336 candidate source records, retained bundle records and the Vite manifest keep their hashes after the two native commands.
The independent battle checks prove repeatability and unchanged non-battle random streams, not compatibility with the old battle hash.
Native review retains oversized facility tiles, dense map associations and incomplete whole-art acceptance as open issues.

The unchanged road stations keep identical camera coordinates, exclusions, authored inputs and background pixels after the inner-surface change.
Their contrast differences rise from 66, 135, 94, 43 and 35 to 95, 135, 123, 70 and 67.
Comparison: `/tmp/tenka-surface-panel-road-station-compare-20261011.log`.

The final complete CPU suite passes 5,795 tests, fails eight and skips one across 581 files in 108.06 seconds.
The prior road-width failure disappears; the same eight protected core, golden and replay failures remain, with no new failure titles.
The shared-header source contract now checks the intentional dark-header design while retaining paper content and primary-action assertions.
All 211 original core/data/screenshot records and eighteen golden records retain their hashes; normal/core types and scoped static checks pass.
Logs: `/tmp/tenka-surface-panel-final-full-cpu-20261011.log` and `/tmp/tenka-surface-panel-final-cpu-failure-compare-20261011.log`.
These results do not clear whole-game, continuous-zoom or live-performance acceptance.

The next candidate replaces fixed facility tiles with three equal columns and a compact two-row grid.
All six slots, full names, queue days and native actions remain visible; status fonts retain twelve CSS pixels and actions retain thirty-two-pixel targets.
Domestic-only spacing places the complete policy section inside the initial viewport at UI scales 0.8, 1 and 1.5.
The old bundle fails all three density cases; the repaired direct-headless run passes fifteen UI and map cases in 1.2 minutes.
Log: `/tmp/tenka-facility-army-repaired-native-20261011.log`.

Original mid-distance infantry uses a uniform thirty-two-by-thirty-four world-unit frame; the near frame remains twenty-six by twenty-eight.
Sprite rendering and diagnostic bounds now use the same stage-specific placement; ground anchors, direction textures and hit targets remain unchanged.
Six native views retain mandatory digits, non-overlapping plates, bounded tethers and stable idle geometry without changing gameplay state.
Independent geometry comparison finds roughly 47–51 percent larger mid content frames and identical near geometry; this is not an opaque-pixel-area measurement.
Logs: `/tmp/tenka-army-mid-native-compare-20261011.log` and `/tmp/tenka-army-mid-bounds-green.log`.
Dark infantry still merges with terrain, and dense castle associations remain unresolved; these results do not approve whole-game art.

The earned rice workflow passes direct-headless Chromium in 56.3 seconds with the unchanged sixty-second case deadline.
Native controls build Kiyosu's rice dealer, advance sixty-two normal calendar days and execute queued buying and selling with daily invariant checks.
The test retains background AI construction and checks player commands separately; fractional garrison consumption stays separate from trade accounting.
The earlier failure came from comparing national AI construction with player-only commands, not from headless startup or a game-accounting failure.
Log: `/tmp/tenka-earned-rice-player-native-20261011.log`; the failed run remains in `/tmp/tenka-earned-rice-real-native-20261011.log`.
This proves the scoped workflow, not monthly cap exhaustion, cap reset, positive aid acceptance or live performance.

The complete CPU suite passes 5,802 tests, fails the same eight protected compatibility cases and skips one across 581 files in 129.27 seconds.
Normal/core types, scoped lint, formatting, asset validation and the build-budget check pass; no protected hash or golden expectation changes.
All 1,339 candidate source records and retained bundle records keep their hashes after the final native rice run.
Logs: `/tmp/tenka-facility-army-repaired-full-cpu-20261011.log` and `/tmp/tenka-facility-army-repaired-cpu-failure-compare-20261011.log`.
Direct Playwright uses headless Chromium without browser plugins or visible windows; whole-game and live-performance acceptance remain open.

The next notification candidate groups the full title and date beside the existing close control, without a date divider.
Native card heights change from 79.75, 86.1875 and 127.796875 to 40.375, 44.5 and 64.75 CSS pixels at scales 0.8, 1 and 1.5.
Widths, full text, severity, timers, collapse behavior and report-center controls remain unchanged; optional body text still wraps above a twelve-pixel floor.
The old bundle fails all three new density cases; both later candidates pass those cases with complete text bounds and native archive access.
Logs: `/tmp/tenka-report-compact-old-native-20261011.log` and `/tmp/tenka-report-contrast-maximum-native-20261011.log`.

The earlier HUD check incorrectly required a hundred-pixel viewport even for one compact card; the replacement checks complete intrinsic content instead.
For content that exceeds a hundred pixels, the same minimum viewport remains mandatory; a separate five-critical-report case retains that guard.
The supported save-import fixture contains explicit siege history, not earned sieges; its viewport measures 270 pixels against 372 pixels of content.
Native End scrolling reaches the final forty-eight-pixel close control; dismissal removes one visible notification without changing core or command logs.
The archive stays above the minimap; the first fixture attempt used warning-level shortage events and failed the critical-role assertion without a production defect.

Mid infantry gains a second shared-texture light pass at alpha 0.28 with identical body placement and no offscreen filter.
Only the first mid view allocates the light; initial near admission retains its original children, and near/far views hide the light.
The first full CPU run exposed two initial-near allocation failures; lazy allocation repairs both without changing the original renderer tests.
Across three scales, thirty-three unobscured mid body frames gain mean RGB-channel values from 4.72 to 8.13, with no darker pixels.
Thirty-three corresponding near frames keep identical pixels; anchors, admission, diagnostic bounds, depth and world feet also remain identical.
Comparison: `/tmp/tenka-army-contrast-repaired-native-20261011.log`; these are content-frame samples, not opaque-pixel segmentation or a contrast-ratio measurement.

The repaired broad native run passes twenty-one cases and fails only the new maximum-history fixture's incorrect event-role assumption.
After the fixture correction, all seven targeted cases pass in 1.2 minutes, including the maximum stack, three density scales and earned rice trading.
The rice workflow passes in 56.5 seconds with unchanged deadlines and real calendar time; all 1,340 candidate records and retained bundle hashes stay unchanged.
The complete CPU suite passes 5,805 tests, fails the same eight compatibility cases and skips one across 581 files in 129.44 seconds.
Logs: `/tmp/tenka-report-contrast-repaired-full-cpu-20261011.log` and `/tmp/tenka-report-contrast-cpu-check-20261011.log`.
Native PNG review finds restrained highlights without obvious ghosting; crowded associations, whole-art approval and live-performance gates remain open.

Report seals now use the report center's six canonical categories; generic app notices retain severity icons.
Thirty focused tests pass, including actual MainScreen category projection; normal/core types, scoped lint and formatting pass.
Three native scales display the actual military sword path and retain complete text, compact height, close targets and archive access.
All eight native UI and terrain cases pass; the separate five-critical stack keeps its scroll and native dismissal guards.
Log: `/tmp/tenka-category-foothill-native-20261011.log`.

The woodland mask uses a wider inward transition and compact ridge support without new textures or altered geography.
Forty-three focused material, raster and shade tests pass; independent reference math preserves optimized byte equality and historical coverage ceilings.
Six fixed native views keep projection and resources unchanged; over two million checked pixels outside authored mountains retain identical colors.
The pixel check excludes the HUD and allows a two-pixel filter margin; it does not isolate opaque peak artwork.
Hida and Akaishi show subtle contact cleanup; repeated peaks, tree patterns and awkward river registration remain unresolved.
Comparison: `/tmp/tenka-foothill-native-comparison-20261011.json`; whole-terrain realism and performance acceptance remain open.

The complete CPU suite passes 5,818 tests, fails the same eight compatibility cases and skips one across 582 files in 118.51 seconds.
All 211 protected core/data/screenshot records and eighteen golden records remain unchanged.
Log: `/tmp/tenka-category-foothill-full-cpu-20261011.log`; direct Playwright uses headless Chromium without plugins or visible windows.

The new Takeda-to-Hojo aid route fails its acceptance-score guard after paid native diplomatic work in 51.0 seconds.
All 120 daily snapshots pass invariant checks; four monthly payments cost eighty gold and increase trust from zero to 24.32.
The refreshed score is 0.4871694257747828, below the unchanged 0.5 threshold; positive aid remains unproved.
Earlier attempts expose skipped x5 observations, a short diagnostic budget and delayed pointer pause; their traces remain available.
Normal x2 monthly collection uses actual summary pauses and a twelve-second diagnostic budget; the outer sixty-second case deadline remains unchanged.
Log: `/tmp/tenka-earned-hojo-aid-month-native-20261011.log`; this failure does not indicate headless startup failure.

The original Kiso massif replaces only its display asset; the other thirteen mountain bindings and all authored coordinates remain unchanged.
The 974-by-1615 transparent image retains its real generation input, complete built-in imagegen prompts and byte-verified provenance.
Its top and bottom margins miss the requested six-percent target; the source record states that qualification.
Seventy-two focused terrain and provenance checks pass; asset and current-bundle budgets also pass.

Matching close-view mountain contributions change 19,979 pixels inside Kiso and zero of 341,463 clear pixels outside it.
The comparison excludes all castle ribbon frames and HUD; projection, resources, core state and semantic label geometry match.
Cumulative layout-run counters differ after ordinary wheel input; those counters do not represent geometry changes.
Comparison: `/tmp/tenka-kiso-camera-repaired-native-comparison-final-20261011.json`.

The first camera harness accidentally selected near LOD twice because minimap input resets zoom.
The repaired direct-headless case asserts actual mid and near LOD and passes in 9.2 seconds.
No valid old-asset mid baseline exists; the matching close comparison provides the before-and-after evidence.
Log: `/tmp/tenka-kiso-camera-repaired-native-20261011.log`.

Castle labels use warmer main paper and a lighter troop inset without changing geometry, fonts, picking or status channels.
The name and troop contrast ratios are 14.64 and 13.07; 132 focused controls pass.
Independent matching-view review finds modest hierarchy improvement, not complete dense-city or castle-army association acceptance.
Ten separate native UI, army and panel cases pass in 41.4 seconds.
Log: `/tmp/tenka-kiso-register-native-20261011.log`.

The full CPU run reports 5,829 passes, eight failures and one skip across 584 files in 118.68 seconds.
Log: `/tmp/tenka-kiso-register-full-cpu-20261011.log`; protected failures remain unresolved rather than waived.
The initial Kiso art checkpoint reports six mathematical river-contact passes.
That checkpoint does not include the later rendering integration or native valley proof.
Whole-map art, historical succession, earned military aid and isolated performance acceptance remain open.

Kiso now attenuates its painted peak, woodland coverage and shade alpha beside the same-generation emitted Tenryu segments.
The static masks retain full filter support within eight world units of the bank; thirteen other mountains retain exact complete buffers.
The integration adds no resources, per-frame work, river displacement or changes to canonical relief data.
Three original-producer tests first fail; 47 focused controls then pass, alongside 121 renderer controls and four independent integration controls.
The independent integration suite lacks a pre-change RED run; its first run follows implementation and does not prove a failure baseline.

True mid and near native views change 522 and 3,738 pixels inside the contact region.
Outside that region, 541,010 and 531,218 fixed map samples show zero channel change.
Projection, water geometry, core state, commands, resource counts and semantic label geometry remain identical.
The comparison retains two CSS pixels of edge allowance; locality does not establish natural-valley acceptance.
Evidence: `/tmp/tenka-kiso-valley-native-comparison-20261011.json`.

Independent full-scene and crossing-crop review accepts a modest west-bank transition, without an observed white halo, rectangular notch or lost connected crest.
Mid-view benefit remains small; the straight blue river and uniform bank still look schematic.
The Kiso native case passes in 11.0 seconds; two neighboring massif and river-corner cases pass in 45.6 seconds total.
Functional native work overlaps CPU checks, so these timings provide no isolated performance proof.
Logs: `/tmp/tenka-kiso-valley-candidate-native-20261011.log` and `/tmp/tenka-kiso-valley-neighbor-native-20261011.log`.

The full CPU run reports 5,837 passes, the same eight failures and one skip across 585 files in 113.99 seconds.
Normal and core types, scoped lint, formatting, asset validation and current-bundle budgets pass.
All 229 protected source, data, golden and original visual records retain their prior hashes.
Log: `/tmp/tenka-kiso-valley-full-cpu-20261011.log`; whole-game completion remains unproven.

Geographic labels now use opaque dark ink and a warm 1.5-pixel rim, without changing font sizes, strings, world anchors or LOD.
Independent review rejects the first one-pixel candidate for weak mountain and forest readability, then accepts the stronger revision as a bounded hierarchy improvement.
Legacy two-pixel occupancy prevents newly admitted districts from displacing an originally visible road label.
The pure geometry helper creates no font resources; distinct fixed paint styles still use distinct font-cache keys.

Direct Playwright headless Chromium passes one case covering six Mino and Kiso views in 21.1 seconds.
All visible geography IDs, strings, roles and anchors match the original; terrain, castles, armies, resources and campaign state also match.
Every fixed map sample outside the geography paint envelopes shows zero channel change; both mid views remain pixel-identical.
Evidence: `/tmp/tenka-geography-hierarchy-refined-native-comparison-20261011.json`; this proves bounded locality, not universal readability or performance.

The first native diagnostic fails because a live Pixi stroke object cannot serialize; scalar paint fields fix that error.
The focused suite passes 133 tests; normal and core types, scoped lint, formatting, assets and bundle budgets pass.
All 229 protected records retain their original hashes; whole-game acceptance remains open.
Log: `/tmp/tenka-geography-hierarchy-refined-native-20261011.log`; no Chrome plugin or visible browser window participates.

The first full CPU run finds three additional narrowphase failures: old text stand-ins omit the new stroke-style input.
An explicit legacy two-pixel style restores the stand-in contract without changing any original visibility assertion or production behavior.
After that fixture repair, 139 focused tests and two original font-cache controls pass.
Log: `/tmp/tenka-geography-hierarchy-refined-full-cpu-20261011.log` retains the eleven-failure run; it is not an accepted eight-failure result.

The repaired full CPU run reports 5,842 passes, eight failures and one skip across 586 files in 101.66 seconds.
Log: `/tmp/tenka-geography-hierarchy-final-full-cpu-20261011.log`; protected campaign and replay failures remain unresolved.

River shading now follows local segments and cumulative path length instead of decorative noise tied to the full bounding box.
Two genuine original-producer failures cover wrong-side daylight and downstream changes affecting upstream color; the Tenryu depth guard already passes before implementation.
All 46 focused controls pass, including original taper, world registration, quiet variation, allocation caps and WHITE-safe ownership tests.
The material adds bounded work at construction, not per-frame work; texture dimensions, matrices and resource limits remain unchanged.

Direct headless Chromium passes three cases in 24.7 seconds: normal Kiso views, the original bank-pixel control and ten renderer remounts.
The fixed mid and near views change 1,391 and 5,430 pixels inside water, including 200 and 1,421 Tenryu pixels.
Outside actual river capsules plus two CSS pixels, 536,423 and 529,074 samples show zero channel change.
All river metadata, terrain, castles, armies, labels, resource counts and campaign state remain identical.
Evidence: `/tmp/tenka-river-depth-candidate-native-comparison-20261011.json`; locality does not establish natural-bank or performance acceptance.

Independent paired-scene and crop review accepts improved bank shading without an obvious new dark-slot discontinuity.
Mid-view benefit remains subtle; long straight channels and their continuous light edges still look schematic.
One successful transport isolation does not prove the historical intermittent bounds anomaly is absent.
Log: `/tmp/tenka-river-depth-candidate-native-20261011.log`; whole-game acceptance remains open.

The full CPU run reports 5,845 passes, eight failures and one skip across 586 files in 105.28 seconds.
Normal and core types, scoped lint, formatting, assets and bundle budgets pass; all 229 protected records retain their prior hashes.
Log: `/tmp/tenka-river-depth-full-cpu-20261011.log`; campaign and replay blockers remain unresolved.

The Tenryu corridor experiment passes 47 focused tests and three headless cases, but independent art review rejects its negligible visual benefit.
Both changed files return to their exact accepted hashes; the restored 46 focused controls pass.
Log: `/tmp/tenka-tenryu-corridor-native-20261011.log`; no corridor opt-in remains in production.

Akaishi v2 replaces repetitive ridges with three unequal summit groups; the old asset, provenance and historical controls remain intact.
Only Akaishi's selected asset changes; thirteen other bindings and fourteen canonical masses and ridge sets remain unchanged.
Two authentic producer failures precede the migration; all 48 focused pack and raster tests then pass.
Actual content aspect is 0.528, not the requested 0.42; uniform containment retains natural proportions without squeezing the image.

Direct Playwright headless Chromium passes four cases in 33.0 seconds, without a plugin or visible window.
The cases cover normal Akaishi and Kiso views, the original river-bank pixel control and ten renderer remounts.
Fixed Akaishi mid and near views change 2,843 and 28,697 pixels inside its authored rectangle plus two CSS pixels.
Outside that rectangle, 534,672 and 479,788 map samples show zero channel change; no foreground exclusions apply.
River, water, coast, settlement, actor, label, campaign and resource diagnostics remain identical.
Evidence: `/tmp/tenka-akaishi-v2-focused-native-comparison-20261011.json`; the neighboring Kiso comparison also passes exact locality checks.

Independent paired-scene review accepts the unequal summits and broader saddles, with no new western-river or eastern-road burial.
The straight blue river through Akaishi remains schematic; this bounded adoption does not finish terrain-water composition or whole-game art.
The built-in image tool's final prompt and measured metadata remain in the asset's v2 provenance.
Log: `/tmp/tenka-akaishi-v2-candidate-native-20261011.log`; whole-game acceptance remains open.

The first full CPU run reports 5,847 passes, ten failures and one skip across 586 files in 109.31 seconds.
Exact failure-title comparison finds the prior eight failures plus two stale manifest inventory expectations, with no removed failures.
The inventory migration retains v1 hashes, frames and recursive references, and adds exact v2 reference-chain and forged-frame controls.
All 91 focused controls pass across four suites; normal and core types, scoped lint and formatting pass.
Log: `/tmp/tenka-akaishi-v2-full-cpu-20261011.log`; this ten-failure checkpoint is not an accepted eight-failure result.

The repaired full CPU run reports 5,849 passes, eight failures and one skip across 586 files in 139.99 seconds.
Exact sorted failure titles match the prior river-depth checkpoint, with zero added or removed failures.
All 34 public assets match their built copies; asset and bundle budgets pass.
Log: `/tmp/tenka-akaishi-v2-repaired-full-cpu-20261011.log`; original campaign and replay blockers remain unresolved.

The Akaishi river is Oi, not western Tenryu; the contact experiment passes separate same-generation snapshots to each mountain.
Genuine producer and caller failures cover unchanged Akaishi buffers and the missing sixth argument; an earlier buffer-count fixture error is not requirement RED.
The revised factory passes 49 controls; the caller passes 124, including stale-water rejection at both asynchronous boundaries.

Direct headless Chromium passes four cases in 33.7 seconds, without a plugin or visible window.
Akaishi mid and near views change 381 and 3,356 pixels within the actual Oi bank support and authored mountain rectangle.
Outside that scope, 541,464 and 534,240 fixed map samples show zero channel change; all river, actor, campaign and resource metadata remain identical.
Evidence: `/tmp/tenka-akaishi-oi-contact-native-comparison-20261011.json`; locality does not establish a convincing valley.

Independent paired-scene review rejects the pale, nearly constant-width incision; the wooded shoulders do not descend into the river valley.
All four changed code paths return to their exact accepted V2 hashes; the original 47 factory-related and 121 caller controls pass.
The restored build matches the accepted V2 bundle; no Akaishi Oi-contact opt-in remains in production.
Log: `/tmp/tenka-akaishi-oi-contact-candidate-native-20261011.log`; no full CPU run applies to this rejected candidate.

Akaishi V3 reshapes its internal valley around the unchanged Oi river; V1/V2 assets, provenance and real uniform-fit controls remain intact.
The first two generated layouts retain an eastern middle floor and fail alignment review.
The third uses an actual headless crop as a spatial guide, not as copied texture or generated-art provenance.
Its measured alpha frame is `(142,23,787,1495)`; only Akaishi's binding changes, without canonical river, mass or ridge edits.

All 94 focused controls pass; normal and core types, scoped lint, formatting, asset validation and bundle budgets pass.
Direct Playwright headless Chromium passes four cases in 32.6 seconds, without a plugin or visible window.
Fixed mid and near views change 3,001 and 30,054 pixels inside Akaishi's authored rectangle plus two CSS pixels.
Outside that scope, 534,672 and 479,788 map samples match every channel exactly; no foreground exclusions apply.
Water, river, coast, settlement, actor, label, campaign and resource metadata remain identical; neighboring Kiso locality also passes.
Evidence: `/tmp/tenka-akaishi-v3-akaishi-native-comparison-20261011.json`; native log: `/tmp/tenka-akaishi-v3-candidate-native-20261011.log`.

Independent native review accepts this bounded regional improvement: Oi largely follows a connected low corridor rather than the main summit face.
The middle line remains near the western floor edge, and the straight blue stroke still simplifies the valley.
MID gains remain smaller; this adoption does not finish whole-map art, performance or gameplay acceptance.
The built-in image tool's final prompt, measured metadata and both actual references remain in V3 provenance.
No rejected Akaishi contact-mask opt-in returns; V3 only changes the painted terrain composition.

The complete CPU run reports 5,852 passes, eight failures and one skip across 586 files in 115.91 seconds.
Exact sorted failure titles match accepted V2, with zero added or removed failures; prior campaign, replay and deterministic-trajectory blockers remain unresolved.
All 229 protected records remain unchanged; all 34 public PNGs match their built copies.
Logs: `/tmp/tenka-akaishi-v3-full-cpu-20261011.log` and `/tmp/tenka-akaishi-v3-full-cpu-failure-comparison-20261011.json`.
Whole-game acceptance remains open; this checkpoint only adopts the bounded Akaishi composition improvement.

Castle placards now use aged parchment for main castles and muted earth paper for branches, with darker numeric registers.
Both paper and numeric surfaces stay opaque; unchanged text colors retain minimum contrast 6.41 across both ordinary tier registers.
Warning states brighten only the existing paper; owner seals, relation shapes, warning triangles and target outlines remain intact.
Typography, exact values, painted bounds, layout, anchors, leaders, LOD and private TextStyle lifetimes remain unchanged.

Two actual-factory color failures precede the material change; all 23 focused controls pass across six suites.
Normal and core types, scoped lint, formatting, asset validation and bundle budgets pass.
Direct Playwright headless Chromium passes four cases in 35.3 seconds, without a plugin or visible window.
The cases retain original content-clearance and normal-motion inspector controls, normal campaign views, and selected critical/non-warning castles at three UI scales.

Eight paired views preserve exact campaign, command, camera, water, actor, label-layout and resource metadata.
Changed pixels stay inside actual unchanged placard paint rectangles plus two CSS pixels; the complete scene uses no HUD or foreground exclusions.
Normal MID/NEAR views change 53,109/51,025 interior pixels; all 841,788/840,979 exterior pixels match every channel exactly.
All six selected views also show zero exterior channel change.
Evidence: `/tmp/tenka-castle-placard-material-native-comparison-v2-20261011.json`; native log: `/tmp/tenka-castle-placard-material-candidate-native-20261011.log`.

Independent review accepts this bounded whole-map hierarchy improvement across all eight pairs, with readable names, troop totals and warning prominence.
Dense rectangular repetition and crowded battle flags, numberplates and leaders remain; whole-game art, color-vision and performance acceptance stay open.
No smaller fonts, hidden labels, moved interaction anchors or new graphics resources create this result.

The complete CPU run reports 5,853 passes, eight failures and one skip across 586 files in 111.77 seconds.
Exact sorted failure titles match Akaishi V3, with zero added or removed failures; existing campaign and replay blockers remain unresolved.
All 229 protected records remain unchanged, and all 34 public PNGs match their built copies.
Logs: `/tmp/tenka-castle-placard-material-full-cpu-20261011.log` and `/tmp/tenka-castle-placard-material-full-cpu-failure-comparison-20261011.json`.
This checkpoint adopts the bounded placard material change, not whole-game acceptance.

A wood-pole and linen-cloth candidate does not meet the native battle-scene art gate; the candidate is not adopted.
All 116 focused controls pass, and direct Playwright headless Chromium passes four cases in 24.1 seconds without plugins or visible windows.
Seven paired full scenes retain exact campaign state, commands, geometry and resources, with zero changed pixels outside unchanged signal rectangles plus two CSS pixels.
Independent review finds slightly softer NEAR outlines but no practical MID improvement; red flags, black numberplates and leaders still dominate the formations.
Evidence: `/tmp/tenka-army-cloth-material-native-comparison-20261011.json`; native log: `/tmp/tenka-army-cloth-material-candidate-native-20261011.log`.
The reference records this rejected candidate in art-bible section 6.5; test success does not establish whole-game visual acceptance.

The candidate CPU run reports 5,858 passes, eight failures and one skip in 107.08 seconds; all eight failure titles match the prior checkpoint.
This result describes the rejected candidate, not a new accepted production version.

Painted army numberplates now use a state hierarchy: ordinary MID/NEAR plates use opaque earth paper with dark numbers.
Selected, routed, engaged, sieging or under-seven-day supply plates retain their original inverse colors; far and missing-art profiles remain unchanged.
Exact values, font size, geometry, layout, morale pips, leaders, world anchors and picking remain unchanged.
Late art admission and removal refresh the existing private style and plate paint without waiting for an unchanged-props update.
Solid earth/ink contrast measures 8.16693:1; stable style identity does not prove stable GPU font-cache memory.

Two actual-factory failures precede the change; all 117 focused controls pass, including the original 111 unchanged controls.
Normal/core types, scoped lint, formatting, asset validation and bundle budgets pass.
Direct Playwright headless Chromium passes five cases in 26.9 seconds, without a plugin, visible window or relaxed deadline.
Ten paired full scenes retain exact state, commands, geometry and resources; comparison excludes only layout run counters and ticker timing.
All changed MID/NEAR pixels remain within unchanged army plate rectangles plus two CSS pixels, without HUD or foreground exclusions.
The FAR pair matches all 921,600 pixels exactly across every channel.

The complete CPU run reports 5,859 passes, eight failures and one skip across 587 files in 107.75 seconds.
Exact sorted failure titles match the prior accepted checkpoint, with zero added or removed failures; existing campaign and replay blockers remain unresolved.
All 229 protected records remain unchanged, and all 34 public PNGs match their built copies.
Evidence: `/tmp/tenka-army-plate-material-native-comparison-20261011.json` and `/tmp/tenka-army-plate-material-full-cpu-failure-comparison-20261011.json`.

Independent review accepts all ten pairs: ordinary plates recede, selected and urgent plates stand out, and FAR remains unchanged.
Small formations, repeated red flags, leaders and large panels remain; this checkpoint adopts only the plate material hierarchy.
Whole-game art, color-vision and performance acceptance remain open.

MID roads now use pale earth colors; NEAR roads use quieter soil, and bridges use timber decks with stone abutments.
Route centerlines, widths, bridge geometry, coastal protection and travel data remain unchanged; longitudinal wear replaces transverse marks inside the original casing.
Visible FAR arterial roads, grade-one paths, sea routes and selected highlights retain their controls; hidden FAR bridge instructions also use timber colors.
The reference records these distinctions in art-bible section 6.3.3.

The first soil candidate passes tests but fails independent art review because its dark MID roads weaken inland route visibility.
The second candidate restores MID visibility with lighter soil, without wider roads or saturated gold.
Independent review accepts nine full-scene pairs and eight bridge crop images for this bounded material change.
Thin minor paths, straight route geometry, crowded flags and battle labels remain unresolved.

Actual producer failures precede both candidates; all 93 focused controls pass after explicit material-oracle updates.
Normal/core types, scoped lint, formatting, build, asset validation and bundle budgets pass.
Direct Playwright headless Chromium passes three cases in 24.2 seconds and the separate national road control in 5.9 seconds.
No plugin, visible window, deadline relaxation or baseline replacement supports these results.

Two normal MID/NEAR scenes retain exact campaign state, commands, geometry and resources, apart from ticker and layout-run counters.
Road-off full scenes match every channel exactly; 3,428/4,978 changed road pixels remain within actual road paint plus two CSS pixels.
All 892,762/868,370 pixels outside those regions match every channel exactly, without HUD, actor or terrain exclusions.
The seven battle views support art review, not this road-only pixel-locality certificate.
Evidence: `/tmp/tenka-road-soil-v2-native-comparison-20261011.json`; native logs: `/tmp/tenka-road-soil-v2-{candidate,national}-native-20261011.log`.

The frozen CPU run reports 5,866 passes, eight failures and one skip across 588 files in 105.83 seconds.
All eight sorted failure titles match the previous accepted plate checkpoint; campaign and replay failures remain unresolved.
All 229 protected records remain unchanged, and all 34 public PNGs match their built copies.
Logs: `/tmp/tenka-road-soil-v2-full-cpu-20261011.log` and `/tmp/tenka-road-soil-v2-full-cpu-comparison-20261011.json`.
This checkpoint adopts only road and bridge material; whole-game art, color-vision and performance acceptance remain open.

The separate original three-camera screenshot test still fails against its unchanged protected baselines.
Overview, operational and close differ by 195,640, 280,205 and 285,739 pixels, respectively, against the original 100-pixel limit.
These differences describe the accumulated redesign, not an isolated road regression; no baseline replacement or threshold change resolves this gate.
Log: `/tmp/tenka-road-soil-v2-original-camera-native-20261011.log`; all three actual images and diffs remain in its output directory.

Independent review accepts these three actual views against the old references for terrain relief, command grouping, castle silhouettes and state hierarchy.
River pipes, repeated mountain profiles, tiny MID bodies and battle clutter remain; this art decision does not make the original snapshot test pass.
No protected baseline changes, forty-clan color-vision acceptance or performance acceptance follow from this review.

Direct Chromium CDP emulation now captures achromatopsia, deuteranopia, protanopia and tritanopia at the original three camera presets.
Four headless cases pass in 34.6 seconds, with 36 normal, emulated and restored full-frame PNGs plus raw diagnostics.
Each mode changes actual framebuffer pixels; restoration returns exact RGBA channels without a CSS filter, plugin or visible window.
State invariants, commands, presentation geometry, layer rebuilds and resources remain unchanged, apart from ticker and four explicit layout-run counters.
The source reference describes this artifact gate in art-bible section 3.3.1.

All twelve mode/camera observations contain eleven positive finite signal frames intersecting the canvas, including friendly, enemy, neutral and one routed army.
MID/NEAR contain eleven painted formations; FAR retains symbols, and warning records do not filter offscreen frames.
These records do not prove HUD clearance, successful human recognition, every supply/siege glyph or all three road grades.
The actual fixture has three owners, not forty; whole-frame pixel change alone does not prove useful map-cue discrimination.
Log: `/tmp/tenka-color-vision-map-native-20261011.log`; screenshots and raw observations remain in its output directory.

Only the new browser test and evidence text change after the accepted road checkpoint; no production source or built asset changes support this gate.
Normal/core types, scoped lint and formatting pass; the preceding 5,866-pass CPU result belongs to the road checkpoint, not a new CPU run.
All 229 protected records remain unchanged, and all 34 public PNGs match their built copies.
Independent audit revalidates all 36 states and twelve restoration pairs: zero invariant violations, metadata mismatches or restored-pixel differences.
Each view contains five friendly, four enemy and two neutral signal envelopes; close neutral and warning envelopes are present, not absent.
Supply glyph bounds and HUD clearance remain unproven.

Independent review of twelve simulated images and three normal references rejects color-vision acceptance.
Names, troop totals, priority plates and main road continuity remain readable; close enemy pointed flags and neutral diamonds remain visible.
MID/overview relations and close friendly double rings are not reliably distinguishable; routed, siege, supply and warning microglyphs do not communicate their meanings reliably.
Exact three-grade road distinction remains inconclusive, especially faint paths under achromatopsia; forty-clan acceptance also remains open.
The next visual work must improve noncolor cues, not treat passing artifact tests as perceived readability.

The army annotation candidate adds distinct relation seals and independent state and supply text to the pixel-locked troop row.
FAR keeps these cues while ordinary unselected troop numerals remain hidden; complete row bounds enter the existing placement solver.
Reserved relation cells measure fourteen by seventeen-and-a-half CSS pixels, not opaque glyph masks.
The source reference records the candidate in art-bible section 3.3.2.

Nine direct headless native cases report eight passes and one real collision failure in 30.3 seconds.
Narumi at UI scale 1.5 retains a 37.24-square-pixel plate overlap; the unchanged zero-overlap gate rejects the candidate.
Log: `/tmp/tenka-army-annotation-candidate-native-20261011.log`; all six crowded views and raw pair observations remain available.
Four original color-vision cases pass in 33.7 seconds, with exact restored pixels and unchanged state.
Log: `/tmp/tenka-army-annotation-candidate-cvd-20261011.log`.

Independent review conditionally accepts relation, state and supply recognition across three normal and twelve simulated views, subject to collision repair.
The overview contains denser dark annotation tiles; model-first hierarchy, castle warnings, road grades and forty-clan acceptance remain open.
The candidate build, normal/core types, scoped lint, formatting, assets and bundle budget pass.

Twenty-three new producer/projection unit cases pass; the original compatibility run records eight intentionally changed width and FAR-visibility expectations.
The aligned original contracts and producer suite pass 125 cases; exact pip geometry, clamp-derived leaders, numeral visibility and material values remain explicit assertions.
Normal/core types, scoped lint and formatting pass after these test changes; no protected snapshot changes follow.
Logs: `/tmp/tenka-army-annotation-contract-red-actual-20261011.log` and `/tmp/tenka-army-annotation-contract-green-final-20261011.log`.

All 229 protected records remain unchanged, and all 34 public PNGs match their built copies.
This candidate remains unadopted; the preceding complete CPU result does not certify it.

Six original gameplay cases pass against the candidate bundle in 44 seconds through direct headless Chromium.
They cover army retarget/recall, queued orders across save/reload, modal save guards, persistent settings, owned pauses and mandatory proposals.
The army journey controls ordinary animation-frame ticks with Playwright Clock; this result is not a wall-clock performance measurement.
Log: `/tmp/tenka-army-annotation-candidate-gameplay-20261011.log`.

The second annotation candidate moves the actual morale-dot container upward by 0.75 local units.
Dot radius, count, colors and text remain unchanged; actual Graphics bounds retain 0.75-unit clearance below the plate stroke.
The full dot-bearing height changes from 21.5 to 20.75 local units; rows without dots retain height 16.
Six physical-spacing tests pass, alongside 134 original contract and annotation/projection checks.
Logs: `/tmp/tenka-army-annotation-pip-spacing-green-20261011.log` and `/tmp/tenka-army-annotation-pip-compat-green-20261011.log`.

All six fresh crowded views contain zero plate-pair overlap, but Narumi at scale 1.5 retains a strict leader crossing.
Physical spacing removes one historical baseline collision; each view still contains another real control collision before displacement.
The native fixture now checks that dense-view premise while preserving every final overlap, leader, visibility, font and radius assertion.
The direct headless rerun rejects the crossing; the second candidate remains unadopted.
Log: `/tmp/tenka-army-annotation-pip-v2-leader-red-20261011.log`.
Four original color-vision artifact cases pass in 33.5 seconds: `/tmp/tenka-army-annotation-pip-v2-cvd-20261011.log`.

The retained first-version geometry test remains unchanged in `output/evidence/army-annotation-v1-layout-rejected.spec.ts`.
The current integration test derives height from the actual army factory and fails on the same strict leader crossing.
An independent edge-contact certificate satisfies all original geometry guards, but does not certify the runtime solver.
Logs: `/tmp/tenka-army-annotation-v2-producer-layout-20261011.log` and `/tmp/tenka-annotation-v2-edge-contact-certificate-20261011.json`.

The third prototype exceeded the original whole-candidate traversal count; it remains rejected despite focused passes.
The fourth candidate adds leader-contact proposals within the original four complete traversals, proposal limit and comparison budget.
The displacement disk, fixed-overlap ceilings, selected priority and final geometry guards remain unchanged.
Thirty-seven layout tests pass, including the integration that uses actual producer bounds.
Log: `/tmp/tenka-army-v2-leader-four-traversals-green-final-20261011.log`.

All nine direct-headless layout cases pass in 29.1 seconds; six crowded views clear every pair overlap and strict leader crossing.
Four original color-vision cases pass in 33.4 seconds, with exact restored pixels and unchanged state.
Seven gameplay and road cases pass in 53.6 seconds; this is not a wall-clock performance measurement.
Logs: `/tmp/tenka-army-annotation-forest-v4-native-20261011.log`, `/tmp/tenka-army-annotation-forest-v4-cvd-20261011.log` and `/tmp/tenka-army-annotation-forest-v4-gameplay-road-20261011.log`.

Independent review accepts demonstrated relation shapes, visible status/supply text, troop numerals and physical morale spacing in sixteen actual frames.
The supplied scenes do not prove color-vision recognition of the battle and subjugation characters.
Overview clutter, model-first hierarchy, forty-clan recognition and whole-game art acceptance remain open.

Forest coverage now records actual valid clips, rejects zero-area polygons and retains baked fallback when coverage is incomplete.
All ten valid forest placements retain their original uniform transforms, clips and shared texture ownership.
Forty-nine focused cases, normal/core types, scoped lint and formatting pass after a test-only TypeScript narrowing correction.
Log: `/tmp/tenka-forest-foundation-typefixed49-green-20261011.log`; no new forest bitmap enters production.

The frozen full CPU collection records 5,900 passes, nine failures and one skip across 593 files.
Eight failure titles match the accepted road baseline; one additional FAR consumer test fails on its width expectation.
Neither focused passes nor native renders replace this failed complete collection.
Logs: `/tmp/tenka-army-annotation-forest-v4-full-cpu-20261011.log` and `/tmp/tenka-army-annotation-forest-v4-full-cpu-comparison-20261011.json`.

The new failure exposes an omitted consumer-test migration from numeral-only plates to complete annotation rows.
The corrected test explicitly checks ordinary FAR width thirteen, aggregate width thirty-three and selected width fifty-four local units.
Ordinary numerals stay hidden; aggregate text remains `+3`, and selected text remains `2,000`.
All original radius, font, scale, lifecycle and reset guards remain unchanged; all 121 consumer cases pass without production changes.
Normal/core types, scoped lint and formatting pass; the preceding failed complete collection remains preserved.
Logs: `/tmp/tenka-army-annotation-far-consumer-readonly-20261011.log` and `/tmp/tenka-army-annotation-far-consumer-green-20261011.log`.

The corrected complete collection records 5,901 passes, eight failures and one skip across the same 593 files.
Exact sorted failure titles match the accepted road baseline, with zero additions or removals; the eight failures remain unresolved.
Four workers shorten the collection; these elapsed results are not a performance comparison.
Logs: `/tmp/tenka-army-annotation-forest-v4-contract-full-cpu-20261011.log` and `/tmp/tenka-army-annotation-forest-v4-contract-full-cpu-comparison-20261011.json`.

All 1,377 recorded sources remain exact through that corrected collection; the test corrections change no production source or built bundle bytes.
The same fifty-three bundle files retain the twenty direct-headless browser results; all 229 protected records and thirty-four public PNG copies remain exact.
Assets report zero errors or warnings, and the existing bundle budget passes; no rejected forest or Suzuka image enters production.
The next FAR hierarchy and connected-relief work remains unverified and does not inherit these candidate results.

The fifth FAR revision removes empty paper backing from healthy, unselected, nonaggregate armies without state or supply text.
Relation seals remain visible; selected, aggregate and urgent plates retain their backing.
Five authentic failing producer tests precede 146 focused passes; normal/core types, scoped lint and formatting pass.
Nine Mac native cases and four color-vision cases pass with the original direct-headless configuration.

All ten MID/NEAR pairs retain exact complete RGBA pixels; FAR differences stay within six eligible plate envelopes plus two CSS pixels.
The observed FAR drawable count decreases from forty-nine to forty-three; state, commands and other measured diagnostics remain unchanged.
Independent review accepts this bounded reduction in overview clutter, not complete map hierarchy or forty-clan recognition.
Logs: `/tmp/tenka-army-far-empty-register-v5-native-20261011.log` and `/tmp/tenka-far-empty-paper-native-comparison-20261011.json`.
The complete Mac CPU collection reports 5,906 passes, eight unresolved failures and one skip across 594 files.
Log: `/tmp/tenka-army-far-empty-register-v5-full-cpu-20261011.log`.

SSH tasks use sim1, sim2, sim3 and sim4 with isolated Node 22.17.0 runtimes and unchanged patched dependencies.
A test-only coast fixture removes two platform-dependent sine inputs; all six existing expected output hashes remain unchanged.
Cross-fed inputs produce exact outputs on both platforms; the production coast solver remains unchanged.
The fixed Linux collection reports 5,905 passes, the same eight failures and two skips across 594 files.
Log: `/tmp/tenka-sim2-full-cpu-portable-20261011.log`; this is not a timing comparison against Mac.

Original Linux headless rendering fails during an 8192-square, four-sample field-mask allocation with Vulkan device-memory exhaustion.
A standalone framebuffer reproduction fails at that size; its 256-square control succeeds without Pixi or application shaders.
The isolated viewport candidate bounds the actual field quad while preserving full-world masks, texture phase and antialiasing settings.
Sim1 records a largest 2048-by-1024 target with zero shader failures, GL errors, context losses or GPU crashes.
Evidence: `/tmp/tenka-linux-field-oom-evidence-20261011/` and `/tmp/tenka-field-viewport-sim1-20261011.DXDK2I/field-resource-diagnostic.json`.

The field candidate passes 133 focused cases, normal/core types, scoped lint and formatting before production adoption.
Mac passes nine original native cases and four original color-vision cases; sim4 native reports six passes and three original sixty-second timeouts.
Sim4 separately passes all four original color-vision cases; its combined thirteen-case result remains ten passes and three timeouts.
No test deadline, console guard, renderer backend or golden changes support these results.

Strict comparison keeps all ten FAR/MID images exact, but five NEAR images contain small one-or-two-level channel differences.
The strict comparison fails honestly; floating-point UV and filter rounding remain plausible causes, not uniquely proven causes.
Evidence: `/tmp/tenka-field-viewport-mac-native-comparison-20261011.json`; exact NEAR pixels and Linux native deadline acceptance remain open.

The sim1 plate control reproduces one original sixty-second timeout without OOM, context loss, shader errors, console errors or page errors.
Five views finish before the sixth starts near the deadline; the final bounding-box error does not establish a stuck minimap.
The sim2 default-worker CPU collection records 5,911 passes, nine failures and two skips across 596 files.
Its additional failure reaches the existing five-second App journey deadline; the other eight core failures remain unresolved.
Both failed collections remain preserved; bounded-worker CPU diagnosis does not extend any test deadline.

The bounded four-worker collection reports 5,912 passes, eight failures and two skips across 596 files.
All eight failure titles and complete normalized bodies match the portable Linux baseline; the original five-second App journey passes in 1,641 milliseconds.
Logs: `/tmp/tenka-field-viewport-sim2-default-cpu-20261011.log` and `/tmp/tenka-field-viewport-sim2-four-worker-cpu-20261011.log`.

Independent source review accepts the targeted oversized-filter fix; production adoption changes only its factory and actual camera consumer.
The canonical rerun passes 133 focused cases, normal/core types and scoped lint; its direct Vite build completes in 3.46 seconds.
All runtime bundles remain byte-exact; manifest and source-map dependency paths differ because the isolated build uses a dependency symlink.
Strict NEAR differences and Linux timeouts remain failures, not waivers; complete artifact accounting retains these metadata differences.

The adopted canonical bundle passes seven original direct-headless army, road, save and settings cases in 52.8 seconds.
Actual retarget/recall, authored bridges, queued-save continuation, modal save protection, persistent preferences, owned pauses and mandatory proposals retain their original guards.
Log: `/tmp/tenka-field-viewport-adopted-gameplay-20261011.log`; these functional timings do not establish isolated performance acceptance.
Assets report zero errors and warnings; the existing bundle budget passes, all thirty-four public PNG copies match and all 229 protected inputs remain exact.
The adoption record freezes 1,383 source and candidate files plus fifty-three built files; six metadata files differ only in dependency-resolution paths.
All forty-seven other built files match the isolated candidate exactly, including every runtime script, stylesheet, image, font and HTML entry.

Independent close-view review rejects both connected Suzuka prototypes despite their passing native checks.
The flat prototype loses rock detail; the woodland-albedo prototype reads as a dark wooded embankment rather than a convincing mountain ridge.
A new original rock-material image remains an isolated candidate, without a public asset binding or whole-map acceptance.
Image and exact built-in generation prompt: `output/imagegen/terrain-rock-material-v1-candidate.provenance.json`.
The actual opaque image measures 1254-square pixels, not the requested 1024-square pixels; decoded RGBA uses 6,290,064 bytes.
The original mountain artwork and all protected baselines remain unchanged; continuous relief, rock planes and natural forest transitions still need visual acceptance.

The third isolated prototype restores fractured-rock detail, but close-view review still rejects its uniform rocky band and insufficiently articulated summits and saddles.
Twenty focused sim3 cases and one five-view Mac native preview pass; these results do not authorize the rejected mountain's production adoption.

The fourth prototype produces three measured peaks and two saddles, but actual close-view review still rejects its soft continuous rock band.
The fifth changes only physical daylight response; twenty-six focused sim3 cases and one five-view Mac preview pass without production adoption.
Independent review still finds a rocky embankment rather than articulated mountain volume; this replacement branch stops, with all failed visual evidence retained.
The existing detailed mountain artwork stays canonical; a connected lower-foothill hybrid needs a separate design and resource review.

The isolated hybrid retains the original detailed mountain but adds a coarse, dark woodland skirt; independent close-view review rejects it.
Forty-nine focused cases and both original five-view native previews pass, without production adoption.
All changes stay inside the authored Suzuka mass plus two CSS pixels; Sunpu remains byte-exact.
Translucent mountain-core pixels change by up to twelve channel values; no fully opaque filtered core exists to prove frame equivalence.
Evidence: `/tmp/tenka-suzuka-hybrid-compare-20261011.json`; the original mountain stays canonical and this branch stops.

The adopted bridge correction places the existing raised timber batch above ground-road paint without changing geometry, resources or FAR visibility.
Ninety focused cases, normal/core types, scoped lint, asset validation and the original bundle budget pass.
The original canonical direct-headless road case passes in 9.8 seconds; its sixty-second deadline and five-minute suite limit remain unchanged.
Two isolated MID/NEAR scene pairs change only eighty and 391 pixels inside independently authored bridge envelopes, including original stroke support.
All outside RGBA channels and complete road-off images remain exact; state, commands and geometry retain their original guards.
Evidence: `/private/tmp/tenka-raised-bridge-candidate-20261011.1siEhm/comparison.json` and `/tmp/tenka-raised-bridge-adopted-native-20261011.log`.

Independent review accepts correct deck occlusion at the two authored crossings, not a redesign of all 477 land roads.
The initial isolated packaging failure omitted public inputs; its failed run remains preserved beside the corrected complete-public build.
Protected campaign data and goldens remain unchanged; no new baseline or visual threshold authorizes this correction.

The next isolated road-shoulder prototype passes ninety-four focused cases and both original native road and annotation cases.
Strict FAR/MID images remain exact; only 129 NEAR pixels change inside the original road-paint footprint plus two CSS pixels.
Both bridge crops remain exact, but independent full-scene review finds no meaningful naturalization; this candidate stays rejected and unadopted.
Evidence: `/private/tmp/tenka-road-shoulder-candidate-20261011.9eIHYT/comparison.json`; microscopic pixel changes do not establish a redesigned road network.

The adopted town material separates muted green-gray pitched roofs from warm walls, preserving geometry, alpha, shadows, resources and the legacy flat API.
Thirty-five focused cases pass across draw, geometry and river controls; normal/core types, scoped lint, formatting, assets and bundle budgets also pass.
Both original canonical direct-headless town and road cases pass in 25.7 seconds under their original deadlines.
Six isolated paired scenes change only roof and wall polygons plus two CSS pixels; all outside RGBA channels remain exact.
Campaign state, commands, HUD, constraints and resource ownership remain unchanged; independent original-size review accepts this bounded material improvement.
This acceptance does not establish dense historical towns or whole-map art completion.

The canonical audit retains 1,383 source records, all 229 protected inputs and all thirty-eight public assets.
All forty-seven runtime/public bundle files match the isolated town candidate; six metadata files differ only in dependency-resolution paths.
Evidence: `/private/tmp/tenka-town-material-candidate-20261011.GEMQ7I/fast-comparison.json` and `/tmp/tenka-town-material-adopted-native-20261011.log`.

The adopted castle warnings distinguish an ivory triangle/flame from a red diamond/exclamation, each with a dark outline.
Warning-only inverse camera scaling preserves fourteen CSS pixels and at least two CSS pixels of body clearance, without moving gameplay anchors.
All 164 focused cases, normal/core types, scoped lint, formatting, build, assets and original bundle budgets pass.
The first canonical collection preserves its 163-pass/one-failure result: an old road-tier helper mistakes the newly raised bridge for an arterial road.
Only that helper's tier identities and comment change; all visibility, rebuild-count and redraw assertions remain intact in the successful rerun.

The canonical twelve-view direct-headless control passes in 9.3 seconds; the rebased isolated original nine controls and four CVD cases also pass.
Across twelve actual mini-campaign views, 1,995 pixels change within old/new warning stroke envelopes plus fixed 1.25-CSS-pixel antialiasing support.
Every outside RGBA channel remains exact; bodies, anchors, rings, depth, HUD, campaign state, commands and bidirectional annotation sets remain identical.
The warning fixture uses existing mini-campaign sieges, not a national earned-siege journey; human CVD recognition and whole-map art remain open.
Evidence: `/tmp/tenka-castle-warning-rebased-20261011.iJ2SJ1/` and `/tmp/tenka-castle-warning-canonical-native-20261011.log`.

The first isolated warning candidate retained stale bridge ordering; its ninety-one to 424 outside pixels remain a preserved failure.
Rebasing onto accepted bridge and town sources removes that unrelated delta, without expanding masks or waiving animation differences.
The reused original baseline retains two older documentation files; runtime-bearing sources, tests, all fifty-three built files and public assets remain exact.
Canonical adoption preserves all 229 protected records and thirty-eight public assets; forty-seven runtime/public bundle files match the rebased candidate exactly.
Six metadata files differ only in declared dependency paths; complete normalized JSON, mappings, names and embedded source content match.

The isolated shoreline-distance sea prototype passes twenty-seven focused cases and both six-view normal-national headless captures.
All five original coast, river and foreground-water controls pass; source and both measured bundles remain frozen throughout native checks.
Six paired full scenes preserve state, commands, cameras, HUD, actor frames, annotation sets and resources exactly.
Changed pixels stay within actual displayed-coast distance sixty-four world units plus two CSS pixels of raster support; outside RGBA channels remain exact.
The independent national vector oracle checks 18,287 byte-different texels; their complete linear-filter support reaches at most 52.474 world units.
The producer records 21,531 blend assignments; integer RGB rounding explains why that count exceeds actual changed texels.

Independent original-size review rejects the broad, nearly uniform blue-gray halo at Sunpu MID; Ise and Suzuka also retain a fog-like border.
The candidate remains unadopted despite its passing locality, lifecycle and functional checks; the original sea stays canonical.
Evidence: `/tmp/tenka-sea-depth-paired-pixel-comparison-20261011.log` and `/tmp/tenka-sea-depth-waterguards-native-20261011.log`.
This distance field is a presentation cue, not measured bathymetry or accepted natural-water art.

The second isolated sea candidate replaces the gray blend with palette-derived submerged silt and dimensionless, channel-dependent absorption in linear light.
Thirty-two focused cases pass; both original six-view Mac headless captures preserve complete scene controls and exact outside pixels.
An independent sim2 probe checks four actual producer outputs, reversed coast winding, remote bytes and full linear-filter support.
The probe stubs unused Pixi constructors; these checks establish pixel arithmetic only, not native resources, frame rate or physical water depth.
Original-size review still rejects the uniform olive coastline fringe; the isolated candidate does not change the canonical sea.
Evidence: `/tmp/tenka-sea-depth-v2-paired-pixel-comparison-20261011.log` and `/tmp/tenka-sea-v2-sim2-probe-20261011.4p3v0N/result.json`.

The original five Linux headless water controls on sim4 finish with four passes and one sixty-second timeout, without backend or deadline changes.
The six-focus castle-clearance and signal-interference case times out while returning from settings; its target-closed error follows the deadline.
ReadPixels stall warnings remain in the raw browser log; this run does not establish their causal role or Mac timing equivalence.
All 1,390 candidate sources, fifty-three bundle files, thirty-eight public assets and 229 protected records remain exact after execution.
Evidence: `/tmp/tenka-sea-depth-v2-sim4-guard-evidence-20261011.gbGURh/waterguards-run1-native.log`, with the original trace and error context in the same directory.

The isolated Hida cast-shadow experiment stops after fifty-seven focused controls pass on sim1; no candidate build or native capture was run.
Its CPU coverage audit finds only one of 8,289 painted receiver centers outside the authored mountain mass.
Mountain mass bounds are not the hero silhouette: 2,161 centers lie outside the sampled hero alpha threshold.
The center-sample compositing estimate omits other terrain layers and cannot establish rendered grounding or art quality.
The unbuilt experiment remains unadopted; its retained bundle is the unchanged baseline, not a measured candidate build.
Evidence: `/private/tmp/tenka-hida-cast-shadow-candidate-20261011.ougSbH/extent.json` and `focused-final-frozen.log` in the same directory.

The separate retained-hero earth-support prototype also stops before mesh, shader or renderer integration, without a build or native capture.
The national guard probe produces 608 tile-split triangles from 512 source faces; it excludes 365 and retains 243 in three disconnected components.
Exact Float32 projected-edge connectivity and winding checks confirm the same result, with 1,425,805 charged work units.
One passing diagnostic confirms probe execution, not candidate admission; the declared one-MiB scratch cap remains unproved.

The independent factory test preserves its genuine missing-Mesh failure and passing full-triangle oracle controls; no missing API substitutes for that failure.
Road, body, lake and displayed-river guards stay unchanged; no clearance relaxation or height tuning rescues the stopped candidate.
Evidence: `/tmp/tenka-hida-earth-support-exact-projection-20261011.log` and `/private/tmp/tenka-hida-support-both-owners-authentic-red-20261011-1620.log`.

The unchanged core workload runs serially on idle sim2, with sixty warmup ticks and 360 measured samples for each attempt.
The first mean is 8.759 milliseconds against the original eight-millisecond limit; the permitted single retry passes at 6.500 milliseconds.
Both complete sample arrays remain in `/tmp/tenka-field-viewport-sim2-serial-mean-20261011.log`; this result does not establish native frame rate or midgame P95.
The separate P95 candidate fails original state invariants on day 450 during checkpoint preparation, before any measurement sample.
Log: `/tmp/tenka-field-viewport-sim2-p95-candidate-20261011.log`; no timing number, checkpoint substitution or invariant waiver replaces that failure.

Painted mid/near army banners now move at most twenty-four CSS pixels while soldiers, direction arrows, picking and world feet stay anchored.
Each banner preserves its original overlap ceiling for every fixed castle, ribbon and soldier frame; total banner pair overlap cannot increase.
The bounded helper retains residual collisions instead of hiding armies; the reference contract is in art-bible section 6.5.1.

The unchanged old native build fails the six-view overlap control; its raw rectangles, screenshots and failed report remain preserved.
Log: `/tmp/tenka-army-signal-native-red-20261010.log`; report: `/private/tmp/tenka-army-signal-native-red-report-20261010/`.
This behavioral failure is separate from the earlier missing-API unit failure.

The new prototype passes twelve direct-headless cases in 32.9 seconds, including both signal controls and existing depth, plate, geography and water controls.
Six crowded views reduce banner pair overlap from 598.820 or 862.301 square CSS pixels to zero, without increasing fixed-body overlap.
Actual body-anchor selection, far selected visibility, normal-day movement and idle layout counts pass; presentation-only checks preserve GameState.
Log: `/tmp/tenka-army-signal-prototype-native-20261010.log`; report: `/private/tmp/tenka-army-signal-prototype-native-report-20261010/`.

All 104 focused cases pass; this collection includes army-chip, body-art, helper and frame-measurement tests, but not renderer integration cases.
Build, normal/core types and scoped lint pass; logs use the `/tmp/tenka-army-signal-` prefix.
Screenshot review still finds crowded castle labels and schematic rivers; rectangle tests do not prove whole-map art acceptance.
The prototype excludes full coverage, HUD, coast, sea, smoke and performance gates; complete candidate verification remains pending.

The first complete signal candidate reports 5431 passed, nine failed and one skipped across 547 files in 116.26 seconds.
Eight failures remain the earlier core, golden and replay blockers; one renderer test still observes the old direction-arrow child.
The independent tangent and facing assertions remain required; the new anchored heading Graphics is the correct observation target.
Log: `/tmp/tenka-signal-verified-full-coverage-20261010.log`; all 1230 frozen hashes match after this run.
Read-only integration review also finds an uncaught capacity error; its renderer fallback and regression tests remain pending.

The capacity regressions both fail against the old renderer with the exact input-limit RangeError.
The renderer now resets all banners to baseline for excessive inputs and caches the signature only after accepted offsets apply.
It does not truncate obstacles or hide armies; excess-input separation remains unproven.
Logs: `/tmp/tenka-signal-cap-red-20261010.log` and `/tmp/tenka-signal-cap-green-20261010.log`; all 104 renderer cases pass after repair.

Normal/core types, full lint, build, assets and bundle checks pass; the final candidate freezes 1230 files.
Initial gzip is 573493 bytes, scenario gzip is 100841 bytes and the font remains 355600 bytes.
The final full collection and isolated native GPU run remain pending; earlier results describe their earlier candidates only.

The repaired signal candidate reports 5434 passed, eight failed and one skipped across 547 files in 115.48 seconds.
All UI and App cases pass; the same eight core, golden and replay failures remain unresolved.
Log: `/tmp/tenka-signal-final-full-coverage-20261010.log`.

Its isolated GPU collection reports thirty-six passed and two failed in 2.6 minutes, with no skipped cases.
One failure remains the frozen screenshots; the other reports zero overview army drawables despite visible flags.
The diagnostic walker skips a Graphics object's own drawing when that object has children; the new hidden tether exposes this defect.
Log: `/tmp/tenka-signal-final-gpu-20261010.log`; report: `/private/tmp/tenka-signal-final-gpu-report-20261010/`.
The layer assertion remains required; diagnostic repair and candidate re-verification remain pending.

Twenty moving armies produce 3063 frames over 30007.2 milliseconds on Apple M3 Max Metal, averaging 102.076 frames per second.
Frame-time p95 is 16.7 milliseconds; measured resource counts match before and after the workload.
This result belongs to the pre-diagnostic-repair candidate, not a future candidate or a forty-army national workload.

The observer regression fails against the old walker because a painted parent with a hidden child reports zero drawables.
The repaired walker counts its own drawing and visible children separately; hidden or transparent parents still suppress their complete subtree.
All 118 focused renderer, observer, coast-integration and frame-measurement cases pass; normal/core types and full lint pass.
Logs use the `/tmp/tenka-signal-observer-` prefix; the authentic failed GPU report remains preserved.
The repaired candidate freezes 1230 files under `signal-observed`; its complete CPU and native collections remain pending.

The observed candidate reports 5435 passed, eight failed and one skipped across 547 files in 121.24 seconds.
All UI and App cases pass; the eight existing core, golden and replay blockers remain unresolved.
Log: `/tmp/tenka-signal-observed-full-coverage-20261010.log`.

Its isolated direct-headless GPU run reports thirty-seven passed and one frozen screenshot failure in 2.6 minutes, without skipped cases.
The unchanged required-layer assertion now passes at every LOD; all six crowded banner views retain zero pair overlap.
Both `VISUAL_GPU=1` and `VISUAL_PERF=1` are enabled, with one worker and all CPU jobs complete before launch.
Log: `/tmp/tenka-signal-observed-gpu-20261010.log`; report: `/private/tmp/tenka-signal-observed-gpu-report-20261010/`.
No Chrome plugin, visible window or automatic report opening is used; the screenshot failure remains an unresolved gate.

Twenty moving armies produce 3068 frames over 30001.5 milliseconds on Apple M3 Max Metal, averaging 102.262 frames per second.
Frame-time p95 is 16.7 milliseconds; CPU-update p95 is five milliseconds; measured resource counts match before and after.
This twenty-army result does not prove forty-army national performance or stable whole-heap memory.
Build, full lint, types, assets and bundle checks pass; initial gzip is 573499 bytes and scenario gzip is 100843 bytes.
All 1230 frozen source hashes, 205 earlier core/data hashes and six frozen screenshot hashes match after verification.
Whole-game completion and whole-map art acceptance remain unproven; schematic rivers and crowded cross-type information remain next visual work.

The river candidate replaces concentric center strokes with one static texture shared by each river's original tapered segments.
Original endpoints, widths, round caps, roads, bridges and LOD visibility remain unchanged.
Ten owned textures contain 1078332 raw RGBA bytes; each texture has at most 32768 pixels and a 512-pixel side.
The reference contract is in `docs/visual/art-bible.md` section 3.2.5; bounded transverse detail varies with each river's enclosing rectangle.

All 190 focused material, renderer, Host, owner and frame-measurement cases pass; normal and core typechecks pass.
Logs: `/tmp/tenka-river-focused-current-20261010.log` and `/tmp/tenka-river-types-complete-20261010.log`.
Six frozen screenshot hashes and 205 earlier core/data hashes match; the prior banner build remains available during the original-pixel comparison.
The initial guarded comparison rejects every Kiso sample near the coastal shelf; that failure does not establish a material defect.
Log: `/tmp/tenka-river-native-guarded-original-20261010.log`; its raw images and rejected samples remain preserved.
The full CPU collection and revised geometry-only pixel comparison remain pending; no river performance or complete-art result is claimed.

The first river collection reports 5443 passed, nine failed and one skipped across 548 files in 132.41 seconds.
Eight failures match prior core, golden and replay blockers; the ninth bridge-contact test still selects strokes by the obsolete solid color.
Log: `/tmp/tenka-river-full-coverage-20261010.log`; the geometric wet-center and dry-abutment requirements remain unchanged.

The valid original-pixel comparison uses 24 clear Kiso rows and 32 clear Yodo rows, with all independent exclusion guards intact.
Both old left-bank ranges are zero, below the unchanged required range of three.
Log: `/tmp/tenka-river-native-upper-original-20261010.log`; earlier rejected-probe comparisons do not establish a material defect.

The prototype reports five native passes and one river failure in 18.8 seconds, without skipped cases.
Its Kiso flank ranges are five and 3.6667; Yodo ranges are 8.6667 and 2.3333, so one bank remains below three.
Log: `/tmp/tenka-river-prototype-native-20261010.log`; the failed pixels and raw measurements remain preserved before further material changes.
Build, full lint, types, assets and bundle checks pass; initial gzip is 574699 bytes and scenario gzip is 100844 bytes.
These prototype results do not prove the final river candidate, full-map art acceptance or whole-game completion.

The amplitude-four candidate still fails the unchanged Yodo bank requirement at 2.6667; its five other water controls pass.
Log: `/tmp/tenka-river-final-focused-native-20261010.log`; the failed report remains under `/private/tmp/tenka-river-amplitude4-native-report-20261010/`.
The next candidate changes only the deterministic variation amplitude to six; all geometry, sample locations and acceptance thresholds remain unchanged.
All six real-Pixi material tests, scoped lint, formatting and normal/core typechecks pass under the `tenka-river-amplitude6` log prefix.

The amplitude-six native river control passes with 24 Kiso rows and 32 Yodo rows in 5.1 seconds.
Kiso flank ranges are six and 6.3333; Yodo flank ranges are 12.3333 and 3.6667, within the unchanged three-to-eighteen interval.
Idle and overview-to-close pixels match exactly; all ten owners, canonical river points and LOD/resource checks pass without GameState changes.
Log: `/tmp/tenka-river-amplitude6-native-20261010.log`; report: `/private/tmp/tenka-river-amplitude6-native-report-20261010/`.
The bridge-contact extraction repair passes all three original wet-center and dry-abutment controls without production geometry changes.
Log: `/tmp/tenka-river-bridge-extraction-green.log`; the authentic extraction failure remains preserved separately.

Native screenshot review confirms quiet river paint, but canonical straight segments and crowded cross-type labels still limit whole-map appearance.
The pixel control does not prove every river class, cap, junction or transverse bank-depth relation.
The complete frozen-source CPU and isolated native collections remain pending; no final performance or whole-game result is claimed.

The complete amplitude-six collection uses 1233 unchanged frozen files and reports 5443 passed, nine failed and one skipped in 122.94 seconds.
Log: `/tmp/tenka-river-frozen-full-coverage-20261010.log`; the repaired bridge-contact test passes.
Eight failures match existing core, golden and replay blockers; the ninth repeats the urgent-toast dismissal failure from the preceding mixed collection.
The repeated UI failure remains unresolved, not waived as a flaky result; serial timer diagnostics remain pending.
The preceding collection reports the same counts in 138.59 seconds under `/tmp/tenka-river-final-full-coverage-20261010.log`.
The final build, full lint, normal/core types, assets and bundle checks pass; initial gzip is 574701 bytes and scenario gzip is 100846 bytes.

Native performance remains pending until all CPU diagnostics finish; the complete game and whole-map art remain unaccepted.

Serial unchanged V8 diagnostics pass the urgent case alone and all 64 MainScreen cases; the complete-file run takes 31.54 seconds.
The actual 300-millisecond exit callback fires after 798.418 milliseconds without cancellation; the successful wait leaves about 61 milliseconds before its deadline.
Ten actual river helpers take about 41.7 milliseconds; this measurement does not establish river-only causality or excuse the repeated full-suite failure.
Logs: `/tmp/tenka-river-toast-isolated-v8.log`, `/tmp/tenka-river-main64-isolated-v8.log` and `/tmp/tenka-river-toast-timer-v8-trace-corrected.log`.
No repository source, timer behavior, deadline or assertion changes for these diagnostics.

The frozen direct-headless native collection reports thirty-eight passed and one unchanged screenshot failure in 2.6 minutes, with no skipped cases.
Both `VISUAL_GPU=1` and `VISUAL_PERF=1` use one worker after all CPU diagnostics finish; no Chrome plugin or visible window is used.
Log: `/tmp/tenka-river-frozen-native-20261010.log`; report: `/private/tmp/tenka-river-frozen-native-report-20261010/`.
The final river pixels, required layers, interaction controls, zoom and remount resource checks pass; the frozen screenshot comparison remains unresolved.

Twenty moving armies produce 3066 frames over 30005.5 milliseconds on Apple M3 Max Metal, averaging 102.181 frames per second.
Frame-time p95 is 16.7 milliseconds; CPU-update p95 is 4.9 milliseconds; all measured resource counts match before and after.
River ownership remains ten textures, ten sources, ten listeners and 1078332 raw RGBA bytes throughout the workload.
All 1233 frozen source hashes, 205 earlier core/data hashes and six frozen screenshot hashes match after verification.
This run does not prove forty-army national performance, stable whole-heap memory, complete river geography or whole-map art acceptance.
The nine CPU failures and frozen screenshot failure remain blockers; whole-game completion remains unproven.

The geographic-component candidate reserves visible castle models, durability bars and warning glyphs alongside the existing army, plate and ribbon obstacles.
World anchors, visibility, text and the forty-eight-pixel displacement limit remain unchanged; hidden component layers provide no new obstacles.
Three authentic wiring tests fail against the old producer and pass after the integration; the original renderer controls remain intact.
Logs: `/tmp/tenka-geo-castle-wiring-red-20261010.log` and `/tmp/tenka-geo-castle-wiring-green-20261010.log`.

The independent six-view audit finds a visible HP-frame collision in the Narumi 1.5 view, involving the background Sunpu district label.
Its original-position area is zero; the placed label overlaps Sunpu's HP frame by 86.85 square CSS pixels.
Canvas containment and measured HUD, report and minimap exclusions pass; this is a frame collision, not an opaque glyph-pixel proof.
Log: `/tmp/tenka-geographic-hp-old-red-20261010.log`; all six raw views precede the failed nonincrease assertion.

The prototype passes six direct-headless geography, flag and river controls in 17.7 seconds.
The measured HP area becomes zero; existing geography clearance, moving obstacles, idle stability, original river pixels and mandatory banners pass.
Log: `/tmp/tenka-geo-components-prototype-native-20261010.log`; report: `/private/tmp/tenka-geo-components-prototype-native-report-20261010/`.
Residual soldier and signal frame overlaps remain; these results do not prove complete cross-type information clearance or whole-map art acceptance.

Startup diagnostics compare actual woodland admission with the existing loader's normal missing-material fallback, without replacing MainScreen or the renderer.
Omitting only woodland leaves about 371 milliseconds before the unchanged deadline; the original control leaves about 71 milliseconds.
Logs: `/tmp/tenka-river-toast-woodland-omission-v8-actual.log` and `/tmp/tenka-river-toast-unchanged-control-v8.log`.
Both callbacks execute without cancellation; the comparison does not justify changing Toast semantics or test deadlines.

The producer now yields once before the synchronous mountain-material batch and repeats its generation, terrain, layer and disposal checks.
Three scheduling and lifecycle tests fail against the old source, then pass; swap and disposal during the yield attach no stale mountain masks.
Log: `/tmp/tenka-mountain-input-yield-red.log`; all 110 renderer cases pass under `/tmp/tenka-mountain-input-yield-renderer-green-final.log`.
The unchanged 64 MainScreen V8 cases pass in 31.76 seconds; this serial result does not prove the repeated full-workload failure resolved.
Log: `/tmp/tenka-mountain-input-yield-main64-v8-green.log`; normal types, scoped lint and formatting pass.
The complete candidate CPU/native collections and per-component placement guard remain pending; no whole-game completion is claimed.

The optional protected-component input forbids each accepted label position from increasing overlap with any individual protected castle frame.
The original position remains eligible; the forty-eight-pixel limit, label priorities and two-argument behavior remain unchanged.
The authentic aggregate-score regression trades zero HP overlap for 120 square CSS pixels; the new guard rejects that trade.
Logs: `/tmp/tenka-geographic-hard-channel-red-20261010.log` and `/tmp/tenka-geographic-hard-channel-green-20261010.log`; all eight pure layout cases pass.
The producer supplies visible castle model, durability and warning frames to this guard; no army world position or interaction anchor changes.

All 170 focused renderer, Host, layout and frame-measurement cases pass; build, full lint, types, assets and bundle checks pass.
Log: `/tmp/tenka-geo-components-focused-final-20261010.log`; the reference contracts are `art-bible.md` sections 10.1 and 11.1.
The complete candidate freezes 1234 source, test, tool, configuration, dependency and reference files under `geographic-components`.
Its complete CPU collection and direct-headless individual-frame controls remain pending; frozen screenshot and core blockers are not waived.

The complete protected-component collection reports 5451 passed, eight failed and one skipped across 548 files in 125.65 seconds.
All UI and App cases pass, including the unchanged urgent-toast dismissal under the complete workload.
Log: `/tmp/tenka-geographic-components-full-coverage-20261010.log`; the eight earlier core, golden and replay blockers remain unresolved.
This successful collection does not establish a universal one-second scheduling guarantee; the prior repeated failures remain preserved.

The final individual-frame control and five existing geography, flag and river cases pass in 25.8 seconds.
Every measured label avoids increasing overlap with each recorded visible castle model, HP and warning frame across all six views.
The specific visible Sunpu HP control retains zero baseline and zero placed overlap; no necessary label or banner disappears.
Log: `/tmp/tenka-geographic-components-hard-native-20261010.log`; report: `/private/tmp/tenka-geographic-components-hard-native-report-20261010/`.
These functional controls overlap CPU work and provide no performance evidence; isolated native performance remains pending.

The isolated frozen native collection reports thirty-nine passed and one unchanged screenshot failure in 2.6 minutes, without skipped cases.
Both `VISUAL_GPU=1` and `VISUAL_PERF=1` use one worker after all CPU checks and agent jobs finish.
Log: `/tmp/tenka-geographic-components-gpu-20261010.log`; report: `/private/tmp/tenka-geographic-components-gpu-report-20261010/`.
The new individual castle-frame control, legacy geography tests, interaction controls, zoom, remount and water cases pass.
No Chrome plugin, visible browser window or automatic report opening is used; the frozen screenshot failure remains unresolved.

Twenty moving armies produce 3079 frames over 30001.3 milliseconds on Apple M3 Max Metal, averaging 102.629 frames per second.
Frame-time p95 is 16.8 milliseconds; CPU-update p95 is 5.2 milliseconds; all measured resource counts match before and after.
Build, full lint, normal/core types, assets and bundle checks pass; initial gzip is 574844 bytes and scenario gzip is 100844 bytes.
All 1234 frozen source hashes, 205 earlier core/data hashes and six frozen screenshot hashes match after verification.
This candidate does not prove forty-army national performance, stable whole-heap memory, complete cross-type clearance or whole-map art acceptance.
Eight core, golden and replay failures remain; scenario debut-year authority and whole-game completion remain unproven.

Direct CLI headless Chromium repeats both existing troop-plate cases successfully in 5.5 seconds, without a plugin or visible window.
The process includes `--headless` and `--no-startup-window`; the HTML reporter does not open automatically.
Report: `/tmp/tenka-direct-headless-confirm-report/`; six raw views remain under `/tmp/tenka-direct-headless-confirm-results/`.

An independent dense-pair gate fails against this unchanged native build; the earlier combined ribbon score concealed individual plate-pair regressions.
Sunpu retains pair areas of 546.66 and 75.27 square CSS pixels; Narumi retains 925.62.
The gate requires all plate pairs to separate, retains all six views, and compares control-frame visibility against measured HUD rectangles.
Its visibility oracle passes overlapping rectangles, canvas clipping, complete coverage and edge-touching controls; it does not measure opaque glyph pixels.
Log: `/tmp/tenka-dense-pairs-final-old-red.log`; report: `/tmp/tenka-dense-pairs-final-old-red-report/`.
This new UI failure remains unresolved; no collision threshold, frozen screenshot, core data or world anchor changes to clear it.

Number plates now use fourteen CSS-pixel text across camera zoom, including visible selected and aggregate far plates.
The plate, text and morale group scales independently; its body, flag, world anchor and picking remain unchanged.
The renderer wiring control fails at fifteen pixels against the old producer; the new wiring passes all 199 focused cases.
Logs: `/tmp/tenka-plate-pixel-lock-wiring-red.log` and `/tmp/tenka-plate-pixel-lock-focused-final.log`.
The factory compatibility collection separately passes ninety-four cases; missing-API failures remain under `/tmp/tenka-army-plate-scale-red-actual.log`.

The first typography prototype passes three native cases and fails two, including the new dense-pair gate and a geographic HUD regression.
Narumi's shifted Sunpu district frame newly overlaps the minimap by 170.16 square CSS pixels; its original-position overlap remains zero.
Log: `/tmp/tenka-plate-pixel-lock-native.log`; report: `/tmp/tenka-plate-pixel-lock-native-report/`.
Its complete CPU collection reports 5453 passed, nine failed and one skipped across 548 files in 113.59 seconds.
Eight failures remain the core, golden and replay blockers; urgent-toast dismissal fails again during this overlapping functional workload.
Log: `/tmp/tenka-plate-pixel-lock-full-coverage.log`; the earlier successful scheduling collection does not waive this repeated failure.

The producer now supplies individual measured HUD rectangles and canvas-edge guards to geographic placement without changing explicit navigation.
Main and Host wiring controls both fail against the old integration, then pass; their fifty-four focused compatibility cases pass.
The exact native minimap fixture fails before the new guard and passes after it; all nine pure geography cases pass.
Logs: `/tmp/tenka-screen-occlusions-{main-red,host-red,green}.log` and `/tmp/tenka-geo-pixel14-hud-{red,green}-20261011.log`.
The reference contracts are art-bible sections 6.5.2 and 10.2; army plates and banners do not yet use the HUD guards.

The repaired functional native collection reports nine passed and one dense-pair failure in 26.5 seconds.
The unchanged geographic minimap and HP controls pass, as do existing placement, movement, focus and body-anchor selection checks.
Log: `/tmp/tenka-pixel-hud-native.log`; report: `/tmp/tenka-pixel-hud-native-report/`.
These direct-headless controls overlap CPU checks and provide no isolated performance evidence; complete candidate verification remains pending.

The final typography and HUD candidate reports 5458 passed, eight failed and one skipped across 548 files in 108.59 seconds.
All UI and App cases pass, including urgent-toast dismissal; the same eight core, golden and replay blockers remain unresolved.
Log: `/tmp/tenka-pixel-hud-full-coverage-20261011.log`; the earlier failed scheduling run remains preserved.
This result does not prove a universal timer deadline or whole-game completion.

Its isolated direct-headless GPU collection reports forty passed and two failed in 2.8 minutes, without skipped cases.
The dense-pair gate and frozen screenshots remain failures; the repaired geographic HUD and castle-channel controls pass.
Both `VISUAL_GPU=1` and `VISUAL_PERF=1` use one worker after all CPU checks and agent jobs finish.
Log: `/tmp/tenka-pixel-hud-frozen-gpu-20261011.log`; report: `/tmp/tenka-pixel-hud-frozen-gpu-report-20261011/`.
No Chrome plugin, visible window or automatic report opening is used.

Twenty moving armies produce 3031 frames over 30004.4 milliseconds on Apple M3 Max Metal, averaging 101.019 frames per second.
Frame-time p95 is 16.7 milliseconds; CPU-update p95 is 5.5 milliseconds; all measured resource counts match before and after.
This result does not prove forty-army national performance or stable whole-heap memory.
Build, full lint, normal/core types, assets and bundle checks pass; initial gzip is 575667 bytes and scenario gzip is 100847 bytes.
All 1234 frozen candidate hashes, 205 earlier core/data hashes and six frozen screenshot hashes match after verification.
Remaining crowded plate frames, partial HUD concealment and wider art acceptance remain required work, not acceptance waivers.

The new information-plate candidate keeps fourteen-pixel text and permits bounded eighty-pixel offsets with anchored leader lines.
Six captured views clear every plate pair and retain full HUD-visible plate area; the legacy four-argument helper still uses forty-eight pixels.
The candidate preserves each fixed-frame overlap ceiling and never moves soldiers, flags, picking anchors or GameState.
Input-cap or comparison-budget exhaustion retains the complete legacy result; this fallback does not guarantee zero overlap or full visibility.
The reference contract is art-bible section 6.5.3.

The authentic legacy-only control fails with 428.890728 square CSS pixels of pair overlap; the failed result remains preserved.
Log: `/tmp/tenka-plate80-authentic-red-20261011.log`.
All twenty-eight focused layout controls pass, including the original twelve legacy cases and six captured native fixtures.
Leader factory compatibility passes ninety-five cases; renderer, Host, Main and geography compatibility passes 158 cases.
These overlapping collections are not summed into a unique full-suite total.

The first direct-headless native collection passes five cases in 12.9 seconds, without skips.
All six views retain zero pair overlap, full visible plate area, fourteen-pixel text and correctly anchored leader endpoints.
The existing body-anchor selection, far visibility and geographic HUD controls also pass.
Log: `/tmp/tenka-plate80-native-initial-20261011.log`; report: `/tmp/tenka-plate80-native-initial-report-20261011/`.
This functional run precedes final verification and does not provide isolated frame-performance evidence.

Serial warm Node measurements report dense whole-solver means of 2.922–5.222 milliseconds and p95 values of 3.148–11.608 milliseconds.
Twenty clear plates use the fast path, averaging 0.0456 milliseconds; p95 is 0.0563 milliseconds.
Log: `/tmp/tenka-plate80-timing-20261011.log`; these results are not native frames per second.
Source, test, tool, configuration, dependency and reference hashes freeze 1235 files under `plate-reflow`.

The complete frozen CPU collection reports 5466 passed, eight failed and one skipped across 548 files in 149.32 seconds.
All UI and App cases pass; the eight earlier core, golden and replay blockers remain unresolved.
Log: `/tmp/tenka-plate80-full-coverage-20261011.log`.
Build, full lint, normal/core types, assets and bundle checks pass; initial gzip is 577431 bytes and scenario gzip is 100844 bytes.
All 1235 frozen candidate hashes, 205 earlier core/data hashes and six frozen screenshot hashes match after verification.

Independent segment review finds leader lines crossing another plate interior in five of the six native views.
Army seven crosses army eleven in all Sunpu views and Narumi at scales 0.8 and 1; Narumi 1.5 has no crossing.
Correct endpoints and zero plate-pair overlap do not prove clear association; the current native endpoint assertions miss this defect.
Raw evidence: `/tmp/tenka-plate80-native-initial-20261011/army-plate-layout-native-a-0bca0-pendently-of-castle-ribbons-chromium/dense-pair-observations.json`.
Leader-crossing repair and isolated native GPU acceptance remain pending; no successful frame-performance result belongs to this candidate.

The strengthened native control retains all six observations before checking actual leader segments against other plate interiors.
The unchanged eighty-pixel candidate reports four passed and one failed in 10.1 seconds; its crossing assertion rejects the observed defect.
Log: `/tmp/tenka-plate-tether-native-red-20261011.log`; report: `/tmp/tenka-plate-tether-native-red-report-20261011/`.
Edge and corner touches remain distinct from interior crossings; independent horizontal, vertical, diagonal and degenerate-line controls pass.

The captured-coordinate unit control also fails against the old refinement with an actual leader-interior crossing.
It reports eighteen passed and one failed; log: `/tmp/tenka-plate-tether-red-20261011.log`.
This failure is separate from missing API or type errors; the generalized anchor-aware repair remains pending verification.

The repaired helper accepts actual army anchors and compares pair overlap, directed leader crossings and displacement in that order.
Thirty focused controls pass, including the independent six-view crossing fixture and an already-pair-free crossing fast-path regression.
The four-argument placement result remains unchanged; normal/core types and scoped lint pass.
Dense warm Node means increase to 7.059–11.199 milliseconds, with p95 values of 7.353–12.283 milliseconds.
Log: `/tmp/tenka-plate-tether-timing-20261011.log`; its clear twenty-plate timing fixture omits anchors and is not native performance evidence.

The first repaired functional browser run reports five passed and one failed in one minute.
The all-six pair, visibility, leader-interior and geographic controls pass, but the pointer journey fails during its initial HTTP navigation.
The test does not reach picking or far visibility; its failure remains preserved, not counted as a pass.
Build and browser preview overlap in this run; the trace records `net::ERR_HTTP_RESPONSE_CODE_FAILURE` before the strategy screen loads.
Log: `/tmp/tenka-plate-tethers-native-functional-20261011.log`; isolated verification after build completion remains required.

The first frozen anchor-aware CPU collection reports 5465 passed, eleven failed and one skipped across 548 files in 130.77 seconds.
Eight failures remain the known core, golden and replay blockers; three additional failures affect save feedback or urgent-toast timing.
One App case exceeds five seconds; two Main cases fail their existing UI assertions during the overlapping build, lint and browser workload.
Log: `/tmp/tenka-plate-tethers-full-coverage-20261011.log`; the unsuccessful workload remains preserved.
These failures are not waived by the earlier successful candidate; an isolated full CPU rerun remains required.

The complete native command discovers 140 cases, not the earlier forty-two-case visual subset.
With one worker, it reaches the unchanged five-minute global deadline: forty-eight pass, seven fail, five skip and eighty do not run.
Two further errors occur outside individual cases; the performance case does not run, so this command proves no frame-performance result.
Log: `/tmp/tenka-plate-tethers-frozen-gpu-20261011.log`; report: `/tmp/tenka-plate-tethers-frozen-gpu-report-20261011/`.

Three existing visual controls still encode the old forty-eight-pixel army-plate cap; a deterministic scoped checker reports three violations.
The informational contract now uses eighty pixels; geometric-label and four-argument helper contracts still use forty-eight.
Only those three native cap assertions change; the checker reaches zero without changing body, anchor, visibility or GameState controls.

Both ordinary army journeys also fail to obtain the selected march target; they are not successful production journeys.
Source review finds minimap focus rejecting the retained March target-picker modal, plus obsolete canvas-center pointer assumptions in both tests.
Narrow navigation-ownership repair and actual projected-body pointer verification remain pending; unrelated dialogs must retain their navigation guard.

The owned March picker navigation repair passes thirty-two focused UI cases, including all original focus and hotkey controls.
Only coordinate navigation under the same live picker owner is allowed; owner departure permanently cancels pending navigation.
Log: `/tmp/tenka-owned-picker-navigation-green-final.log`; normal/core types, scoped lint and formatting also pass.

The new target-navigation candidate freezes 1236 source files; build, full lint, types, asset and bundle checks pass.
Its direct-headless native collection reports seven passed and one failed in 31.5 seconds.
Actual army selection, all five plate controls and the geographic semantic audit pass without debug selection or core mutation.
The orders journey reaches deployment but observes two ordinary days instead of one before pause input arrives.
Trace evidence records day two at 17580 milliseconds and pause input beginning at 17955 milliseconds; the exact one-day assertion remains enforced.
Log: `/tmp/tenka-target-navigation-focused.log`; report: `/tmp/tenka-target-navigation-focused-report/`.

Four earlier native failures expose obsolete presentation assumptions before their gameplay assertions are reached.
Auto-return uses a canvas-center target; lord appointment waits in Domestic rather than Overview.
The scroll test assumes Overview fits without scrolling; import consent expects a nested dialog despite deliberate parent reuse.
Harness corrections preserve queued commands, ordinary days, exact per-tab offsets, consent ownership and unchanged-core controls.
Fresh native verification of those corrections remains required; no failed case is counted as passed.

The corrected journey candidate freezes 1236 files and preserves the failed target-navigation candidate separately.
Seven direct-headless native cases report four passed and three failed in 47.6 seconds.
Lord appointment and all three keyboard-dialog controls pass; both army journeys fail to confirm pause after a saved-position pointer click.
The revised scroll journey reaches its retention assertion: Domestic expects thirty-six pixels but restores twenty-four.
Log: `/tmp/tenka-native-journeys-focused.log`; report: `/tmp/tenka-native-journeys-focused-report/`.
The exact day, pause and scroll assertions remain enforced; these failures require diagnosis, not wider tolerances.

An isolated full CPU collection reports 5473 passed, eight failed and one skipped across 548 files in 123.89 seconds.
All UI and App cases pass, including the three timing failures seen during the earlier overlapping workload.
The eight known core, golden and replay blockers remain; no baseline or core-data change clears them.
Log: `/tmp/tenka-native-journeys-isolated-coverage.log`; all 1236 frozen source hashes remain unchanged after verification.

Trace review identifies the new pointer failures without establishing gameplay defects.
Draining queued commands removes a header status and moves Pause away from the previously saved coordinate.
The tab locator auto-scrolls Domestic from thirty-six to twenty-four before its click; the component correctly saves and restores twenty-four.
Corrections use fresh visible hit coordinates and native mouse input; exact day, pause and per-tab restoration controls remain unchanged.
Fresh browser verification remains required; automatic DOM pause activation and debug day stepping are not substituted.

The final journey candidate changes only three E2E files after the isolated CPU collection; all production and Vitest sources remain identical.
Its complete four-worker native functional command discovers 139 cases after excluding the separately measured performance case.
It finishes within the five-minute deadline: 112 pass, fifteen fail and twelve skip in 4.7 minutes; no case remains unrun.
Log: `/tmp/tenka-native-journeys-full.log`; report: `/tmp/tenka-native-journeys-full-report/`; all 1236 frozen hashes remain unchanged.

Both army journeys still overshoot their exact one-day controls under parallel load; fresh pause hit coordinates are correct.
Seven crest and layout failures stop on obsolete exact dimensions before later overflow or interaction controls are reached.
Two monthly navigation cases, report navigation, save focus, transport arrival and the frozen camera screenshot also fail.
Those controls remain unsuccessful; twelve opt-in or deployment checks are skipped, not accepted.
Castle appointment, exact native tab restoration, all three keyboard-dialog cases and the strengthened plate controls pass.

The isolated one-worker repeat preserves both army failures: each second ordinary day advances to three instead of the expected two.
It also records an unsuccessful thirty-second reference-GPU camera workload, with twenty armies and stable resource counts.
Apple M3 Max Metal renders 555 frames in 30058.1 milliseconds: mean FPS is 18.4642, FPS P95 is 23.9808 and frame-time P95 is 66.6 milliseconds.
CPU-update P95 is 61.4 milliseconds; the required fifty-five-FPS and frame-time gates remain unmet.
Log: `/tmp/tenka-native-journeys-serial.log`; raw measurement: `/tmp/tenka-native-journeys-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
These results supersede no historical measurement; the current candidate has no performance acceptance or whole-game completion claim.

Exact plate-search pruning preserves the six captured offset outputs and all thirty original focused controls; three additional controls also pass.
The new deterministic work control records 596962 operations against an unchanged-scene limit of one million; this is not a native performance gate.
The twenty-army Node surrogate finishes twenty-five searches instead of exhausting every search; its mean is 28.90 milliseconds.
These CPU measurements do not establish reference-GPU acceptance or a general translation-invariance guarantee.

The direct Playwright headless candidate freezes 1236 files; build passes and all six protected screenshot hashes remain unchanged.
Ten one-worker native journeys report eight passed and two failed in 1.6 minutes.
Army orders, auto-return, five monthly controls and transport pass; report navigation and save-focus controls remain unsuccessful.
Log: `/tmp/tenka-headless-direct-journeys.log`; report: `/tmp/tenka-headless-direct-journeys-report/`.
The report oracle depends on a decluttered castle ribbon; the save host captures focus after the actual opener becomes disabled.
Both failures require scoped corrections and fresh native verification; local unit success does not clear the real save-focus failure.

The isolated direct-headless thirty-second workload retains twenty armies, Apple M3 Max Metal and the existing thresholds.
It renders 1221 frames in 30016.8 milliseconds: mean FPS is 40.6772, FPS P95 is 60.2410 and frame-time P95 is 33.1 milliseconds.
CPU-update P95 is 25.6 milliseconds; resource counts remain identical before and after the workload.
FPS P95 passes, but frame-time P95 fails the unchanged 18.1818-millisecond limit; this candidate has no performance acceptance.
Log: `/tmp/tenka-headless-direct-perf.log`; raw measurement: `/tmp/tenka-headless-direct-perf/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1236 frozen hashes remain unchanged after both native commands; neither command uses a browser plugin or opens a visible window.

The next candidate captures the actual save opener before disabling controls and validates its original parent lease before restoration.
Its report oracle uses the emitted castle-body anchor rather than an optional decluttered ribbon; navigation and unchanged-core controls remain enforced.
Lazy once-only leader construction reduces the deterministic work count to 577174; thirty-four focused plate controls preserve the six captured offset outputs.
Fifty-two focused save and consent cases, normal/core types, scoped lint and formatting pass; build also passes.
One simulated focus-loss boundary supplies a qualified unit RED; the actual prior native save-focus failure remains the primary browser evidence.

Fresh direct-headless verification reports nine passed in seventeen seconds, including both previously unsuccessful report and save-focus journeys.
All five plate controls and both geographic-placement controls pass; source hashes remain unchanged after this command.
Log: `/tmp/tenka-headless-opener-lazy-focused.log`; report: `/tmp/tenka-headless-opener-lazy-focused-report/`.

The separately isolated thirty-second workload renders 1227 frames in 30026.4 milliseconds with stable resource counts.
Mean FPS is 40.8640, FPS P95 is 60.2410, frame-time P95 is 33.2 milliseconds and CPU-update P95 is 25.5 milliseconds.
The unchanged slow-frame limit still fails; this repeat does not establish a native performance improvement from lazy construction.
Log: `/tmp/tenka-headless-opener-lazy-perf.log`; raw measurement: `/tmp/tenka-headless-opener-lazy-perf/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.

The newer candidate's isolated full CPU collection reports 5480 passed, nine failed and one skipped across 548 files in 114.27 seconds.
Core coverage is 94.8 percent lines and 91.17 percent branches; the eight known core, golden and replay blockers remain.
One additional MainScreen urgent-toast dismissal control fails; its unchanged file passes all sixty-four cases in a separate repeat.
The repeat does not waive the complete collection's failure or establish its cause; full-suite acceptance remains unsuccessful.
Logs: `/tmp/tenka-headless-opener-lazy-isolated-coverage.log` and `/tmp/tenka-headless-opener-lazy-main-screen-repeat.log`.
All 1236 frozen hashes remain unchanged; no protected core/data or screenshot baseline is updated by this work.

The next candidate coalesces unpainted plate and geographic placement at each scene's actual Pixi prerender boundary.
Bodies, camera transforms, culling and picking remain immediate; public observations settle pending placement synchronously.
Scene replacement clears old pending work; teardown removes the exact scene observer before application destruction.
The authentic eager-layout control fails before the patch; all 152 focused renderer, Host, observation and frame controls then pass.
Types, full lint, asset and bundle checks pass; the new candidate freezes 1238 files, including its generated image and provenance.

Painted castles gain restrained static soil contact beneath their existing body; thirty-eight focused controls pass without new picking or shared-texture ownership.
One original transparent foothill image replaces only Ibuki's display asset; fifty-two terrain and provenance controls pass, including every unchanged authored coordinate.
Same-view Sunpu and Narumi screenshots show less repeated Ibuki terrain and subtle castle contact, without an obvious new obstruction in those views.
Rivers, angular lake forms and troop/banner crowding still prevent whole-map art acceptance; these changes are incremental.
Image: `public/assets/textures/terrain-mountain-foothills-v1.png`; complete built-in generation prompt: `assets/generated/terrain-mountain-foothills-v1.provenance.json`.

The complete four-worker native functional collection finishes all 139 cases in 3.3 minutes: 117 pass, ten fail and twelve skip.
Both ordinary army journeys fail their exact-day controls under concurrent browser load; seven crest/layout controls and the frozen camera images also fail.
Reports, save focus, monthly navigation, transport and all strengthened plate controls pass; skipped deployment and national workloads remain unaccepted.
Log: `/tmp/tenka-prerender-grounding-full.log`; report: `/tmp/tenka-prerender-grounding-full-report/`; all 1238 frozen hashes remain unchanged.

The isolated one-worker repeat passes both ordinary army journeys and the unchanged thirty-second, twenty-army reference-GPU workload in 55.3 seconds.
Apple M3 Max Metal renders 2141 frames in 30011.6 milliseconds: mean FPS is 71.3391, FPS P95 is 121.9512 and frame-time P95 is 17.3 milliseconds.
The existing FPS and slow-frame gates pass; resource counts remain stable, including thirteen listeners with the new scene observer.
Synchronous CPU-update P95 is 2.4 milliseconds, but excludes deferred layout; this number is not comparable to the previous full synchronous update cost.
Log: `/tmp/tenka-prerender-grounding-serial.log`; raw measurement: `/tmp/tenka-prerender-grounding-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
This result establishes only the existing twenty-army workload; national forty-army, soak, complete art and whole-game acceptance remain unproven.

The isolated full CPU collection reports 5486 passed, ten failed and one skipped across 548 files in 112.05 seconds.
Core coverage remains 94.8 percent lines and 91.17 percent branches; the eight known core, golden and replay failures remain.
Two MainScreen toast-dismissal controls receive no callback within their existing deadline; this collection does not establish the cause.
The unchanged MainScreen file separately passes all sixty-four cases in 17.61 seconds; that repeat does not waive either full-suite failure.
Logs: `/tmp/tenka-prerender-grounding-isolated-coverage.log` and `/tmp/tenka-prerender-grounding-main-screen-repeat.log`.
All 1238 frozen hashes, 205 protected core/data hashes and six protected screenshot hashes remain unchanged after verification.

A second isolated reference-GPU repeat also passes the unchanged twenty-army, thirty-second workload after all CPU checks finish.
It renders 2074 frames in 30006.3 milliseconds: mean FPS is 69.1188, FPS P95 is 121.9512 and frame-time P95 is 17.3 milliseconds.
Resource counts remain stable; synchronous update P95 is 2.5 milliseconds with the same deferred-cost limitation.
Log: `/tmp/tenka-prerender-grounding-perf-repeat.log`; raw measurement: `/tmp/tenka-prerender-grounding-perf-repeat/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1238 candidate hashes remain unchanged after the repeat; both reference measurements remain preserved, without selecting only the faster result.

The compact HUD candidate retains the smaller rail and crest while adding twelve-pixel text and thirty-two-pixel control floors.
Its deliberate geometry contract replaces obsolete large-crest expectations; every subsequent panel, minimap, table, canvas and gameplay assertion remains.
The first direct-headless collection reports eight passes and one failure: a wide resource heading still renders at 11.2 pixels.
The correction adds the missing wide-layout font floor; twenty-two focused source and component controls pass without weakening the native assertion.
Logs: `/tmp/tenka-compact-hud-native.log`, `/tmp/tenka-wide-resource-readable-red.log` and `/tmp/tenka-wide-resource-green-final.log`.

Local lake curves retain canonical vertices, exact bounds, river-connected banks and the existing area, centroid and intersection guards.
The authentic native control fails on the old geometry at 55.0856 degrees; its independent thirty-five-degree limit remains unchanged.
The new unit controls measure every flattened join near four specified corners, not only the original vertices.
Their maxima are 32.9908, 32.9908, 23.3848 and 25.0439 degrees; protected river corners deliberately retain their original turns.
Forty-seven focused controls, normal/core types and scoped lint pass; actual lake outputs contain fifty and fifty-four points within the 768-point limit.
Logs: `/tmp/tenka-local-lake-native-red.log` and `/tmp/tenka-local-lake-corner-focused-final-20261011.log`.

The integrated candidate freezes 1239 files; build, full lint, asset and bundle checks pass.
All fifteen direct-headless HUD, hierarchy, water-material and remount controls pass in 40.3 seconds, including every previously unreachable layout interaction.
The native lake control passes the unchanged thirty-five-degree limit and all original bounds, area, centroid, river-bank and gameplay assertions.
Log: `/tmp/tenka-compact-hud-water-focused.log`; report: `/tmp/tenka-compact-hud-water-focused-report/`; frozen hashes remain unchanged after this collection.

Matching Biwa captures show softer northern shoulders, but the improvement is modest at the normal view size.
Biwa retains long straight banks and a protected hard mouth; Hamana still retains its triangular authored silhouette.
Neither capture shows a new obvious foreground obstruction; local rounding does not establish whole-map realism or complete art acceptance.

The complete native collection finishes all 139 cases with 124 passes, three failures and twelve skips; its reporter shows 5.0 minutes.
All seven former crest and layout failures pass; ordinary army orders also pass under this collection's concurrent load.
Army auto-return overshoots the exact-day assertion, Taimei restoration retains the transient AI log, and the three frozen camera images differ.
Log: `/tmp/tenka-compact-hud-water-full.log`; report: `/tmp/tenka-compact-hud-water-full-report/`; all 1239 frozen hashes remain unchanged.

The isolated full CPU collection reports 5491 passes, nine failures and one skip across 5501 tests in 114.90 seconds.
Core coverage remains 94.8 percent lines and 91.17 percent branches; the eight protected core, golden and replay failures persist.
One MainScreen urgent-dismissal callback still exceeds its existing deadline; this result does not establish timer cancellation or justify a longer deadline.
Log: `/tmp/tenka-compact-hud-water-isolated-coverage.log`; full CPU acceptance remains unsuccessful.

The Taimei trace shows F9 immediately after the save-success toast, without observable restoration of its transient AI log.
Current save code publishes success before its final slot refresh, while the operation guard still rejects new operations.
This ordering supports a readiness race, but the trace does not directly measure the guard's rejection; a controlled deferred-refresh test remains necessary.

The one-worker native repeat passes both ordinary army journeys and the unchanged twenty-army, thirty-second reference-GPU gate.
Taimei restoration fails again with the same transient AI log, so concurrent browser load alone does not explain that failure.
Metal renders 2134 frames in 30000.6 milliseconds: mean FPS is 71.1319, FPS P95 is 121.9512 and frame-time P95 is 17.2 milliseconds.
Resource counts remain stable; synchronous CPU-update P95 is 2.3 milliseconds and still excludes deferred layout work.
Log: `/tmp/tenka-compact-hud-water-serial.log`; raw measurement: `/tmp/tenka-compact-hud-water-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1239 candidate hashes remain unchanged after this repeat; complete functionality, national workloads and whole-map art remain unaccepted.

Controlled deferred-refresh tests now reproduce the save-readiness race; the unchanged code fails five new cases.
Success now publishes only after slot refresh and operation-lock release, with the original session and admission checks intact.
All seventy-nine focused save, confirmation, quick-load and ports controls pass; normal/core types and scoped lint also pass.
Logs: `/tmp/tenka-save-success-readiness-red.log` and `/tmp/tenka-save-success-readiness-compat-final.log`.

The unchanged Taimei and seven save journeys pass in both subsequent direct-headless collections.
Each collection reports eight passes and one new district-oracle failure, not complete native acceptance.
Logs: `/tmp/tenka-save-ready-district-focused.log` and `/tmp/tenka-save-ready-district-expanded.log`.
The original district body fails the independent quiet-earth control at a color distance of 76.4191, above forty.
Log: `/tmp/tenka-district-native-zoomed-red.log`; the new district implementation passes sixteen direct rendering and lifecycle controls.

The first native district collection samples one district repeatedly because wheel input interrupts minimap focus animation.
An added castle is absent from the fixture; that failure is a harness error, not a product rendering failure.
The corrected oracle waits for a stable projection, records raw colors before assertions and verifies picking within each sampled view.
It also requires four distinct districts rather than counting repeated samples as broader coverage.
The settled-camera run exposes an owner-accent color distance of 52.4976, above the unchanged thirty-five limit.
Log: `/tmp/tenka-district-settled.log`; raw attachments and screenshots remain in `/tmp/tenka-district-settled/`; district native acceptance remains unsuccessful.

The retained gold selection ring explains that owner-accent failure; no owner-stroke change follows from the contaminated sample.
Each successful physical pick now ends with the normal panel-close button before the next material view.
The corrected unselected control exposes a genuine body failure on a dark substrate: color distance 41.6487 exceeds forty.
Log: `/tmp/tenka-district-material-unselected.log`; the existing opacity permits that dark-substrate deviation, while the native thresholds remain unchanged.

The body opacity changes from 0.82 to 0.86; owner strokes, semantic colors, geometry and picking remain unchanged.
An eight-corner opaque-RGB mixing guard fails on the original opacity and passes with the correction; all seventeen district controls pass.
Logs: `/tmp/tenka-district-earth-opacity-red-20261011.log` and `/tmp/tenka-district-earth-opacity-green-20261011.log`; types, scoped lint and formatting pass.

The rebuilt native collection again passes all eight unchanged save journeys and every sampled district pixel and in-view pick.
Its extra four-distinct-district assertion fails because the fixed scene provides only three unobstructed, independently pickable district targets.
Log: `/tmp/tenka-save-ready-district-final-focused.log`; that failed coverage result remains preserved rather than counting duplicates as four districts.
The revised coverage control requires those three exact targets and retains the original four-sample, two-owner and pixel limits.
This scope does not establish native coverage of all forty faction colors or whole-map art acceptance.

The corrected direct-headless district control passes in 9.7 seconds without changing its original pixel or sample-count limits.
It verifies three exact unobstructed districts, two owners, repeated native samples and in-view physical picking with unchanged gameplay state.
Log: `/tmp/tenka-district-verified.log`; screenshots and raw color attachments remain in `/tmp/tenka-district-verified/`.

The final candidate freezes 1241 files; build, full lint, normal/core types, formatting, asset and bundle checks pass.
The complete direct-headless collection reports 125 passes, three failures and twelve skips across 140 cases in 3.5 minutes.
Taimei restoration, save journeys and the corrected district oracle pass within that collection.
Army auto-return overshoots its exact-day assertion, the month-opening observer races a legitimate proposal dialog, and frozen camera images differ.
Log: `/tmp/tenka-save-ready-district-verified-full.log`; report: `/tmp/tenka-save-ready-district-verified-full-report/`; the complete native gate remains unsuccessful.

The month-opening trace ends with the correct toast and mandatory proposal dialog, without a month-summary dialog.
Its repeated asynchronous owner checks precede a later dialog-count assertion; this evidence supports a test-observation race, not suppressed notification.
No production change or deadline extension follows from this diagnosis; a synchronized snapshot control remains necessary.

The isolated eight-worker CPU collection reports 5501 passes, eight failures and one skip across 5510 tests in 112.81 seconds.
All UI and App controls pass; the eight protected core, golden and replay failures remain.
Core coverage remains 94.8 percent lines, 91.17 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-save-ready-district-verified-coverage.log`; no browser workload runs during this collection.

The isolated one-worker native repeat passes unchanged army auto-return and the twenty-army, thirty-second GPU gate in 39.5 seconds.
All other local tests and agents are terminal before launch; no formatter or independent CPU job runs during measurement.
Metal renders 2170 frames in 30002.3 milliseconds: mean FPS is 72.3278, FPS P95 is 121.9512 and frame-time P95 is 17.1 milliseconds.
Resource counts remain stable; synchronous CPU-update P95 is 2.3 milliseconds and excludes deferred layout work.
Log: `/tmp/tenka-save-ready-district-verified-serial.log`; raw measurement: `/tmp/tenka-save-ready-district-verified-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1241 candidate hashes and six frozen PNG hashes remain unchanged; complete functionality, national workloads and whole-map art remain unaccepted.

The command rail now separates three command groups without changing button order, width, callbacks or keyboard stops.
The realm entry paints two deliberate label lines while retaining its complete accessible name and original admission guards.
Three authentic source and DOM controls fail before the change; fifty-three focused UI controls and seven existing HUD contracts pass afterward.
Logs: `/tmp/tenka-command-rail-hierarchy-red.log`, `/tmp/tenka-command-rail-hierarchy-green-final.log` and `/tmp/tenka-command-rail-hierarchy-layout-compat.log`.

The monthly observer now reads toast, modal ownership, visible dialog count and pause state in one synchronous browser snapshot.
Unknown owners still fail closed, including the positive toast exit; the forty-five-second deadline and final product assertions remain unchanged.
One synthetic native control checks coherent later-owner observations, physical proposal rejection and refusal to dismiss an unknown dialog.
That synthetic control verifies the harness contract, not production monthly behavior.

The first plain-headless collection passes that harness control but fails all five native journeys on Pixi shader initialization errors.
Log: `/tmp/tenka-month-atomic-observation.log`; these errors identify the default browser path, not a reason to remove console-error guards.
The same six viewport/scale combinations and real monthly journeys pass with the existing full-Chromium headless Metal configuration.
All fifteen focused cases pass in 56.0 seconds; log: `/tmp/tenka-rail-month-focused.log`.

macOS now uses that verified headless renderer by default, without a GPU environment flag; browser windows and automatic reports remain closed.
One configuration control fails before the change and all three pass afterward; Linux retains its earlier default unless the GPU flag selects full Chromium.
Logs: `/tmp/tenka-default-headless-config-red.log` and `/tmp/tenka-default-headless-config-green-final.log`; platform-specific assertions explicitly skip other platforms.
Without either GPU environment flag, all fifteen native focused cases pass in 59.6 seconds.
Log: `/tmp/tenka-default-headless-rail-month.log`; report: `/tmp/tenka-default-headless-rail-month-report/`; top and tail captures cover all six viewport/scale combinations.

The native rail controls check actual two-line bounds, twelve-pixel text, original Tab order and the physically opened end-of-rail Taimei panel.
Matching screenshot review shows deliberate labels and modest grouping, not a complete visual redesign or realistic terrain acceptance.
The final source record freezes 1244 files; the full browser, CPU and isolated GPU collections remain necessary for this candidate.

Build, full lint, normal/core types, formatting, asset and bundle checks pass for the frozen command-rail candidate.
The complete direct-headless collection reports 127 passes, two failures and twelve skips across 141 cases in 3.8 minutes.
All real monthly journeys, rail bounds, keyboard traversal, save journeys and district controls pass under four-worker load.
Army auto-return still overshoots its exact-day assertion; the unchanged frozen camera comparison also fails.
Log: `/tmp/tenka-command-rail-month-verified-full.log`; report: `/tmp/tenka-command-rail-month-verified-full-report/`; complete native acceptance remains unsuccessful.

The isolated eight-worker CPU collection reports 5512 passes, eight failures and one skip across 5521 tests in 114.75 seconds.
All UI and App controls pass; the eight protected core, golden and replay failures remain.
Core coverage measures 94.8 percent lines, 91.16 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-command-rail-month-verified-coverage.log`; no browser workload runs during this collection.

The isolated one-worker native repeat passes unchanged army auto-return and the twenty-army, thirty-second GPU gate in 39.6 seconds.
All other local jobs and agents are terminal before launch; no formatter or independent CPU job runs during measurement.
Metal renders 2158 frames in 30007.8 milliseconds: mean FPS is 71.9146, FPS P95 is 121.9512 and frame-time P95 is 17.2 milliseconds.
Resource counts remain stable; synchronous CPU-update P95 is 2.3 milliseconds and excludes deferred layout work.
Log: `/tmp/tenka-command-rail-month-verified-serial.log`; raw measurement: `/tmp/tenka-command-rail-month-verified-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1244 candidate hashes and six frozen PNG hashes remain unchanged; complete functionality, national workloads and whole-map art remain unaccepted.

The local river prototype retains authored anchors, taper widths and complete bridge-protected spans, with an exact original-capsule mask.
The bridge control observes actual display paint intersected with that mask; seventy-eight focused geometry, lifecycle and measurement controls pass.
No extra texture or per-frame curve work follows from this change; graphics ownership has separate counters.

The old native control records turns of 33.05 degrees at Fuji and 66.94 degrees at Shinano.
Fuji is geometry-only because troops and coast obstruct its view; Shinano is the clear visual-review control.
Log: `/tmp/tenka-river-corner-native-behavior-red.log`; both raw observations and matching-view crops precede the assertions.

The first rebuilt headless candidate passes four existing water and foreground controls but fails the unchanged Fuji limit of twenty degrees.
Its measured turn is 20.1397 degrees; log: `/tmp/tenka-local-river-native-focused.log`; failed images and observations remain preserved.
The original-capsule mask still retains angular outer banks, so smoother emitted paths do not establish realistic riverbank acceptance.

Equal-strength corner tangents replace the half-strength tangent that concentrates direction changes at the retained anchor.
The eight-chord sampling and original limits remain unchanged; twenty-five owned controls pass after a genuine tangent-regression failure.
Logs: `/tmp/tenka-river-balanced-tangent-red-20261011.log` and `/tmp/tenka-river-balanced-green-20261011.log`; normal/core types, scoped lint and formatting pass.

All five rebuilt native water and corner controls pass in plain headless mode without GPU environment flags.
The independent emitted turns measure 14.4440 degrees at Fuji and 29.1646 degrees at Shinano, below the unchanged twenty/thirty-degree limits.
Log: `/tmp/tenka-local-river-final-focused.log`; matching-view review shows only local change, not realistic outer-bank or whole-map acceptance.
The final record freezes 1247 files; this focused result does not establish complete native, CPU or GPU acceptance.

Build, full lint, normal/core types, formatting, asset and bundle checks pass for the final local-river candidate.
The complete direct-headless collection reports 128 passes, two failures and twelve skips across 142 cases in 3.7 minutes.
Army auto-return still overshoots its exact-day assertion under four-worker load; the unchanged frozen camera comparison also fails.
Log: `/tmp/tenka-local-river-final-full.log`; report: `/tmp/tenka-local-river-final-full-report/`; complete native acceptance remains unsuccessful.

The isolated eight-worker CPU collection reports 5528 passes, eight failures and one skip across 5537 tests in 114.57 seconds.
All UI and App controls pass; the eight protected core, golden and replay failures remain.
Core coverage measures 94.8 percent lines, 91.16 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-local-river-final-coverage.log`; no browser workload runs during this collection.

The isolated one-worker native repeat passes unchanged army auto-return and the twenty-army, thirty-second GPU gate in 39.8 seconds.
All other jobs and agents are terminal before launch; no formatter or independent CPU job runs during measurement.
Metal renders 2167 frames in 30002.8 milliseconds: mean FPS is 72.2266, FPS P95 is 125 and frame-time P95 is 17.6 milliseconds.
Resource counts remain stable, including ten river masks and ten display Graphics; synchronous CPU-update P95 is 2.2 milliseconds and excludes deferred layout.
Log: `/tmp/tenka-local-river-final-serial.log`; raw measurement: `/tmp/tenka-local-river-final-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1247 candidate hashes, 205 protected core/data hashes and six frozen PNG hashes remain unchanged; whole-game and whole-map acceptance remain incomplete.

The mountain candidate replaces only Akaishi and Aso with two original connected massifs; the other twelve selections and canonical geography remain unchanged.
The built-in image generator produces both PNGs; Akaishi also retains its original edit input and recursively verified repository provenance.
Manifest and real-pixel provenance admission first fails twice before registration; the final focused collection reports 55 passes.
Logs: `/tmp/tenka-massif-provenance-red.log` and `/tmp/tenka-massif-integration-final.log`; build, types, full lint, assets and bundle checks pass.

The old native reference passes; separate new-asset admission fails against that same old build after both full-mass captures.
The candidate passes one direct-headless case in 10.5 seconds, including asset admission, unchanged GameState, matching projection and stable idle/LOD resources.
Logs: `/tmp/tenka-massif-old-reference.log`, `/tmp/tenka-massif-old-admission-red.log` and `/tmp/tenka-massif-candidate.log`; no Chrome plugin or visible window is used.
Matching-view review finds broader connected peaks and foothills, but Akaishi retains repetitive ribs and troop obstruction; the eastern Aso river remains schematic.
These checks do not prove opaque coverage or whole-map art acceptance; 1254 frozen files identify this candidate.

The auto-return pre-armed pointer experiment fails its real exact-day journey, including all four parallel repeats; the unsuccessful approach is reverted.
Its final failed log is `/tmp/tenka-auto-return-four-worker.log`; successful synthetic controls do not establish a repair.
The retained narrow correction sends duplicate pointer events to the same disabled switch instead of triggering the global Space shortcut.
Original native day advancement, deadlines, command-count and core/deployed assertions remain unchanged; serial and four-repeat checks pass.
Logs: `/tmp/tenka-auto-return-restored-serial.log` and `/tmp/tenka-auto-return-restored-four-worker.log`; complete mixed-candidate verification remains pending.

The mixed mountain collection passes auto-return but fails army-orders at its unchanged exact-day helper: expected day two, received day three.
Trace review shows the native pause eventually applies after another ordinary day; it does not establish retarget, recall or mountain-picking failure.
The read-only diagnosis leaves source, deadlines and exact-day assertions unchanged; the failed candidate remains an unresolved native gate.

The complete mountain headless collection reports 129 passes, two failures and thirteen skips across 144 cases in 4.3 minutes.
The army-orders exact-day failure and unchanged frozen-image failure remain unresolved; all mountain, resource and auto-return controls pass.
Log: `/tmp/tenka-massif-full.log`; report: `/tmp/tenka-massif-full-report/`; skipped national and hardware workloads remain incomplete.

The isolated serial native collection passes both army journeys and the thirty-second GPU workload in 56.9 seconds, without competing browser or CPU jobs.
Metal renders 2079 frames over 30000.6 milliseconds: mean FPS is 69.2986, FPS P95 is 121.9512 and frame-time P95 is 17.2 milliseconds.
Synchronous CPU-update P95 is 2.4 milliseconds and excludes deferred layout; measured resource counts match before and after.
Log: `/tmp/tenka-massif-serial.log`; raw measurement: `/tmp/tenka-massif-serial/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
Serial success does not repair the mixed-collection failure or prove forty-army national performance.

The complete CPU collection reports 5529 passes, ten failures and one skip across 5540 tests in 117.70 seconds.
Eight existing core, golden and replay failures remain; two MainScreen notification-dismissal cases also fail and require diagnosis.
Core coverage is 94.8 percent lines and 91.17 percent branches; the passing coverage thresholds do not override failed tests.
Log: `/tmp/tenka-massif-coverage.log`; all 1254 frozen candidate hashes still match.

The unchanged full MainScreen file passes all 64 cases under isolated serial V8 coverage in 32.42 seconds.
Its two dismissal cases take 899 and 893 milliseconds; the failed full-collection cases take 1180 and 1230 milliseconds with zero callbacks.
Log: `/tmp/massif-main64-serial-v8.log`; source, assertions, deadlines and baselines remain unchanged.
No timer-fire trace establishes exact causality; isolated success does not repair or waive either full-collection failure.
All 1254 candidate hashes, 205 protected core/data hashes and six screenshot hashes match after verification; whole-game acceptance remains incomplete.

The command-desk candidate coordinates the resource strip, navigation rail, object inspector, notifications and minimap with navy, ivory and restrained brass framing.
It preserves existing controls, values, DOM order, UI-scale support and map geometry; selected objects gain a stronger title and action hierarchy.
Actual matching-view review confirms more consistent framing, but schematic rivers, crowded map labels and incomplete whole-game flows remain visible limitations.

The notification regression first fails because its matcher is unsupported; that harness error is preserved separately from the authentic product failure.
Corrected tests reproduce two lost callbacks when an accepted exit changes severity while retaining the same notification ID.
The repair separates severity-countdown cleanup from keyed-notification lifetime cleanup; accepted exits retain their original duration and use the latest callback.
Removed keyed notifications still cancel their exit; all sixteen ReportStack cases pass, and the combined MainScreen collection reports eighty passes.
Logs: `/tmp/tenka-toast-lifetime-{red,authentic-red,green}.log` and `/tmp/tenka-command-desk-main-focused.log`.
This distinct lifecycle repair does not establish the cause or resolution of the preceding full-collection notification deadline failures.

The army-orders harness starts ordinary speed with trusted numeric input while the actual pause button retains focus, then uses Enter on that button.
The original five-second observation deadline, exact next-day assertion, command counts and core/deployed comparisons remain unchanged.
One serial journey and four simultaneous repeats pass; the earlier expected-day-two/actual-day-three failure remains preserved.
Logs: `/tmp/tenka-army-orders-keyboard-{serial,four-worker,types,lint,format}.log`; no synthetic pause API or product timing change is used.

The command-desk focused CPU checks report 22 resource/rail passes, 32 inspector/minimap passes and eighty MainScreen/notification passes in separate collections.
Seven direct-headless native cases pass in 20.4 seconds, covering actual resource clipping, keyboard traversal, HUD-safe focus, reports and mountain adoption.
Log: `/tmp/tenka-command-desk-native.log`; report: `/tmp/tenka-command-desk-native-report/`; all 1254 frozen candidate hashes match.
Full-candidate native, CPU and isolated performance verification remain pending; focused success does not certify whole-map art or the entire game.

The first full command-desk native collection reports 125 passes, six failures and thirteen skips in 3.8 minutes.
Its three 1920-pixel scale cases expose resource labels above the HUD; the unchanged contrast control also rejects two rail labels.
The other failures remain exact-day army-orders and frozen images; all failed screenshots and traces remain under `/tmp/tenka-command-desk-full/`.
Log: `/tmp/tenka-command-desk-full.log`; the earlier seven focused passes do not cover these full-candidate defects.
The failed candidate retains its separate `command-desk-verified` freeze; corrected resource layout and opaque command-surface fallback still require re-verification.

The keyboard army-orders candidate again fails expected day two versus actual day three, despite retained focus and a successful speed-start control.
Enter starts thirteen milliseconds after the observation, but its native call completes about 648 milliseconds later; the trace lacks actual handler timing.
Current source applies pause synchronously and checks authoritative speed before every ordinary day; no deferred React pause effect is found.
No product clock change is justified; earlier serial/repeat success does not repair or waive this mixed-collection failure.

The corrected command-desk candidate keeps resource headings, values and food coverage within the original HUD at every tested scale and viewport.
Explicit navy background colors remain beneath the command gradients, giving the actual surface a solid fallback without changing contrast thresholds.
All fourteen native layout, focus, contrast, mountain and resource-lifetime cases pass in 38.7 seconds.
Log: `/tmp/tenka-command-desk-final-focused.log`; report: `/tmp/tenka-command-desk-final-focused-report/`.

Build, normal/core types, formatting, assets and bundle checks pass; the previous full lint remains successful with only subsequent CSS changes.
All 1254 final candidate hashes match; the preceding failed freeze and native report remain separate and unchanged.
Complete final CPU, native and isolated performance verification remain pending; the coordinated HUD does not certify the entire game or map.

The pre-standalone-background final native collection reports 130 passes, one frozen-image failure and thirteen skips in 3.6 minutes.
All layout, contrast and functional journeys pass in that collection, including army-orders; earlier exact-day failures remain unresolved reliability evidence.
Log: `/tmp/tenka-command-desk-final-full.log`; report: `/tmp/tenka-command-desk-final-full-report/`.

Its default-worker CPU collection reports 5531 passes, eleven failures and one skip in 115.60 seconds.
Eight failures remain protected core/golden/replay cases; one exposes ResourceBar's missing standalone command background, and two require updated design-specific CSS assertions.
Log: `/tmp/tenka-command-desk-final-coverage.log`; all unsuccessful candidate and harness attempts remain preserved.

ResourceBar now supplies its own navy surface on light hosts; gallery examples have auto-height parents, so the strip retains intrinsic content height.
The source contracts now require navy inverse titles, ivory facts, restrained two-pixel corners, opaque command fallback and non-intercepting minimap decoration.
Existing size, visibility, keyboard and geometric requirements remain unchanged; these source checks do not establish native art acceptance.
All ten focused contracts and nine native layout/contrast cases pass after the standalone fix; logs use the `tenka-command-desk-contract-checked` and `checked-focused` prefixes.

The checked candidate's isolated eight-worker collection reports 5534 passes, eight protected core/golden/replay failures and one skip across 5543 tests in 119.03 seconds.
All UI and App cases pass; core coverage is 94.8 percent lines, 91.17 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-command-desk-checked-coverage.log`; no browser workload runs during this collection.
Build, normal/core types, assets, bundle checks and scoped contract lint/format checks pass.
Earlier full lint belongs to its earlier snapshot; the later test has scoped lint coverage, and later CSS has formatting coverage.

The checked candidate's isolated headless GPU workload passes in 32.2 seconds, with all other jobs terminal before launch.
Metal renders 2067 frames over 30016.3 milliseconds: mean FPS is 68.8626, FPS P95 is 125 and frame-time P95 is 17.7 milliseconds.
Synchronous CPU-update P95 is 2.5 milliseconds and excludes deferred layout; measured resource counts match before and after.
Log: `/tmp/tenka-command-desk-checked-perf.log`; raw measurement: `/tmp/tenka-command-desk-checked-perf/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
All 1254 checked source hashes, 205 protected core/data hashes and six PNG hashes match; whole-game and whole-map acceptance remain incomplete.

The Kiso candidate changes one guarded free interval in both the sparse visual map and the normal s1560 map.
Continuous control hulls and water radii exclude actual roads, bridges, castle bodies, lake fills, coast boundaries and other river capsules.
Exact old contact intervals remain straight; the first and last original river capsules remain unchanged.
The candidate uses an expanded display corridor, not the old capsule-containment guarantee; all other rivers retain their prior diagnostics.
Normal-map integration preserves owned texture, source, listener, Graphics and byte counts; all 42 focused geometry, material and guard cases pass.

The old fixed Kiso bank crop fails the visible-departure control at 0.59895 screen pixels; the candidate passes the unchanged two-pixel requirement.
Complete-crop obstruction guards and independent painted-bank comparisons pass; this local shape result does not establish whole-map art acceptance.
Reports: `/tmp/tenka-river-bank-before-shape-report/` and `/tmp/tenka-natural-river-focused-report/`.
The earlier raw-centerline material probe reports a range of 34 because changed banks invalidate its old sample locations.
The corrected fixed stations intersect actual emitted water and retain the original minimum of eight samples and the original 3–18 quietness limits.
Actual guarded samples number 23 for Kiso and 32 for Yodo; the separately imposed 24-sample attempts fail and remain preserved.

An unchanged mini42 campaign earns unification after 329 normal production days, at day419, with natural AI, legal player orders and daily invariants.
Pending native continuation repeats every event and the complete persistent state and random-number state; three earned-ending App cases pass.
The App tests stub only strategy presentation; actual ending statistics, acknowledgement, continuation and title return remain under test.
Log: `/tmp/tenka-earned-ending-native-artifact-cpu.log`; this small campaign does not prove national completion.

Native import stores the earned mini campaign, but the production event loader rejects its unsupported scenario before the App commits it.
The initial two native ending attempts fail; no native ending acceptance follows from the passing App tests.
The corrected browser controls prove refusal, intact export and persisted progress after reload, without changing scenario identity or inventing victory.
Artifacts: `/tmp/tenka-earned-ending-native/`; the supported-scenario earned native ending remains an explicit gap.

The checked candidate passes thirteen direct-headless layout, motion, river and unsupported-save controls in 45.9 seconds with two browser workers.
Log: `/tmp/tenka-natural-river-earned-ending-checked-native.log`; report: `/tmp/tenka-natural-river-earned-ending-checked-native-report/`.
Build, full lint, normal/core types, assets and bundle checks pass; 1259 frozen files identify the checked candidate.
Record: `/tmp/tenka-natural-river-earned-ending-checked-frozen-sources-20261011.txt`; the earlier failed harness record remains separate.

The full direct-headless collection reports 133 passes, one frozen camera-baseline failure and thirteen skips across 147 cases in 4.9 minutes.
The army-orders case passes in this run; this result does not establish that its earlier timing race is resolved.
Log: `/tmp/tenka-natural-river-earned-ending-full-native.log`; report: `/tmp/tenka-natural-river-earned-ending-full-native-report/`.
No visible browser, plugin or automatic report viewer is used; the protected baseline images remain unchanged.
The final documentation distinguishes the guarded Kiso display corridor from the default original-water containment rule.
Record: `/tmp/tenka-natural-river-earned-ending-final-frozen-sources-20261011.txt`; earlier source records remain preserved.

The final isolated eight-worker CPU collection reports 5548 passes, eight existing core/golden/replay failures and one skip across 5557 tests in 147.95 seconds.
All UI and App cases pass; core coverage remains 94.8 percent lines, 91.17 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-natural-river-earned-ending-final-coverage.log`; the failure set matches the preceding checked candidate.

The final isolated headless GPU workload passes with twenty moving armies and all other jobs terminal before launch.
Metal renders 2061 frames over 30002.9 milliseconds: mean FPS is 68.6934, FPS P95 is 121.9512 and frame-time P95 is 17.3 milliseconds.
Synchronous CPU-update P95 is 2.4 milliseconds and excludes deferred layout; measured resource counts match before and after.
Log: `/tmp/tenka-natural-river-earned-ending-final-perf.log`; raw measurement: `/tmp/tenka-natural-river-earned-ending-final-perf/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
The final 1259 source hashes, 205 protected core/data hashes and six protected PNG hashes match.
The write reference format separates passing local guards from failed controls and incomplete whole-game or whole-map acceptance.

The closed ContextPanel previously admitted its hidden close button through actual native Shift+Tab traversal.
The candidate adds the native inert attribute only while closed; mounted transitions and open actions remain unchanged.
Four component cases and the native closed/open traversal pass; the original behavioral failure remains in `/tmp/tenka-context-focus-old-closed.log`.
The React18 boolean-attribute attempt fails component/types checks; the final empty-string attribute preserves native boolean semantics without that warning.

Successful mountain rasters now add continuous foothill light from the existing authored height field under fixed north-west daylight.
Fourteen static shade textures and sources add 896 KiB of raw pixels; peak placement, polygons, fallback and shared assets remain unchanged.
All 35 focused shade, material and raster cases pass; 26 frame-measurement cases also pass with the additive resource fields.
Six direct-headless context, geographic-label, river and mountain controls pass in 18.9 seconds.
Log: `/tmp/tenka-foothill-context-candidate-native.log`; this functional run overlaps CPU checks and provides no isolated performance evidence.

The initial single-mass pixel oracle attributes 2295 changed Akaishi-exterior pixels to an apparent containment failure.
Independent attribution places every such pixel inside the simultaneously enabled Kiso mass; no changed pixel lies outside all fourteen authored masses.
The corrected mass-union comparison preserves the original two-world-unit edge exclusion and reports zero exterior changes in both fixed native crops.
Logs: `/tmp/tenka-foothill-single-mass-oracle-failure.log` and `/tmp/tenka-foothill-mass-union-check.log`; projection, crop and raw geometry match exactly.
The painted changes are subtle; neither admission counts nor pixel departure establishes complete slope-direction or whole-map art acceptance.
The separate shared-server teardown failure remains preserved; a retained preview fixes test coordination without suppressing console errors.

An unchanged supported s1560 subset earns victory through legal Takeda orders, natural AI and the complete scenario event catalog.
The builder loads Koshinetsu with two initial clans and nine castles; genuine enemy falls occur on days 35, 73, 139 and 373.
Every normal day has zero invariant errors, rejected commands and fatal errors; earlier genuinely losing strategies remain preserved.
Two CPU cases prove the pending five-order native checkpoint, all 373 event arrays, persistent state and random-number state against an independent fresh journey.
Actual App statistics and continuation pass with only strategy presentation stubbed; the day 600 historical event lies beyond this earned route.
Log: `/tmp/tenka-earned-regional-ending-integration.log`; this subset does not substitute for the production wizard or full-national campaign.

Two real-browser supported-ending cases pass after each independently earns its own fresh native save before browser actions.
Native import, five actual statistics, Escape, title return, intact export and reload preserve the unacknowledged earned ending.
Continue preserves day and random-number state, processes the six real mandatory proposal decisions, advances normal time and survives native quick-save reload.
Log: `/tmp/tenka-earned-supported-regional-decisions-native.log`; report: `/tmp/tenka-earned-supported-regional-decisions-native-report/`; the two cases pass in 8.4 seconds.
Earlier failures retain the missing thousands separator and unhandled mandatory proposal pause; neither proves a production ending defect.
The final 1264-file source record is `/tmp/tenka-foothill-context-earned-regional-frozen-sources-20261011.txt`; earlier candidates remain separate.

The frozen candidate's isolated CPU collection reports 5556 passes, eight existing core/golden/replay failures and one skip across 5565 tests in 125.70 seconds.
All UI and App cases pass; core coverage is 94.81 percent lines, 91.18 percent branches and 98.47 percent functions.
Log: `/tmp/tenka-foothill-context-earned-regional-coverage.log`; the eight failures match the preceding protected failure set.

The isolated headless GPU case passes with twenty moving armies after all other validation jobs terminate.
Metal renders 2107 frames over 30000.2 milliseconds: mean FPS is 70.2329, FPS P95 is 121.9512 and frame-time P95 is 17.1 milliseconds.
Synchronous CPU-update P95 is 2.4 milliseconds; measured ownership counts match before and after, including all fourteen added shade resources.
Raw measurement: `/tmp/tenka-foothill-context-earned-regional-perf/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.
This isolated case does not prove national simulation performance, cold-start limits or a thirty-minute heap soak.

Normal/core types, full lint and build pass; all 1264 source, 205 protected core/data and six protected PNG hashes match.

The complete-candidate native collection reports 135 passes, two failures and thirteen skips across 150 cases in 4.1 minutes.
Log: `/tmp/tenka-foothill-context-earned-regional-full-native.log`; report: `/tmp/tenka-foothill-context-earned-regional-full-native-report/`.
The failures are the retained camera-baseline mismatch and the army-orders exact-day scheduling race; both supported regional ending cases pass.
The army trace records a 146-millisecond observer-to-Enter delay and 383 milliseconds of Enter processing; the real pause finally activates after day2.
This evidence does not demonstrate rejected pause input; a clock-controlled scheduler remedy remains separate from real-time responsiveness acceptance.
Local ending and shade evidence do not prove whole-game completion.

The revised army-orders helper installs Playwright Clock before navigation and freezes time only after the real pause is active.
Paused frames reset the existing controller accumulator; native hotkey 1, normal RAF callbacks and native Enter still start, advance and stop time.
Exact one-day assertions and every preview, queue, retarget and recall assertion remain unchanged; no debug stepping or game-state setter is used.
Four simultaneous headless repetitions pass in 40.5 seconds; log: `/tmp/tenka-army-clock-four-worker.log`.

This result proves clock-controlled normal scheduling, not real-time input latency, ordinary wall-clock reliability or frame performance.
The final artifact states this qualification; source record: `/tmp/tenka-foothill-context-earned-regional-clock-frozen-sources-20261011.txt`.
Only the army test differs from the preceding 1264-file candidate; production, CPU and isolated GPU inputs remain unchanged.

The clock-qualified complete native collection reports 136 passes, one failure and thirteen skips across 150 cases in 4.1 minutes.
All browser runs use direct headless Chromium with four workers; no browser plugin or visible window is used.
The remaining failure is the retained three-camera baseline mismatch; the army-orders case and both supported regional ending cases pass.
Log: `/tmp/tenka-foothill-earned-regional-clock-full-native.log`; report: `/tmp/tenka-foothill-earned-regional-clock-full-native-report/`.

Final normal/core type checking and full lint pass; all 1264 candidate, 205 protected core/data and six protected PNG hashes remain unchanged.
The clock qualification above still applies; this collection does not prove real-time input responsiveness or authorize baseline replacement.

The next candidate gives castle seals their own horizontal identity column and replaces the MiniMap's bright panel sea with existing map colors.
Castle fonts, ribbon heights, world anchors, troop values and relationship shapes remain unchanged; main and branch ribbons grow by 25 and 22 CSS pixels.
Reference revisions: `docs/visual/art-bible.md` sections 9.4 and 10.3; historical design records remain unchanged.

The old seal/text intersection fails an authentic geometry control; log: `/tmp/tenka-castle-identity-column-authentic-red.log`.
An earlier control chose the troop dot instead of the seal and remains a harness failure, not product evidence.
Five castle tests pass, including 240 tier/color/relationship combinations; these mocked bounds do not replace loaded-font evidence.
The MiniMap's missing opaque sea fails its old drawing control; twenty-eight drawing and existing pointer/drag/throttle tests pass after the change.
Logs: `/tmp/tenka-muted-minimap-red.log`, `/tmp/tenka-muted-minimap-final.log`, `/tmp/tenka-castle-identity-column-green-final.log`.

Fresh screenshots reveal an intermediate regression: the wider ribbon hides Gifu through a shared 64-pixel bucket despite zero actual intersection.
The corrected native control fails before the narrow-phase change; log: `/tmp/tenka-identity-gifu-authentic-red.log`.
The preceding wrong castle identifier remains a harness failure in `/tmp/tenka-identity-gifu-red.log`.
Castle decluttering now checks actual rectangle intersections; unchanged geographic-label bucket density, priorities, LOD and forced visibility remain intact.
An intermediate all-label narrow phase exposes additional geographic text and fails the unchanged Narumi control; `/tmp/tenka-identity-minimap-exact-native.log` retains this failure.

Final focused native validation passes ten cases in 15.2 seconds, including loaded-font seal clearance, retained Gifu visibility and unchanged army/geographic controls.
Log: `/tmp/tenka-identity-minimap-narrow-final-native.log`; same-view screenshots and measured text rectangles remain in its output directory.
Six declutter controls and the renderer/frame tests pass: 149 total; log: `/tmp/tenka-identity-minimap-narrow-final-cpu-root.log`.
The shared Pixi mock gains local text bounds only for compatibility; its earlier missing-method failures remain in `/tmp/tenka-identity-minimap-renderer-cpu-root.log`.

A separate pure ribbon-layout helper passes seven controls but has no production integration, leader guarantee or independent HUD-protection acceptance.
Nearby soldier/flag occlusion remains unresolved; internal seal clearance and improved MiniMap materials do not prove whole-map art acceptance.
The new candidate freezes 1269 files: `/tmp/tenka-identity-minimap-narrow-frozen-sources-20261011.txt`; protected core/data and all six PNGs remain unchanged.

The isolated twenty-army GPU case passes with 2209 frames over 30001.5 milliseconds; mean FPS is 73.6297 and frame-time P95 is 17.7 milliseconds.
FPS P95 is 126.5823; synchronous CPU-update P95 is 2.3 milliseconds, excluding deferred layout.
Resource observations match before and after; log: `/tmp/tenka-identity-minimap-perf.log`.
This single candidate measurement does not establish a performance improvement, national simulation performance or a heap soak.

The subsequent full coverage run reports 5570 passes, twelve failures and one skip across 5583 cases in 311.34 seconds.
Eight failures retain the protected simulation/golden blockers; two App cases time out, the urgent-toast assertion fails, and the MiniMap contract expects obsolete paint.
Log: `/tmp/tenka-identity-minimap-full-coverage.log`; no protected simulation or golden sources change.
The MiniMap assertion now explicitly expects `--map-sea`, as authorized by art-bible section 9.4; pointer and geometry contracts remain unchanged.

The paired native run reports 132 passes, three failures, thirteen skips and three unexecuted cases across 151 cases.
The unchanged 300-second global deadline also interrupts execution and teardown; this run does not cover the entire collection.
Failures concern army auto-return timing, missing geographic labels and the retained camera baseline; log: `/tmp/tenka-identity-minimap-full-native.log`.
Serial native controls pass auto-return but still fail the missing-label audit; log: `/tmp/tenka-identity-minimap-isolated-controls-native.log`.
The geographic defect persists without competing jobs; load alone does not explain it.

Each original App/urgent-toast case passes an unchanged, single-worker, no-coverage diagnostic; these controls do not replace the full coverage gate.
Logs: `/tmp/tenka-identity-regional-ending-serial-diagnostic.log`, `/tmp/tenka-identity-event-session-serial-diagnostic.log`, `/tmp/tenka-identity-urgent-toast-serial-diagnostic.log`.

The joint candidate uses exact intersections whenever a castle ribbon participates; geographic labels retain conservative bucket density against other geographic labels.
Build and 156 focused CPU controls pass; log: `/tmp/tenka-identity-minimap-joint-cpu-root.log`.
Its first focused native run reports ten passes and one failure; the six-view semantic audit now passes with visible geographic text.
The old Narumi fixture assumes zero baseline overlap, but restored geographic text produces 1628.2559772237037 square pixels at UI scale 0.8.
Log: `/tmp/tenka-identity-minimap-joint-native.log`; the assertion failure remains preserved pending measured layout review.
The preceding isolated GPU measurement belongs to the narrow candidate, not this changed joint candidate.

Measured attachments show the original Narumi road remains visible with zero baseline and placed overlap at all three scales.
The revised regression retains that road control and adds per-label summed nonincrease plus strict improvement for restored district collisions.
The joint focused collection then passes eleven cases in 17.3 seconds; log: `/tmp/tenka-identity-minimap-joint-final-native.log`.
This contract does not guarantee nonincrease against each individual army obstacle.

A stronger native control detects new castle-ribbon coverage despite improved aggregate clearance; log: `/tmp/tenka-identity-minimap-ribbon-protection-red.log`.
It records 51.48009063720602 square pixels against a previously clear ribbon; the failed production attempt remains preserved.
The protected candidate adds castle ribbons to independent hard constraints, alongside castle bodies, durability, warnings, HUD and canvas edges.
Build and 158 focused CPU cases pass; log: `/tmp/tenka-identity-minimap-protected-cpu.log`.
Its 1269-file source record is `/tmp/tenka-identity-minimap-protected-frozen-sources-20261011.txt`; 205 protected simulation/data hashes and six PNG baselines remain unchanged.

All eleven focused native cases pass in 17.8 seconds, including the stronger independent castle-ribbon control.
Log: `/tmp/tenka-identity-minimap-protected-native.log`; normal/core type checks and scoped lint/format checks also pass.
Screenshot review still finds soldier/flag coverage around Sunpu; whole-map readability and final art approval remain open.

The first protected GPU invocation omits `VISUAL_PERF=1` and skips the case; `/tmp/tenka-identity-minimap-protected-perf.log` is not performance evidence.
The corrected isolated invocation passes on Apple M3 Max Metal: 2205 frames over 30014.4 milliseconds, mean FPS 73.4647.
FPS P95 is 128.2051, frame-time P95 is 17.7 milliseconds, and synchronous CPU-update P95 is 2.3 milliseconds.
Resource observations remain equal; log: `/tmp/tenka-identity-minimap-protected-perf-gpu.log`; all 1269 source hashes remain unchanged after measurement.
The raw frame and CPU samples remain in its `frame-measurement.json`; this run does not establish a performance improvement or full-game acceptance.

Castle ribbons now use bounded CSS displacement and anchor leaders; world containers, castle models, hit anchors, typography and forced visibility remain unchanged.
Reference contract: `docs/visual/art-bible.md` section 10.4; actual paint bounds include shadows, relation glyphs, warning marks and target highlights.
The first four child indices remain stable; the fifth child paints the leader, and redraws reapply the accepted displacement.

The independent old-production obstruction gate fails after twelve captured views: 5469.551337838637 square pixels of unobscured name/troop intersection with soldiers and signals.
Log: `/tmp/tenka-castle-ribbon-obstruction-old-stable.log`; its earlier ticker-field idle comparison remains a harness failure in `/tmp/tenka-castle-ribbon-obstruction-old.log`.
Two old-helper controls fail independent hard-frame and leader-interior protection; eleven helper controls pass after implementation, including the original seven.
Logs: `/tmp/tenka-castle-ribbon-hard-leader-red.log`, `/tmp/tenka-castle-ribbon-hard-leader-green-frozen.log`.

The first integrated native candidate passes eleven cases but introduces a 491.2598714417043-square-pixel army plate pair collision at Narumi, scale 1.5.
The unchanged dense-pair oracle fails; log: `/tmp/tenka-castle-ribbon-placement-native.log`.
The corrected ordering resolves original-ribbon army plates first, protects each resolved slot, then moves ribbons and applies the unchanged army seed.
Seed inputs exclude previous-frame offsets; ribbons cannot newly invade seed slots, and army plates do not reflow around moved ribbons.
One added integration control verifies seed/final equality, per-seed nonincrease, day-only stability and unchanged hit anchors.

The corrected focused collection passes twelve direct-headless cases in 23.5 seconds; log: `/tmp/tenka-castle-ribbon-seed-native.log`.
Across twelve views, measured name/troop intersections with soldiers and signals decrease from 5469.5513378386395 to 426.47594699507056 square pixels.
This 92.20% reduction covers eligible unobscured content envelopes, not opaque glyph pixels or army-plate intersections.
Repeated observations include 33 displaced and 36 unresolved ribbons; those counts are observations, not unique castles.
The Gifu army plate still covers castle text in screenshot review; residual troop/flag collisions and whole-map art acceptance remain open.

The focused CPU collection passes 178 cases; log: `/tmp/tenka-castle-ribbon-seed-frozen-cpu.log`.
Earlier missing-method, obsolete-baseline and diagnostic-fixture errors remain preserved; the updated baseline control retains nonvacuous original collision and zero final collision.
The typed frame fixture gains an empty ribbon diagnostic for compatibility, not native rendering evidence.
Final source record: `/tmp/tenka-castle-ribbon-seed-final-frozen-sources-20261011.txt`, containing 1271 files; protected simulation/data hashes and six PNGs remain unchanged.
The work budget covers alternative proposals; separately input-bounded baseline and final accounting remain outside that budget.

The final frozen build, normal/core types, scoped lint/format and bundle budget checks pass.
All twelve focused native cases pass again in 23.1 seconds; log: `/tmp/tenka-castle-ribbon-seed-final-native.log`.
The earlier typed-fixture and lint failures remain retained; final fixes only add the empty diagnostic, specify a Map generic and remove unnecessary type assertions.

The isolated final GPU case passes on Apple M3 Max Metal with twenty armies: 2071 frames over 30015.3 milliseconds.
Mean FPS is 68.9981, FPS P95 is 125, frame-time P95 is 17.9 milliseconds, and synchronous CPU-update P95 is 2.3 milliseconds.
Deferred layout is outside the CPU-update measurement; resource observations remain equal and all 1271 source hashes remain unchanged after measurement.
Log: `/tmp/tenka-castle-ribbon-seed-final-perf.log`; raw samples remain in its `frame-measurement.json`.
This single run meets the named frame gate, not a speedup, heap-soak, whole-game or whole-map art acceptance claim.

The frozen ribbon candidate passes the full UI project: 1066 tests across 98 files in 41.18 seconds.
The App project passes 1055 tests across 115 files in 60.93 seconds, without coverage instrumentation.
Logs: `/tmp/tenka-castle-ribbon-broad-ui-20261011.log` and `/tmp/tenka-ribbon-broad-app-20261011.log`; original canvas and React warnings remain retained.
These results do not replace full coverage, core, golden, replay or native release gates.

The auto-return journey now uses Clock-controlled normal RAF ticks and real keyboard input for speed and pause.
Exact day increments, duplicate-input protection, command counts and authoritative army assertions remain unchanged.
Its direct-headless native case passes in 10.6 seconds; log: `/tmp/tenka-auto-return-clock-native.log`.
Normal types, scoped lint and format checks pass; the build precedes the next army-seed refinement.
Tests use no Chrome plugin, visible browser window or report auto-opening; this result does not measure wall-clock input latency.

Army seeds now receive a bounded text refinement before castle ribbons move; selected armies retain their original seed positions.
Each original fixed-obstacle, plate-pair, directed plate-tether and HUD visibility constraint remains a separate ceiling.
The helper does not certify tether clearance against every HUD or castle body; input validation precedes capacity checks.
Alternative proposals have explicit limits; budget exhaustion restores the complete original seed, without hiding armies or text.

The measured seed control retains a genuine 547.9441 square-pixel name obstruction before refinement; all 146 focused helper and renderer cases pass.
The stronger native oracle independently measures actual castle name and troop bounds against final army plates in all twelve views.
Its original build fails at a 0.7276 square-pixel troop obstruction; all twelve raw views and the failed trace remain retained.
Logs: `/tmp/tenka-army-seed-readability-red.log` and `/tmp/tenka-castle-plate-content-red.log`.

The refined build passes all twelve native cases in 35.1 seconds, including exact zero unobscured plate-to-text intersections.
Log: `/tmp/tenka-army-seed-readability-native.log`; existing pair, tether, hit, HUD, idle, geographic and core controls remain intact.
The reviewed Sunpu-close image exposes Gifu's name; rectangle evidence does not prove opaque-pixel clearance or whole-map art acceptance.
Normal types, scoped lint and format pass; 205 protected simulation/data hashes and six baseline PNG hashes remain unchanged.

The isolated seed-refinement GPU case fails the unchanged frame-time gate: P95 is 25 milliseconds, above 18.1818 milliseconds.
It records 1880 frames over 30007.4 milliseconds with twenty armies; synchronous CPU-update P95 is 2.6 milliseconds.
Resource observations match before and after; deferred layout remains outside the CPU-update measurement.
Log: `/tmp/tenka-army-seed-readability-perf.log`; raw frame samples and the failed trace remain preserved.
All other jobs finish before this measurement; the named GPU gate remains unresolved, without a threshold waiver.

The next helper preserves proposal order and guard rules, but stops work when no strict content improvement remains possible.
An independent work control rejects the earlier clear-scene count of 15840 `Math.min` calls; the unchanged 5000-call limit now passes.
All 147 focused cases pass, including the original accepted-offset control; types, scoped lint and format checks pass.
Logs: `/tmp/tenka-army-seed-readability-work-red.log` and `/tmp/tenka-army-seed-readability-work-green.log`.
All twelve native cases pass again in 36.9 seconds; log: `/tmp/tenka-army-seed-shortcircuit-native.log`.

The isolated next GPU case passes with 1995 frames over 30009.2 milliseconds on Apple M3 Max Metal, averaging 66.4796 FPS.
Frame-time P95 is 18.1 milliseconds, below the unchanged 18.1818 limit; synchronous CPU-update P95 is 2.3 milliseconds.
Resource observations match; log: `/tmp/tenka-army-seed-shortcircuit-perf.log`, with raw frame samples and the earlier failed run preserved.
The source record contains 1272 files: `/tmp/tenka-army-seed-shortcircuit-frozen-sources-20261011.txt`.
This single passing run does not establish timing margin, a causal speedup, forty-army national performance or whole-game acceptance.

The new Court-work native journey remains pending; its first run times out on an incorrect officer selector.
The selector correction reaches the paid monthly favor and treasury checks, then fails because closing the summary restores speed one.
Logs: `/tmp/tenka-court-work-native.log` and `/tmp/tenka-court-work-corrected-native.log`; both failures remain preserved without deadline waivers.
These failures identify harness assumptions, not a verified Court production defect or a successful complete journey.
The controlled-clock correction reaches the stopped-work month, but exceeds the unchanged sixty-second limit during daily input round trips.
Log: `/tmp/tenka-court-work-controlled-native.log`; the complete two-month journey remains unverified.

Keeping speed one active between days still exceeds the same deadline during the second month.
Log: `/tmp/tenka-court-work-segment-native.log`; all prior failed traces remain retained.

The final Court journey uses native five-speed input and Clock-controlled normal RAF ticks, without debug stepping or injected state.
Each day still advances exactly once and passes state invariants; native pause remains at command and settlement boundaries.
The paid month deducts fifty through the independently reconstructed economy ledger and gains the expected Court favor.
Stopping queues one accepted command; the next month records no work charge and the normal favor decay.
Court passes in 41.1 seconds; auto-return passes again in 9.4 seconds, with both original per-case deadlines unchanged.
Log: `/tmp/tenka-court-work-x5-native.log`; actual states, choices, ledgers and accepted command logs remain attached.

The final source record contains 1272 unchanged files: `/tmp/tenka-seed-shortcircuit-court-x5-frozen-sources-20261011.txt`.
Only the Court test changes after the passing GPU run; production sources match that measured build.
The final bundle check passes; full coverage, national succession, protected screenshot baselines and whole-map art acceptance remain separate unresolved gates.

The static sea material adds quiet crossed daylight and current variation; muted soil and grass replace the pale coast profile.
One 512-by-512 RGBA texture owns 1048576 raw bytes; the existing coast atlas remains 2048 bytes with unchanged geometry.
Sea paint stays beneath the shallow shelf and opaque land; explicit teardown releases its source once without destroying shared textures.
The reference contract is in `docs/visual/art-bible.md` section 3.2.4; these materials do not represent water depth or weather.

Both original open-water crops fail the independently selected variation control, with a mean-RGB range of only 0.3333.
The guarded control reconstructs world projection from actual castle anchors and excludes samples within twenty-four world units of emitted land.
Logs: `/tmp/tenka-sea-native-red-20261010.log` and `/tmp/tenka-sea-native-guarded-red-20261010.log`; both failed reports remain preserved.

The prototype passes all five direct-headless sea, coast, lake, foreground and remount controls in seventeen seconds.
Open-water ranges are five and four; both row and column mean ranges exceed the unchanged 0.5 threshold.
Idle and restored-camera pixels match, source ownership remains bounded, and GameState remains unchanged.
Log: `/tmp/tenka-sea-prototype-native-20261010.log`; report: `/private/tmp/tenka-sea-prototype-native-report-20261010/`.
Screenshot review finds reduced pale edging and quiet water variation, but dense banners and labels still prevent whole-map art acceptance.

All 180 focused renderer, Host, material, map-drawing and frame-measurement cases pass; normal/core types and scoped lint pass.
One interim failure references WHITE on a scene mock without that resource; the actual Pixi helper retains independent WHITE safety checks.
Earlier interim integration diagnostics and label mismatches remain separate failed logs, not material behavior evidence.
Logs: `/tmp/tenka-sea-focused-final-20261010.log`, `/tmp/tenka-sea-final-types-20261010.log` and `/tmp/tenka-sea-integration-lint-20261010.log`.
The sea candidate freezes 1227 files; focused results do not replace full-suite or isolated GPU evidence.

The complete sea candidate reports 5422 passed, eight failed and one skipped across 546 files in 127.21 seconds.
All UI and App cases pass; the eight earlier core, golden and replay failures remain unresolved.
Log: `/tmp/tenka-sea-verified-full-coverage-20261010.log`; no concurrent GPU test runs during this eight-worker collection.

The isolated direct-headless GPU run reports thirty-five passed and one frozen screenshot failure in 2.6 minutes, with no skipped cases.
It enables both `VISUAL_GPU=1` and `VISUAL_PERF=1`; all CPU jobs finish before that run.
Log: `/tmp/tenka-sea-verified-gpu-20261010.log`; report: `/private/tmp/tenka-sea-verified-gpu-report-20261010/`.
Actual sea pixels retain ranges five and four; camera, LOD, lake, foreground and renderer-remount controls pass without page errors.
The unchanged screenshot comparison remains a failure, not an acceptance waiver.

Twenty moving armies produce 3017 frames over 30007.8 milliseconds on Apple M3 Max Metal, averaging 100.541 frames per second.
Frame-time p95 is 16.8 milliseconds; CPU-update p95 is 2.9 milliseconds; resource counts match before and after the workload.
The sea owns one texture and one source, with 1048576 raw RGBA bytes; coast geometry remains 966184 bytes.
Remount cache counts remain eight font atlases, fourteen canvas contexts and thirty-eight BitmapText objects.
Eleven post-GC whole-heap samples rise from 42963028 to 45131092 bytes; heap stability remains unproven.

Build, full lint, normal/core types, asset checks and bundle checks pass; logs use the `/tmp/tenka-sea-verified-` prefix.
Initial gzip is 571855 bytes, scenario gzip is 100845 bytes and the font remains 355600 bytes.
All 1227 candidate hashes, 205 earlier core/data hashes and six frozen PNG hashes match after testing.
No golden, replay or screenshot baseline changes; whole-game completion and whole-map art acceptance remain unproven.

Display-only coast curves now use protected local triangles instead of a uniform twenty-unit exclusion margin.
Roads, rivers, bridges and fixed wave centers retain their complete conservative paint envelopes; canonical data and picking remain unchanged.
One 128-by-4 atlas serves the shallow shelf and clipped land bank; two meshes own separate geometries.
The shelf stays below opaque land, and delayed ground paint stays below the clipped bank.
The reference contract is in `docs/visual/art-bible.md` section 3.2.3; these materials do not represent real bathymetry.

The original native coast fails the named inlet control with a maximum local turn of 83.991 degrees.
The first prototype still fails at 72.810 degrees because a neighboring corner remains protected by an invented continuous wave envelope.
Actual discrete wave footprints resolve that error without reducing paint protection.
Logs: `/tmp/tenka-coast-constrained-native-red-20261010.log` and `/tmp/tenka-coast-prototype-native-20261010.log`.
Their separate reports and same-view PNGs remain preserved under `/private/tmp/`.

The first full candidate reports 5392 passed, twenty-two failed and one skipped across 545 files in 145.60 seconds.
Eight failures are earlier core, golden and replay blockers; six App cases time out, and two toast dismissal callbacks fail.
Six MapCanvasHost cases expose missing Mesh exports in its separate test mock, including one failed owner cleanup check.
Log: `/tmp/tenka-coast-verified-full-coverage-20261010.log`; these additional failures are not acceptance waivers.

The same candidate passes three native water controls but fails the coast control at 83.991 degrees.
The real visual fixture has fifteen nodes and fourteen roads; excess safe coast corners trigger a global output-budget fallback.
Local budget admission now retains completed safe curves while only excess corners stay unrounded.
Logs: `/tmp/tenka-coast-verified-functional-20261010.log` and `/tmp/tenka-constrained-coast-sparse-authentic-red.log`.
The failed native report is `/private/tmp/tenka-coast-first-verified-functional-report-20261010/`.

The corrected coast passes its direct-headless native case with a maximum local turn of 12.8413 degrees.
The actual sparse scene emits 4094 points, 966184 geometry-array bytes and 2048 atlas bytes, within the unchanged caps.
Geometry, ground clipping, pan, UI scales, far LOD, resource identity and page-error controls pass; GameState and source hashes remain unchanged.
Log: `/tmp/tenka-coast-budget-functional-20261010.log`; report: `/private/tmp/tenka-coast-budget-functional-report-20261010/`.
All four same-view PNGs remain in `/private/tmp/tenka-coast-budget-functional-20261010/`; whole-map art acceptance remains incomplete.

All seventy-nine focused coast and road cases pass, and all 114 renderer integration and material cases pass.
The corrected MapCanvasHost mock passes all twenty-one unchanged cases, including complete owned-source cleanup.
The four affected App files pass nineteen cases in a separate serial control; that control does not replace full-suite evidence.
Logs: `/tmp/tenka-constrained-coast-sparse-focused-final.log`, `/tmp/tenka-coast-renderer-compat-final.log`, and `/tmp/tenka-coast-app-controls-20261010.log`.
The toast assertion still fails in a separate control; subsequent tracing confirms that its actual dismissal callback executes before the timeout.

The actual 300-millisecond exit timer fires after 996.497 milliseconds during traced initialization.
The supplied dismissal spy receives `save-action:urgent`, but the later timeout reports a stale earlier zero-call assertion.
This trace identifies delayed observation, not a cancelled timer or a broken dismissal callback.
Log: `/tmp/tenka-coast-main-two-dispatch-trace.log`; temporary instrumentation returns to the original source hash afterward.
The complete UI run still needs fresh evidence; these traces do not convert failures into passes.

An incremental spatial index reduces accepted-triangle comparisons from 105549 to 325 while retaining the exact overlap predicate and bounded work guards.
Six pre-index geometry hashes remain identical, including the real sparse fixture, national scene and dense synthetic rings.
All eighty-one focused coast and road cases pass; timing probes remain qualified startup diagnostics, not native frame-rate acceptance.
Logs: `/tmp/tenka-constrained-coast-index-work-red.log` and `/tmp/tenka-constrained-coast-index-focused-final.log`.

Quiet-host toast controls still fail after that optimization; the spatial index alone does not resolve initialization starvation.
Broader tracing finds two terrain reconstructions, lasting 239.91 and 210.61 milliseconds, followed by 429.56 milliseconds of mountain raster work.
MapCanvasHost submits static data before initialization, then unnecessarily submits the identical data again after initialization already consumes it.
The Host now skips only redundant synchronization for the same renderer and data identity; explicit renderer reload semantics remain unchanged.
Logs: `/tmp/tenka-coast-main-broad-phase-trace.log` and `/tmp/tenka-host-boot-red.log`; original test assertions and deadlines remain unchanged.

All twenty-six Host cases pass after the synchronization fix, including five new startup and pending-data controls.
An explicit same-object renderer reload still rebuilds roads and buffers; only redundant Host completion synchronization is skipped.
The unchanged urgent and merged-toast controls both pass with V8 coverage on a quiet host in 5.63 seconds.
Logs: `/tmp/tenka-host-boot-green-refrozen.log` and `/tmp/tenka-coast-boot-main-control-20261010.log`.
These focused results do not replace the complete candidate run.

The boot-corrected full run reports 5414 passed, eight failed and one skipped across 545 files in 129.62 seconds.
All UI and App cases pass; the eight earlier core, golden and replay blockers remain unresolved.
Log: `/tmp/tenka-coast-boot-verified-full-coverage-20261010.log`; the run uses eight workers without concurrent native GPU testing.
All 1224 frozen candidate files and six baseline PNG hashes remain unchanged after that run.

The direct-headless GPU suite reports thirty-three passed, one frozen screenshot failure and one performance case skipped in two minutes.
The skipped case requires `VISUAL_PERF=1`; a separate isolated run with that flag passes in 32.2 seconds.
Logs: `/tmp/tenka-coast-boot-verified-gpu-20261010.log` and `/tmp/tenka-coast-boot-verified-perf-20261010.log`.
Reports remain under `/private/tmp/tenka-coast-boot-verified-gpu-report-20261010/` and `/private/tmp/tenka-coast-boot-verified-perf-report-20261010/`.
No plugin, visible browser, automatic report opening or baseline update is used.

On Apple M3 Max Metal, twenty moving armies produce 3020 frames over 30003.8 milliseconds, averaging 100.654 frames per second.
Frame-time p95 is 16.7 milliseconds; CPU-update p95 is 2.9 milliseconds; resource counts match before and after the workload.
The remount run preserves font-atlas, canvas-context and BitmapText counts at eight, fourteen and thirty-eight respectively.
Eleven post-GC whole-heap samples rise from 43362016 to 45519276 bytes; this does not establish heap stability.
Current screenshots still show a uniform dark sea, pale shore profile and dense flags and labels; whole-map art acceptance remains incomplete.

Build, full lint, normal/core types, asset validation and bundle validation pass for the boot-corrected candidate.
Initial gzip is 570771 bytes, scenario gzip is 100844 bytes and the font is 355600 bytes.
Evidence logs use the `/tmp/tenka-coast-boot-verified-` prefix; release blockers remain open.

Mandatory troop plates now reserve actual visible soldier frames and semantic signal bounds within the existing 48 CSS-pixel cap.
Castle clearance remains the first priority; foreground overlap cannot increase when castle overlap equals its baseline.
Castle improvements can still require foreground tradeoffs; mandatory plates, picking and world anchors remain unchanged.
The presentation contract is in `docs/visual/art-bible.md` section 6.5.

Lake fills now use local two-dimensional bank distance, sky reflection and static coherent variation instead of a one-dimensional gradient.
Each lake owns one texture, source and removable style listener; destruction releases those owners through public Pixi APIs.
Allocation caps are 32 lakes, 128 texels per side and 2 MiB of raw RGBA; invalid polygons retain solid fallback.
The national scene owns two water textures, two sources and two style listeners, with 79360 raw RGBA bytes.
These counts do not represent total GPU memory; existing `ownedTextures` counts only territory and analysis textures.

The old built candidate fails both strengthened native behavior checks; initial missing-diagnostic failures remain separate structural evidence.
Sunpu army 11 increases foreground overlap from 247.6936 to 1815.3177 square CSS pixels while castle overlap remains zero.
Biwa's right bank measures 129.2222 against a 133.8148 center, failing the independently selected same-row brighter-bank control.
Log: `/tmp/tenka-water-foreground-strong-native-red-20261010.log`; report: `/private/tmp/tenka-water-foreground-strong-native-red-report-20261010/`.

All twelve integrated direct-headless cases pass in 44.8 seconds; Sunpu army 11 now has zero foreground overlap.
Sunpu total foreground overlap falls from 3013.0273 to 400.4564 square CSS pixels at all three UI scales.
Narumi totals fall from 1989.3989–2085.6537 to 525.7753; all six views retain zero castle-frame overlap.
These sums count pairwise rectangular intersections, not opaque pixels; remaining foreground overlap prevents a universal visibility claim.
Biwa's left, center and right same-row means are 130.6296, 116.9259 and 135.1111; both banks pass the brighter-bank control.

Functional screenshots and raw observations remain under `/private/tmp/tenka-water-foreground-functional-20261010/`.
The preserved HTML report is `/private/tmp/tenka-water-foreground-functional-report-20261010/`.
Screenshot review still finds angular protected coastlines and dense soldier, flag and district clusters; overall art acceptance remains incomplete.

The full run reports 5382 passed, eight failed and one skipped across 541 files in 184.28 seconds.
All UI/App cases pass; the same earlier core, golden and replay blockers remain unresolved.
Build, full lint, normal/core type checks, asset checks and bundle checks pass.
Initial gzip is 565834 bytes; scenario gzip is 100840 bytes; the font remains 355600 bytes.
All 1215 frozen candidate hashes, 205 previous core/data hashes and six baseline PNG hashes match after functional and full testing.
Log: `/tmp/tenka-water-foreground-full-coverage-20261010.log`; no golden, replay or screenshot baseline changes.

The first extended headless GPU run reports 28 passed, two failed and three not run at the five-minute suite limit.
One failure is the unchanged frozen screenshot comparison; the other exposes a new real remount lifecycle regression.
The second early remount triggers Pixi's `Cannot read properties of null (reading 'on')` error, then waits until the 180-second case timeout.
Heap and performance acceptance remain unverified for this candidate; missing cases do not count as passes.
Log: `/tmp/tenka-water-foreground-verified-gpu-20261010.log`; preserved report: `/private/tmp/tenka-water-foreground-first-gpu-report-20261010/`.

Explicit GraphicsContext release fixes a real ownership omission; 38 focused lake tests pass and shared WHITE/EMPTY resources remain alive.
The first rebuilt candidate still fails the independent native remount case; context release alone does not resolve the Pixi error.
That three-remount oracle rejects actual page errors promptly; the original built candidate reproduces the error in three seconds.
Logs: `/tmp/tenka-water-remount-native-red-20261010.log` and `/tmp/tenka-water-remount-functional-20261010.log`.
Reports: `/private/tmp/tenka-water-remount-native-red-report-20261010/` and `/private/tmp/tenka-water-remount-first-fix-report-20261010/`.

The context-only full run reports 5382 passed, nine failed and one skipped across 541 files in 187.88 seconds.
Eight failures are the earlier core, golden and replay blockers; the ninth is a MainScreen urgent-toast dismissal spy with zero calls.
That additional failure remains preserved and requires a separate control; it is not a passing UI result.
Log: `/tmp/tenka-water-remount-full-coverage-20261010.log`.

The isolated urgent-toast control passes one case with 63 filtered cases skipped; its production and test sources remain unchanged.
Log: `/tmp/tenka-water-remount-toast-control-20261010.log`; this control does not replace a complete UI run.

Real ESM/CJS pooled-batch tests reproduce the native error: two failures and two passing controls before dependency repair.
An intervening ordinary render batcher reuses stale trailing batches; subsequent graphics preparation reads destroyed source styles.
The pinned local repair prepares bind groups only for `batcher.batchIndex`, not the retained array length, in both module formats.
This separate fix does not claim upstream patch coverage; the installer now validates nineteen targets and writes zero on repeat.
All eighteen focused dependency and lifecycle cases pass after repair; earlier harness errors and non-failing probes remain separate evidence.
Logs: `/tmp/tenka-graphics-batch-reuse-second-remount-red.log` and `/tmp/tenka-graphics-batch-reuse-green.log`.

The rebuilt direct-headless candidate passes all three new cases in 12.8 seconds, including three actual renderer remounts without page errors.
Water resources retain two textures, two sources, two style listeners and 79360 raw RGBA bytes; actual lake geometry and GameState remain unchanged.
Log: `/tmp/tenka-water-verified-functional-20261010.log`; report: `/private/tmp/tenka-water-verified-functional-report-20261010/`.
All 1218 corrected candidate hashes match after this run; previous failed records remain preserved rather than overwritten.

The corrected full run reports 5387 passed, eight failed and one skipped across 542 files in 184.34 seconds.
All UI/App cases pass, including the unchanged urgent-toast case; the eight earlier core, golden and replay blockers remain unresolved.
Build, full lint, normal/core type checks, asset checks and bundle checks pass for the corrected candidate.
Initial gzip is 565847 bytes; scenario gzip is 100844 bytes; the font remains 355600 bytes.
All 1218 corrected candidate hashes match after full testing; no golden, replay or screenshot baseline changes.
Log: `/tmp/tenka-water-verified-full-coverage-20261010.log`.

The final isolated direct-headless GPU suite reports 33 passed, one frozen-baseline failure and zero skipped in 2.7 minutes.
All three new cases and the full remount, gameplay, layout and performance controls pass; the frozen screenshot comparison remains unresolved.
Log: `/tmp/tenka-water-verified-gpu-20261010.log`; artifacts: `/private/tmp/tenka-water-verified-gpu-20261010/`.
The preserved HTML report is `/private/tmp/tenka-water-verified-gpu-report-20261010/`.

The twenty-army Metal workload records 3040 frames over 30003.2 milliseconds on Apple M3 Max.
Frame-time p95 is 16.7 milliseconds; CPU-update p95 is 3.0 milliseconds across 3041 samples.
Water resources retain two textures, two sources, two style listeners and 79360 raw RGBA bytes before and after the workload.
Historical territory/analysis textures, shared terrain sprites and event listeners retain counts of 1, 2 and 12.
These ownership counts do not measure total GPU memory or establish whole-heap stability.

Measured remounts retain 8 font-atlas canvases, 14 2D contexts and 38 BitmapText instances without context loss.
Twenty-one post-GC heap samples rise from 70838716 to 72217020 bytes; whole-heap stability remains unproven.
Raw frame and heap samples remain in the final verified artifact directory above.
All 1218 corrected candidate hashes, 205 previous core/data hashes and six frozen PNG hashes match after both final suites.
The pinned installer validates nineteen targets without writes; no golden, replay or screenshot baseline changes.

The painted model hierarchy enlarges main castles to 40 world units and branch castles to 30.
Painted troop flags use a 24-unit pole and 11-unit cloth; legacy and far profiles remain unchanged.
Durability and warnings clear the actual painted frame; semantic anchors, picking and shared model depth remain unchanged.
The presentation contract is in `docs/visual/art-bible.md` section 6.4.3.

The old built candidate fails the independent native width check: expected 60 CSS pixels, received 42.
A second initial failure came from an incorrect far-branch test assumption, not a product regression.
The corrected oracle expects the existing hidden far branch and retains the main-castle vector control.
Log: `/tmp/tenka-model-hierarchy-native-red-20261010.log`.

Display-only lake curves retain canonical anchors, exact bounding boxes and river-connected straight banks.
Biwa expands from 10 to 45 points; Hamana expands from 6 to 36.
Their area differences are 0.891% and 1.486%; both centroid shifts remain below 0.5 world units.
All 24 focused lake tests pass; model tests report 120 passes and renderer compatibility tests report 122.
These checks do not certify opaque-pixel appearance or campaign acceptance.

The integrated direct-headless run passes all eight model, depth, picking, status and lake cases in 36.2 seconds.
Native screenshots and raw attachments remain under `/private/tmp/tenka-model-hierarchy-functional-20261010/`.
The preserved HTML report is `/private/tmp/tenka-model-hierarchy-functional-report-20261010/`.
Screenshot review still finds dense troop clusters and unfinished terrain presentation.

Build, full lint, normal/core type checks, asset checks and bundle checks pass.
Initial gzip is 564296 bytes; scenario gzip is 100845 bytes; the font remains 355600 bytes.
All 1211 frozen candidate hashes, 205 earlier core/data hashes and six baseline PNG hashes match.

The first full hierarchy run reports 5365 passed, nine failed and one skipped across 539 files in 180.37 seconds.
Eight failures match the earlier core, golden and replay blockers.
The ninth is an old painted-width expectation: actual 40 world units versus expected 28.
Only that painted assertion changes to 40/30; placement-helper defaults and far-vector controls remain unchanged.
All six direct castle-art tests then pass; the original failure log remains preserved.
Logs: `/tmp/tenka-model-hierarchy-full-coverage-20261010.log` and `/tmp/tenka-model-hierarchy-castle-art-contract-green-20261010.log`.

The final direct-headless GPU suite reports 30 passed, one frozen-baseline failure and zero skipped in 2.5 minutes.
All three new hierarchy cases, remount checks and performance checks pass.
Log: `/tmp/tenka-model-hierarchy-verified-gpu-20261010.log`; artifacts: `/private/tmp/tenka-model-hierarchy-verified-gpu-20261010/`.
The preserved HTML report is `/private/tmp/tenka-model-hierarchy-verified-report-20261010/`.
All 1211 corrected candidate hashes match after native testing; production code is unchanged by the test-only correction.

The isolated twenty-army workload records 3104 frames over 30008 milliseconds on Apple M3 Max Metal.
Frame-time p95 is 16.8 milliseconds; CPU-update p95 is 1.1 milliseconds across 3105 samples.
Owned textures, shared terrain sprites and event listeners retain counts of 1, 2 and 12.
Remount cache counts retain 8 font-atlas canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 70595576 to 72173596 bytes; whole-heap stability remains unproven.
Raw frame and heap samples remain under the verified artifact directory above.

The corrected full run reports 5366 passed, eight failed and one skipped across 539 files in 173.43 seconds.
All UI/App cases and the corrected castle-art control pass; only the eight earlier core, golden and replay blockers remain.
Log: `/tmp/tenka-model-hierarchy-verified-full-coverage-20261010.log`.
All 1211 corrected candidate hashes match after both final suites; no golden, replay or screenshot baseline changes.

The original actor-depth native run fails all three new cases against the earlier built candidate.
Two failures identify the absent shared-model diagnostic; these are structural evidence, not compositing measurements.
The plate case measures 1165.3943 square CSS pixels of castle-body overlap after placement against 605.3633 at baseline.
That genuine overlap regression remains preserved; body-frame bounds do not prove opaque-pixel visibility.
Log: `/tmp/tenka-actor-depth-native-red-20261010.log`; artifacts: `/private/tmp/tenka-actor-depth-native-red-20261010/`.

The shared castle-building and soldier-body layer uses world foot Y and stable `kind:id` order.
Castle flags, durability and warnings occupy the existing effects layer; army semantic containers retain their original foreground layer.
Selection changes semantic order, not model depth; world anchors, picking and GameState remain unchanged.
Visible castle body frames now constrain plate placement within the existing 48 CSS-pixel displacement cap.
The solver minimizes raw body overlap before padded obstacles and displacement; the baseline candidate prevents increased body overlap.
The explicit presentation contract is in `docs/visual/art-bible.md` section 6.4.2 and `plan/04-map-and-movement.md` section 3.10.1.

All 257 focused renderer, model, host, placement and measurement tests pass across seven files.
The crossing control verifies real body reordering, exact foot ties, selection independence and position-only updates without redraw.
Far empty troop footprints remain explicitly invisible; reset and destruction retain ownership checks.
The body-priority regression first records 120 to 420 square CSS pixels of increased overlap; all twelve solver tests pass after correction.
Logs: `/tmp/tenka-actor-depth-final-257.log`, `/tmp/tenka-castle-body-primary-{red,green-final}.log`.

The first integrated direct-headless native run passes all seven cases in 37.8 seconds.
All six measured Sunpu and Narumi views reduce plate/body-frame overlap to zero at UI scales 0.8, 1 and 1.5.
Each Sunpu view measures 420.3912 to zero square CSS pixels; each Narumi view measures 605.3633 to zero.
Actual mixed model order, real occupied-anchor selection, normal-day movement, idle stability and far mandatory plates pass.
Existing castle statuses, inspector controls and castle/army picking also pass; these checks do not prove opaque-pixel visibility or earned campaign play.
Log: `/tmp/tenka-actor-depth-functional-20261010.log`; artifacts: `/private/tmp/tenka-actor-depth-functional-20261010/`.

The preserved functional HTML report retains all six raw numeric attachments under `/private/tmp/tenka-actor-depth-functional-report-20261010/`.
Screenshot review finds clearer castle art, but dense soldier/flag clusters, small models and terrain presentation remain unfinished.
Unrelated actors can remain beneath the minimap; target-focused checks do not promise visibility of every actor.

All 1208 candidate hashes match after functional testing; six frozen PNGs and 205 core/data hashes remain unchanged.
Build, full lint, normal/core type checks, asset checks and bundle checks pass.
Initial gzip is 562611 bytes, scenario gzip is 100847 bytes, and the font is 355600 bytes.
Logs: `/tmp/tenka-actor-depth-{build,full-lint,root-types,assets,bundle}-20261010.log`.

The frozen full run reports 5360 passed, eight failed and one skipped across 538 files in 184.89 seconds.
All UI/App tests pass; the eight earlier core, golden and replay failures remain unresolved.
All 1208 candidate hashes match after this run; no golden, replay or screenshot baseline is rewritten.
Log: `/tmp/tenka-actor-depth-full-coverage-20261010.log`.

The verified direct-headless GPU suite reports 27 passed, one frozen-baseline failure and zero skipped in 2.4 minutes.
All three new depth cases and both existing castle cases pass; all other functional, remount and performance cases pass.
The required-layer gate also verifies visible shared models at all three LOD stages.
All 1208 candidate hashes match after this run; the six frozen PNGs remain unchanged, and the pinned patch validates seventeen targets without writes.
Log: `/tmp/tenka-actor-depth-verified-gpu-20261010.log`; artifacts: `/private/tmp/tenka-actor-depth-verified-gpu-20261010/`.
The preserved report retains numeric attachments under `/private/tmp/tenka-actor-depth-verified-report-20261010/`.

The verified twenty-army workload records 3104 frames over 30002.5 milliseconds with the Apple M3 Max Metal renderer.
Frame-time p95 is 16.8 milliseconds, FPS p95 is 140.85, and CPU-update p95 is 1.0 millisecond across 3105 samples.
Owned textures, shared terrain sprites and event listeners remain 1, 2 and 12 before and after the workload.
Measured remounts retain 8 font-atlas-sized canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 70445744 to 71879260 bytes; whole-heap stability remains unproven.
Raw samples remain in `frame-measurement.json` and `remount-heap-samples.json` under the verified artifact directory above.

The model-first castle redesign moves node selection and siege marks into a ground subcontainer behind every node model.
Shallow gold and red ellipses replace roof-crossing circles; durability uses a short base bar, and critical danger uses a compact badge.
World anchors, picking radii, durability ratios, color thresholds, siege modes and existing LOD visibility remain unchanged.
The explicit presentation update is in `docs/visual/art-bible.md` section 6.4.1; earlier CD5 geometry and layer decisions are historical.

The siege inspector now docks beside navigation, below layer controls and above the context panel, with 12 CSS-pixel gaps.
Its physical width caps at 280 pixels; bounded scrolling retains all progress values, modes and disabled reasons.
Explicit map focus reserves that left-side footprint; layout updates do not move the camera automatically.
All 94 MainScreen, keyboard, focus-measurement and siege integration tests pass across four files.
Logs: `/tmp/tenka-siege-inspector-dock-{red,green-final}.log`, `/tmp/tenka-model-first-main-integration-20261010.log`.

The original direct-headless inspector regression fails with 601.7169 square CSS pixels of overlap against the original castle art frame.
That frame comes from independently projected asset bounds; it is not an opaque-pixel or semantic roof mask.
The new native cases also inspect actual renderer tree order and keep ordinary, assault and encircle controls at three UI scales.
The redesign is not complete; broader model depth, troop representation and terrain presentation remain unfinished.
Log: `/tmp/tenka-model-first-inspector-red-20261010.log`; artifacts: `/private/tmp/tenka-model-first-inspector-red-results-20261010/`.

All 171 focused model, renderer and measurement tests pass across seven files after four authentic geometry/layer regression failures.
The frozen full run reports 5354 passed, eight failed and one skipped across 538 files in 183.06 seconds.
All UI/App tests pass; the eight earlier core, golden and replay failures remain unresolved.
All 1207 candidate hashes match after the full and first native runs.
Logs: `/tmp/tenka-model-status-{red,green-final}.log`, `/tmp/tenka-model-first-full-coverage-20261010.log`.

The first direct-headless functional run reports four passed and one failed in 33.8 seconds.
The inspector clears the castle frame and settled HUD at all three scales; progress values, radios, reasons, scrolling and keyboard controls pass.
All three existing focus cases pass; the new status case stops at an occupied Narumi anchor with an incorrect castle-selection expectation.
Actual input selects the 900-soldier army under the unchanged army-first rule; later Sunpu and Kakegawa status observations remain unverified.
The revised observation retains that army control and adds unoccupied castle picking; final native and performance verification remain pending.
Log: `/tmp/tenka-model-first-functional-20261010.log`; artifacts: `/private/tmp/tenka-model-first-functional-results-20261010/`.

The corrected browser test verifies the occupying Nagahide army, its selected 900 plate and its Narumi-west destination.
Separate real Kiyosu anchor clicks verify castle picking at each scale; production sources and deadlines remain unchanged.
Formatting, scoped lint and normal/core type checks pass; candidate comparison finds only the new browser-test file changed.
Logs: `/tmp/tenka-castle-model-picking-{format,lint,types}.log`.

The verified direct-headless GPU suite reports 24 passed, one frozen-baseline failure and zero skipped in 2.3 minutes.
Both new castle cases pass, including all three-scale inspector checks, ordinary/critical/threatened channels, real picking and retained far statuses.
Battle, geographic, HUD, production smoke, remount and performance cases pass; the six frozen strategy PNGs remain unchanged.
All 1207 candidate hashes match after this run; 205 core/data hashes remain unchanged, and the pinned patch validates 17 targets without writes.
Log: `/tmp/tenka-model-first-verified-gpu-20261010.log`; artifacts: `/private/tmp/tenka-model-first-verified-gpu-results-20261010/`.
The preserved HTML report includes JSON attachments under `/private/tmp/tenka-model-first-verified-report-20261010/`.

The verified twenty-army workload records 3096 frames over 30000.3 milliseconds with the Apple M3 Max Metal renderer.
Frame-time p95 is 16.7 milliseconds, FPS p95 is 140.85, and CPU-update p95 is 0.9 milliseconds across 3097 samples.
Owned textures, shared terrain sprites and event listeners remain 1, 2 and 12 before and after the workload.
Measured remounts retain 8 font-atlas-sized canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 69691180 to 71050304 bytes; whole-heap stability remains unproven.
Raw samples are in `frame-measurement.json` and `remount-heap-samples.json` under the verified artifact directory above.

Screenshot review confirms the old roof-crossing red/gold circles are absent, and the siege inspector no longer floats over the selected castle.
Sunpu and Narumi castle artwork remains obscured by soldier clusters and foreground army number plates.
The renderer still draws every army after every castle; shared body depth and castle-aware plate placement remain required work.
Scene-tree and art-frame checks do not prove opaque-pixel visibility, complete 2.5D acceptance or earned campaign gameplay.

The model-first production candidate passes build, full lint, normal/core type checks, asset checks and bundle checks.
Initial gzip is 561211 bytes, scenario gzip is 100845 bytes, and the font is 355600 bytes.
Logs: `/tmp/tenka-model-first-{build,lint,types,assets,bundle}-20261010.log`.

Targeted battle tactics now retain their original game, battle and actor identity instead of transferring to a newly selected unit.
Switching actors or losing a controllable actor cancels the draft; returning to that actor does not revive it.
The original actor can still select its unlocked tactic; the other actor can still issue an ordinary attack.
Both positive controls use the real order queue and battle tick, with only the rendering boundary mocked.
All 70 focused battle integration tests pass across six files; the screen suite passes all 21 tests.

The direct-headless pre-fix run fails because the target hint remains after switching actors through a unit card.
The isolated trait-specific DOM regression also fails before the fix; initial incorrect-label failures do not count as behavioral evidence.
The new native test covers both cards and map controls, same-actor retention, cancellation and unchanged paused GameState.
The first integrated native run passes the new actor-switch case and both existing tactical projection and real movement/attack cases.
Logs: `/tmp/tenka-battle-tactic-actor-{red-confirmed,green-refrozen}.log`, `/tmp/tenka-battle-tactic-actor-native-red-20261010.log`, `/tmp/tenka-battle-tactic-actor-integration-20261010.log`.

Explicit map navigation now places its world target at the center of a measured HUD-free rectangle, with a 12 CSS-pixel gap.
Raw manual camera controls, world coordinates and picking remain unchanged; measurement, resize and day updates do not pan automatically.
MainScreen defers explicit navigation one frame, measures the committed layout and supplies that fresh rectangle to the renderer.
Open context panels reserve their final footprint during their slide transition; finite 2D and 3D translation offsets do not reduce this reservation.
The revised presentation contract is in `plan/04-map-and-movement.md` sections 3.11 and 3.13.1.

All 122 renderer, host and geometry tests pass; all 89 MainScreen, keyboard and measurement tests pass after integration corrections.
The translated-panel regression first fails with a 524-pixel safe height instead of 404; the bounded translation correction passes afterward.
The shared-Dialog regression first permits pending navigation under a foreground dialog; the corrected guard cancels it.
The report-destination integration initially chooses the node branch; explicit physical coordinates restore the existing navigation contract.
Logs: `/tmp/tenka-main-focus-transition-{red,green-final}.log`, `/tmp/tenka-hud-focus-shared-dialog-red.log`, `/tmp/tenka-hud-focus-main-compat{,-refrozen}.log`.

The first integrated full run reports 5333 passed, twelve failed and one skipped across 538 files in 183.44 seconds.
Eight failures match earlier core, golden and replay failures; three UI failures expose old fixture or timing assumptions, including the report-destination branch mismatch.
The fourth UI failure concerns manual notification dismissal; unchanged isolated and whole-file checks subsequently pass, but the original failure remains recorded.
No notification deadline or production timer changes address that failure; the original unsuccessful run remains available.
Log: `/tmp/tenka-hud-focus-and-tactic-full-coverage-20261010.log`.

The final full run reports 5338 passed, eight failed and one skipped across 538 files in 175.01 seconds.
All UI/App tests pass; the eight earlier core, golden and replay failures remain unresolved.
All 1203 source, test, tool, browser, configuration and installed-patch hashes match after this run.
Log: `/tmp/tenka-hud-focus-and-tactic-final-full-coverage-20261010.log`.

The first integrated direct-headless functional run reports fourteen passed and two failed in one minute; it does not measure performance.
All six focus geometry observations pass before the minimap-shortcut check fails from an unsuitable foreground control.
The normal-motion check observes an unfinished 600-millisecond camera animation after approximately 435 milliseconds.
The revised tests use real map-background input and poll actual target projection without a fixed sleep or a longer deadline.
All 1203 candidate hashes match after both first runs; final native verification remains pending.
Log: `/tmp/tenka-hud-focus-and-tactic-native-first-20261010.log`.

The next direct-headless GPU run reports 21 passed, two failed and zero skipped in two minutes.
All reduced-motion focus, battle, geographic, HUD, production smoke, remount and performance cases pass.
Normal-motion target projection, HUD nonintersection and state-purity assertions pass before a final browser callback raises `castle is not defined`.
That callback omits its serialized castle ID; the other failure concerns unchanged frozen screenshot baselines.
All 1203 candidate hashes match after this run; the callback correction requires another full native verification.
Log: `/tmp/tenka-hud-focus-and-tactic-final-gpu-20261010.log`; artifacts: `/private/tmp/tenka-hud-focus-and-tactic-final-gpu-results-20261010/`.

The callback now receives the castle ID as an explicit browser argument; all assertions, deadlines and production sources remain unchanged.
The isolated normal-motion test passes in four seconds; formatting, scoped lint and normal/core type checks pass.
Candidate comparison finds only this browser-test file changed; the preceding full unit-suite result still describes unchanged production sources.
Log: `/tmp/tenka-hud-focus-serialized-id-native-20261010.log`; the full native rerun follows below.

The verified direct-headless GPU suite reports 22 passed, one frozen-baseline failure and zero skipped in two minutes.
All three HUD-safe focus cases pass, including normal panel motion and stable target projection after the camera settles.
Battle controls, geographic placement, HUD visibility, production smoke, remount and frame-rate gates pass.
All 1203 candidate hashes match after this run; six frozen PNGs and 205 core/data hashes remain unchanged.
Log: `/tmp/tenka-hud-focus-and-tactic-verified-gpu-20261010.log`; artifacts: `/private/tmp/tenka-hud-focus-and-tactic-verified-gpu-results-20261010/`.

The verified twenty-army workload records 3095 frames over 30008.1 milliseconds with the Apple M3 Max Metal renderer.
Frame-time p95 is 16.7 milliseconds, FPS p95 is 128.21, and CPU-update p95 is 0.9 milliseconds across 3096 samples.
Owned textures, shared terrain sprites and event listeners remain 1, 2 and 12 before and after the workload.
Measured remounts retain 8 font-atlas-sized canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 69867752 to 71098444 bytes; whole-heap stability remains unproven.
Raw samples are in `frame-measurement.json` and `remount-heap-samples.json` under the verified artifact directory above.

Screenshot review finds a foreground siege panel covering part of the selected Sunpu castle model despite clear ribbon geometry.
The current focus oracle measures the header, navigation, context panel, reports and minimap; it does not include that siege panel.
Passing rectangle gates therefore do not prove complete model visibility or complete UI acceptance.
Large status circles still obscure castle artwork, and the remaining body-depth and terrain presentation work prevents complete 2.5D acceptance.

This run records 3079 frames over 30002.3 milliseconds with the Apple M3 Max Metal renderer.
Frame-time p95 is 16.7 milliseconds, FPS p95 is 128.21, and CPU-update p95 is 1 millisecond across 3080 samples.
Owned textures, shared terrain sprites and event listeners remain 1, 2 and 12 before and after the workload.
Measured remounts retain 8 font-atlas-sized canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 69737536 to 71076064 bytes; whole-heap stability remains unproven.

The final focus-and-tactic production candidate passes build, full lint, normal and core type checks, asset checks and bundle checks.
Initial gzip is 559959 bytes, scenario gzip is 100846 bytes, and the font is 355600 bytes.
Logs: `/tmp/tenka-hud-focus-and-tactic-final-{build,lint,types,assets,bundle}-20261010.log`.

Geographic text now uses measured Pixi bounds to avoid visible troop bodies, number plates and castle ribbons within 48 CSS pixels.
The renderer retains world anchors, text content and existing visibility rules; unchanged geometry reuses placement without rebuilding labels.
The first native run reports nine passed and one failed: Sunpu rectangle overlap increases from 651.82 to 732.90 square CSS pixels.
The corrected solver first minimizes raw obstacle overlap; the unchanged baseline remains a candidate, so each label cannot increase that overlap.

All 194 focused integration tests pass; the first objective correction prevents increased overlap but leaves Sunpu overlap unchanged.
The second native run reports fifteen passed and two failed: unchanged Sunpu overlap and existing frozen-image differences.
Logs: `/tmp/tenka-geographic-native-20261010.log`, `/tmp/tenka-geographic-primary-overlap-{red,green}.log`, `/tmp/tenka-geographic-integration-refrozen-20261010.log`.
Second native log: `/tmp/tenka-geographic-final-gpu-20261010.log`.

The final search adds interior offsets and obstacle-edge combinations, with at most 376 candidate positions per label before deduplication.
All 122 focused tests pass after this change; the existing 48 CSS-pixel limit remains unchanged.
The third native run reports three passed and one failed because its Narumi assertion incorrectly requires an existing collision.
The corrected observation distinguishes Sunpu improvement from Narumi stability; it retains strict Sunpu improvement checks at all three scales.
Logs: `/tmp/tenka-geographic-interior-focused-20261010.log`, `/tmp/tenka-geographic-interior-native-20261010.log`.

The geographic full run reports 5321 passed, nine failed and one skipped across 536 files in 174.35 seconds.
Eight failures match earlier core, golden and replay failures; the ninth is a UI assertion tied to CSS argument order.
The observation-only correction retains both logical breakpoint sizes and the physical display cap; all 85 screen tests pass afterward.
All 1198 source, test, tool, browser, configuration and installed-patch hashes match after the full and second native runs.
Logs: `/tmp/tenka-geographic-full-coverage-20261010.log`, `/tmp/tenka-geographic-main-css-correction-20261010.log`.

The final geographic full run reports 5323 passed, eight failed and one skipped across 536 files in 173.95 seconds.
All UI/App tests pass; the eight earlier core, golden and replay failures remain.
Core coverage remains 94.80% lines, 91.18% branches and 98.47% functions.
All 1198 source, test, tool, browser, configuration and installed-patch hashes match after this run.
Log: `/tmp/tenka-geographic-release-full-coverage-20261010.log`.

The final direct-headless GPU suite reports sixteen passed, one frozen-baseline failure and zero skipped in 1.8 minutes.
Sunpu overlap decreases at all three UI scales; Narumi labels retain their already-clear placement.
Each Sunpu observation records summed rectangle overlap from 651.8206 to 69.875 square CSS pixels, an 89.28% reduction.
The remaining overlap involves one district label and one army plate; measured troop-body and castle overlap is zero.
Each Narumi observation records zero overlap before and after placement; rectangle tests do not identify individual opaque glyph pixels.

Normal-day movement, HUD visibility, keyboard traversal, army selection, production smoke, remount and frame-rate gates pass.
All 1198 candidate hashes match after the run; the six frozen strategy baselines remain unchanged.
Log: `/tmp/tenka-geographic-release-gpu-20261010.log`; artifacts: `/private/tmp/tenka-geographic-release-gpu-results-20261010/`.

Screenshot review still finds dense troop artwork and minimap occlusion of right-side troops in the Narumi view.
These geographic-label checks do not prove universal glyph separation, production campaign acceptance or a complete 2.5D redesign.

The final twenty-army workload records 3082 frames over 30000.6 milliseconds with the Apple M3 Max Metal renderer.
Frame-time p95 is 16.8 milliseconds, FPS p95 is 140.85, and CPU-update p95 is 1 millisecond across 3083 samples.
Owned textures, shared terrain sprites and event listeners remain 1, 2 and 12 before and after the workload.
Twenty measured remounts retain 8 font-atlas-sized canvases, 15 2D contexts and 38 BitmapText instances.
Twenty-one post-GC heap samples rise from 69675240 to 71022980 bytes; whole-heap stability remains unproven.
Artifacts: `frame-measurement.json` and `remount-heap-samples.json` under the final GPU artifact directory above.

The final geographic candidate passes build, full lint and bundle checks.
Initial gzip is 558430 bytes, scenario gzip is 100845 bytes, and the font is 355600 bytes.
Logs: `/tmp/tenka-geographic-interior-build-20261010.log`, `/tmp/tenka-geographic-release-{lint,bundle}-20261010.log`.

Notifications pause their remaining dismissal time while keyboard focus or the pointer stays inside them.
Moving focus within a notification does not restart its timer; leaving both channels resumes the remaining delay.
All thirteen notification tests pass, including three tests that fail before the focus fix.
Logs: `/tmp/tenka-toast-focus-red.log`, `/tmp/tenka-toast-focus-green-refrozen.log`.

Army number plates now avoid visible castle ribbons and other number plates within a 48 CSS-pixel offset limit.
Morale dots move with the plate; bodies, flags, hit anchors, stack positions and troop formats retain their existing contracts.
Dense layouts retain required labels through a minimum-overlap fallback; unchanged geometry reuses the previous layout.
All 237 focused tests pass, including existing army drawing, artwork, pointer, lifecycle and renderer-update controls.
Log: `/tmp/tenka-army-plate-integration-final.log`.

Two new direct-headless cases pass with the unchanged synthetic visual fixture; the existing frozen-baseline case still fails.
Six observations cover Sunpu and Narumi at UI scales 0.8, 1 and 1.5; measured army/castle-plate rectangle overlap falls to zero.
Actual pointer input selects a player army at its body anchor, retains the selected plate at far LOD and leaves GameState unchanged.
These cases do not prove earned campaign gameplay or native collapsed-stack coverage; rectangle bounds do not prove glyph/body separation.
Log: `/tmp/tenka-army-plate-native-first-20261010.log`; artifacts: `/private/tmp/tenka-army-plate-native-first-results-20261010/`.

Native screenshot review confirms readable, separated number rows and castle captions, including the previously obscured 1100 plate.
Geographic labels still crowd the Sunpu troop artwork; the initial UI-scale-1.5 screenshot clips the prestige value.
Report and minimap overlays cover troops in that Narumi view; these initial findings prevent complete UI acceptance.

The frozen army-plate full run reports 5307 passed, 8 failed and 1 skipped across 534 files in 173.77 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
All 1192 source, test, tool, browser, configuration and installed-patch hashes match after the run.
Log: `/tmp/tenka-army-plate-full-coverage-20261010.log`.

The subsequent compact HUD groups labels above complete values and reserves the actual minimap footprint for reports.
All 123 focused integration and component tests pass; types, lint, formatting and build checks pass.
The first native run reports seven passed and one keyboard-test failure; resource clipping and overlay separation checks pass.

Screenshot review still finds a short notification viewport; the follow-up minimap cap limits its display to 192 CSS pixels.
The keyboard test incorrectly assumes forward focus wraps from the final document control; the follow-up test uses both traversal directions.

The follow-up direct-headless suite passes all eight cases, including resource visibility, keyboard traversal, army plates and production smoke journeys.
The native notification viewport exceeds 100 CSS pixels, and the report stack does not intersect the minimap.
All 1195 source, test, tool, browser, configuration and installed-patch hashes match after the run.
Maximum-pending native notification coverage remains unverified; the full coverage and performance runs above precede these HUD changes.
Logs: `/tmp/tenka-hud-overlay-focused-final-20261010.log`, `/tmp/tenka-hud-overlay-native-20261010.log`, `/tmp/tenka-minimap-physical-cap-green.log`.
Final native log: `/tmp/tenka-hud-overlay-cap-native-20261010.log`; artifacts: `/private/tmp/tenka-hud-overlay-cap-native-results-20261010/`.

Direct headless Chromium now runs after the permission change, without Chrome plugins or new windows.
The earlier GPU smoke/visual suite reports 12 passed, 1 failed and zero skipped after the army-plate layout change.
The original null-resource error is gone, and the unchanged remount gate passes; frozen visual baselines still differ.
Log: `/tmp/tenka-army-plate-gpu-smoke-visual-20261010.log`.

Shared label styles reuse font identities and detach label listeners on destruction; 113 focused tests pass.
After ten warmup remounts and twenty measured remounts, font-atlas-sized canvases remain 8 and BitmapText instances remain 38.
Before the listener fix, 2D contexts rose from 35 to 75; the unchanged gate also failed with trace disabled.
Heap paths connect retired MiniMap canvases to Pixi's global texture pool through a renderer callback; the listener fix removes that callback.
Logs: `/tmp/tenka-label-font-cache-renderer-final.log`, `/tmp/tenka-label-font-remount-traceoff-20261010.log`, `/tmp/tenka-minimap-exact-root-audit.log`.

The pinned render-target patch removes only each system's source callbacks before target teardown; fourteen installed-Pixi ownership and patch tests pass.
The latest native gate passes twenty measured remounts after ten warmups: font-atlas-sized canvases remain 8, 2D contexts 15 and BitmapText instances 38.
However, twenty-one post-GC heap samples rise from 69547080 to 70876788 bytes; the counter gate does not prove whole-heap stability.
Artifacts: `/private/tmp/tenka-army-plate-gpu-results-20261010/visual-M6-V11-visual-quali-4d444-counts-without-context-loss-chromium/`; test log: `/tmp/tenka-render-target-lifecycle-green-final.log`.

The isolated 1080p, twenty-army, thirty-second debug workload passes on headless Chromium with the Apple M3 Max Metal renderer.
Its 3099 frame samples report frame-time p95 of 16.8 ms and FPS p95 of 136.99; owned-resource counters remain unchanged.
All 3100 CPU-update samples remain available; CPU-update p95 is 0.6 ms.
This fixture does not prove national simulation performance, whole-heap stability, or performance on other hardware.
Artifact: `/private/tmp/tenka-army-plate-gpu-results-20261010/visual-M6-V11-visual-quali-a2ad1-s-30-second-camera-workload-chromium/frame-measurement.json`.

Native comparison against the preceding mask-fix run finds 686 changed overview pixels, zero operational changes and 344 changed close pixels.
The changes affect geographic-label glyphs, not global terrain or HUD placement; these observations do not approve replacement baselines.
Log: `/tmp/tenka-label-font-native-parity-20261010.log`.

The subsequent render-target fix changes zero pixels across all three actual native images compared with the shared-font run.
The six frozen strategy baselines remain unchanged.
Log: `/tmp/tenka-render-target-native-parity-20261010.log`.

The frozen font-fix full run reports 5287 passed, 9 failed and 1 skipped across 531 files in 171.29 seconds.
Eight failures match earlier core, golden and replay failures; the ninth identifies a missing TextStyle export in a UI test mock.
All 1185 source, test, tool, browser, configuration and installed-patch hashes match after that run.
The mock-only correction passes 23 focused tests; the original failing evidence remains available.
Log: `/tmp/tenka-label-font-full-coverage-20261010.log`.

The preceding frozen run includes the mock correction and render-target listener cleanup.
It reports 5292 passed, 8 failed and 1 skipped across 532 files in 172.69 seconds.
All UI/App tests pass; the eight earlier core, golden and replay failures remain.
All 1188 source, test, tool, browser, configuration and installed-patch hashes match after the run.
Log: `/tmp/tenka-render-target-full-coverage-20261010.log`.

The existing headless component gallery passes all five tests without fixture or axe changes.
Four axe states report zero violations; incomplete checks still require review.
ResourceBar supplies its own command surface, and the neutral labeled Badge retains its swatch with readable text.
Log: `/tmp/tenka-headless-remount-gallery-20261010.log`.

The pinned Pixi patch detaches a completed mask source before returning its effect to the shared pool.
Real installed ESM/CJS tests cover source disposal, pooled reuse and a separate active owner; all ten focused tests pass.
The patch retains exact-version, hash, prevalidation and idempotence checks; it does not clear global pools or retain disposed masks.
Before the shared-font fix, native remounts failed with font atlas canvases rising from 46 to 186 and 2D contexts from 57 to 217.
Logs: `/tmp/tenka-alpha-mask-lifecycle-green-final.log`, `/tmp/tenka-gallery-contrast-green-final.log`.

The preceding mask-fix frozen full run reports 5286 passed, 8 failed and 1 skipped across 530 files in 180.29 seconds.
The same eight earlier core, golden and replay failures remain; all UI/App tests pass.
Core coverage remains 94.80% lines, 91.18% branches and 98.47% functions.
All 1169 source/test/tool/browser/config hashes match before and after verification; the six frozen strategy PNGs remain unchanged.
Log: `/tmp/tenka-headless-remount-full-coverage-20261010.log`.

The army-plate candidate passes types, full lint, formatting, build, asset and bundle checks; the existing chunk warning remains.
Initial gzip is 556711 bytes, scenario gzip is 100846 bytes, and the font is 355600 bytes.
Core/data sources remain unchanged; neither the whole game nor the 2.5D redesign has complete acceptance evidence.
Logs: `/tmp/tenka-army-plate-{types,lint,format,build,assets,bundle}-20261010.log`.

The earlier frozen bridge/audit run reports 5279 passed, 8 failed and 1 skipped across 528 files in 180.33 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
Core coverage is 94.80% lines, 91.18% branches and 98.47% functions.
All 1117 source/test/tool hashes match before and after the run; six frozen strategy PNGs remain unchanged.
Neither the whole game nor the 2.5D redesign has complete acceptance evidence.
Log: `/tmp/tenka-bridge-audit-complete-coverage-root.log`.

Mid bridges now retain near world size; bridge centers, directions, construction and conservative coast guards remain unchanged.
Roads and sea routes retain their existing LOD multipliers; far bridges remain hidden.
Focused checks pass 83 road tests and three independent real-Pixi river-contact tests.
Actual helper compositions match the approved candidate, but neither proves native pixels or that every projected bridge part stays on land.
Logs: `/tmp/tenka-bridge-display-scale-focused.log`, `/private/tmp/tenka-bridge-contact-green-final.log`, `/tmp/tenka-bridge-mid1-actual-source-parity.log`.

The balance audit now separates source-backed derived calibration from missing literals without decoding approximation as exact equality.
All 53 focused audit tests pass; the real CLI still fails with five missing constants and one unverified calibration.
Counts remain 614 declared rows and 590 implemented comparisons; all 24 raw missing rows remain visible.
Current opening population/kokudaka is 0.3353, matching plan 14's 0.33 scaling rather than plan 15's approximate equality assumption.
Opening castle capacity is 231805, or 128.82 per ten-thousand koku; capacity is not sustained field strength or calibrated acceptance.
Logs: `/tmp/tenka-bridge-gameplay-balance-audit-after-root.log`, `/tmp/tenka-bridge-audit-capacity-observation-final-root.log`.

The bridge/audit types, full lint, formatting, build, asset, data, glyph and bundle checks passed; the existing chunk warning remained.
Initial gzip is 554982 bytes, scenario gzip is 100843 bytes, and the font is 355600 bytes.
Original cold notification tests pass serially: 2 passed and 62 filtered skips, in 4.93 seconds.
No population, BAL, core baseline or frozen visual baseline changed; rule choices and native acceptance remain pending.
Logs: `/tmp/tenka-bridge-audit-{types,eslint,format,build,assets,bundle,cold-two}-root.log`.

The earlier frozen road/context run reports 5257 passed, 8 failed and 1 skipped across 527 files in 177.13 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
Core coverage is 94.80% lines, 91.18% branches and 98.47% functions.
All 1078 source/test hashes match before and after the run; six frozen strategy PNGs remain unchanged.
Neither the whole game nor the 2.5D redesign has complete acceptance evidence.
Log: `/tmp/tenka-road-context-complete-coverage-root.log`.

Road material uses thinner earth strokes and a quieter sea halo; road geometry, bridge paint and coast protection remain unchanged.
Wide context panels use facts-first columns with side actions; narrow panels retain a scrolling stack and all controls.
Focused checks pass 77 road tests, four context tests and three independent material tests.
Actual helper compositions match the approved road candidate outside captions; neither proves native legibility or GPU pixels.
Logs: `/tmp/tenka-quiet-roads-focused.log`, `/tmp/tenka-context-columns-green-final.log`, `/private/tmp/tenka-road-material-roles-green.log`.

Latest types, full lint, formatting, build, asset and bundle checks pass; the existing chunk warning remains.
Initial gzip is 554964 bytes, scenario gzip is 100845 bytes, and the font is 355600 bytes.
Original cold notification tests pass serially: 2 passed and 62 filtered skips, in 4.45 seconds.
Terrain-routing candidates remain rejected diagnostics; river shape, bridge scale and native visual acceptance still need work.
Logs: `/tmp/tenka-road-context-{types,eslint,format,build,assets,bundle,cold-two-serial}-root.log`.

The earlier frozen lake-material run reports 5249 passed, 8 failed and 1 skipped across 526 files in 175.58 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
Core coverage is 94.80% lines, 91.18% branches and 98.47% functions.
All 1076 source/test hashes match before and after the run; six frozen strategy PNGs remain unchanged.
Neither the whole game nor the 2.5D redesign has complete acceptance evidence.
Log: `/tmp/tenka-lake-material-complete-coverage-root.log`.

Lake fill now uses a shared local sky-reflection gradient and thinner shore strokes; river geometry and material remain unchanged.
Real Pixi allocation tests confirm one owned 32x1 texture, no empty-lake allocation and one texture/source teardown.
Independent CPU tests confirm normalized diagonal UVs, clamp-to-edge and inward lake meshes for both windings.
Actual helper compositions match approved diagnostics outside captions, but neither proves native filtering or GPU pixels.
Focused integration passes 112 tests; three independent UV/mesh tests also pass.
Logs: `/tmp/tenka-lake-material-green-final.log`, `/private/tmp/tenka-lake-uv-green-final.log`, `/tmp/tenka-lake-final-parity-root.log`.

Latest types, full lint, formatting, build, asset and bundle checks pass; the existing chunk warning remains.
Initial gzip is 554627 bytes, scenario gzip is 100845 bytes, and the font is 355600 bytes.
Original cold notification tests pass separately: 2 passed and 62 filtered skips, in 4.45 seconds.
Rejected river candidates remain TMP diagnostics; angular shorelines and river segments still need visual work.
Logs: `/tmp/tenka-lake-material-{types,eslint,format,build,assets,bundle,cold-two}-root.log`.

The earlier frozen display-coast run reports 5242 passed, 8 failed and 1 skipped across 524 files in 179.89 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
Core coverage is 94.80% lines, 91.18% branches and 98.47% functions.
All 1074 source/test hashes match before and after the run; six frozen strategy PNGs remain unchanged.
Neither the whole game nor the 2.5D redesign has complete acceptance evidence.
Log: `/tmp/tenka-display-coast-complete-coverage-root.log`.

The display coast now uses 2230 protected float vertices; the canonical outline remains unchanged at 470 vertices.
Ground materials share the display coast; raised mountain and forest artwork remain outside the new ground mask.
Independent audits find no new node, river or road classification changes; sampled paint and bridge footprints also match.
Only 51 territory cells change, all within 3.168 world of the coast; no existing land winner changes.
Helper compositions remain non-native and omit HUD and territory rendering; protected harbors still have angular corners.
Logs: `/private/tmp/tenka-display-coast-{independent-runtime,territory-runtime}-audit.log`.

Consumer integration passes 142 focused tests; final hierarchy strengthening passes 111, and eight helper tests pass.
Actual Pixi factories retain shared textures and destroy reparented ground masks once for both mountain and forest variants.
Types, full lint, formatting, build, asset and bundle checks pass; the existing chunk warning remains.
Initial gzip is 554354 bytes, scenario gzip is 100843 bytes, and the font is 355600 bytes.
Original cold notification tests pass separately: 2 passed and 62 filtered skips, in 4.60 seconds.
Logs: `/tmp/tenka-display-coast-{types,eslint,format,build,assets,bundle,cold-two}-root.log`.

The earlier frozen HUD run reports 5230 passed, 8 failed and 1 skipped across 523 files in 176.96 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures remain.
Core coverage is 94.80% lines, 91.17% branches and 98.47% functions; 1072 source/test hashes match before and after the run.
Resources now scroll separately; speed, system and status ports remain in the fixed command cluster.
DOM propagation and CSS size budgets pass, but native geometry and rendering remain unverified.
Log: `/tmp/tenka-fixed-hud-complete-coverage-root.log`.

Latest types, full lint, formatting, build, asset and bundle checks pass; the existing chunk warning remains.
Initial gzip is 552074 bytes, scenario gzip is 100846 bytes, and the font is 355600 bytes.
Original cold notification tests pass separately: 2 passed and 62 filtered skips, in 4.61 seconds.
Shore-mask and river-material proposals remain rejected TMP diagnostics; no whole-map visual acceptance follows from this HUD change.
Logs: `/tmp/tenka-fixed-hud-{types,eslint,format,build,assets,bundle,cold-two}-root.log`.

The earlier frozen display-curve run reports 5227 passed, 8 failed and 1 skipped across 522 files in 171.71 seconds.
All UI/App tests pass; the same eight earlier core, golden and replay failures still block acceptance.
Core coverage is 94.80% lines, 91.18% branches and 98.47% functions.
The 1071 source/test files and six frozen strategy PNGs remain unchanged across verification.
Log: `/tmp/tenka-curve-runtime-complete-coverage-root.log`.

Four of five authored waypoint roads now use bounded local display curves; 472 land roads still lack waypoints.
All eight display consumers use the shared immutable geometry; the AST checker reports zero remaining raw consumers.
Actual helper exports match the approved proposal outside captions; 703 geography samples pass the same-mass exemption rule.
These non-native compositions omit the HUD and cannot certify browser rendering or the whole 2.5D redesign.
Logs: `/tmp/tenka-visual-road-consumer-zero-root.log`, `/private/tmp/tenka-road-smoothing-final-runtime-{parity,geography}.log`.

The latest types, full lint, formatting, build, asset and bundle checks pass; the existing chunk warning remains.
Initial gzip is 551929 bytes, scenario gzip is 100846 bytes, and the font is 355600 bytes.
Original cold notification tests pass separately: 2 passed and 62 filtered skips, in 4.33 seconds.
Logs: `/tmp/tenka-curve-runtime-{types,eslint,format,build,assets,bundle,cold-two}-root.log`.
The table below preserves earlier evidence and unresolved acceptance boundaries.

| Gate                        | Current evidence or limitation                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| National five-year golden   | Seed 15600519 fails at day450: dead Saito retains four castles and sixteen districts. No authentic national snapshot exists. Log: `/tmp/tenka-dismiss-ai-complete-coverage.log`.                                                                                                                                                                                                                                                                  |
| Ten-year nightly golden     | The enabled current test reproduces day450 INV-02/INV-22. No nightly snapshot exists. Log: `/tmp/tenka-monthly-reward-nightly.log`.                                                                                                                                                                                                                                                                                                               |
| National performance        | Current serial means: 9.873 ms failure, 7.151 ms permitted-retry pass; all 720 samples remain. Earlier p95 preparation fails at day450; zero samples. Current p95 remains unverified. Log: `/tmp/tenka-rice-successor-serial-mean.log`.                                                                                                                                                                                                           |
| Coverage                    | The frozen route/context run reports 94.80% core lines, 91.17% branches and 98.47% functions. Thresholds pass; eight failing tests still block acceptance. Log: `/tmp/tenka-route-context-complete-coverage-refrozen-root.log`.                                                                                                                                                                                                                   |
| Complete unit run           | The refrozen route/context run reports 5220 passed, 8 failed and 1 skipped across 521 files. The earlier run reports 5219 passed and 9 failed, including a new context-scroll regression. Its original test now passes; all eight earlier core failures remain. No baseline updates. Logs: `/tmp/tenka-route-context-complete-coverage-{final,refrozen}-root.log`.                                                                                |
| Main hotkey fixture         | The first run reports 4881 passed, 9 failed, 1 skipped, including one additional F2 failure. Its fixture set only the UI screen mirror. Both screens now match production; original assertions and three negative controls pass. Log: `/tmp/tenka-castle-transport-coverage.log`.                                                                                                                                                                 |
| Continue-preview regression | The first run reports 4850 passed, 10 failed, 1 skipped, including two new F9 read-count failures. The fix preserves existing assertions; both pass in the final run. Log: `/tmp/tenka-vassal-continue-coverage.log`.                                                                                                                                                                                                                             |
| Parallel-run timeouts       | The first run reports 4831 passed, 15 failed, 1 skipped, including seven App timeouts. The isolated run preserves assertions and timeouts; those seven pass. Log: `/tmp/tenka-tactic-reisei-coverage.log`.                                                                                                                                                                                                                                        |
| Current UI regression       | Every UI/App test passes in the refrozen V8 run. Army position, heading and previews follow authored roads. Context actions use normal flow; original outer scrolling remains. Original cold notification tests pass separately (2 passed, 62 filtered skips). Native focus, geometry and rendering remain unproven. Logs: `/tmp/tenka-route-context-complete-coverage-refrozen-root.log`, `/tmp/tenka-route-context-cold-two-refrozen-root.log`. |
| Runtime 2.5D map            | Original castles, infantry, bridges, fields, forests and water remain integrated. Four mountain systems use approved V5 crests; H3/V4 defaults remain. H4 candidates exceed the unchanged 2048px cap and were rejected. Movement and previews now follow authored road polylines. Of 477 land roads, 472 still have no waypoints; natural road shapes and shores remain unfinished. Helper compositions are not browser screenshots.              |
| Data and visual assets      | Eighteen generated PNG/provenance pairs pass all 25 checks. Textures total 38112.8 KiB; first-screen assets remain 944.5 KiB, with zero errors and warnings. Raw generated RGBA totals 113231576 bytes; material masks remain 5373952 CPU bytes. No GPU/heap acceptance. Logs: `/tmp/tenka-ridge-v5-manifest-final-root.log`, `/tmp/tenka-ridge-v5-assets-final-root.log`.                                                                        |
| Earned captive handoff      | Unchanged mini earns a siege-fall capture at day152 through normal bridge ticks with all natural AI. Actual CaptiveModal release and pending-save continuation agree in state, RNG and events. Old reset cannot remove synchronously published replacement arrivals. This is not full Main pointer or native-browser acceptance. Log: `/tmp/tenka-earned-captive-root-focus-clean-final.log`.                                                     |
| Earned plot resolution      | Unchanged mini earns one natural failed rumor after three paid months, releasing its executor and publishing the report. Actual PlotPanel, normal bridge, natural AI and native pending continuation pass. This is not a full Main pointer journey. Log: `/private/tmp/tenka-earned-plot-green-frozen.log`.                                                                                                                                       |
| Castle transport fixture    | The first UI/App run reports 1882 passed and one failure. The old success fixture used a delegated source and the title screen. Original assertions and two authority counterexamples pass after fixture correction. Log: `/tmp/tenka-castle-admin-authority-verified.log`.                                                                                                                                                                       |
| Castle management entry     | Unchanged-mini DOM delegation, restoration and pending-save continuation pass normal bridge ticks. Gold-only and mixed transport also pass. This evidence does not prove long-term delegated AI or native geometry. Log: `/tmp/tenka-castle-admin-focused-verified.log`.                                                                                                                                                                          |
| Castle formation entry      | Actual Castle selection reaches MarchModal, a legal queued march and normal-day settlement. Stale callbacks and delegated controls pass. This jsdom journey does not prove native pointers or geometry. Log: `/private/tmp/tenka-main-castle-march-frozen.log`.                                                                                                                                                                                   |
| Transport interception      | The new unchanged-mini replay earns conquest before testing actual node occupancy, native continuation and earlier-arrival looting. National and browser acceptance remain unproven. Log: `/tmp/tenka-mini-transport-replay-green-frozen.log`.                                                                                                                                                                                                    |
| Earlier replay boundary     | Unchanged-mini cases pass recorded-command replay and native continuation. Corps, diplomacy and the earlier player-only reward trace do not execute generated AI through the production driver. Log: `/private/tmp/tenka-reward-month-green.log`.                                                                                                                                                                                                 |
| AI reward replay            | The separate reward trace executes eight natural AI commands plus three gifts. Actual production bridge export matches its full log and final hash. Native browser coverage remains absent. Log: `/tmp/tenka-dismiss-ai-focused-final.log`.                                                                                                                                                                                                       |
| Rakuichi income replay      | Unchanged mini earns district ownership while its castle remains enemy-owned. Actual driver export and monthly income match the complete trace. Five independent checks pass; native rendering remains unproven. Log: `/tmp/tenka-castle-rakuichi-driver-root.log`.                                                                                                                                                                               |
| Dismissal lifecycle         | Two authentic failures reproduced unwanted replacement-game pause and revived native consent. Both fixes pass unchanged-mini regressions and the final UI/App run. Log: `/tmp/tenka-castle-dismiss-lifecycle-frozen.log`.                                                                                                                                                                                                                         |
| Successor payroll replay    | A new unchanged-mini trace earns succession, actual unpaid salaries and wallet recovery. Manual Beta inputs remain explicit; native pending proof uses genuine player and natural AI orders only. This is not an Alpha UI journey. Log: `/tmp/tenka-raster-journeys-root.log`.                                                                                                                                                                    |
| Monthly delegation replay   | Actual monthly castle-authority orders settle before legal direct restoration. Complete production-driver export matches the new replay; native continuation and earlier restoration pass. Native browser acceptance remains absent. Log: `/tmp/tenka-raster-journeys-root.log`.                                                                                                                                                                  |
| Payroll recovery replay     | A separate unchanged-mini trace earns unpaid salaries, refunds the real corps wallet, and resumes payment next month. Production bridge recording matches. Log: `/tmp/tenka-25d-payroll-corps-current.log`.                                                                                                                                                                                                                                       |
| Successor corps eligibility | The new unchanged-mini trace earns Beta succession and applies an explicit trusted Beta order. Four replay tests pass, including native continuation and legal tampering. This is not a player UI journey or natural AI commander choice. Log: `/tmp/tenka-successor-corps-legal-tamper-green.log`.                                                                                                                                               |
| Scenario calibration        | Current s1560 statistics show 121 castles, 344 districts, and 619 named officers. All nine regional quotas meet tolerance; Oda/Imagawa calibration passes. Log: `/tmp/tenka-completion-audit-stats.log`.                                                                                                                                                                                                                                          |
| Balance constants           | Current audit compares 590 implemented literals against 614 declared rows. Five missing constants and one unverified calibration remain; passed and valueProof are false. All 24 raw missing rows remain. Log: `/tmp/tenka-bridge-gameplay-balance-audit-after-root.log`.                                                                                                                                                                         |
| Historical events           | The acceptance checker passes 23 synthetic cases. Actual seed1 fails at day1590; the short probe is incomplete. Neither proves twenty-seed acceptance. Outputs: `/private/tmp/tenka-historical-acceptance-{one,short}-seed.json`.                                                                                                                                                                                                                 |
| Balance diagnostics         | Before combat-merit changes, all sixty seeds stopped on ownership violations; none completed or repeated. Current-core long runs remain unverified. Accounting: `/tmp/tenka-auto-return-completion-accounting.json`.                                                                                                                                                                                                                              |
| Headless execution          | Direct headless GPU smoke/visual tests report 12 passed and 1 frozen-baseline failure. Native remount and debug frame-rate gates pass. Complete native acceptance remains unverified. Log: `/tmp/tenka-army-plate-gpu-smoke-visual-20261010.log`.                                                                                                                                                                                                 |
| Frozen visual baselines     | Necessary UI changes conflict with existing frozen strategy images. Preserve image hashes and tolerances pending the authorized resolution.                                                                                                                                                                                                                                                                                                       |
| Heap lifetime               | Twenty measured native remounts retain stable font, canvas, BitmapText and owned-resource counters without context loss. Post-GC heap samples still rise by 1329708 bytes; whole-heap stability remains unproven.                                                                                                                                                                                                                                 |
| Rule decisions              | No-heir territory, noncombat field-encounter closure, voluntary tactical retreat, and Awe presentation need decisions. Existing specs do not authorize invented outcomes or rewards.                                                                                                                                                                                                                                                              |
| Deployment integration      | Local workflow tests pass; deployment now requires successful same-repository main-push CI and builds its exact tested SHA. External CI/deployment remains unverified.                                                                                                                                                                                                                                                                            |
| External verification       | Remote CI, a successful scheduled nightly run, deployment, and a complete production Pages journey remain unverified here.                                                                                                                                                                                                                                                                                                                        |

## Automated candidate gates

- [ ] Pass `npm ci` on the candidate.
- [ ] Pass `npm run lint`.
- [ ] Pass `npm run typecheck`, including the core purity check.
- [ ] Pass `npx tsx tools/ci/balance-spec-audit.ts`; resolve master-table gaps, forbidden entries, and unsupported values without name-only proof.
- [ ] Pass `npm run validate:data` for all nine production regions, without regional exclusions.
- [ ] Attach `npx tsx tools/stats.ts s1560` output and the source-qualified data review for every regional batch.
- [ ] Pass `npm run validate:assets`, including source, license, hash, runtime-path, and budget checks.
- [ ] Pass `npm run build` and `npm run validate:bundle` on the release candidate and Pages-base build.
- [ ] Pass `npm test`, including the ordinary national golden and no-heir regressions.
- [ ] Pass determinism DT1–DT4, battle RNG isolation, all existing golden cases, and replay tamper controls.
- [ ] Pass `npx vitest run tests/core/ai-legality.spec.ts --testNamePattern A2` on the complete production world.
- [ ] Produce an authentic national five-year snapshot after resolving the invariant failure.
- [ ] Pass `npx vitest run tests/golden/s1560.spec.ts` without automatic baseline updates.
- [ ] Pass `npm run test:coverage` with core line coverage ≥80% and branch coverage ≥70%.
- [ ] Confirm the release milestone makes national golden, national AI legality, performance, and coverage blocking CI gates.
- [ ] Verify the CI-gated deployment externally builds the exact successful main-push commit and rejects fork or pull-request runs.

## Headless browser and visual gates

All automated browser runs must remain headless. Run GPU timing alone on its host.
Headless results do not replace the separate manual checks below.

- [ ] Pass `npm run e2e`, including canonical P1–P5 and the additional production gameplay regressions.
- [ ] Resolve the legacy P5 retreat requirement against the authorized tactical retreat contract before claiming full smoke acceptance.
- [ ] Pass the production nine-region wizard, native command, save/reload, queued-choice, and full state/RNG equality cases.
- [ ] Pass `npm run e2e:visual` with the authorized frozen baselines and unchanged tolerances.
- [ ] Verify overview, operational, and close layers contain actual drawable content, not only containers.
- [ ] Verify static-map rebuild limits, ownership dirty propagation, and moving-army updates.
- [ ] Verify ≥32 CSS-pixel targets, keyboard operation, dialog focus ownership, and no critical accessibility violations.
- [ ] Verify 1280×720 layouts across supported UI scales, reduced motion, viewport pause, and result acknowledgement.
- [ ] Verify 1920×1080 with twenty moving armies for thirty seconds: FPS p95 ≥55 and frame-time p95 ≤1000/55 ms.
- [ ] Verify destroy/remount restores stable texture, listener, canvas, and heap counts without WebGL context loss.
- [ ] Attach before/after images and reviewer approval for any separately authorized baseline change.

## Serial simulation and performance

- [ ] Run `npm run test:perf` without competing CPU or browser workloads.
- [ ] Preserve all 360 measured samples per attempt after sixty warmup ticks.
- [ ] Require mean tick time <8 ms locally or <16 ms in CI; allow only the specified single retry.
- [ ] Verify the separate 01 §3.9.1 targets: forty moving armies at ≥60 FPS and midgame tick p95 <8 ms.
- [ ] Measure cold-cache Pages interactivity below 3000 ms with Fast 4G throttling.
- [ ] Verify gzip budgets: initial JavaScript ≤800 KB and scenario data ≤1200 KB; subset font ≤2048 KB.
- [ ] Run the reference benchmark separately and retain mean/p99 output, even when the gate fails.
- [ ] Run `npm run simulate -- --seeds=20 --years=25 --difficulty=normal --verify-repeat=true --output=balance-normal.json --out=balance-normal.csv --monthly-output=balance-normal-monthly.csv`.
- [ ] Repeat the twenty-seed, twenty-five-year simulation for `easy` and `hard`; retain JSON and monthly CSV outputs.
- [ ] Verify real canonical events, valid autonomous commands, daily invariants, and repeatable seed trajectories throughout the runs.
- [ ] Verify historical-event count median ≥8 across twenty seeds over 1560–1585, as required by 10-T6.
- [ ] Reconcile and then verify both balance specifications; do not silently replace one target with the other.

Balance boundaries: 15 §5.6 requires first-two-million-koku median at 12–20 elapsed years,
Oda twenty-year survival >40%, and median surviving clans ≥3.
18 M9-2 separately requires unification median at 15–25 years, Oda twenty-five-year survival ≥60%,
and Imagawa/Takeda/Mori/Hojo/Shimazu ten-year survival ≥70%.

Record any required authoritative interpretation before changing constants or acceptance assertions.
Reports expose `balanceAcceptance` for 15 §5.6 and `acceptance` for 18 §5.4.
Require both results to pass. Retain the independent `repeatRuns` observations; a missing repeat remains incomplete.
Repeat CSV equality covers the wide koku table, not every field in the monthly table or every event.

For diagnostics, add `--continue-on-error=true` with an explicit `--output` path.
Retain `requestedSeeds` and `failedRuns`; any failed primary or repeat prevents acceptance and keeps exit code 1.
Only completed runs supply monthly CSV rows. A failure report is not a passing balance distribution.

## Manual map acceptance: 17 §3.9.2

These seven steps remain manual requirements. They are not authorization to open visible browser windows during automated work.
Obtain explicit coordination for the manual session; record its candidate and hardware.

1. [ ] Run `npm run build && npm run preview`; open Chrome at 1920×1080.
2. [ ] Open Developer Tools → Performance Monitor and display FPS.
3. [ ] Load s1560; pan the national overview for ten seconds with FPS continuously ≥55.
4. [ ] Zoom to the closest view; pan for ten seconds with FPS ≥55 and readable castle names and district boundaries.
5. [ ] Use `spawnArmies(20)`; run ×5 for one game month with FPS ≥55 and stable heap usage.
6. [ ] Perform ten repeated zoom-in/zoom-out cycles without flicker or WebGL context loss.
7. [ ] Open an issue and block release if any step fails.

- [ ] Inspect grayscale/color-vision simulations for distinguishable ownership, warnings, hostile states, and all three road grades.
- [ ] Perform the specified Firefox/Safari compatibility spot checks; Chromium automation alone does not cover them.
- [ ] Complete the full production gameplay journey, including combat, diplomacy, succession, events, save/load, and an actual ending.
- [ ] Complete a manual full-game spot check on the production Pages URL after deployment.

## Nightly and release authorization

- [ ] Produce an authentic ten-year baseline only after complete repeat and native-codec continuation runs succeed.
- [ ] Pass `NIGHTLY_GOLDEN=1 npx vitest run tests/golden/s1560-nightly.spec.ts` against that baseline.
- [ ] Verify one successful scheduled [nightly workflow](.github/workflows/nightly.yml), with serial benchmark and extended golden artifacts.
- [ ] Confirm nightly remains observational and never updates baselines automatically.
- [ ] Complete the README attribution, controls, limitations, and progress requirements without hiding known blockers.
- [ ] Attach this completed checklist and balance outputs to the release review.
- [ ] Complete the roadmap checkpoint and set `milestone.json.current` to `DONE` only after its requirements pass.
- [ ] Obtain explicit authorization before tagging `v1.0.0`, pushing, dispatching workflows, or deploying.
- [ ] Verify the deployed URL and commit match the approved candidate.
