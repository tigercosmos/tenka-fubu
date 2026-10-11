# Native road capsule allocation controls

The `dec6b8a` road capsule rewrite preserves all nine native snapshots exactly.
The pinned reference is the previously validated `8cdd7db` output.
The comparison covers complete published views, canonical hashes, labels, plates, ribbons, and artwork geometry.
Only named nonvisual run and cache counters are excluded.

| Camera      | Before FPS | After FPS | Before p95 | After p95 |
| ----------- | ---------: | --------: | ---------: | --------: |
| Overview    |      59.61 |     59.87 |    17.6 ms |   17.6 ms |
| Operational |      42.98 |     42.81 |    25.3 ms |   25.5 ms |
| Close       |      18.49 |     23.99 |    70.3 ms |   50.4 ms |

All three 30-second 1920×1080 controls use actual RTX 5070 Ti Vulkan rendering in headless Chrome 149.
Each control mounts all 120 armies and fails the unchanged strict 60 FPS gate.
The renderer controls keep strategy paused and do not establish live campaign acceptance.
Postrender cadence does not measure physical GPU presentation.

Exact before and after strategy JSON comes from the retained Playwright traces.
Every window preserves all 816643 bytes and the same SHA256 hash.
Resource objects also preserve their hashes.
`native-state-resource-proof.json.gz` records trace paths, hashes, and extraction details.
`native-canonical-state.raw.json.gz` preserves the exact strategy bytes.

The isolated replica receives only `roadLabelCapsules.ts` after the preceding validated build.
All 754 source, tool, and public file hashes match the recorded frozen base and owned changes.
Dependency module hashes remain unchanged; later root cache patches do not apply.
The raw native files and scripts use the `native-` prefix.
Local unit, typecheck, lint, and Git reference evidence is recorded separately.
