#!/usr/bin/env python3
"""Archive exact original and patched Pixi 8.19 texture batch kernel bytes."""
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
MANIFEST = ROOT / 'tools/dependencies/pixi-8.19-patch.json'
manifest = json.loads(MANIFEST.read_text())
selected = [target for target in manifest['targets']
            if Path(target['path']).stem in ('TextureSource', 'BatchTextureArray')]
assert len(selected) == 4
rows = []
context = [
    'lib/rendering/renderers/shared/texture/sources/TextureSource.d.ts',
    'lib/rendering/batcher/shared/BatchTextureArray.d.ts',
    'lib/rendering/batcher/shared/Batcher.js',
    'lib/rendering/batcher/shared/Batcher.mjs',
    'lib/rendering/batcher/gpu/getTextureBatchBindGroup.js',
    'lib/rendering/batcher/gpu/getTextureBatchBindGroup.mjs',
    'lib/rendering/renderers/gpu/texture/GpuTextureSystem.js',
    'lib/rendering/renderers/gpu/texture/GpuTextureSystem.mjs',
    'lib/prepare/PrepareBase.js',
    'lib/prepare/PrepareBase.mjs',
    'lib/utils/data/uid.js',
    'lib/utils/data/uid.mjs',
]
with tarfile.open(OUT / 'texture-kernel-sources.tar.gz', 'w:gz') as archive:
    def add(name, body, expected=None):
        digest = hashlib.sha256(body).hexdigest()
        if expected is not None:
            assert digest == expected, (name, digest, expected)
        info = tarfile.TarInfo(name)
        info.size = len(body)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(body))
        rows.append({'path': name, 'sha256': digest, 'bytes': len(body)})
    for target in selected:
        patched = (ROOT / 'node_modules/pixi.js' / target['path']).read_text()
        original = patched
        for item in reversed(target['replacements']):
            before, after = item['from'], item['to']
            if not after and before.startswith('//# sourceMappingURL='):
                original += before
            else:
                assert original.count(after) == 1, target['path']
                original = original.replace(after, before)
        add('original/' + target['path'], original.encode(), target['originalSha256'])
        add('patched/' + target['path'], patched.encode(), target['patchedSha256'])
    for path in context:
        add('context/' + path, (ROOT / 'node_modules/pixi.js' / path).read_bytes())
print(json.dumps({'manifestSha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
                  'manifestTargets': len(manifest['targets']), 'files': rows}, indent=2))
