# Next continuation: one earned Ending fixture per invocation

The original 16-worker run failed all three earned Ending cases before their browser assertions. Their child Vitest tests exceeded the unchanged 5,000 ms limit: 6.61, 6.47 and 5.95 seconds. The same generator command passed on the idle host in 1.61 seconds. These observations identify a fixture-generation failure under that cohort; they do not explain the other full-suite failures or prove a scheduling repair will meet the five-minute gate.

The next implementation should use an **Ending-only Playwright dependency setup project**. Do not add a global setup that generates this fixture for unrelated focused subsets. The bounded change affects the Playwright project configuration, a new earned-fixture setup module and the existing earned Ending test helper. No game code, game rule, timeout or acceptance assertion needs to change.

- Generate one fresh deterministic earned save per invocation, within the existing 300-second global budget and before the dependent browser tests. Keep the generator's current 5,000 ms Vitest case limit.
- Use an exclusive run-specific artifact/log path. Verify the generated save's schema, earned campaign properties and hash. Dependent tests consume those immutable bytes in separate browser contexts.
- Propagate generator failure to dependent tests. Missing files, wrong hashes or invalid provenance fail explicitly; there is no stale fixture fallback.
- Preserve each existing load, continue, native save/reload and title-return assertion. Report setup duration separately while retaining it within the total suite duration.
- Ensure selecting the Ending tests also selects their dependency. Unrelated test subsets should not run the generator. Preserve explicit project selection behavior, or document a necessary project-name change before adoption.
- Retain the original 8ea965a failure. First validate the dependency and all three Ending workflows under the unchanged deadlines. Run another complete suite only after the causal scheduling change is implemented and verified.

The isolated control and all original child logs are in the full-suite evidence package. No scheduling code was changed in this tranche. Other native failures, the original per-case timeout discrepancy, strict render performance, whole-heap behavior, long-run acceptance and pending game-rule/baseline decisions remain open.

The original five-screen axe data is retained in `battle-axe-3da2334/native-raw.tar.gz`, under `tenka-overlays-79682cd/runs/axe-earned-probe/browser-results/`. It contains `axe-battle.json`, `axe-proposal.json`, `axe-month-summary.json`, `axe-event.json` and `axe-ending.json`. All five had zero critical violations. Proposal, Month Summary and Event retain moderate `region` findings for the underlying strategy map/minimap; Ending retains moderate `region` findings for its generic root content. These are follow-up semantic issues, not cleared by the Battle fix. Incomplete contrast and label checks also retain their manual-review status.
