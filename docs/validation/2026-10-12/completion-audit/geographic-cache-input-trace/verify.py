import gzip, hashlib, json, pathlib, subprocess, sys
p = pathlib.Path(sys.argv[1]).resolve()
hash256 = lambda b: hashlib.sha256(b).hexdigest()
for row in json.loads((p / 'manifest.json').read_text())['files']:
    b = (p / row['path']).read_bytes()
    raw = gzip.decompress(b)
    assert len(b) == row['bytes'] and hash256(b) == row['sha256'], row['path']
    assert len(raw) == row['rawBytes'] and hash256(raw) == row['rawSHA256'], row['path']
def load(name):
    return json.loads(gzip.decompress((p / (name + '.gz')).read_bytes()))
static, moving = load('trace.raw.json'), load('trace-moving.raw.json')
assert len(static['records']) == len(moving['records']) == 20
assert len({x['signature'] for x in static['records']}) == 1
assert len({x['signature'] for x in moving['records']}) == 20
assert not any(x['labels'] for x in static['records'])
labels = [x for r in moving['records'] for x in r['labels']]
hits = sum(x['signature'] == x['cachedSignature'] for x in labels)
assert (len(labels), hits, len(labels) - hits) == (2128, 20, 2108)
far = zero = 0
for label in labels:
    if label['signature'] == label['cachedSignature']:
        continue
    assert label['cachedSignature'] is not None
    a, b = json.loads(label['cachedSignature']), json.loads(label['signature'])
    changes = {i for i, (x, y) in enumerate(zip(a, b)) if x != y}
    assert not changes.intersection({0, 1, 2, 3})
    if changes <= {4, 5, 6}:
        far += 1
        zero += label['cachedOffset'] == {'x': 0, 'y': 0}
assert (far, zero) == (347, 161)
for raw in [static, moving]:
    assert raw['canonicalByteEqual']
    assert raw['before']['canonicalJSON'] == raw['after']['canonicalJSON']
    assert hash256(raw['before']['canonicalJSON'].encode()) == raw['canonicalBeforeSHA256']
    assert raw['before']['driver']['ticks'] == raw['after']['driver']['ticks'] == 0
    assert raw['canonicalBeforeSHA256'] == raw['canonicalAfterSHA256']
proof = load('source-proof.json')
for row in proof['source']:
    original = gzip.decompress((p / (row['path'].replace('/', '__') + '.gz')).read_bytes())
    assert hash256(original) == row['sha256']
    assert hashlib.sha1(b'blob ' + str(len(original)).encode() + b'\0' + original).hexdigest() == row['gitBlob']
for stage in ['static', 'moving']:
    assert all(x['terminalExit'] == 0 for x in load(stage + '-status.json'))
print('PASS: 30 gzip byte proofs, original Git blobs, two trace scopes and exact cache classifications')
