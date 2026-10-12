#!/usr/bin/env python3
"""Verify the compact original close failure and separate CPU profile evidence."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
items = {}
for item in manifest['items']:
    compressed = (root / item['file']).read_bytes()
    assert len(compressed) == item['gzipBytes']
    assert hashlib.sha256(compressed).hexdigest() == item['gzipSha256']
    raw = gzip.decompress(compressed)
    assert len(raw) == item['rawBytes']
    assert hashlib.sha256(raw).hexdigest() == item['rawSha256']
    items[item['source']] = raw

def data(label):
    return json.loads(items['remote-copy/' + label])

before = json.loads(items['remote-copy/sourceproof/before/stdout-stderr.log'])
after = json.loads(items['remote-copy/sourceproof/after/stdout-stderr.log'])
for proof in (before, after):
    assert proof['revision'] == '9550e397568ff448689bc5904ec0651b04bfe717'
    assert proof['sourceCount'] == 1648 and proof['dependencyCount'] == 29
    assert proof['bad'] == [] and proof['overlay'] == {}
assert before['dependencies'] == after['dependencies']
assert data('original/result.json')['exitCode'] == 1
assert data('profile/result.json')['exitCode'] == 0
assert data('tenka-castle-clean-list-955-c3/result.json')['exitCode'] == 0
listed = items['remote-copy/tenka-castle-clean-list-955-c3/stdout-stderr.log'].decode()
assert 'Total: 1 test in 1 file' in listed
original = data('original/national-close-frames.json')
assert 'RTX 5070 Ti' in original['environment']['renderer']
assert 'Vulkan' in original['environment']['renderer']
m = original['measurement']
assert m['armyCount'] == 120 and m['durationMs'] >= 30_000
assert m['averageFps'] == 33.23673940610271 and m['averageFps'] < 60
assert m['minMountedArmies'] == 120
assert 'Expected: >= 60' in items['remote-copy/original/stdout-stderr.log'].decode()
profile = data('profile/summary.json')
assert profile['equal'] == {'state': True, 'commands': True, 'resources': True}
assert profile['driver']['ticks'] == 0
assert 'RTX 5070 Ti' in profile['gpuBefore']['renderer']
assert profile['gpuBefore']['renderer'] == profile['gpuAfter']['renderer']
assert profile['measurement']['armyCount'] == 120
assert profile['measurement']['durationMs'] >= 10_000
assert profile['profile']['samples'] > 0
attribution = data('profile/source-parent-attribution.json')
assert attribution['samples'] == profile['profile']['samples']
assert attribution['totalUs'] > 10_000_000
assert any('flushScreenLayouts' in key for key in attribution['parentChildren'])
assert manifest['remoteTrace']['sha256'] == '6481796e2a62a30f2e61dc24dbbfd6ffc783e90a495356cbe334ad61ab189236'
print(json.dumps({'verifiedItems': len(items), 'source': before['revision'], 'originalFps': m['averageFps'], 'profileFps': profile['measurement']['averageFps'], 'profileSamples': profile['profile']['samples']}))
