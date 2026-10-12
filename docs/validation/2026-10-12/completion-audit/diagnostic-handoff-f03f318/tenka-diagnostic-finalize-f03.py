"""Preserve compact review captures and append immutable diagnostic evidence."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import sys

repo = Path('/Users/tigercosmos/tenka-fubu')
base = repo / 'docs/validation/2026-10-12/completion-audit'
package = base / 'diagnostic-handoff-f03f318'

def copy_capture(source, name):
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))

if sys.argv[1] == 'prepare':
    package.mkdir(exist_ok=False)
    copy_capture(Path('/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-compact-verification-fkqm3c9g'), 'root-independent-compact-verification')
    with (package / 'tenka-diagnostic-finalize-f03.py').open('xb') as stream:
        stream.write(Path(__file__).read_bytes())
    with (package / 'tenka-validation-capture-961f0ae.py').open('xb') as stream:
        stream.write(Path('/tmp/tenka-validation-capture-961f0ae.py').read_bytes())
    (package / 'README.md').write_text('''# Diagnostic-only continuation handoff

This package preserves the independent root verification of the color-layer and trace-relocation packages, plus final documentation checks. The adjacent native-critical-path package records an unsuccessful cost experiment. No production or E2E change was adopted from this continuation, and no new full-suite or speedup result is claimed.

The index updater verifies all 3,811 historical rows and their bytes against the committed `f03f318` index before appending the four new package directories. It never rewrites historical entries. Its own execution output is external because a running capture cannot be included in its own stable hash inventory.

The retained relocation manifest is the authority for the new remote trace path; the old local path no longer exists. Root verification checks local proof, not indefinite remote availability. Existing game-rule, artwork, full-native, strict 60 FPS, heap, long-run, and remaining M6–M9 gates remain open.
''')
    print(json.dumps({'package': str(package), 'prepared': True}))
elif sys.argv[1] == 'index':
    for name in ['tenka-diagnostic-final-prepare-f03-c1', 'tenka-diagnostic-final-format-f03-c1', 'tenka-diagnostic-final-check-f03-c1', 'tenka-f03-package-verifier-final-c1', 'tenka-f03-package-format-check-final-c1']:
        copy_capture(Path('/tmp') / name, name)
    relative = 'docs/validation/2026-10-12/completion-audit/continuation-artifact-sha256.json'
    control = Path('/tmp/tenka-diagnostic-index-control-f03-c1')
    control.mkdir(exist_ok=False)
    command = ['git', 'show', 'f03f318:' + relative]
    (control / 'command.json').write_text(json.dumps(command) + '\n')
    with (control / 'stdout.log').open('xb') as out, (control / 'stderr.log').open('xb') as err:
        result = subprocess.run(command, cwd=repo, stdout=out, stderr=err)
    (control / 'result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
    result.check_returncode()
    historical = json.loads((control / 'stdout.log').read_text())
    current = json.loads((repo / relative).read_text())
    assert current == historical and len(current['artifacts']) == 3811
    for row in current['artifacts']:
        path = base / row['path']
        assert path.stat().st_size == row['bytes'], row['path']
        with path.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['path']
    new = []
    names = ['color-layer-observation-f03f318', 'national-traces-relocation-f03f318', 'native-critical-path-f03f318', 'diagnostic-handoff-f03f318']
    for name in names:
        for path in sorted((base / name).rglob('*')):
            if not path.is_file():
                continue
            raw = path.read_bytes()
            row = {'path': str(path.relative_to(base)), 'bytes': len(raw), 'sha256': hashlib.sha256(raw).hexdigest()}
            if path.suffix == '.gz':
                digest = hashlib.sha256()
                size = 0
                with gzip.open(path, 'rb') as stream:
                    while block := stream.read(8 * 1024 * 1024):
                        digest.update(block)
                        size += len(block)
                row.update(uncompressedBytes=size, uncompressedSha256=digest.hexdigest())
            new.append(row)
    assert len({row['path'] for row in current['artifacts'] + new}) == 3811 + len(new)
    current['artifacts'].extend(new)
    assert current['artifacts'][:3811] == historical['artifacts']
    (repo / relative).write_text(json.dumps(current, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'historicalRows': 3811, 'newRows': len(new), 'totalRows': len(current['artifacts']), 'historicalRowsAndBytesUnchanged': True}))
else:
    raise SystemExit('unknown mode')
