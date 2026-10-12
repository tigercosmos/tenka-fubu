"""Verify native texture-cache evidence and exact source/image comparisons."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
summary = json.loads((root / 'summary.json').read_text())
def read(name):
    return gzip.decompress((root / name).read_bytes())
for row in summary['artifacts']:
    packed = (root / row['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == row['bytes']
    assert hashlib.sha256(packed).hexdigest() == row['sha256']
    assert len(raw) == row['rawBytes']
    assert hashlib.sha256(raw).hexdigest() == row['rawSha256']
for scope, names, count in [('baseline', ['source-before', 'source-final'], 1555), ('candidate', ['source-before', 'source-after-visual', 'source-after-original', 'source-final'], 1556)]:
    checkpoints = []
    for name in names:
        data = json.loads(read(scope + '__' + name + '.json.gz'))
        assert data['passed'] and data['sourceCount'] == count
        assert all(r['equal'] and r['expected'] == r['actual'] for r in data['rows'])
        checkpoints.append(data['rows'])
    assert all(data == checkpoints[0] for data in checkpoints)
    assert int(read(scope + '__visual.exit.gz')) == 1
    assert int(read(scope + '__art-gl.exit.gz')) == (0 if scope == 'baseline' else 1)
origin = json.loads(read('candidate__source-origin.json.gz'))
assert origin == summary['source'] and origin['base'] == 'd7c0337cf8b99d6e2fe982853066d533af3d7318'
assert len(origin['overlays']) == 3
source = {r['path']:r['actual'] for r in checkpoints[0]}
for row in origin['overlays']:
    assert source[row['path']] == row['candidateSha256']
assert sum(r['sourcePath'].endswith('.heapsnapshot') for r in summary['artifacts']) == 5
for kind, count in [('original', 21), ('diagnostic', 241)]:
    assert int(read('candidate__' + kind + '.exit.gz')) == 0
    row = next(r for r in summary['artifacts'] if r['scope'] == 'candidate' and r['sourcePath'].startswith(kind + '-results/') and r['sourcePath'].endswith('/remount-heap-samples.json'))
    samples = json.loads(read(row['path']))['usedHeapBytes']
    assert len(samples) == count == summary[kind]['sampleCount']
    assert samples[-1] - samples[0] == summary[kind]['delta']
    assert samples[-1] - samples[-20] == summary[kind]['last20SamplesDelta']
    if kind == 'diagnostic':
        assert samples[-1] - samples[120] == summary[kind]['second120Delta']
for item in summary['sameHostActualImageComparison']:
    rows = [next(r for r in summary['artifacts'] if r['scope'] == scope and r['sourcePath'].endswith('/strategy-' + item['view'] + '-actual.png')) for scope in ['baseline','candidate']]
    before, after = [read(r['path']) for r in rows]
    assert before == after and item['byteIdentical']
    assert hashlib.sha256(before).hexdigest() == item['baselineSha256'] == item['candidateSha256']
print('Native artifacts, six source checkpoints, overlays, five snapshots and three image pairs verified')

assert 'map renderer 尚未掛載' in read('candidate__art-gl.log.gz').decode()
gpu_row = next(r for r in summary['artifacts'] if r['scope'] == 'candidate' and r['sourcePath'].startswith('diagnostic-results/') and r['sourcePath'].endswith('/gpu-identity.json'))
gpu = json.loads(read(gpu_row['path']))
assert 'RTX 5070 Ti' in gpu['renderer'] and 'Vulkan' in gpu['renderer']
print('Candidate standalone GPU probe RED preserved; extended diagnostic actual-page GPU identity verified')
