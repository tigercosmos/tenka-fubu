# Minimum-viewport keyboard acceptance evidence

The six Chromium cases passed at **1280 × 720** on sim4. The committed test is `934163c` (`e2e/keyboard-minimum.spec.ts`). The final run used a fresh `961f0ae` source checkout, its pinned dependencies, and that exact test file. `manifest.json` records the source hashes.

The cases cover Tab, Shift+Tab, Alt+1–5, focus ownership, F1–F7, R, Home, and M. They also cover WASD, arrows, `+`, `-`, a native wheel event, speed keys, Space, Ctrl+S, F9, and Enter. Each camera action has a settled minimap frame before and after it. The 11 image-hash pairs differ. The cases do not measure movement direction or zoom magnitude.

| Run                                           | Captured result     | Meaning                                                                                                                   |
| --------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `old-control-runs/keyboard-old-router-red-v3` | 1 failure           | The old `7d37c28` router ignored `m` from a focused, non-input trait control. The minimap remained visible.               |
| `runs/keyboard-camera-v4`                     | 1 timeout           | One combined camera case exceeded its 60-second case limit while reading the frame. It did not fail a movement assertion. |
| `runs/keyboard-camera-v5`                     | 3 passes            | Separate WASD, arrow, and zoom cases passed with settled-frame checks.                                                    |
| `runs/keyboard-final-v7`                      | 5 passes, 1 failure | The save/load case saw no dirty F9 dialog. The test had no quick-save completion wait.                                    |
| `runs/keyboard-save-v8`                       | 1 pass              | The save/load case waited for the completed quick-save notice and required a dirty mark before F9.                        |
| `runs/keyboard-full-v9`                       | 6 passes            | Final native keyboard matrix. The report embeds all 11 before/after hashes.                                               |

The quick-save notice follows `saveCurrent` and `refresh` in `src/app/persistence/useSaveLoad.ts`. The final test captures the saved day after that notice and the clean-state check. It then advances time and requires a dirty-state check before F9. This closes the v7 test race without changing product behavior.

The three `.tar.gz` archives contain lossless command, process, result, stdout/stderr, JSON report, and error-context files. They include the fresh install, build, source proof, and local typecheck, ESLint, and Prettier checks. A later readback of the old control records its router, v3 test, and dependency hashes. It is not a contemporaneous source proof from the RED run. `sim4-current-metadata.tar.gz` and `sim4-old-control-metadata.tar.gz` omit only the large trace ZIP files. `manifest.json` records each omitted ZIP's sim4 path, byte size, and SHA-256 hash. Those ZIP files remain on sim4 and are **not in Git**.

The initial local `git archive -o` failed with `No space left on device` before capture was in use. Only its tool transcript survives. The later streamed archive completed, but its direct tool transcript is outside this package. Initial remote `npm ci` attempts failed before child spawn because the noninteractive PATH lacked Node; their captured logs have no `result.json`. A local v9 typecheck attempt used the remote Node path and exited 127; the corrected captured typecheck passed. One direct Prettier check lacked a capture; the later captured Prettier check passed. These gaps do not contribute to the final pass claim.

Run `python3 docs/validation/2026-10-12/completion-audit/keyboard-minimum-961f0ae/verify.py` from this repository. The verifier checks archive hashes, six final case statuses, and all 11 distinct camera pairs. It also checks the old-router failure, run exit codes, committed test bytes, source and dependency hashes, and remote trace inventory. The verifier does not read the external trace ZIP bytes.
