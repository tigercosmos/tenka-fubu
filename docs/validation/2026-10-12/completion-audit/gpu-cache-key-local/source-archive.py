#!/usr/bin/env python3
"""Archive exact pinned Pixi kernel inputs and patched outputs from the manifest."""
import hashlib
import io
import json
import tarfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
OUT = Path(__file__).resolve().parent
MANIFEST = ROOT / 'tools/dependencies/pixi-8.19-patch.json'
manifest = json.loads(MANIFEST.read_text())
selected = [t for t in manifest['targets'] if Path(t['path']).stem in ('GCManagedHash', 'AbstractRenderer')]
assert len(selected) == 4
rows = []
with tarfile.open(OUT / 'runtime-kernel-sources.tar.gz', 'w:gz') as archive:
    for target in selected:
        patched = (ROOT / 'node_modules/pixi.js' / target['path']).read_text()
        source = patched
        for replacement in reversed(target['replacements']):
            before, after = replacement['from'], replacement['to']
            if not after and before.startswith('//# sourceMappingURL='):
                source += before
            else:
                assert source.count(after) == 1, target['path']
                source = source.replace(after, before)
        for state, content, expected in [('original', source, target['originalSha256']),
                                         ('patched', patched, target['patchedSha256'])]:
            body = content.encode()
            actual = hashlib.sha256(body).hexdigest()
            assert actual == expected, (target['path'], state, actual, expected)
            name = f'{state}/{target["path"]}'
            info = tarfile.TarInfo(name)
            info.size = len(body)
            info.mtime = 0
            archive.addfile(info, io.BytesIO(body))
            rows.append({'path': target['path'], 'state': state, 'sha256': actual, 'bytes': len(body)})
    for relative in ['lib/rendering/renderers/shared/system/AbstractRenderer.d.ts',
                     'lib/utils/data/uid.js', 'lib/utils/data/uid.mjs',
                     'lib/rendering/renderers/shared/buffer/Buffer.js']:
        body = (ROOT / 'node_modules/pixi.js' / relative).read_bytes()
        info = tarfile.TarInfo('context/' + relative)
        info.size = len(body)
        info.mtime = 0
        archive.addfile(info, io.BytesIO(body))
        rows.append({'path': relative, 'state': 'context',
                     'sha256': hashlib.sha256(body).hexdigest(), 'bytes': len(body)})
report = {'manifestSha256': hashlib.sha256(MANIFEST.read_bytes()).hexdigest(),
          'manifestTargets': len(manifest['targets']), 'files': rows}
print(json.dumps(report, indent=2))
