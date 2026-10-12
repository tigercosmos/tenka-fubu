#!/usr/bin/env python3
"""Check immutable native evidence, without browser or external temp paths."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
raw = lambda name: gzip.decompress((root / (name + '.gz')).read_bytes())
load = lambda name: json.loads(raw(name + '.json'))

inventory = json.loads((root / 'artifact-inventory.json').read_text())
assert inventory == json.loads(raw('artifact-inventory.raw.json'))
for row in inventory:
    data = (root / row['path']).read_bytes()
    if not row['alreadyGzip']:
        data = gzip.decompress(data)
    assert len(data) == row['rawBytes'], row['path']
    assert hashlib.sha256(data).hexdigest() == row['rawSha256'], row['path']
summary = load('summary')
assert summary == json.loads((root / 'summary.json').read_text())
assert summary['source'] == '04c7b6083df32cc9c1a20d693ef45eddb806ed14'
results = load('native-results')
assert len(results) == 6 and all(row['status'] == 'passed' for row in results)
for row in results:
    for attachment in row['attachments']:
        data = raw(attachment['name'])
        assert len(data) == attachment['bytes']
        assert hashlib.sha256(data).hexdigest() == attachment['sha256']
assert raw('native-exit-code.txt').strip() == b'0'
assert load('failure-traces') == []
for phase in ['before-build', 'after-native']:
    proof = load('source-verification-' + phase)
    assert proof['checkedFiles'] == 3068 and not proof['mismatches']
    assert proof['commit'] == summary['source']
manifest = json.loads(raw('source-manifest.json'))
assert manifest['commit'] == summary['source']
assert len(manifest['files']) == 3068
expected_sources = {row['path']: row for row in manifest['files']}
for source in root.glob('source-*.gz'):
    if source.name == 'source-manifest.json.gz' or source.name.startswith('source-verification-'):
        continue
    path = source.name.removeprefix('source-').removesuffix('.gz').replace('__', '/')
    data = gzip.decompress(source.read_bytes())
    assert len(data) == expected_sources[path]['bytes'], path
    assert hashlib.sha256(data).hexdigest() == expected_sources[path]['sha256'], path
assert raw('archive-commit.txt').decode().strip() == summary['source']
for name in ['actual-tenka_engine.wasm', 'served-tenka_engine.wasm']:
    wasm = raw(name)
    assert len(wasm) == 63073
    assert hashlib.sha256(wasm).hexdigest() == '4baa718c94815b8943235e1b09856730e413d97a4beeb6f2bca06b8bf4d92eba'
runtime = load('runtime-dependency-proof')
assert len(runtime['patchRows']) == 23
assert all(row['sha256'] == row['expectedPatchedSha256'] for row in runtime['patchRows'])
assert runtime['wasm']['engineABI'] == runtime['wasm']['geographicABI'] == runtime['wasm']['castleABI'] == 1
first = load('worker-full-world-reference')
assert first['actual'] == first['reference']['state']
assert first['actualLog'] == first['reference']['log']
assert first['simulation']['wasmLoaded'] and first['simulation']['workerReady']
assert first['simulation']['generation'] == 3 and first['simulation']['pendingTicks'] == 0
assert any(row['kind'] == 'ready' and row['backend'] == 'rust-wasm' for row in first['traffic']['received'])
assert any(row['status'] == 200 for row in first['wasmResponses'])
for name, log in [('worker-pending-save-reload-reference', 'actualLog'), ('native-worker-cancel-generation-parity', 'log')]:
    record = load(name)
    assert record['actual'] == record['reference']['state']
    assert record[log] == record['reference']['log']
cancel = load('native-worker-cancel-generation-parity')['cancelled']
assert cancel['posted']['pendingTicks'] == 1
assert cancel['after']['generation'] > cancel['before']['generation']
assert cancel['after']['pendingTicks'] == cancel['after']['completedWorkerTicks'] == 0
assert cancel['after']['wasmLoaded'] and cancel['after']['workerReady']
for name, day in [('same-host-60-day-worker-responsiveness', 61), ('same-host-120-day-worker-responsiveness', 121), ('normal-x5-worker-paced-sync-responsiveness', 30)]:
    record = load(name)
    assert record['states'][0] == record['states'][1]
    assert record['logs'][0] == record['logs'][1]
    assert all(state['time']['day'] == day for state in record['states'])
    for row in record['rows']:
        assert all(not message.get('inconsistentThreatTotals', []) for message in row.get('traffic', {}).get('received', []))
normal = load('normal-x5-worker-paced-sync-responsiveness')
assert normal['rows'][0]['requestedDays'] == 60
assert all(row['completedDays'] == 29 for row in normal['rows'])
print('PASS: frozen 04, six native state/log parity cases, actual ready/ABI/HTTP, 3068 hashes; no FPS claim')
