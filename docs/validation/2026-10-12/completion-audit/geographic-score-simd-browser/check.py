#!/usr/bin/env python3
"""Verify retained bytes and bounded browser-probe claims; does not rerun a browser."""
from pathlib import Path
import gzip, hashlib, json
base = Path(__file__).resolve().parent
manifest = json.loads((base / 'manifest.json').read_text())
for row in manifest['payloads']:
    packed = (base / row['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == row['gzipBytes']
    assert hashlib.sha256(packed).hexdigest() == row['gzipSha256']
    assert len(raw) == row['bytes']
    assert hashlib.sha256(raw).hexdigest() == row['sha256']
def load(name):
    return json.loads(gzip.decompress((base / 'raw' / (name + '.gz')).read_bytes()))
for name in ['result-default-headless.json', 'result.json']:
    record = load(name)
    result = record['result']
    assert record['probe']['bytes'] == manifest['probeBytes']
    assert record['probe']['sha256'] == manifest['probeSha256']
    assert result['validate'] and result['allEqual']
    assert result['rows'] == 224 and result['cases'] == 100352
    assert result['nans'] + result['finite'] + result['infinite'] == result['cases']
    assert len(result['controls']) == 4 and len(result['explicit']) == 5
    for item in result['controls'] + result['explicit']:
        if not item['nan']:
            assert item['expected'] == item['scalar'] == item['simd']
    installed = {x['name']: x['exists'] for x in record['installed']}
    assert installed == {'chromium': True, 'firefox': False, 'webkit': False}
assert hashlib.sha256(gzip.decompress((base / 'raw' / 'probe.wasm.gz').read_bytes())).hexdigest() == manifest['probeSha256']
explicit = load('result.json')
assert '/chromium-1228/' in explicit['launchExecutable']
assert explicit['browserVersion']['product'] == 'Chrome/149.0.7827.55'
print(f"PASS: {len(manifest['payloads'])} exact gzip/raw payload pairs; two browser summaries, no missing full-row claim")
