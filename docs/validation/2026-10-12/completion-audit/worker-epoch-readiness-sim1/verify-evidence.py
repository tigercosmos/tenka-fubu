#!/usr/bin/env python3
"""Verify retained readiness evidence; does not execute test suites."""
import gzip
import hashlib
import json
from pathlib import Path

root = Path(__file__).resolve().parent
proof = json.loads((root / 'proof.json').read_text())
raw = json.loads(gzip.decompress((root / 'proof.raw.json.gz').read_bytes()))
assert proof == raw
for artifact in proof['compressedArtifacts']:
    data = gzip.decompress((root / artifact['file']).read_bytes())
    assert len(data) == artifact['uncompressedBytes'], artifact['file']
    assert hashlib.sha256(data).hexdigest() == artifact['uncompressedSha256'], artifact['file']
assert proof['workerTests']['passed'] == 22
assert proof['combinedFinal'] == {'files': 4, 'passed': 65}
assert proof['negativeControl']['failed'] == 7
assert proof['negativeControl']['passed'] == 9
assert proof['negativeControl']['unhandledErrors'] == 0
final = gzip.decompress((root / 'raw-bridge-final.log.gz').read_bytes()).decode()
negative = gzip.decompress((root / 'raw-bridge-negative-final.log.gz').read_bytes()).decode()
assert '65 passed (65)' in final
assert '7 failed | 9 passed (16)' in negative
assert 'Unhandled Errors' not in negative
wasm = gzip.decompress((root / 'actual-tested-tenka_engine.wasm.gz').read_bytes())
assert len(wasm) == proof['actualWasm']['bytes'] == 63073
assert hashlib.sha256(wasm).hexdigest() == proof['actualWasm']['sha256']
print('PASS: immutable raw/source/artifact hashes, 65 GREEN, 7 RED, no native claim')
