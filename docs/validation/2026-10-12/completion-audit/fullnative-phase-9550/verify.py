#!/usr/bin/env python3
"""Verify the immutable one-case phase census captures."""

import hashlib
import json
import tarfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
HASHES = {
    'raw.tar.gz': '03c9293a0a17bf69f9bf6d9ebcd42266fdcde65a6d89999bed1361d82c3e8b1a',
    'maps.tar.gz': 'a2d6884d755e0fbd24d4038215244ba5079044c6b02df76fec2eae3698126d1e',
    'local-captures-c2.tar.gz': 'd5ab04c0109afadd5e4182eaa8df1d074d65903ded982dab169a21840681aa2d',
    'failed-local-captures-c1.tar.gz': 'ba8fe428d2781a8aedc40a61987170a69e53d171f583810aa21b4946585f2534',
}
for name, expected in HASHES.items():
    assert hashlib.sha256((HERE / name).read_bytes()).hexdigest() == expected, name


def read(archive: tarfile.TarFile, name: str) -> bytes:
    member = archive.extractfile(name)
    assert member is not None, name
    return member.read()


def obj(archive: tarfile.TarFile, name: str):
    return json.loads(read(archive, name))


with tarfile.open(HERE / 'raw.tar.gz') as raw, \
        tarfile.open(HERE / 'maps.tar.gz') as maps, \
        tarfile.open(HERE / 'local-captures-c2.tar.gz') as local:
    prefix = 'tenka-fullnative-phase-'
    expected_remote = {
        'list-c1': 1,
        'list-c2': 0,
        'native-c1': 1,
        'build-c1': 0,
        'native-c2': 0,
        'source-after-c2': 1,
        'source-after-c3': 0,
        'deps-after-c1': 0,
        'analysis-c1': 0,
        'process-after-c1': 0,
    }
    for suffix, code in expected_remote.items():
        assert obj(raw, f'{prefix}{suffix}/result.json')['exitCode'] == code, suffix
    report = obj(raw, f'{prefix}native-c2/report.json')
    assert report['stats']['expected'] == 1
    assert report['stats']['unexpected'] == 0
    assert report['stats']['duration'] == 4408.12

    case_dir = next(name.rsplit('/', 1)[0] for name in raw.getnames()
                    if name.startswith(f'{prefix}native-c2/browser-results/')
                    and name.endswith('/phase-census.json'))
    marks = obj(raw, f'{case_dir}/phase-census.json')
    assert [mark['label'] for mark in marks] == [
        'case-start', 'before-goto', 'after-goto', 'after-settings',
        'after-clan-pick', 'after-wizard', 'after-map-idle', 'case-end',
    ]
    assert marks[-1]['timeMs'] - marks[0]['timeMs'] == 3472
    profile = obj(raw, f'{case_dir}/cpu-profile.json')['profile']
    assert len(profile['nodes']) == 2186
    assert len(profile['samples']) == len(profile['timeDeltas']) == 4924
    assert profile['endTime'] - profile['startTime'] == 3475408

    analysis = obj(raw, f'{prefix}analysis-c1/stdout-stderr.log')
    assert len(analysis['phases']) == 7
    assert sum(row['wallMs'] for row in analysis['phases']) == 3472
    assert round(sum(row['idleMs'] for row in analysis['phases'])) == 759

    source_before = obj(local, f'{prefix}source-before-c1/stdout-stderr.log')
    source_after = obj(raw, f'{prefix}source-after-c3/stdout-stderr.log')
    for proof in (source_before, source_after):
        assert proof['revision'] == '9550e397568ff448689bc5904ec0651b04bfe717'
        assert proof['matchedGitBlobs'] == 1648
        assert proof['extra'] == ['e2e/nonpolicy-phase-census.spec.ts']
        assert proof['packageLockSha256'] == '63f021d39b353a70831accbfc50b714a09767b900ce23157fbf4ecce1dda7be1'
    assert source_after['distIndexSha256'] == '2eaae0b72257668342bc82e46012a4312c810a9476a48d90f5324895835e074c'
    deps = obj(raw, f'{prefix}deps-after-c1/stdout-stderr.log')
    assert deps['pixiTargetCount'] == len(deps['pixiTargets']) == 29
    assert deps['lockSha256'] == source_after['packageLockSha256']
    assert read(raw, 'e2e/nonpolicy-phase-census.spec.ts') == read(
        raw, 'fullnative-phase-9550-payload-c1/nonpolicy-phase-census.spec.ts')

    mapped = obj(maps, f'{prefix}sourcemap-c1/stdout-stderr.log')
    assert len(mapped) == 7
    for row in mapped:
        content = read(maps, f'{row["bundle"]}.js.map')
        assert hashlib.sha256(content).hexdigest() == row['sourceMapSha256']
        assert len(content) == row['sourceMapSize']
        assert row['original']['source']

    assert obj(local, f'{prefix}local-pack-c1/result.json')['exitCode'] == 1
    assert len((HERE / 'failed-local-captures-c1.tar.gz').read_bytes()) == 29

print('PASS: exact archives, setup REDs, one-case PASS, phase/profile, source, 29 Pixi targets, maps')
