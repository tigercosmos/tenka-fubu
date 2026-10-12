# Local evidence for the Pixi texture batch ID patch

The [candidate native heap analysis](../gpu-cache-key-native/README.md) found 63 stable `BatchTextureArray.ids` maps. Their indexed backing storage grew from 73,476 to 128,772 bytes between remounts 120 and 240. All 2,941 earlier numeric entries and all 5,574 later entries pointed to null. The source assigned each map a rising `TextureSource.uid`. This package records the local fix and its limits; it does not record the new native candidate result.

The pinned PixiJS version is 8.19.0. The candidate changes `TextureSource.uid` to `-uid("textureSource") - 1` in ECMAScript modules, with the equivalent CommonJS expression. IDs stay unique numbers and never equal zero. Negative numeric keys become named properties on `BatchTextureArray.ids`; direct `ids[source.uid]` lookups still work. `BatchTextureArray.clear()` deletes each released key. The patch does not change `Batcher` or the declarations `TextureSource.uid: number` and `BatchTextureArray.ids: Record<number, number>`.

`uid-audit.py` preserves every `.uid` line in the installed JS and MJS runtime. `uid-audit.json` records 289 lines and 14 lexical references relevant to a texture source. The only relevant bitwise operation is the bind-group hash. It uses XOR and then converts the hash to an unsigned integer. The scan found no comparison with `-1`, zero, or one on a `.uid` expression. The archive `texture-kernel-sources.tar.gz` contains the four original and patched runtime files, two declarations, and related consumers. `source-hashes.json` checks the original and patched bytes against the 29-target manifest. This audit covers pinned runtime source, not unknown external consumers.

`control.mjs.gz` reconstructs the unpatched source of the four new targets from the manifest. It runs 130 fill/clear cycles for the accepted 25-target baseline, candidate CommonJS, and candidate ECMAScript modules. `control.json` records 130 null keys after clear in the baseline and zero keys in either candidate format. It also records distinct numeric IDs, including `-1` in the ECMAScript run. `candidate-hashes.json` pins the three changed tracked files against commit `d7c0337`. The new 29-target installer accepts pristine 8.19.0 inputs, the installed 25-target state, or its own output. `upgrade-25-to-29.py` builds the exact 25-target fixture from pinned hashes. `upgrade-25-to-29.json` records four writes on upgrade and zero on repeat. The native candidate uses fresh `npm ci` to isolate its source and dependency state.

The initial new-test revision ran against the accepted local 25-target install. `red-old25-vitest.log.gz` records two expected failures: positive source IDs and a stale key after clear. The final test adds resource-order and padding checks without removing either RED assertion. `green-pixi.log.gz` records 27 passing tests across all six Pixi test files. `typecheck.log.gz`, `eslint.log.gz`, and `installer.log.gz` preserve successful local checks and their exit codes. The installer reported 29 validated targets and zero rewrites on the already patched local install. These checks do not establish whole-heap stability or protected visual acceptance.

Reproduce the source audit and local control from the repository root after applying the 29-target patch:

```sh
python3 docs/validation/2026-10-12/completion-audit/texture-batch-key-local/source-archive.py
python3 docs/validation/2026-10-12/completion-audit/texture-batch-key-local/uid-audit.py
python3 docs/validation/2026-10-12/completion-audit/texture-batch-key-local/upgrade-25-to-29.py
gzip -dc docs/validation/2026-10-12/completion-audit/texture-batch-key-local/control.mjs.gz | node --input-type=module
npx vitest run tests/ci/pixi*.spec.ts --minWorkers=1 --maxWorkers=1
npm run typecheck
```
