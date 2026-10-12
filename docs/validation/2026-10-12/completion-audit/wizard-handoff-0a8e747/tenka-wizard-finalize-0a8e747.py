"""Preserve compact review captures and append immutable diagnostic evidence."""
from pathlib import Path
import gzip
import hashlib
import json
import subprocess
import sys

repo = Path('/Users/tigercosmos/tenka-fubu')
base = repo / 'docs/validation/2026-10-12/completion-audit'
package = base / 'wizard-handoff-0a8e747'

def copy_capture(source, name):
    for path in sorted(source.rglob('*')):
        if path.is_file():
            target = package / 'raw' / name / (str(path.relative_to(source)) + '.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                stream.write(gzip.compress(path.read_bytes(), mtime=0))

if sys.argv[1] == 'prepare':
    package.mkdir(exist_ok=False)
    roots = {
        'root-responsive-endpoints': '/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-responsive-check-pykugz4p',
        'root-responsive-45': '/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-45-verification-4lwjekis',
        'root-wizard-ab': '/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-wizard-integration-enxwjfdx',
        'root-wizard-correction': '/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-wizard-correction-8uxp_4xi',
        'root-representative': '/var/folders/s6/przk1x9n5vv7v6m8lbg0z3940000gn/T/tenka-root-representative-6kdnbxgy',
    }
    for name, source in roots.items():
        copy_capture(Path(source), name)
    with (package / 'tenka-wizard-finalize-0a8e747.py').open('xb') as stream:
        stream.write(Path(__file__).read_bytes())
    with (package / 'tenka-validation-capture-961f0ae.py').open('xb') as stream:
        stream.write(Path('/tmp/tenka-validation-capture-961f0ae.py').read_bytes())
    (package / 'README.md').write_text("""# Four-step wizard continuation handoff

This package retains independent root reviews and final documentation checks for the four-step wizard, its font/card corrections, responsive panel acceptance, and representative existing boot flows. The adjacent packages retain exact original failures and separate source pins. Full unit results belong to ab06242; corrected assets/CSS to 01c7dbc; the final catalog-backed native test to 0a8e747. None is relabeled as a passing complete project gate.

The updater verifies all 3,912 historical rows and bytes against the committed da142d1 inventory before appending the seven new package directories. Running captures are never included in their own stable inventory. Bulk native artifacts remain at explicit remote paths with hashes; only compact reports and selected images are copied here.

The initial responsive observer overlays were overwritten on the isolated host, as disclosed in that package; retained reports contain failing snippets but cannot prove complete overlay bytes. Later wizard and final matrix overlays use immutable unique paths. No blanket claim that every setup artifact was retained is made. Full native 300 seconds, strict 60 FPS, whole-heap, long-run, the remaining M6-M9 scope, gameplay decisions and protected-art approval remain open. No rules, baselines, time limits or milestone were changed; nothing was pushed or deployed.
""")
    print(json.dumps({'package': str(package), 'prepared': True}))
elif sys.argv[1] == 'index':
    for name in ['tenka-wizard-doc-format-final-c1', 'tenka-wizard-doc-check-final-c1']:
        copy_capture(Path('/tmp') / name, name)
    relative = 'docs/validation/2026-10-12/completion-audit/continuation-artifact-sha256.json'
    control = Path('/tmp/tenka-wizard-index-control-0a-c1')
    control.mkdir(exist_ok=False)
    command = ['git', 'show', 'da142d1:' + relative]
    (control / 'command.json').write_text(json.dumps(command) + '\n')
    with (control / 'stdout.log').open('xb') as out, (control / 'stderr.log').open('xb') as err:
        result = subprocess.run(command, cwd=repo, stdout=out, stderr=err)
    (control / 'result.json').write_text(json.dumps({'exitCode': result.returncode}) + '\n')
    result.check_returncode()
    historical = json.loads((control / 'stdout.log').read_text())
    current = json.loads((repo / relative).read_text())
    assert current == historical and len(current['artifacts']) == 3912
    for row in current['artifacts']:
        path = base / row['path']
        assert path.stat().st_size == row['bytes'], row['path']
        with path.open('rb') as stream:
            assert hashlib.file_digest(stream, 'sha256').hexdigest() == row['sha256'], row['path']
    new = []
    names = ['responsive-panels-da142d1', 'responsive-panels-ab06242', 'representative-flows-01c7dbc', 'wizard-integrated-ab06242', 'wizard-correction-01c7dbc', 'new-game-wizard-final', 'wizard-handoff-0a8e747']
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
    assert len({row['path'] for row in current['artifacts'] + new}) == 3912 + len(new)
    current['artifacts'].extend(new)
    assert current['artifacts'][:3912] == historical['artifacts']
    (repo / relative).write_text(json.dumps(current, indent=2, ensure_ascii=False) + '\n')
    print(json.dumps({'historicalRows': 3912, 'newRows': len(new), 'totalRows': len(current['artifacts']), 'historicalRowsAndBytesUnchanged': True}))
else:
    raise SystemExit('unknown mode')
