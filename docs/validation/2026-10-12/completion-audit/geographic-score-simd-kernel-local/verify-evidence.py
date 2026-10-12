#!/usr/bin/env python3
"""Verify complete SIMD prototype evidence, without executing the prototype."""
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
    assert len(packed) == row['bytes'] and sha(packed) == row['sha256']
    raw = gzip.decompress(packed)
    assert len(raw) == row['rawBytes'] and sha(raw) == row['rawSHA256']
    blobs[Path(row['path']).name[:-3]] = raw
for name, key in [('baseline.wasm', 'baseline'), ('prototype.wasm', 'prototype')]:
    assert len(blobs[name]) == m[key]['bytes'] and sha(blobs[name]) == m[key]['sha256']
assert blobs['baseline.wasm'] == blobs['frozen.wasm']
source = blobs['source-rust__engine__src__geographic_preparation.rs'].decode()
baseline = blobs['baseline-geographic-preparation.rs'].decode()
assert baseline[:baseline.index('/// Reuse prepared')] == source[:source.index('/// Prepared-only strict')]
assert '#[target_feature(enable = "simd128")]' in source
assert 'unsafe { overlap_prepared(a, b, padding) }' in source
assert 'f64x2_extract_lane::<0>(size) * f64x2_extract_lane::<1>(size)' in source
score = source[source.index('pub(crate) fn score_prepared'):]
assert 'prepared_overlap(' in score and not re.search(r'\boverlap\(', score)
shared = blobs['source-rust__engine__src__geographic.rs']
assert sha(shared) == m['sourceProof']['legacyGeographicBeforeSHA256'] == m['sourceProof']['legacyGeographicAfterSHA256']
artifact = json.loads(blobs['prototype-manifest.json'])
assert artifact['wasmSha256'] == m['prototype']['sha256']
assert artifact['sourceFiles']['rust/engine/src/geographic_preparation.rs'] == sha(source.encode())
assert artifact['sourceFiles']['rust/engine/src/geographic.rs'] == sha(shared)
raw = json.loads(blobs['simd-parity.raw.json'])
assert len(blobs['simd-parity.raw.json']) == 11412888
rows = raw['observations']
assert len(rows) == raw['summary']['cases'] == 2121
assert raw['summary']['allEqual'] is True
assert sum('derivedFirstX' in row for row in rows) == 5
assert sum(row.get('validExtreme', False) for row in rows) == 196
assert sum('scene' in row for row in rows) == 1920
for row in rows:
    result = row['result']
    assert len(result['before']) == len(result['after']) == result['n']
negative = json.loads(blobs['malformed-and-abi.raw.json'])
assert negative['validatedBoth'] is True
assert set(negative['baselineVersions'].values()) == set(negative['prototypeVersions'].values()) == {1}
assert len(negative['cases']) == 24
for row in negative['cases']:
    result = row['result']
    assert result['result'] == -2 and result['before'] == result['after']
ops = json.loads(blobs['simd-instructions.json'])
asm = blobs['prototype-disassembly.txt'].decode()
for name, count in ops.items():
    assert len(re.findall(r'\b' + re.escape(name) + r'\b', asm)) == count
assert ops['f64x2.min'] == 1 and ops['f64x2.max'] == 2
assert not any(count for name, count in ops.items() if 'relaxed' in name or '.pmin' in name or '.pmax' in name)
assert b'test result: ok. 23 passed; 0 failed' in blobs['native-scalar-reference-tests.log']
print(f'PASS: {len(blobs)} full dual-SHA raws, exact SIMD source binding, '
      '2121 compiled cases, 24 atomic negatives, actual strict SIMD disassembly')
print('Native23 remains scalar-only; no execution, browser, performance, or adoption proof.')
