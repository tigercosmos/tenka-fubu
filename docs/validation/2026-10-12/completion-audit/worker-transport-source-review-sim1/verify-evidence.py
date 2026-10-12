#!/usr/bin/env python3
"""Verify source/input provenance and exact non-timing JSON counts."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parent
proof = json.loads((root / 'provenance.json').read_text())
assert proof == json.loads(gzip.decompress((root / 'provenance.raw.json.gz').read_bytes()))
report = json.loads((root / 'payload-analysis.json').read_text())
assert report == json.loads(gzip.decompress((root / 'payload-analysis.raw.json.gz').read_bytes()))
for record in proof['artifacts']:
    packed = (root / record['path']).read_bytes()
    raw = gzip.decompress(packed)
    assert len(packed) == record['gzipBytes']
    assert hashlib.sha256(packed).hexdigest() == record['gzipSha256']
    assert len(raw) == record['rawBytes']
    assert hashlib.sha256(raw).hexdigest() == record['rawSha256']
with tarfile.open(fileobj=io.BytesIO(gzip.decompress((root / 'sources.tar.gz').read_bytes()))) as archive:
    for record in proof['sourceFiles']:
        raw = archive.extractfile(record['path']).read()
        assert len(raw) == record['bytes']
        assert hashlib.sha256(raw).hexdigest() == record['sha256']
        assert record['sameAs04c7b60'] is True
    catalog = json.loads(archive.extractfile('src/data/scenarios/s1560/events.json').read())['events']
input_file = (root / proof['input']['relativeSibling']).resolve()
packed = input_file.read_bytes()
raw = gzip.decompress(packed)
assert hashlib.sha256(packed).hexdigest() == proof['input']['gzipSha256']
assert hashlib.sha256(raw).hexdigest() == proof['input']['rawSha256']
observation = json.loads(raw)
script = r"""
const chunks=[];for await(const c of process.stdin)chunks.push(c);
const data=JSON.parse(Buffer.concat(chunks));
function tree(value){let objectOccurrences=0,arrayOccurrences=0,scalarOccurrences=0,childSlots=0;const visit=x=>{if(x===null||typeof x!=='object'){scalarOccurrences++;return;}if(Array.isArray(x))arrayOccurrences++;else objectOccurrences++;for(const k of Object.keys(x)){childSlots++;visit(x[k]);}};visit(value);return{compactJsonUtf8Bytes:Buffer.byteLength(JSON.stringify(value)),objectOccurrences,arrayOccurrences,scalarOccurrences,childSlots};}
const actual={warmDay1:tree(data.warm),afterDay121:tree(data.final),canonicalEventDefs:{definitions:data.catalog.length,...tree(data.catalog)},warmBranches:Object.fromEntries(Object.entries(data.warm).map(([k,v])=>[k,tree(v)]))};
for(const k of Object.keys(actual))if(JSON.stringify(actual[k])!==JSON.stringify(data.expected[k]))throw Error('count mismatch '+k);
process.stdout.write('PASS: archived source/input/producer hashes and all exact non-timing JSON tree counts; no wire/performance claim\n');
"""
result = subprocess.run(['node', '--input-type=module', '-e', script], input=json.dumps({'warm': observation['warmInitial'], 'final': observation['actual'], 'catalog': catalog, 'expected': report}).encode(), capture_output=True, check=True)
print(result.stdout.decode(), end='')
