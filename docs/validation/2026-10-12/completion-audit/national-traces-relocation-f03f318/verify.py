"""Check compact local relocation evidence; do not infer current remote retention."""
from pathlib import Path
import gzip
import hashlib
import json

here = Path(__file__).resolve().parent
for name, digest in json.loads((here / 'manifest.json').read_text()).items():
    assert hashlib.sha256((here / name).read_bytes()).hexdigest() == digest, name

def raw(name):
    return gzip.decompress((here / 'raw' / (name + '.gz')).read_bytes())

def read(name):
    return json.loads(raw(name))

digest = 'ab99618435e18191c5e8ec92ac696bdfd0b1c3853756c1d57a18194840014e47'
assert hashlib.sha256(raw('manifest.json')).hexdigest() == digest
entries = read('manifest.json')
assert len(entries) == 17006
assert len({row['path'] for row in entries}) == len(entries)
assert sum(row.get('bytes', 0) for row in entries) == 1644571085
assert read('transfer.result.json') == {'producer_exit': 0, 'consumer_exit': 0}
assert read('verify-remote.result.json')['exit_code'] == 0
assert read('verify-remote.stdout') == {'entries': 17006, 'bytes': 1644571085, 'verified': True}
assert read('predelete-lsof.result.json')['exit_code'] == 1
assert raw('predelete-lsof.stdout') == b''
before, after = read('summary.json'), read('summary-after-removal.json')
assert before['manifest_sha256'] == after['manifest_sha256'] == digest
assert before['remote_verified'] and before['local_unchanged'] and not before['local_deleted']
assert after['remote_verified'] and after['local_unchanged'] and after['local_deleted']
assert after['predelete_manifest_equal'] and not after['predelete_open_handles']
assert after['remote_host'] == 'sim2'
assert after['remote'] == '/tmp/tenka-retained-national-traces-10277b4a96544765bec8b7244a8c8d9c/tenka-national-current-headless-artifacts'
assert read('removal-plan.json')['remove_only'] == after['local'] == '/tmp/tenka-national-current-headless-artifacts'
print('PASS: recorded exclusive relocation, 17006 entries/1644571085 bytes, remote and local comparisons, no open handles, local duplicate removed; no current remote re-read.')
