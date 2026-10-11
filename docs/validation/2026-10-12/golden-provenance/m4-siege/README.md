# M4 siege replay provenance

The exact retained source `/tmp/tenka-harvest-audit.G2gIVc` reproduces the protected BAL hash `7634217400759e66` and final state hash `1fa6d835811be620`. The archived source and every file SHA256 are preserved here. `frozen-v3.tfulog.json` preserves the original commands and hashes.

The paired run against `68e96a6` applies the same commands for all 61 days. Every applied command and every event is exactly equal. Full states differ only in these intentional mechanics:

- Format 4 and the two fresh-game monthly reward counters, as in the policy-cycle proof (16 D18, 06 D17).
- Siege durability writes become integers (02 §3.4/§4.5; 07 D47). The first difference is day 10: `castle.b2.durability` changes from `496.69208` to `497`. Through day 60, the regression independently applies each unchanged historical damage amount to the previous integer durability and rounds the final value. This preserves daily rounding rather than rounding the final fractional trajectory once.
- At the day 61 fall, the actual victorious commander receives `round(30 × 1.5) = 45` merit and leadership/valor experience (06 §3.5/§5.7). The retained implementation omitted this award; current `siege.ts` captures eligible attacking officers before assignment cleanup and calls `gainMerit` after settlement.

The final full state differs in exactly six fields: save version, the two reward counters, and the commander's merit/leadership experience/valor experience. Durability is equal after settlement. Current final hash is `34b167e62e89721a`. Only the fixture's BAL and final hashes change; all commands and its final day remain unchanged. Replay final-hash validation remains strict.

`full-state-proof.json.gz` preserves all historical full states, events, applied commands, paired daily hashes and exact field differences. `m4SiegeMigration.spec.ts` checks all 61 current full states against a closed set of these specific changes, independently verifies durability rounding and the specified commander award, and checks the original frozen final hash and archive SHA256.

Reproduce after `npm ci`, with Node 22:

```sh
repo_dir="$PWD"
proof_dir="$repo_dir/docs/validation/2026-10-12/golden-provenance/m4-siege"
run_dir="$(mktemp -d /tmp/tenka-m4-provenance.XXXXXX)"
tar -xzf "$proof_dir/historical-source.tar.gz" -C "$run_dir"
ln -s "$repo_dir/node_modules" "$run_dir/node_modules"
cp "$proof_dir/reproduce.mts.txt" "$run_dir/reproduce.mts"
TENKA_HISTORICAL_ROOT="$run_dir" TENKA_CURRENT_ROOT="$repo_dir" \
TENKA_PROOF_ROOT="$proof_dir" TENKA_OUTPUT_FILE="$run_dir/reproduced.json" \
  ./node_modules/.bin/tsx "$run_dir/reproduce.mts"
```

The reproducer verifies the historical source manifest before execution, the old BAL/final oracle, all daily events and applied commands, all full states under only the specified corrections, and the current final oracle. Other golden fixtures are investigated separately and remain unchanged.
