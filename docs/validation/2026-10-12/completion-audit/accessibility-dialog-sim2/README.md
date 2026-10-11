# M6-V11 production accessibility and Dialog landmarks

The production audit found an unintended second page banner inside settings and save/load dialogs.
The Dialog header correction preserves its heading, accessible name, modal role, and focus behavior.
The original producer fails the new landmark regression; the correction passes the focused unit and native tests.
Other axe findings remain visible and require separate assessment.

## Acceptance and scope

Plan 12 §3.2.2 requires a labelled modal dialog.
Plan 12 §3.5 requires visible focus, focus restoration, keyboard access, and text contrast of at least 4.5:1.
M6-V11 and 12-T14 require no critical axe violations.
The production scan used every default axe rule without suppressions.
The Gallery run used its existing assertions, including no reported violations.
Incomplete checks remain in every raw result.

The tested base is `e65fbbc8401c5fe96d0f887c78a13e4803e12f02` on isolated sim2.
[Source verification](source-verification.json.gz) checks 1,477 archived files and records only the two approved Dialog file differences.
The new accessibility E2E source hash is recorded separately.
The browser ran headlessly, without a profiler or concurrent native workloads.
Existing 60-second test and five-minute global timeouts remained unchanged.
No screenshot baseline, tolerance, save command, or core state rule changed.

## Landmark defect

A plain Dialog header became a page banner because its parent uses a DIV with `role="dialog"`.
The strategy HUD already supplies the page banner.
[HTML-AAM](https://www.w3.org/TR/html-aam/#el-header) distinguishes body-scoped header banners from section-scoped headers.
The correction gives the decorative Dialog header `role="none"` and preserves its actual H2.
The dialog still references that H2 through `aria-labelledby` and retains `aria-modal="true"`.

| Validation                                               | Original producer                            | Corrected producer |
| -------------------------------------------------------- | -------------------------------------------- | ------------------ |
| Dialog unit suite                                        | 1 failed, 21 passed                          | 22 passed          |
| New native accessibility tests                           | 1 failed, 1 passed                           | 2 passed           |
| New accessibility plus unchanged keyboard/contrast tests | Four existing tests passed before correction | Six passed         |
| Existing Gallery config                                  | Not repeated before correction               | Five passed        |

[Unit RED log](tenka-a11y-dialog-red.log.gz) and [unit GREEN log](tenka-a11y-dialog-green.log.gz) preserve the regression.
[Native RED log](tenka-a11y-e65fbbc-accessibility-red.log.gz) and [six-test GREEN log](tenka-a11y-e65fbbc-accessibility-green.log.gz) preserve browser results.
[Gallery log](tenka-a11y-e65fbbc-gallery.log.gz) includes the existing battle layout, icon, virtual table, keyboard, and axe gates.
Settings and save/load no longer report duplicate-banner or landmark-unique violations.

## Empty registry counterexample

Axe reports `scrollable-region-focusable` for the empty load registry because all descendant action buttons are disabled.
The original pinned Chromium 149 still reaches the OL with a real Tab from Return.
The original native End key scrolls it from 0 to 542 pixels.
Its content height is 888 pixels, its visible height is 346 pixels, and its explicit tabIndex is -1.
That native counterexample rules out an inaccessible registry in the tested browser.
No list role, tabindex, or axe rule was changed to silence the finding.

[Original keyboard probe](keyboard-probe--scroll-keyboard-probe.json.gz) preserves the Tab sequence and scroll geometry.
[Corrected native keyboard attachment](native-green-attachments--empty-registry-native-keyboard.json.gz) records a visible two-pixel outline and real End scrolling.
The new keyboard regression passes with both source versions.
This proof does not certify other browsers, screen readers, or OS IME behavior.

## Remaining findings

Every production state has zero critical violations.
The corrected title reports three moderate region nodes; main, settings, and save/load each report two.
The serious empty-registry axe finding remains in the save/load report despite the native keyboard counterexample.
Incomplete aria and color-contrast checks remain in production reports.

The corrected canonical save/load scan also reports eight empty-slot status spans with contrast 3.37:1.
The reported colors are `#777c7b` on `#e8e5de`, with 12-pixel text.
Earlier original scans did not resolve those spans into the same color violation.
The header role change does not establish the cause of this difference.
An independent stable-render contrast check remains necessary before treating that acceptance item as complete.

All four Gallery axe states report zero violations, while retaining incomplete checks.
[Complete summaries](axe-summary.json) enumerate all 24 preserved axe results, including original, RED, GREEN, probe, and Gallery scans.
Passing the critical-only production gate does not establish a clean overall accessibility result.

## Raw evidence and reproduction

[Provenance](provenance.json) records exact commands, environment, source archive hash, and remote result paths.
[Raw manifest](manifest.json) records both compressed and uncompressed SHA-256 values for every preserved raw file.
Raw JSON, logs, scripts, source copies, and report bodies were compressed before formatting derived metadata.
All manifest hashes, byte counts, and local links were checked after copying this directory into the repository.

The report extractor decodes Playwright's embedded ZIP and preserves JSON attachment body strings as exact UTF-8 bytes.
Its raw script and [extraction manifest](native-green-attachments--extraction-manifest.json.gz) identify the originating ZIP entries and attachment hashes.
The original failing trace remains remotely under the path recorded in [trace checksums](red-trace-hashes.log.gz).
Large HTML reports, screenshots, traces, and runtime source archives are excluded from this bounded commit.
Parent completion records remain separately owned.
