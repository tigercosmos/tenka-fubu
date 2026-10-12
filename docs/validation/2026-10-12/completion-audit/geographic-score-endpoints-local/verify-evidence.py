#!/usr/bin/env python3
"""Check complete scratch evidence without running its tests or compiler."""
import gzip
import hashlib
import json
from pathlib import Path
import re


def sha(data):
    return hashlib.sha256(data).hexdigest()


base = Path(__file__).resolve().parent
m = json.loads((base / 'manifest.json').read_text())
blobs = {}
for row in m['files']:
    packed = (base / row['path']).read_bytes()
    assert len(packed) == row['bytes'] and sha(packed) == row['sha256'], row['path']
    raw = gzip.decompress(packed)
    assert len(raw) == row['rawBytes'] and sha(raw) == row['rawSHA256'], row['path']
    blobs[Path(row['path']).name[:-3]] = raw
for name, key in [('baseline.wasm', 'baseline'), ('candidate.wasm', 'candidate')]:
    assert len(blobs[name]) == m[key]['bytes'] and sha(blobs[name]) == m[key]['sha256']
assert blobs['baseline.wasm'] == blobs['frozen.wasm']
assert m['candidateBinaryGrowthBytes'] == len(blobs['candidate.wasm']) - len(blobs['baseline.wasm'])
shared = blobs['candidate-rust__engine__src__geographic.rs']
assert sha(shared) == m['sharedGeographicBeforeSHA256'] == m['sharedGeographicAfterSHA256']
candidate_source = blobs['candidate-rust__engine__src__geographic_preparation.rs']
candidate_tests = blobs['candidate-rust__engine__src__geographic_preparation_tests.rs']
manifest = json.loads(blobs['candidate-manifest-permanent.json'])
assert manifest['wasmSha256'] == m['candidate']['sha256']
assert manifest['sourceFiles']['rust/engine/src/geographic_preparation.rs'] == sha(candidate_source)
assert manifest['sourceFiles']['rust/engine/src/geographic_preparation_tests.rs'] == sha(candidate_tests)
assert manifest['sourceFiles']['rust/engine/src/geographic.rs'] == sha(shared)
assert b'super::overlap_candidate' in candidate_tests
assert b'crate::geographic::overlap' in candidate_tests
assert b'fn overlap_candidate' not in candidate_tests
assert re.search(rb'test result: ok\. 24 passed; 0 failed', blobs['permanent24-tests-final.log'])
assert b'ACTUAL_HELPER_PARITY_GRID_CASES=1169294; TOUCHING_ULP_EPSILON_CASES=40' in blobs['permanent24-tests-final.log']
assert re.search(rb'test result: ok\. 23 passed; 0 failed', blobs['original23-tests.log'])
assert b'error[E0689]' in blobs['permanent24-tests-first-red.log']
raw = json.loads(blobs['compiled-parity.raw.json'])
assert len(blobs['compiled-parity.raw.json']) == 10986065
assert len(raw['observations']) == raw['summary']['cases'] == 1925
assert raw['summary']['baseline'] == m['baseline']['sha256']
assert raw['summary']['candidate'] == m['candidate']['sha256']
assert raw['summary']['allEqual'] is True
assert len([r for r in raw['observations'] if 'derivedFirstX' in r]) == 5
for observation in raw['observations']:
    result = observation['result']
    assert len(result['before']) == len(result['after']) == result['n']
    for field in ['frame', 'road']:
        assert all(v == 'NaN' or re.fullmatch('[0-9a-f]{16}', v) for v in observation[field])
print(f'PASS: {len(blobs)} full dual-SHA raw files; exact binaries/source binding; '
      '24 actual Rust tests + 1169294/40 controls + 1925 recorded ABI cases')
print('No compiler, test runner, WASM execution, browser, or timing executed.')
