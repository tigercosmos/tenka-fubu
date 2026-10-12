#!/usr/bin/env python3
"""Verify retained regional generator JS/WASM control evidence."""
import gzip
import hashlib
import json
import re
import tarfile
from pathlib import Path

pack = Path(__file__).resolve().parent
manifest = json.loads((pack / 'manifest.json').read_text())
for name, item in manifest.items():
    data = (pack / name).read_bytes()
    assert len(data) == item['size'], name
    assert hashlib.sha256(data).hexdigest() == item['sha256'], name
assert {p.relative_to(pack).as_posix() for p in (pack / 'raw').iterdir()} == set(manifest)

with tarfile.open(pack / 'raw/remote-captures.tar.gz', 'r:gz') as archive:
    def read(name):
        file = archive.extractfile(name)
        assert file is not None, name
        return file.read()

    for prefix, overlay in (
        ('tenka-earned-wasm-control-proof-remote-27d-c2', '121522007e1be411a7c71a952c0f95ce7395ac4eff8905326a47e6a3a90a1a08'),
        ('tenka-earned-wasm-control-after-remote-27d-c2', '121522007e1be411a7c71a952c0f95ce7395ac4eff8905326a47e6a3a90a1a08'),
        ('tenka-earned-wasm-c4-before-corrected-remote-27d-c4', '384a591afe6d40c8a40f0a09818f700ab59cbc1e7e2b2505f1961a8196f1d1d0'),
        ('tenka-earned-wasm-c4-after-remote-27d-c4', '384a591afe6d40c8a40f0a09818f700ab59cbc1e7e2b2505f1961a8196f1d1d0'),
    ):
        result = json.loads(read(prefix + '/stdout-stderr.log'))
        assert result['passed'] and result['revision'] == '27d9028f01e38e67cfb0adf65b933ffd44485930'
        assert result['entries'] == 1650
        assert result['overlay']['tests/app/earnedRegionalEndingJourney.spec.tsx'] == overlay
        assert len(result['dependencies']) == 29
        assert all(x['actual'] == x['expected'] for x in result['dependencies'])
        assert result['wasmSha256'] == 'e22f559b4b9d6f6348709e028cecdbc2c6f567db2483fa845b48df0554d7bc7d'
        assert json.loads(read(prefix + '/result.json'))['exitCode'] == 0
    assert json.loads(read('tenka-earned-wasm-c4-types-remote-27d-c4/result.json'))['exitCode'] == 0
    assert json.loads(read('tenka-earned-wasm-c4-before-remote-27d-c4/result.json'))['exitCode'] == 1
    cases = {}
    for label, directory, status, ms in (
        ('js', 'tenka-earned-wasm-js-27d-c2', 0, 1620),
        ('bad_url', 'tenka-earned-wasm-candidate-27d-c2', 1, None),
        ('missing_import', 'tenka-earned-wasm-c3-27d-c3', 1, None),
        ('wasm', 'tenka-earned-wasm-c4-27d-c4', 0, 1604),
    ):
        assert json.loads(read(directory + '/result.json'))['exitCode'] == status
        log = read(directory + '/stdout-stderr.log').decode()
        if ms is not None:
            assert re.search(rf'{ms}\x1b\[2mm?s', log) or f'{ms}ms' in log
            match = re.search(r'EARNED_ROUTE_WITNESS (\{[^\n]+\})', log)
            assert match, label
            cases[label] = json.loads(match.group(1))
        elif label == 'bad_url':
            assert 'The URL must be of scheme file' in log
        else:
            assert 'resolve is not defined' in log
    left, right = cases['js'], cases['wasm']
    for key in ('day', 'fullStateHash', 'completeJsonStateHash', 'encodedSaveHash', 'rngHash', 'historyHash', 'commandsHash', 'historyDays', 'commands'):
        assert left[key] == right[key], key
    assert left['day'] == right['day'] == 373
    assert left['historyDays'] == right['historyDays'] == 373
    assert left['commands'] == right['commands'] == 84
    assert left['rustQueries'] == 0 and right['rustQueries'] == 4202
    assert right['topologyBuilds'] == 16
    assert left['readyAfter'] is False and right['readyAfter'] is False
    js_save = read('tenka-earned-wasm-js-27d-c2/earned-regional-ending.tfusave')
    wasm_save = read('tenka-earned-wasm-c4-27d-c4/earned-regional-ending.tfusave')
    assert js_save == wasm_save and len(js_save) == 155056
    assert hashlib.sha256(js_save).hexdigest() == '6fb93a190a467c5184580c45c2df1aadcf67b3d1b4bd447dc91a30ed001d9d39'

for name, expected in (
    ('control-27d-c2', '121522007e1be411a7c71a952c0f95ce7395ac4eff8905326a47e6a3a90a1a08'),
    ('candidate-27d-c2', 'c09f10a5df0ae3a41fbc9ee08e76c7d42155f2e4999e70c60c15b8ae988b003a'),
    ('candidate-27d-c3', '2b7a63da6e1c66b42855b574051064b6d047d4424a96345fb40ea1ea444f9286'),
    ('candidate-27d-c4', '384a591afe6d40c8a40f0a09818f700ab59cbc1e7e2b2505f1961a8196f1d1d0'),
):
    raw = gzip.decompress((pack / f'raw/{name}.spec.tsx.gz').read_bytes())
    assert hashlib.sha256(raw).hexdigest() == expected, name
print('PASS: raw hashes, source/dependency proofs, two retained setup REDs, original 5s case PASS pair, full lossless witness and save equality')
