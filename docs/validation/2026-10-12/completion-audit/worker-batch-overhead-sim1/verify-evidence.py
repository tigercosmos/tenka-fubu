#!/usr/bin/env python3
"""Verify frozen profiler/transport/native-state evidence; no timing or GPU run."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
raw = lambda name: gzip.decompress((root / name).read_bytes())
load = lambda name: json.loads(raw(name))
inventory = json.loads((root / 'artifact-inventory.json').read_text())
assert inventory == load('artifact-inventory.raw.json.gz')
for row in inventory:
    packed = (root / row['path']).read_bytes()
    unpacked = gzip.decompress(packed)
    assert len(packed) == row['gzipBytes'], row['path']
    assert hashlib.sha256(packed).hexdigest() == row['gzipSha256'], row['path']
    assert len(unpacked) == row['rawBytes'], row['path']
    assert hashlib.sha256(unpacked).hexdigest() == row['rawSha256'], row['path']
scopes = load('scopes.raw.json.gz')
assert scopes == json.loads((root / 'scopes.json').read_text())
assert scopes['defaultProfile']['actual120Captures'] == 1
assert scopes['hardwareSetup0']['actual120Captures'] == scopes['hardwareAttempt1']['actual120Captures'] == 0
assert raw('default-exit-code.txt.gz').strip() == b'0'
assert raw('hardware-setup0-exit-code.txt.gz').strip() == raw('hardware-attempt1-exit-code.txt.gz').strip() == b'1'
assert not (root / 'hardware-attempt1-main-cpu-profile.json.gz').exists()
manifest = json.loads(gzip.decompress(raw('source-manifest.json.gz.gz')))
assert manifest['commit'] == scopes['frozenSource'] and len(manifest['files']) == 3068
for phase in ['before-profile', 'after-profile', 'before-hardware-profile', 'after-hardware-profile', 'after-linux-build']:
    check = load('source-verification-' + phase + '.json.gz')
    assert check['commit'] == scopes['frozenSource']
    assert check['checkedFiles'] == 3068 and not check['mismatches']
expected = {row['path']: row for row in manifest['files']}
for f in root.glob('source-*.gz'):
    if '__' not in f.name and f.name not in ['source-playwright.config.ts.gz']:
        continue
    path = f.name.removeprefix('source-').removesuffix('.gz').replace('__', '/')
    assert hashlib.sha256(gzip.decompress(f.read_bytes())).hexdigest() == expected[path]['sha256']
obs = load('default-observation.json.gz')
assert obs['warmInitial'] == obs['warmReference']['state']
assert obs['warmLog'] == obs['warmReference']['log']
assert obs['actual'] == obs['reference']['state']
assert obs['actualLog'] == obs['reference']['log']
assert obs['warmInitial']['time']['day'] == 1 and obs['actual']['time']['day'] == 121
m = obs['measurement']
assert m['completedDays'] == 120 and m['stepMs'] == 13296 and m['idleMs'] == 0
assert obs['before']['simulation']['generation'] == obs['after']['simulation']['generation'] == 3
traffic = obs['after']['traffic']
sent = {r['requestId']: r for r in traffic['sent'] if r['kind'] == 'tick' and r['beforeStateVersion'] >= 1}
received = [r for r in traffic['received'] if r['kind'] == 'complete' and r['beforeStateVersion'] >= 1]
assert len(sent) == len(received) == 120 and {r['epoch'] for r in received} == {3}
assert traffic['created'] == 3 and len(obs['http']) == 4
assert all(not r['inconsistentThreatTotals'] for r in received)
transport = load('transport-summary.json.gz')
assert transport == json.loads((root / 'transport-summary.json').read_text())
assert transport['computeMsSum'] == sum(r['computeMs'] for r in received)
assert transport['postSyncMsSum'] == sum(r['returnedAt'] - r['postedAt'] for r in sent.values())
assert transport['postToReceiveMsSum'] == sum(r['receivedAt'] - sent[r['requestId']]['postedAt'] for r in received)
profile = load('default-main-cpu-profile.json.gz')['profile']
assert len(profile['samples']) == len(profile['timeDeltas'])
node = {n['id']: n for n in profile['nodes']}
program_us = sum(delta for sample, delta in zip(profile['samples'], profile['timeDeltas']) if node[sample]['callFrame']['functionName'] == '(program)')
assert program_us == 12530325
attribution = load('cpu-attribution.json.gz')
assert attribution == json.loads((root / 'cpu-attribution.json').read_text())
for row in attribution['frames']:
    source = row.get('sourceFile')
    if source:
        data = raw(source) if source.endswith('.gz') else (root / source).read_bytes()
        assert hashlib.sha256(data).hexdigest() == row['sourceSha256']
        line = data.decode().splitlines()[row['lineNumber']].encode('utf-16-le')
        begin = max(0, row['columnNumber'] - 60) * 2
        end = (row['columnNumber'] + 450) * 2
        assert line[begin:end].decode('utf-16-le') == row['locationSnippet']
identity = load('default-current-gpu-identity.json.gz')
assert any('SwiftShader' in (c.get('unmaskedRenderer') or '') for c in identity['identity']['canvases'])
hardware = load('hardware-attempt1-hardware-preflight.json.gz')
assert all(c['context'] is None for c in hardware['beforeGpu']['identity']['canvases'])
assert 'llvmpipe' in hardware['beforeGpu']['system']['gpu']['auxAttributes']['glRenderer']
assert hardware['warmInitial'] == obs['warmInitial'] and hardware['warmLog'] == obs['warmLog']
assert 'Executable doesn\'t exist' in raw('hardware-setup0-profile-native.log.gz').decode()
assert 'WebGL1 blocklisted' in raw('hardware-attempt1-profile-native.log.gz').decode()
mac = raw('default-mac-before-build-tenka_engine.wasm.gz')
linux = raw('default-linux-after-build-tenka_engine.wasm.gz')
assert mac == linux and len(linux) == 63073
assert hashlib.sha256(linux).hexdigest() == scopes['producer']['wasmSha256']
mac_manifest = raw('default-mac-before-build-manifest.json.gz')
assert mac_manifest == raw('default-linux-after-build-manifest.json.gz')
assert hashlib.sha256(mac_manifest).hexdigest() == scopes['producer']['manifestSha256']
boundary = load('hardware-attempt1-full-trace-boundary.json.gz')
assert boundary['rawZipBytes'] == 49547340 and boundary['fullTraceCommitted'] is False
assert not (root / 'hardware-attempt1-failure-trace.zip.gz').exists()
initial = {r['path']: r for r in load('initial-packed-inventory.raw.json.gz')}
assert initial['hardware-attempt1-failure-trace.zip.gz']['rawSha256'] == boundary['rawZipSha256']
assert any(name.endswith('.trace') for name in boundary['included'])
assert boundary['excluded']
print('PASS: sole120profile/actualtransport/full121parity, GPU/readiness RED scopes, Linux byte parity, raw dualSHA, exact frames; no FPS/hardware claim')
