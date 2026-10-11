# Tactical transcript migration

The retained army, harvest and d27 source controls reproduce the original transcript exactly: initial hash `75fdbdd5c374400c`, all four checkpoints, final hash `34625decd4738d63`, resolution tick 30 and BAL `7634217400759e66`. The exact historical source archive and manifest are preserved in `../goldens/`. The original transcript remains intact here as `frozen-v3.tfbattle.json`.

The paired full-state run against `655f3ba` differs only in the same five schema/roster fields as B8 until tick 29: format 4, alpha/beta zero monthly reward counters, and both original complete participation rosters. These follow 16 D18, 06 D17 and 07 D49. The proof derives each roster directly from the historical army/clan/leader/deputy assignments.

Tick 30 resolves an attacker victory with large awe, 793 attacker losses and 1,200 defender losses. The entire returned `BattleTickResult`, including every ordered tactic, casualty, routing, movement and resolution event, is identical in every tick. Current settlement additionally awards the victorious commander `round((40 + 20) × 1.5) = 90` merit and leadership/valor experience (06 §3.5/§5.7; `battle.ts` victory roster and `gainMerit` settlement). The historical source omitted that award. No combat casualty, RNG, timer, order, awe level or winner changes.

The resolved field combat is removed, so final full states differ in exactly six fields: save version, both fresh reward counters and the commander's merit/leadership experience/valor experience. Current initial hash is `86b14d5fd1346b7c`; final hash is `d788173b342da967`.

`full-state-proof.json.gz` preserves both original/current initial states and all 30 complete states, tick results, hashes and field differences. The migration regression reproduces the original protected checkpoint/final hashes, explicitly adds only the schema/roster fields and terminal award, then compares every current full state/result and validates invariants. The ordinary transcript test retains strict BAL, initial, every checkpoint, final hash and repeatability checks. Its entries, layout identity and final tick remain unchanged.

Reproduce using Node 22 and installed dependencies:

```sh
repo_dir="$PWD"
proof_dir="$repo_dir/docs/validation/2026-10-12/golden-provenance/tactical"
run_dir="$(mktemp -d /tmp/tenka-tactical-provenance.XXXXXX)"
tar -xzf "$proof_dir/../goldens/historical-source.tar.gz" -C "$run_dir"
ln -s "$repo_dir/node_modules" "$run_dir/node_modules"
cp "$proof_dir/reproduce.mts.txt" "$run_dir/reproduce.mts"
TENKA_HISTORICAL_ROOT="$run_dir" TENKA_CURRENT_ROOT="$repo_dir" \
TENKA_PROOF_ROOT="$proof_dir" ./node_modules/.bin/tsx "$run_dir/reproduce.mts"
```

This verifies every historical source SHA256, every recorded historical full state/result, both old/current strict hash sequences and exact current full-state/result equality after only the stated corrections. No production serializer or replay validation changes.
