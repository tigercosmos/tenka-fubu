# Army signal integration checks at `ef75be6`

The adopted army signal overlap fast path passed 207 focused unit tests across eight files. Typecheck, full ESLint, the production build, bundle budget, and touched-file formatting also passed. The runner used commit `ef75be660e0a142da9c6130ac04ffefc9820e7fb`. It checked all 1,650 files in the scoped Git inventory and all 29 pinned Pixi targets before and after validation. Both proofs passed.

The unit cohort covers the signal solver and its frozen original oracle, army plate geometry and placement, castle ribbons, geographic labels, and `MapRenderer` integration. The renderer places signals before castle ribbons, army plates, and geographic labels. The renderer tests cover measured banner bounds, camera scale, fixed obstacles, presentation offsets, and idle-cache behavior. The eight files contain 207 tests at this revision; the earlier static `it` count of 183 omitted parameterized cases.

| Check              | Result                | Scope                                                |
| ------------------ | --------------------- | ---------------------------------------------------- |
| Focused Vitest     | 207 passed in 8 files | Signal, plate, castle, geography, and renderer units |
| Typecheck          | Exit 0                | App and core TypeScript configs                      |
| Full ESLint        | Exit 0                | `eslint .`                                           |
| Production build   | Exit 0                | Includes the existing WASM check                     |
| Bundle budget      | Exit 0                | Initial, scenario, and font limits                   |
| Touched formatting | Exit 0                | Three signal source and test files                   |

The Vitest log contains a jsdom canvas `getContext` warning from Pixi import. All 207 tests still passed. The build log contains the existing Vite large-chunk warning; the bundle budget check passed. This run did not repeat the full core suite or native browser suite. The earlier full 440-case native result at `9550e39` remains a separate historical run and does not validate this commit.

`manifest.json` lists 44 gzip-preserved artifacts with original and compressed sizes and SHA-256 hashes. The archive includes every inner and outer command, result, and log; the scoped Git inventory; both source and dependency proofs; and all three runner sources. Run `python3 verify.py` in this directory to verify the archive and the stated results. The package producer capture remains at `/tmp/tenka-army-signal-integrated-pack-c1` and is separate from the 44 validation inputs.
