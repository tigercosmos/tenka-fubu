# Three intentional golden migrations

The archived source `/tmp/tenka-harvest-audit.G2gIVc` reproduces all three protected golden summaries exactly, including every checkpoint and BAL hash `7634217400759e66`. Its file manifest and archive are preserved here. The ordinary current source at `655f3ba` reproduces the reviewed new summaries in `current/`; these are identical to the earlier `68e96a6` ordinary controls. `frozen/` preserves all original snapshots.

The full trajectory changes follow four bounded groups of intentional mechanics implemented in `9188831`:

| Mechanic                                   | Source and specification                               | Observed trigger                                                                                                                                                                                                                                                                             |
| ------------------------------------------ | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Siege integer durability and victory merit | `systems/siege.ts`; 02 §3.4/§4.5, 07 D47, 06 §3.5/§5.7 | Mini day 10 durability `497.669 → 498`; AI day 16 `492.16028 → 492`. Eligible victorious commanders receive the specified merit and leadership/valor experience.                                                                                                                             |
| Monthly security                           | `systems/uprising.ts`; 05 §3.8.1/§8.8, 02 §3.4         | Positive contributions are damped separately from negative penalties, then the final security value is rounded. Diplomacy day 360 security `81 → 82` changes subsequent population, recruitment and food use. The hostile stationary-army predicate also follows §3.8.1.                     |
| Successful diplomacy merit                 | `systems/diplomacy.ts`; 06 §3.5/§5.7                   | Each genuine paid-work crossing to maximum credit awards 25 merit and politics experience. Diplomacy's final executor gains 75 of each across three completions.                                                                                                                             |
| Muster acceptance alternatives             | `systems/ai/attackPlan.ts`; 09 §5.4                    | AI tick 28 (game day 117): beta has 1,552 ready troops against 1,567 planned, exceeding the 80% alternative. The old OR rejection aborted `musterWeak`; the correct AND rejection advances despite insufficient estimated power. This changes later autonomous commands and battle outcomes. |

Format 4 and fresh-game reward bookkeeping also change the persistent schema (16 D18, 06 D17). In the causal comparison only `meta.saveVersion: 4 → 3` and removal of specifically asserted zero reward counters are normalized: alpha/beta for mini and AI, and alpha/beta/gamma for diplomacy. Every tick asserts these exact clans, values zero and version 4. No nonzero spending, random state, command history or other metadata is removed.

The isolated counterfactual starts from the current source and reverses only the four groups above. It leaves all other current code and BAL values active. Across all 720 mini, 360 AI and 1,800 diplomacy days, the normalized counterfactual full states, events, queued commands and applied commands exactly equal the historical core. There are zero residual differences. This diagnoses the complete trajectory change; it does not modify production behavior or weaken golden assertions.

`golden-causal-proof.json.gz` contains both ordinary and counterfactual daily field/event/command comparisons and exact summaries. `golden-reversepatch.json.gz` preserves each of the four changed files before/after, with SHA256. Source archives and manifests permit reproduction without external retained directories. The independent historical oracle is the protected snapshot in `frozen/`, rather than any older snapshot bundled in the retained archive. The preserved initial reproduction failure records that mistaken reference selection; the final run uses the correct frozen oracle.

`tests/golden/provenanceCausalControl.spec.ts` runs this proof against the live core in isolated temporary copies. It reproduces every old protected summary, verifies the historical source manifest, checks the ordinary live-core summaries, then requires exact daily parity after only the stated reversals and zero-counter normalization. The ordinary golden tests, replay final hashes, AI command validation, state invariants and RNG tests remain strict. Focused acceptance and effect regressions (`aiAttackPlan`, `siegeTraitEffects`, `siegeMerit`, `diplomacyMerit`) passed 39 tests.

Reproduce the archived source control with Node 22 after `npm ci`:

```sh
repo_dir="$PWD"
proof_dir="$repo_dir/docs/validation/2026-10-12/golden-provenance/goldens"
run_dir="$(mktemp -d /tmp/tenka-golden-provenance.XXXXXX)"
mkdir "$run_dir/old" "$run_dir/current"
tar -xzf "$proof_dir/historical-source.tar.gz" -C "$run_dir/old"
tar -xzf "$proof_dir/current-source-655f3ba.tar.gz" -C "$run_dir/current"
cp "$proof_dir/reproduce.mts.txt" "$run_dir/reproduce.mts"
TENKA_HISTORICAL_ROOT="$run_dir/old" TENKA_CURRENT_ROOT="$run_dir/current" \
TENKA_PROOF_ROOT="$proof_dir" TENKA_DEPENDENCIES_ROOT="$repo_dir" \
TENKA_OUTPUT_ROOT="$run_dir/output" ./node_modules/.bin/tsx "$run_dir/reproduce.mts"
```

For the live-core regression, run `npx vitest run tests/golden/provenanceCausalControl.spec.ts`. The proof writes its scratch path and per-scenario day counts; successful output asserts exact daily full-state/event/queue/applied-command parity. Other frozen artifacts, including the battle transcript and B8 hash, are not changed by this migration.
