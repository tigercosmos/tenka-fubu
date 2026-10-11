# B8 schema and participation migration

The exact retained harvest source reproduces all ten original B8 hashes, from `8fd5eca404decc70` through `7243d4d6ee381170`. Army and d27 retained source controls independently produce the same sequence. The harvest archive and SHA256 manifest are preserved in `../goldens/`.

Before the first tick and after each of ten ticks, current full states differ in exactly five fields:

- `meta.saveVersion`: 3 → 4 (16 D18).
- Alpha and beta fresh-game `rewardGoldSpentThisMonth`: absent → 0 (06 D17).
- `fieldCombats[fc.castle-a2-90].sideA.participation` and `.sideB.participation`: the complete original army/clan/leader/deputy rosters (07 D49).

07 D49 preserves original participants independently from surviving `armyIds`, so later departures and losses cannot erase eligible merit recipients. In B8 the original roster is one army per side, with its original taisho and no deputies. The proof builds both complete objects directly from the historical armies. There are no tactical simulation changes in these ten ticks: every other full-state field, every returned battle-tick result and all RNG streams match the historical core exactly.

`full-state-proof.json.gz` preserves the old initial state, every old full tick state/result/hash, the current hashes and exact differences. The existing B8 test now calls `expectB8MigrationState` before ticking and after every authoritative tick, explicitly adds only these five fields, and requires exact full-state/result equality. Its ten literal hash assertions, repeatability check and non-battle RNG assertions remain intact. Only their intentionally migrated expected values change.

Reproduce with Node 22 and installed project dependencies:

```sh
repo_dir="$PWD"
proof_dir="$repo_dir/docs/validation/2026-10-12/golden-provenance/b8"
run_dir="$(mktemp -d /tmp/tenka-b8-provenance.XXXXXX)"
tar -xzf "$proof_dir/../goldens/historical-source.tar.gz" -C "$run_dir"
ln -s "$repo_dir/node_modules" "$run_dir/node_modules"
cp "$proof_dir/reproduce.mts.txt" "$run_dir/reproduce.mts"
TENKA_HISTORICAL_ROOT="$run_dir" TENKA_CURRENT_ROOT="$repo_dir" \
TENKA_PROOF_ROOT="$proof_dir" ./node_modules/.bin/tsx "$run_dir/reproduce.mts"
```

The reproducer verifies every archived source file and the preserved historical full states before checking all current full states and returned results. No production serializer or RNG behavior changes.
