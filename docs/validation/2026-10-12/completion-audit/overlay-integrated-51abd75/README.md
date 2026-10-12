# Frozen overlay integration at 51abd75

The combined Ending fix and Battle/mandatory-overlay tests at `51abd75` passed 138 focused tests across 16 files. General/core type checks, full ESLint, data and asset validation, production build, and bundle budget also passed. This is a focused regression result; the latest complete core suite remains pinned to `7d37c28`.

All 1,632 allowlisted source, test, asset, tool, plan and configuration inputs matched their Git blobs and executable modes before and after these checks. The scope excludes validation documentation, generated bundles and installed dependencies. This package does not claim a fresh dependency installation. The producer creates each command's complete combined stdout/stderr log before launching it, records independent statuses, and continues later checks even if an earlier command fails.

The original complete native suite at this source failed during Node 22 test discovery. Its separate full-suite package preserves that failure and later test-only repair. These successful local checks do not override that native result or prove the original five-minute native deadline.

`raw/tenka-overlay-keyboard-status-01` retains an independent status-read setup failure: SSH command quoting caused a remote shell syntax error before any data was read. No game test ran in that command. The active worker's own captured run supplied the subsequent authoritative result.

Run `python3 docs/validation/2026-10-12/completion-audit/overlay-integrated-51abd75/verify.py` to verify the captured logs, statuses, source inventories and hashes. The command verifies existing evidence; it does not rerun the application tests.
