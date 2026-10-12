#!/usr/bin/env python3
"""Verify every archived byte and the recorded castle ribbon packet census."""

import gzip
import hashlib
import json
import math
import statistics
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parent
assert hashlib.sha256((ROOT / 'manifest.json').read_bytes()).hexdigest() == (
    'c6fbbf24b74394ea0b0deecc41cf562abbb820421ad7e5d8c747af9639b12782'
)
items = json.loads((ROOT / 'manifest.json').read_text())['items']
assert len(items) == 99
paths = {item['file'] for item in items}
assert len(paths) == len(items)
assert paths == {str(path.relative_to(ROOT)) for path in (ROOT / 'raw').iterdir() if path.is_file()}
for item in items:
    compressed = (ROOT / item['file']).read_bytes()
    original = gzip.decompress(compressed)
    assert len(compressed) == item['gzipBytes'], item['file']
    assert len(original) == item['rawBytes'], item['file']
    assert hashlib.sha256(compressed).hexdigest() == item['gzipSha256'], item['file']
    assert hashlib.sha256(original).hexdigest() == item['rawSha256'], item['file']


def raw(name):
    path = ROOT / 'raw' / name
    assert str(path.relative_to(ROOT)) in paths, name
    return gzip.decompress(path.read_bytes())


def obj(name):
    return json.loads(raw(name))


before = obj('remote-copy__tenka-castle-axis-baseline-proof-955-c1__stdout-stderr.log.gz')
after = obj('remote-copy__tenka-castle-axis-final-proof-955-c1__stdout-stderr.log.gz')
assert before['revision'] == after['revision'] == (
    '9550e397568ff448689bc5904ec0651b04bfe717'
)
assert before['sourceCount'] == after['sourceCount'] == 1648
assert before['dependencyCount'] == after['dependencyCount'] == 29
assert before['bad'] == after['bad'] == []
assert before['dependencies'] == after['dependencies']
assert before['nodeModulesTarget'] == after['nodeModulesTarget']
assert after['overlay'] == {
    'src/ui/map/wasmCastleRibbonPlanner.ts':
        '83683d74cc2fa474478619927b48e26d3c1c7b4e79fcae63aa3e6e9ad14579f0',
    'e2e/castle-axis-packet.spec.ts':
        '8af3f4b4268e585fbe5181077c52484291784593f1dc7e832a5c31933c1aad25',
}
assert hashlib.sha256(raw('remote-copy__wasmCastleRibbonPlanner.ts.gz')).hexdigest() == (
    after['overlay']['src/ui/map/wasmCastleRibbonPlanner.ts']
)
assert hashlib.sha256(raw('remote-copy__castle-axis-packet.spec.ts.gz')).hexdigest() == (
    after['overlay']['e2e/castle-axis-packet.spec.ts']
)

for name, status in (
    ('remote-copy__tenka-castle-axis-build-955-c1__result.json.gz', 0),
    ('remote-copy__tenka-castle-axis-typecheck-955-c1__result.json.gz', 0),
    ('remote-copy__tenka-castle-axis-list-955-c1__result.json.gz', 0),
    ('remote-copy__tenka-castle-axis-native-955-c1__result.json.gz', 0),
    ('remote-copy__tenka-castle-axis-wasm-cost-955-c1__result.json.gz', 1),
    ('remote-copy__tenka-castle-axis-wasm-cost-955-c2__result.json.gz', 0),
):
    assert obj(name)['exitCode'] == status, name
assert b'Import #0 "env": module is not an object or function' in raw(
    'remote-copy__tenka-castle-axis-wasm-cost-955-c1__stdout-stderr.log.gz'
)
report = obj('remote-copy__tenka-castle-axis-native-955-c1__report.json.gz')
assert report['stats']['expected'] == 1
assert report['stats']['unexpected'] == report['stats']['skipped'] == 0
assert report['stats']['duration'] == 4212.327
result = report['suites'][0]['specs'][0]['tests'][0]['results'][0]
assert result['status'] == 'passed' and result['duration'] == 3503

packet_names = [name for name in paths if name.endswith('__castle-solver-full-packets.json.gz')]
assert len(packet_names) == 1
packet = raw(Path(packet_names[0]).name)
attachment_names = [name for name in paths if '__attachments__castle-solver-full-packets-' in name]
assert len(attachment_names) == 1
assert packet == raw(Path(attachment_names[0]).name)
assert len(packet) == 2321543
assert hashlib.sha256(packet).hexdigest() == (
    '288f9951c0f817dc11dd7c208bd2079fa5c1a5195b46b01a3119b400a56642dc'
)
full = json.loads(packet)
assert full['before'] == full['after']
assert full['preparation']['count'] == 120
assert 'NVIDIA GeForce RTX 5070 Ti' in full['environment']['renderer']
assert [row['camera'] for row in full['captures']] == ['overview', 'operational', 'close']


def f64(hex_bits):
    return struct.unpack('<d', struct.pack('<Q', int(hex_bits, 16)))[0]


counts = {
    'overview': (0, 166, 0, 0, 0, 0),
    'operational': (29, 237, 28, 7685, 913, 1642),
    'close': (64, 168, 63, 14784, 1451, 2001),
}
census_lines = raw('local-capture__tenka-castle-axis-census-955-c1__stdout-stderr.log.gz')
recorded_census = {row['camera']: row for row in map(json.loads, census_lines.splitlines())}
assert set(recorded_census) == set(counts)
for capture in full['captures']:
    camera = capture['camera']
    encoded = capture['packet']
    words = [f64(value) for value in encoded['inputHex']]
    output = [f64(value) for value in encoded['outputHex']]
    candidates, fixed_count, hard_count, leader_count = map(int, words[1:5])
    assert len(words) == encoded['inputWords'] == 16 + candidates * 8 + (
        fixed_count + hard_count + leader_count) * 4
    assert len(output) == encoded['outputWords'] == candidates * 16
    assert encoded['status'] == candidates
    expected_candidates, expected_fixed, dynamic, scans, x_endpoints, y_endpoints = counts[camera]
    assert candidates == expected_candidates and fixed_count == expected_fixed
    assert recorded_census[camera]['candidateCount'] == candidates
    assert recorded_census[camera]['ordinaryCount'] == fixed_count
    assert recorded_census[camera]['hardCount'] == hard_count
    assert recorded_census[camera]['leaderCount'] == leader_count
    assert recorded_census[camera]['work'] == f64(encoded['workHex'])
    assert all(math.isfinite(value) for value in words + output)
    baseline = [tuple(words[16 + i * 8:20 + i * 8]) for i in range(candidates)]
    start = 16 + candidates * 8
    fixed = [tuple(words[start + i * 4:start + i * 4 + 4]) for i in range(fixed_count)]
    placed = [tuple(output[i * 16 + 2:i * 16 + 6]) for i in range(candidates)]
    observed_scans = observed_x = observed_y = 0
    for index, rect in enumerate(baseline):
        reserved = fixed + placed[:index] + baseline[index + 1:]
        assert len(reserved) == fixed_count + dynamic
        observed_scans += len(reserved)
        for other in reserved:
            for vertical in (False, True):
                axis = 1 if vertical else 0
                extent = axis + 2
                left = ((other[axis] - rect[axis]) - rect[extent]) - 4.0
                right = ((other[axis] + other[extent]) + 4.0) - rect[axis]
                hits = int(math.isfinite(left) and abs(left) <= 48.0) + int(
                    math.isfinite(right) and abs(right) <= 48.0)
                if vertical:
                    observed_y += hits
                else:
                    observed_x += hits
    assert (observed_scans, observed_x, observed_y) == (scans, x_endpoints, y_endpoints)
    assert recorded_census[camera]['sum'].get('reserved', 0) == scans
    assert recorded_census[camera]['sum'].get('xEndpoints', 0) == x_endpoints
    assert recorded_census[camera]['sum'].get('yEndpoints', 0) == y_endpoints

cost = obj('remote-copy__tenka-castle-axis-wasm-cost-955-c2__stdout-stderr.log.gz')
assert cost['scope'].startswith('offline Node WASM full-solver cost')
assert cost['wasmSha256'] == 'e22f559b4b9d6f6348709e028cecdbc2c6f567db2483fa845b48df0554d7bc7d'
assert [row['camera'] for row in cost['results']] == ['overview', 'operational', 'close']
for row, expected in zip(cost['results'], (0.00388898, 1.65785906, 2.82865870)):
    assert len(row['batchesMs']) == 5
    assert row['medianMs'] == statistics.median(row['batchesMs'])
    assert abs(row['medianMs'] - expected) < 1e-8
source = raw('producer__tenka-castle-axis-wasm-cost.mjs.gz').decode()
assert 'i < 50' in source and 'batch < 5' in source and 'i < 100' in source
assert 'output.equals(expected)' in source
print('PASS: 99 original artifacts, source/deps, native result, bit packets, axis census, offline cost and RED')
