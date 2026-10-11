# Extended renderer remount diagnostic

The unchanged resource equality gate failed twice after exactly 41 total remounts (10 warmup plus measured cycle 30). These diagnostic runs increased the measured count from 20 to 120; the second run also recorded complete map diagnostics before each resource assertion. Neither run completed the requested 120 measurements or produced an after snapshot. The accepted original 20-measurement result remains separate.

The second run reports `Elevated terrain ground texture unavailable`, with elevated, foothill and canopy resources all zero while coastal resources remain present. This occurs before terrain factory construction. The first trace contains twelve failed asset transports in the final remount cohort, spanning terrain, castle and army assets. Their response records nominally show status 200, but nested `response._failureText` is `net::ERR_FAILED`, with no received body. A status-only scan would miss these failures. This evidence identifies asset acquisition failure; it does not establish the browser/server/cache cause or justify automatic retries.

All 714 production files present under `src` and `tools` on sim4 match local `9a0e242` bytes. Configuration, public assets and E2E files are outside this comparison. Diagnostic E2E source bytes are archived separately and were not adopted as the repository gate. Runs use the existing headless GPU Chromium configuration on sim4 and Node 22.17.0.

Raw logs, complete second-run cycle JSONL, error context, diagnostic test sources and exact failed network records are archived with compressed and uncompressed SHA256. Large original traces and before heaps remain on sim4 at the exact paths in `remote-artifact-sha256.json`; their hashes are preserved. No after heap exists. Per-cycle Runtime readings precede garbage collection and are not post-GC heap stability measurements.

Reproduce in the isolated built replica with the archived diagnostic file installed as `e2e/visual.spec.ts`:

```sh
VISUAL_GPU=1 VISUAL_HEAP=1 npx playwright test e2e/visual.spec.ts --project=chromium --workers=1 --grep 'renderer remount'
```

The first run changes only the measurement count. The second additionally writes diagnostics and Runtime heap readings. Preserve both failures and keep any future transport discriminator separate from renderer acceptance.
