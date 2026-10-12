#!/usr/bin/env python3
"""Exercise the 25-target installed state against the 29-target installer."""
import hashlib
import json
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
CURRENT = json.loads((ROOT / 'tools/dependencies/pixi-8.19-patch.json').read_text())
BASE = json.loads(subprocess.check_output(
    ['git', 'show', 'd7c0337:tools/dependencies/pixi-8.19-patch.json'], cwd=ROOT))
assert len(BASE['targets']) == 25 and len(CURRENT['targets']) == 29
sha = lambda body: hashlib.sha256(body).hexdigest()
base_targets = {target['path']: target for target in BASE['targets']}
with tempfile.TemporaryDirectory(prefix='tenka-pixi-25-to-29-') as directory:
    fixture = Path(directory)
    (fixture / 'package.json').write_text('{"version":"8.19.0"}')
    for target in CURRENT['targets']:
        relative = target['path']
        installed = (ROOT / 'node_modules/pixi.js' / relative).read_text()
        assert sha(installed.encode()) == target['patchedSha256'], relative
        if relative in base_targets:
            assert target['patchedSha256'] == base_targets[relative]['patchedSha256'], relative
            body = installed
        else:
            body = installed
            for replacement in reversed(target['replacements']):
                before, after = replacement['from'], replacement['to']
                if not after and before.startswith('//# sourceMappingURL='):
                    body += before
                else:
                    assert body.count(after) == 1, relative
                    body = body.replace(after, before)
            assert sha(body.encode()) == target['originalSha256'], relative
        path = fixture / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body)
    script = 'import { applyPixiPatch } from ' + json.dumps((ROOT / 'tools/dependencies/pixi-8.19-patch.mjs').as_uri()) + '; console.log(JSON.stringify(applyPixiPatch(process.argv[1])));'
    first = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, str(fixture)], cwd=ROOT))
    second = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', script, str(fixture)], cwd=ROOT))
    assert first == {'version': '8.19.0', 'validated': 29, 'written': 4}
    assert second == {'version': '8.19.0', 'validated': 29, 'written': 0}
    print(json.dumps({'baselineCommit': 'd7c0337', 'baselineTargets': 25,
                      'candidateTargets': 29, 'firstInstall': first, 'repeatInstall': second}, indent=2))
