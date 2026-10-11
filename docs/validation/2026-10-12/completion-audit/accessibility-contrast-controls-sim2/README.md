# M6-V11 independent empty-slot contrast controls

The settled save/load status text independently meets the required 4.5:1 contrast baseline.
Both native paint crops contain the actual foreground `#4d5658` and background `#fbf8f0`, giving 7.098:1.
No static SaveLoad CSS defect was established, so this step changes no production source or tests.
The earlier eight-node axe color report remains preserved with its cause unresolved.

## Native controls

The controls used frozen `e65fbbc` production art and loader with the approved `1575bc8` Dialog role correction.
The relevant CSS and theme files [match current working source](source-verification.json).
All browser runs were headless, serial on sim2, and without a profiler.
Every axe invocation used its full default rules.

| Control                                                         | Default axe scans | Color-contrast violations | Paint evidence               |
| --------------------------------------------------------------- | ----------------: | ------------------------: | ---------------------------- |
| Normal motion, immediate and after actual animation completion  |                 2 |                         0 | Positive native status crop  |
| Reduced motion, immediate and after actual animation completion |                 2 |                         0 | Positive native status crop  |
| Original six-state screen sequence, normal motion               |                 6 |                         0 | 27 RAF ancestry observations |

The controls awaited scoped `animation.finished` promises without changing CSS, animation duration, or rendering.
All captured ancestry samples in the full sequence were opaque.
That observation does not identify the cause of the earlier discrepancy.
The complete reports retain moderate region findings, the separate serious scroll-focus report, and incomplete aria or contrast checks.

## Independent paint check

The status span is plain metadata text, not a disabled action label.
Its settled computed color is `rgb(77, 86, 88)` over the opaque slot color `rgb(251, 248, 240)`.
Every settled ancestor has opacity one.
Each 37×18 native crop contains ten exact foreground pixels and 537 exact background pixels.
The colors were therefore observed in rendered pixels as well as computed style.

The independent calculation uses the sRGB luminance transfer and `(Llighter + 0.05) / (Ldarker + 0.05)`.
The result is 7.098273976153997 for both crops.
The archived [paint calculation](paint-calculation.py.gz) recomputes that ratio and validates positive foreground and background pixel counts.
[Normal-motion paint](probe--no-preference-status-paint.png) and [reduced-motion paint](probe--reduce-status-paint.png) retain unchanged PNG bytes.
[Raw geometry and ancestry](probe--geometry-and-colors.json.gz) record the actual status bounds, colors, and animation observations.
[Derived summary](summary.json) records counts and every axe result.

## Preserved discrepancy

The [earlier canonical report](../accessibility-dialog-sim2/native-green-attachments--axe-save-load.json.gz) identifies eight spans at 3.37:1.
It reports `#777c7b` over `#e8e5de`, which differs from the independently observed settled colors.
The new controls did not reproduce that report.
These results do not justify calling it an automatic false positive or attributing it to a transition.
Its raw bytes remain archived rather than replaced.
No axe rule, screenshot baseline, tolerance, CSS token, or disabled-state styling was changed.

## Provenance

[Reproducer metadata](reproducer.json) records the exact scripts, source scope, environment, and external full-page image paths.
The scripts, logs, source copies, ten full axe results, geometry, and sampled frames are retained as compressed raw files.
[Manifest](manifest.json) records both checksum forms and byte counts; native PNGs remain uncompressed and unchanged.
All records were checked after repository copying.
Full-page screenshots remain external with [recorded checksums](external-page-paint-hashes.log.gz).
Parent completion records remain separately owned.
