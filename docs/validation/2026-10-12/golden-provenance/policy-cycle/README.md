# Ten-command policy fixture provenance

The retained source in `/tmp/tenka-army-audit.YtXEQ3`, created on 2026-10-08, reproduces the original protected final hash `6696ac9f6fc92503` and BAL hash `7634217400759e66`. Its exact source archive and SHA256 manifest are preserved here. `frozen-v3.tfulog.json` preserves the original command log without modification.

Paired runs against commit `68e96a6` differ only in three fields, from initialization through each of the ten recorded days:

- `meta.saveVersion`: 3 → 4.
- `clans[clan.alpha].rewardGoldSpentThisMonth`: absent → 0.
- `clans[clan.beta].rewardGoldSpentThisMonth`: absent → 0.

Every full state, including transient AI intent history, matches after applying exactly these three documented fresh-game schema changes. Every event and applied command matches without modification. The current final hash is `2cfa89ea001535e8`. The protected fixture changes only its `balanceHash` and `finalHash`; its commands and final day remain unchanged.

This follows `plan/16-save-and-settings.md` D18 and `plan/06-officers.md` D17, which add persisted monthly reward spending and save format 4. A new scenario starts with known spending zero. This proof concerns a replay rebuilt from a fresh scenario; native migration of an existing v3 save correctly preserves unknown historical spending as null. No production serialization projection or replay guard changes.

`full-state-proof.json.gz` preserves all ten historical full states, events, applied commands, daily hashes, and exact paired differences. `tests/replay/policyCycleSchemaMigration.spec.ts` checks the original frozen oracle, archive hash, unchanged commands, current invariants, and every complete upgraded state.

Reproduce the source comparison from a checkout with `npm ci` completed, using Node 22 and Python-free extraction:

```sh
repo_dir="$PWD"
proof_dir="$repo_dir/docs/validation/2026-10-12/golden-provenance/policy-cycle"
run_dir="$(mktemp -d /tmp/tenka-policy-provenance.XXXXXX)"
tar -xzf "$proof_dir/historical-source.tar.gz" -C "$run_dir"
ln -s "$repo_dir/node_modules" "$run_dir/node_modules"
cp "$proof_dir/reproduce.mts.txt" "$run_dir/reproduce.mts"
TENKA_HISTORICAL_ROOT="$run_dir" TENKA_CURRENT_ROOT="$repo_dir" \
TENKA_PROOF_ROOT="$proof_dir" TENKA_OUTPUT_FILE="$run_dir/reproduced.json" \
  ./node_modules/.bin/tsx "$run_dir/reproduce.mts"
```

The script verifies every retained source manifest entry before executing either core. It asserts the protected old hash and exact three-field transformation for all ten days. The other older replay and golden fixtures remain unresolved and unchanged.
