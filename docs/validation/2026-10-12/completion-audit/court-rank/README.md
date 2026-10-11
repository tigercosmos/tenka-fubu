# Earned court rank: native proof

The native test passed for seed 1 Oda on sim3 with frozen production commit `505d96a`.
Test commit `8c0de41` contains the exact accepted test bytes.
[The manifest](source-manifest.json) compares the relevant court, dialog, balance, and save sources against later root sources.
Every compared source matches.

Normal donations earned 23 favor on day 150.
The native rank request stayed queued until day 151.
The grant deducted 300 gold, added 50 prestige, and kept all 23 favor.
The court page displayed 從五位下 and disabled the next request.
Native save and reload retained the full documented save snapshot on day 151.
The codec deliberately omits the transient AI intent log.

The [compressed raw result](success-full-state.json.gz) contains full snapshots, monthly favor, commands, choices, and every scheduler slice.
All 149 recorded scheduler steps advanced exactly one day and passed all state invariants.
Two authored historical choices separately settled days 60→61 and 120→121 through the native event host.
The helper added at most three ordinary frames only with an unchanged day, no dialog, and selected x5 speed.
It never resumed through an unknown owner.

[The summary](summary.json) records all four diagnostic failures and the exact remote paths and hashes of their large traces.
Exact compressed logs and raw attachments remain alongside the passing result.
The summary records each uncompressed hash and byte count.
The two early raw attachments came from trace resources and predate monthly and frame recording.
The later helper records both.
[Network excerpts](diagnostic-wasm-network.json) come from diagnostic runs only; the passed run retained no trace.

Runtime: Node 22.23.3, Playwright 1.61.1, and Chrome Headless Shell 149.0.7827.55, with one worker.
The command used `NODE_OPTIONS=--import=tsx npx playwright test e2e/court-rank.spec.ts --workers=1`.
The test passed in approximately 3.1 minutes; this duration is not a performance benchmark.
Isolated production build and typecheck passed.
Final test lint, formatting, and full local typecheck also passed.

This proof covers the first earned rank and native persistence on the frozen bundle.
It does not establish long-horizon completion, second-rank progression, succession, or the pending no-heir policy.
Later unrelated production changes require their own validation.
