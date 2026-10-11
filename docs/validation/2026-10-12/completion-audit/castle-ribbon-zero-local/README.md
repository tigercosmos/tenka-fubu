# M6-V11 castle ribbon zero-objective local proof

The narrow source change skips proposal scoring when the baseline already has zero ordinary overlap, zero padded overlap, and zero hard overlap.
Its distance is also zero, so no proposal can improve the objective.
The original candidate generation, output construction, final diagnostics, and conservative shared-work effect remain unchanged.
No native performance benefit is claimed by this local evidence.

## Exact source and reference

The implementation is committed in `6795ed7`.
[Summary](summary.json) records complete SHA-256 values for the production source, independent reference, and parity test.
All three working files match that commit byte-for-byte.
The reference is the complete original producer from `a381b7d`, with a provenance header.
Its unchanged original body is pinned to `2c5e8d577598f1204cdcd67dfc0473e29be15ca4f4a3a613c24aa8287c6559ad`.
The authenticity test independently verifies that body hash.

The reference imports no production scoring helper.
[Archived source](castleRibbonLayout.ts.gz), [reference](castleRibbonZeroObjectiveReference.ts.gz), and [test](castleRibbonZeroObjectiveParity.spec.ts.gz) retain their exact bytes.
This commit changes only evidence files, while the tested source remains fixed.

## Accounting proof

Each proposal has the same integer conservative charge before any guard or early rejection.
The fast path preserves the exact unique proposal list and computes how many charges fit in the remaining shared budget.
Zero-charge proposals retain every try even after an earlier ribbon exhausts its positive-charge budget.
The resulting work, tried placements, budget flag, and callback value match the original loop.
Nonzero padding or hard area retains the full search because those objectives can still improve.

## Validation

| Check                     | Result     | Scope                                                                                 |
| ------------------------- | ---------- | ------------------------------------------------------------------------------------- |
| Six related castle suites | 37 passed  | Existing geometry, leader, hard tie, compact admission, budget and new parity         |
| Final parity suite        | Six passed | Strict values, full Map order, serialized bytes, callback work and input immutability |
| Typecheck                 | PASS       | Existing full two-project command                                                     |
| Owned ESLint              | PASS       | Three owned source/reference/test files                                               |
| Owned formatter check     | PASS       | Three owned files without rewriting source                                            |

The seed suite compares 120 mixed scenes and their reversed input permutations, for 240 exact comparisons.
Boundary scenes cover signed zero, fractional dimensions, gap contacts, and coordinates near both admitted extremes.
Counterexamples verify that positive padding and positive hard area still require search.
A dense 40-candidate scene with 1,024 fixed/hard obstacles exhausts earlier work before a distant zero-charge ribbon.
Every returned geometry, leader, overlap, unresolved flag, tried count, budget flag, callback, and serialized order is compared.
No tolerance or approximate geometry comparison is used.

[Focused log](tenka-castle-zero-objective-tests.log.gz) and [final parity log](tenka-castle-zero-objective-final-parity.log.gz) preserve complete runner output.
[Typecheck](tenka-castle-zero-objective-typecheck.log.gz), [lint](tenka-castle-zero-objective-lint.log.gz), and [formatter](tenka-castle-zero-objective-format.log.gz) preserve raw checks.
The successful lint emits no text; its empty raw file remains checksummed.
An initial UI-project invocation selected no files; the preserved accepted run uses the workspace's core project for these pure geometry tests.

## Native and storage boundaries

Parent coordinates separate sim3 runs for exact native observations, three FPS windows, and one profile, serially on that host.
No sim2 native work or browser repeat accompanies this proof.
Local parity establishes unchanged output and accounting, not real responsiveness improvement.
Frozen assets, screenshot oracles, and thresholds remain unchanged.

[Reproducer](reproducer.json) records exact commands and runtime.
[Manifest](manifest.json) records byte counts and both SHA-256 forms for all eight raw files.
Raw logs and source copies were compressed before derived metadata formatting; their bytes remain unchanged.
Parent completion records remain separately owned.
