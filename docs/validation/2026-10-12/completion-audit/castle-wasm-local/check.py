"""Verify evidence bytes and frozen oracle records without executing the engine."""
import gzip
import hashlib
import json
import struct
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text())
def raw(name):
    return gzip.decompress((root / name).read_bytes())
for entry in manifest['entries']:
    compressed = (root / entry['path']).read_bytes()
    data = gzip.decompress(compressed)
    assert len(compressed) == entry['gzipBytes'], entry['path']
    assert len(data) == entry['rawBytes'], entry['path']
    assert hashlib.sha256(compressed).hexdigest() == entry['gzipSha256'], entry['path']
    assert hashlib.sha256(data).hexdigest() == entry['rawSha256'], entry['path']
wasm = raw('source/public/wasm/tenka_engine.wasm.gz')
assert len(wasm) == manifest['artifact']['bytes']
assert hashlib.sha256(wasm).hexdigest() == manifest['artifact']['sha256']
build = json.loads(raw('source/public/wasm/manifest.json.gz'))
assert build['wasmSha256'] == manifest['artifact']['sha256']
assert build['sourceSha256'] == manifest['artifact']['sourceSha256']
for path, digest in build['sourceFiles'].items():
    assert hashlib.sha256(raw('source/' + path + '.gz')).hexdigest() == digest, path
reference = raw('source/tests/helpers/castleWasmReference.ts.gz')
assert hashlib.sha256(reference).hexdigest() == manifest['referenceSha256']
assert raw('raw/tenka-castle-wasm-reference-9e49cc9.ts.gz') == reference
fixture = raw('prototype/fixtures.bin.gz')
oracle = json.loads(raw('prototype/oracle-manifest.json.gz'))
assert len(fixture) == oracle['fixtureBytes'] == manifest['prototype']['fixtureBytes']
assert hashlib.sha256(fixture).hexdigest() == oracle['sha256'] == manifest['prototype']['fixtureSha256']
assert oracle['referenceSha256'] == manifest['referenceSha256']
cursor = 0
cases = []
while cursor < len(fixture):
    words, candidates = struct.unpack_from('<II', fixture, cursor)
    cursor += 8
    before = fixture[cursor:cursor + words * 8]
    cursor += words * 8
    after = fixture[cursor:cursor + words * 8]
    cursor += words * 8
    assert len(before) == len(after) == words * 8
    header = struct.unpack_from('<16d', before)
    assert header[1] == candidates
    output_start = 16 + candidates * 8 + int(header[2] + header[3] + header[4]) * 4
    assert words == output_start + candidates * 16
    assert before[:48] == after[:48]
    assert before[56:output_start * 8] == after[56:output_start * 8]
    cases.append((before, after))
assert cursor == len(fixture)
assert len(cases) == oracle['cases'] == manifest['prototype']['cases'] == 337
if 'mixedSignControls' in manifest:
    controls = json.loads(raw('mixed/controls.json.gz'))
    binary = raw('mixed/controls.bin.gz')
    assert hashlib.sha256(binary).hexdigest() == controls['sha256']
    assert controls['referenceSha256'] == manifest['referenceSha256']
    assert len(binary) == controls['bytes'] == 1680
    for row, control in enumerate(controls['controls']):
        words, candidates = struct.unpack_from('<II', binary, row * 840)
        assert words == 52 and candidates == 1
        before = binary[row * 840 + 8:row * 840 + 424]
        after = binary[row * 840 + 424:(row + 1) * 840]
        before_bits = [f'{word:016x}' for word in struct.unpack('<52Q', before)]
        after_bits = [f'{word:016x}' for word in struct.unpack('<52Q', after)]
        assert before_bits == control['inputBits']
        assert after_bits == control['expectedBits']
        assert after_bits[36:] == control['expectedOutputBits']
        assert struct.unpack_from('<d', after, 48)[0] == control['work'] == 472
        assert control['callbacks'] == 1
        assert before != cases[321 + row][0], 'mixed signs must not be mislabeled original cases'
before = raw('raw/tenka-fixed-04c7-before.json.gz')
after = raw('raw/tenka-fixed-04c7-after.json.gz')
assert before == after
assert before == raw('raw/tenka-fixed-04c7-after-checks.json.gz')
assert manifest['fixed04Full']['checks']['afterChecksByteIdentical']
assert len(json.loads(before)['files']) == manifest['fixed04Full']['trackedInputs'] == 1485
assert raw('correction/public/wasm/tenka_engine.wasm.gz') == wasm
corrected = json.loads(raw('correction/public/wasm/manifest.json.gz'))
assert corrected['sourceSha256'] == manifest['correction']['artifactSourceSha256']
assert corrected['wasmSha256'] == manifest['artifact']['sha256']
for path, digest in corrected['sourceFiles'].items():
    target = 'correction/' + path + '.gz'
    if not (root / target).exists():
        target = 'source/' + path + '.gz'
    assert hashlib.sha256(raw(target)).hexdigest() == digest, path
checksums = root / 'SHA256SUMS'
if checksums.exists():
    for line in checksums.read_text().splitlines():
        digest, name = line.split('  ', 1)
        assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
print(f"PASS: {len(manifest['entries'])} gzip/raw SHA pairs; artifact source identity; 337 frozen oracle records")
