"""Retain compact proof of the verified relocation; do not copy bulk traces."""
from pathlib import Path
import gzip
import hashlib
import json

source = Path('/tmp/tenka-national-archive-proof-ars5_k50')
target = Path('/Users/tigercosmos/tenka-fubu/docs/validation/2026-10-12/completion-audit/national-traces-relocation-f03f318')
target.mkdir(exist_ok=False)
raw = target / 'raw'
raw.mkdir()
for path in sorted(source.iterdir()):
    assert path.is_file(), path
    with (raw / (path.name + '.gz')).open('xb') as stream:
        stream.write(gzip.compress(path.read_bytes(), mtime=0))
with (target / Path(__file__).name).open('xb') as stream:
    stream.write(Path(__file__).read_bytes())
print(json.dumps({'proofFiles': len(list(source.iterdir())), 'bulkTraceBytesCopied': 0}))
