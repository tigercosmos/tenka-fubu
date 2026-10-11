# Geographic WASM indirect fixture integration

The first full run of `fb9fd7f885f3569bc819a3957a67f734f9f7b123` found indirect component fixtures that lacked renderer WASM ownership.
This package preserves that failure separately from the earlier 19-file focused pass.
The repair source is `9e49cc913aab1effbb6e7292cc2943f2640c28a2`. Its 20-file focused run passed 175 tests in 54.34 seconds.
Types, full lint, build, and bundle checks passed. The fixed-source full suite is terminal with one known core failure.
The remaining test failure is the pre-existing national no-heir fixture.

## Original full-suite result

| Field                    | Recorded value                          |
| ------------------------ | --------------------------------------- |
| Test files               | 683: 671 passed, 11 failed, one skipped |
| Tests                    | 6,287 passed, 34 failed, one skipped    |
| Unhandled errors         | 17                                      |
| Duration                 | 116.06 seconds                          |
| New integration failures | 33, across ten files                    |
| Separate known failure   | `tests/golden/s1560.spec.ts`            |

The raw log contains `Failed to parse URL from /wasm/tenka_engine.wasm` from production loader acquisition in Node fixtures.
The original constructor checker migrated direct owners, but did not cover App and MainScreen mounting the real MapCanvasHost indirectly.
The two original source manifests match exactly. Their scope excludes public artifacts and dependencies; the local WASM package records artifact identity separately.

## Repaired fixed-source full suite

The `9e49cc9` full run records 6,320 passed tests, one known no-heir failure, and one skipped test.
Its 683 files contain 681 passes, one failure, and one skip; duration is 126.96 seconds.
There is no unhandled-error summary. The 33 new integration failures are resolved in this run.
Before/after manifests contain 1,477 tracked inputs and match byte-for-byte.
Full types, lint, build, and bundle checks all exited zero. The build completed in 5.38 seconds.
The after-checks manifest also matches the original 1,477-input manifest byte-for-byte.

## Read-only inventory

The frozen-source inventory finds 26 specs importing or mocking App, MainScreen, or MapCanvasHost.
Twenty-one TSX files and one explicit lifecycle TS file have Pixi module mocks.
The already-owned MapCanvasHost and lifecycle tests leave twenty component fixtures for the expanded migration.
The inventory combines literal discovery with manual inspection; it is not a complete transitive module graph.

Four relevant specs lack Pixi mocks and replace the renderer path entirely:

- `src/ui/screens/MainScreenFocusViewport.spec.tsx` replaces MapCanvasHost with a ref/prop stub.
- `tests/app/AppEndingCampaign.spec.tsx` replaces MainScreen with a strategy marker.
- `tests/app/earnedMiniEndingJourney.spec.tsx` replaces MainScreen with a strategy marker.
- `tests/app/earnedRegionalEndingJourney.spec.tsx` replaces MainScreen with a strategy marker.

These four replacements do not call the actual host or screen.
`mainCastleMarch.spec.tsx` does call `<actual.MapCanvasHost>` inside its mock; that partial mock requires an actual scorer owner.
The shared helper scan found only the Pixi class factory, with no hidden real-screen or real-host rendering wrapper.

## Expanded checker

The retained v2 checker reports twenty violations before migration and zero afterward.
It retains the original direct-constructor rule and adds TSX Pixi mocks without an explicit scorer module mock.
The current checker collects real string-literal `vi.mock` calls through the TypeScript AST, excluding comments.
The checker logs establish the migration count; the separate full-suite log establishes the repaired execution result.

The archived two-file probe mixes executable and commented mock calls; its retained stdout reports exactly one violation.
The repair patch adds 220 lines across twenty files, with no deletions or changes to original assertions.

Future coverage should handle aliased mock APIs and also inspect real App/MainScreen/MapCanvasHost imports and distinguish full stubs from wrappers calling `importActual` or `importOriginal`.
Renderer lifecycle tests need an explicit owner seam, not a blanket exemption.
An imported helper name alone does not prove that a fixture allocates an independent scorer instance.

`manifest.json` records each raw path and both raw/gzip SHA-256 values.
Run `python3 check.py` to verify the archived bytes and original source-manifest equality without executing tests.
