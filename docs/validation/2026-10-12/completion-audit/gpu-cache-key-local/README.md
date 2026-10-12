# Local evidence for the Pixi renderer cache key patch

This package records the source and local checks for a candidate fix to the current-renderer heap growth. It does not record a native browser acceptance result. The pinned dependency is PixiJS 8.19.0, and the repository base is `2d872d7`.

The [current heap evidence](../heap-current-2d872d7/README.md) compares 120 and 240 remount snapshots. It attributes 343,448 bytes of increased `_gpuData` indexed backing storage to a renderer ID change from 130 to 250. Of that amount, 248,400 bytes comes from 345 current-only keys. Another 95,048 bytes comes from 109 stable cache owners that retain old keys with null values. The raw per-owner node IDs and strong root paths are in `gpu-history-analysis.json.gz` in that evidence package. `exhaustive-old-keys.py` checks every old indexed value on those 109 stable owners. `exhaustive-old-keys.json` records 14,170 null values at remount 120 and 27,250 at remount 240, with no exceptions. These are snapshot self-size changes, not a whole-heap acceptance result.

Pixi's `AbstractRenderer` allocates a rising numeric UID. Pixi stores renderer-owned data in objects indexed by that UID. The candidate makes each renderer UID a unique negative number. A negative key remains a numeric renderer ID but becomes an ordinary object property rather than an indexed element. `GCManagedHash.remove` also deletes a released `_gpuData` key after it destroys the GPU data. The deletion applies when the value is already null. The patch does not reuse renderer IDs or change other resource IDs.

`source-archive.py` creates `runtime-kernel-sources.tar.gz` from the exact installed Pixi files and the manifest's reversible replacements. The archive holds original and patched CommonJS and ECMAScript modules for `AbstractRenderer` and `GCManagedHash`. It also holds the declaration of `AbstractRenderer.uid`, the UID allocator, and the Buffer cache owner. `source-hashes.json` checks each original and patched byte sequence against the pinned patch manifest. `candidate-hashes.json` records the base and candidate hashes of the three tracked files changed by this fix. The manifest has 25 exact-version targets; this fix adds two renderer targets and revises two managed-hash target outputs. The new recipe accepts pristine Pixi 8.19.0 files or its own 25-target outputs. It does not accept a previously installed 23-target revision because the managed-hash bytes differ. A fresh `npm ci` applies this candidate from pristine inputs. In this local checkout, the four installed runtime files were changed to their exact candidate bytes before the installer checked 25 targets and wrote zero files. This evidence does not claim an in-place 23-to-25 upgrade.

`uid-audit.py` scans the installed Pixi JS and MJS runtime. `uid-audit.json` holds all 132 direct `renderer.uid` references across 36 files, including source lines. Every recorded reference uses the UID as a bracket key. `AbstractRenderer.d.ts` declares `readonly uid: number`; it does not require a nonnegative or sequential value. This audit covers direct references in the pinned runtime, not every external Pixi consumer.

`cache-control.mjs.gz` contains a module that reconstructs pristine CommonJS source from the candidate manifest. It also applies the archived `baseline-23-manifest.json.gz` from commit `2d872d7` to make the accepted 23-target baseline. In 130 renderer cycles, pristine Pixi leaves 130 `_gpuData` keys and 130 unload listeners. The accepted baseline leaves 130 keys and zero listeners. Each candidate format leaves zero keys and zero listeners. All four controls call the unload callback and GPU destructor 130 times. The listener fix predates this candidate. The shared-owner check keeps the second renderer's entry alive while the first is destroyed, then checks the recreated first entry and final cleanup. `cache-control.json` is the raw output. This is a local lifecycle control, not a Chromium memory measurement.

Fresh scoped checks are preserved as raw logs: `vitest.log` records 24 passing tests in five Pixi test files; `typecheck.log` records both TypeScript checks; `eslint.log` records the changed test files and patch installer; `installer.log` records 25 validated targets and zero rewrites on an already patched installation. Each log includes its exit code. The fixture test also checks a fresh 25-file installation, idempotence, mixed-state recovery, exact hashes, and both module formats. Earlier scratch checks were not retained as raw logs; these fresh runs replace them.

Reproduce the controls from the repository root after `npm ci` applies the pinned patch:

```sh
python3 docs/validation/2026-10-12/completion-audit/gpu-cache-key-local/source-archive.py
python3 docs/validation/2026-10-12/completion-audit/gpu-cache-key-local/uid-audit.py
python3 docs/validation/2026-10-12/completion-audit/gpu-cache-key-local/exhaustive-old-keys.py
gzip -dc docs/validation/2026-10-12/completion-audit/gpu-cache-key-local/cache-control.mjs.gz | node --input-type=module
npx vitest run tests/ci/pixi*.spec.ts --minWorkers=1 --maxWorkers=1
npm run typecheck
```
