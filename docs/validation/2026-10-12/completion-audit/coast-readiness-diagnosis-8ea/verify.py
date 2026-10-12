#!/usr/bin/env python3
"""Verify preserved coast readiness controls without running a browser."""
from hashlib import sha256
from pathlib import Path
import gzip
import json
import tarfile

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
EXPECTED = {
    'old': 'db9ffeeb243ffb768bf86162c34be2bd98da20ced9281ebcab26358d35975036',
    'candidate': '164613cc0ed2d7dd12d682e267673ccecd63937e453959d317ca440e3373681b',
}
assert sha256((REPO / 'e2e/coast-surface-layout.spec.ts').read_bytes()).hexdigest() == EXPECTED['candidate']
with gzip.open(HERE / 'old-behavior-regression.spec.ts.gz', 'rb') as source:
    assert b'async function waitForMapReady(page: Page) {\n  await idle(page);\n}' in source.read()

def observed(archive: str, prefix: str) -> tuple[int, str]:
    with tarfile.open(HERE / archive, 'r:gz') as raw:
        def read(name: str) -> bytes:
            member = raw.extractfile(f'{prefix}/{name}')
            assert member is not None, name
            return member.read()
        return json.loads(read('result.json'))['exitCode'], read('stdout-stderr.log').decode()

isolated = observed('native-isolated-run.tar.gz', 'isolated-run')
old = observed('native-redgreen-runs.tar.gz', 'tenka-coast-old-behavior-delayed-red-v1')
fixed = observed('native-redgreen-runs.tar.gz', 'tenka-coast-candidate-all2-v1')
assert isolated[0] == 0 and '1 passed' in isolated[1]
assert old[0] == 1 and 'Received: "rejected"' in old[1]
assert fixed[0] == 0 and '2 passed' in fixed[1]
print('coast readiness evidence PASS: isolated 1, delayed old RED, candidate 2')
