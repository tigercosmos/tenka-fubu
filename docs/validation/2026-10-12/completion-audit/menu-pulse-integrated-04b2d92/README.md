# System menu ownership and selection pulse integration

Frozen source `04b2d92` combines the SystemMenu StrictMode ownership fix (`6cb9643`), its actual captured-confirmation callback regression (`1990036`), and the selected-node pulse (`04b2d92`). The seven changed files include no core or rule changes.

The local run uses 15 related renderer, scene-part, menu, modal-store, dialog and App save/session/hotkey/event test files. Each validation command opens a unique complete log before spawning; later checks execute even if an earlier check fails. Source and patched-Pixi inputs are checked against their pinned bytes before and after the complete sequence.

The original combined capture reports 247/247 tests across 15 files (11.68 s), passing typecheck, data/assets, build/bundle, formatting, production discovery (440 tests/106 files) and gallery discovery (8 tests/4 files). All 1,648 scoped Git inputs and 29 patched Pixi targets match before and after.

The first full ESLint command failed on five temporary TS/TSX source copies being packaged concurrently under the new menu evidence directory, outside the TypeScript project. The runtime source had no lint errors. Those evidence bytes were retained in a source-support archive and the plain copies removed; no lint configuration or application code changed. The separate full ESLint rerun passes with zero errors and two warnings. The original failed result remains preserved. Two nonblocking warnings concern the existing NewGameOptions export and the intentional generation-ref read during SystemMenu cleanup. No full core or full native suite is implied. Native menu and pulse evidence uses explicitly described isolated source overlays rather than relabeling those executions as the entire combined checkout. Original failures and setup errors remain in their respective packages. The full five-minute native, strict 60 FPS, whole-heap, long-run and remaining M6–M9 gates stay open.

Native evidence: [SystemMenu ownership](../system-menu-strict-1990036/README.md) and [selection pulse](../selection-ring-pulse-04b2d92/README.md). Run `python3 verify.py` to check retained hashes and exact local results.
