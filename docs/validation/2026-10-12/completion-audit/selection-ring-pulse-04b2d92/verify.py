#!/usr/bin/env python3
"""Check the compact selected-ring pulse evidence and committed source."""

import base64
import hashlib
import json
import subprocess
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]
SOURCE_COMMIT = '04b2d92'
BASE_COMMIT = '5febce974ee2c6b2f3e9203aad535fe28590d6a8'
SOURCE_SHA = {
    'src/ui/map/MapRenderer.ts': '646476e87d6421d032b2a7c43445b9ecfba973b1d8d3b1564f67d605444e93f7',
    'src/ui/map/mapRendererDirty.spec.ts': '63710753c7f0c4be9251ff7ab0c8f73674fa19fa8c46ddebffafa52eb347a887',
    'src/ui/map/sceneParts/selectionRing.ts': '23a14eeec3ca03de4af6a68f6a82f69a183453585a4bd46e38f850fbea784099',
    'tests/ui/sceneParts/selectionRing.spec.ts': 'f6411ca2af1fda24a1df36cfbbdb80ccdb76930132fe0cfae3e877b7956006ed',
    'tests/browser/selectionPulse.pw.ts': 'd7f15c9c954d123874dcda53389065a297229ee5d1182ee90381da6c2fa75f46',
}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def tar_json(name, member):
    with tarfile.open(HERE / name) as archive:
        source = archive.extractfile(member)
        assert source is not None, member
        return json.load(source)


def tar_text(name, member):
    with tarfile.open(HERE / name) as archive:
        source = archive.extractfile(member)
        assert source is not None, member
        return source.read().decode()


checksums = json.loads((HERE / 'SHA256SUMS.json').read_text())
for name, expected in checksums.items():
    assert sha((HERE / name).read_bytes()) == expected, name

manifest = json.loads((HERE / 'source-manifest.json').read_text())
assert manifest['revision'] == BASE_COMMIT
assert len(manifest['entries']) == 1646
assert manifest['archiveSha256'] == 'a7ceb7ce2c5fd42285755d3bfc14a1d9676849af22281ed9be437beaa8f61dbe'

for path, expected in SOURCE_SHA.items():
    source = subprocess.check_output(['git', 'show', f'{SOURCE_COMMIT}:{path}'], cwd=REPO)
    assert sha(source) == expected, path

old = json.loads((HERE / 'old-report.json').read_text())
candidate = json.loads((HERE / 'candidate-report.json').read_text())
assert (old['stats']['expected'], old['stats']['unexpected']) == (0, 1)
assert (candidate['stats']['expected'], candidate['stats']['unexpected']) == (1, 0)
assert len(old['suites'][0]['specs']) == len(candidate['suites'][0]['specs']) == 1
assert old['suites'][0]['specs'][0]['title'] == candidate['suites'][0]['specs'][0]['title']
candidate_result = candidate['suites'][0]['specs'][0]['tests'][0]['results'][0]
encoded = next(item['body'] for item in candidate_result['attachments'] if item['name'] == 'ring-witness')
assert base64.b64decode(encoded) == (HERE / 'ring-witness.json').read_bytes()
witness = json.loads((HERE / 'ring-witness.json').read_text())
assert witness['expanded']['scale'] > 1.04 and witness['expanded']['alpha'] < 0.75
assert witness['expanded']['groundY'] == 4
assert (witness['expanded']['worldX'], witness['expanded']['worldY']) == (
    witness['initial']['worldX'], witness['initial']['worldY'])
assert len(witness['reducedSamples']) == 3
assert all((sample['scale'], sample['alpha'], sample['groundY']) == (1, 1, 4)
           for sample in witness['reducedSamples'])
assert sha((HERE / 'selected-ordinary.png').read_bytes()) != sha((HERE / 'selected-reduced.png').read_bytes())

assert tar_json('native-captures.tar.gz', 'tenka-selection-pulse-old-native-c1/result.json')['exitCode'] == 1
assert tar_json('native-captures.tar.gz', 'tenka-selection-pulse-candidate-native-c1/result.json')['exitCode'] == 0
for name in ('old', 'candidate'):
    embedded = tar_json('native-captures.tar.gz', f'tenka-selection-pulse-{name}-native-c1/report.json')
    assert embedded == (old if name == 'old' else candidate)
for name, expected in {
    'tenka-selection-pulse-old-unit-c1': 1,
    'tenka-selection-pulse-unit-c5': 0,
    'tenka-selection-pulse-renderer-c3': 0,
    'tenka-selection-pulse-type-c6': 0,
    'tenka-selection-pulse-lint-c6': 0,
    'tenka-selection-pulse-format-c6': 0,
    'tenka-selection-pulse-sourceverify-c1': 1,
    'tenka-selection-pulse-sourceverify-c2': 1,
    'tenka-selection-pulse-sourceverify-c3': 0,
}.items():
    assert tar_json('local-captures.tar.gz', f'{name}/result.json')['exitCode'] == expected, name
source_proof = json.loads(tar_text('local-captures.tar.gz',
    'tenka-selection-pulse-sourceverify-c3/stdout-stderr.log'))
assert source_proof['oldUnchangedBaseFiles'] == 1646
assert source_proof['candidateUnchangedBaseFiles'] == 1642
assert source_proof['candidateOverlayFilesFromInitialArchive'] == 4
assert source_proof['oldAndCandidateTestMatchFinalPayload']
assert not tar_text('local-captures.tar.gz', 'tenka-selection-pulse-postprocess-c1/stdout-stderr.log').strip()

print(f'PASS: {len(checksums)} compact artifacts, 5 source files, old RED, candidate GREEN, source proof')
