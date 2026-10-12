"""Verify local color-layer observation artifacts; external trace remains on sim4."""

import collections
import hashlib
import json
import pathlib
import tarfile

ROOT = pathlib.Path(__file__).resolve().parent


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


for line in (ROOT / 'SHA256SUMS').read_text().splitlines():
    expected, name = line.split('  ', 1)
    assert digest((ROOT / name).read_bytes()) == expected, name

report = json.loads((ROOT / 'native/report.json').read_text())
result = json.loads((ROOT / 'native/result.json').read_text())
assert result['exitCode'] == 1 and report['stats']['unexpected'] == 1
log = (ROOT / 'native/stdout-stderr.log').read_text()
assert 'original exact RGBA restoration oracle' in log
assert 'Received: 508' in log

raw = json.loads((ROOT / 'native/layer-observation.json').read_text())
summary = json.loads((ROOT / 'native/summary.json').read_text())
assert raw['source'] == 'f03f3188f5cd86590864a10e65a99123a365a689'
assert raw['modeChange']['count'] == 921600
assert raw['restoration']['count'] == 508
assert raw['restoration']['bounds'] == [10, 14, 69, 63]
assert len(raw['observations']) == 6
assert all(item['reducedMotion'] is True and item['animations'] == [] for item in raw['observations'])
assert len({item['stateHash'] for item in raw['observations']}) == 1
assert len({item['commandsHash'] for item in raw['observations']}) == 1
for field in ['hud', 'hudBefore', 'hudAfter', 'rail', 'railBefore', 'railAfter',
              'canvas', 'railRealm', 'hudResources', 'focus']:
    assert all(item[field] == raw['observations'][0][field] for item in raw['observations'])
assert all(item['hud']['computed']['animationDuration'] == '0s' and
           item['rail']['computed']['animationDuration'] == '0s' for item in raw['observations'])
assert all(item['paintEntries'] == raw['observations'][0]['paintEntries'] for item in raw['observations'])
assert summary['sourceSha256'] == digest((ROOT / 'native/layer-observation.json').read_bytes())
assert summary['layerPaintedEventCount'] == 0
assert sum(summary['layerTreeEventCounts'].values()) == 84
for layer_id in ['30', '31']:
    history = summary['hudLayerAndRailLayer'][layer_id]
    assert history['events'] == 84 and history['uniqueDescriptions'] == 4
    assert [item['paintCount'] for item in history['descriptions']] == [0, 1, 2, 3]
    assert len({(item['width'], item['height'], tuple(item['transform']))
                for item in history['descriptions']}) == 1
assert collections.Counter(item['kind'] for item in raw['layers']) == {'tree': 84}

source_sha = digest((ROOT / 'sources/temporary-layer-observation.ts.txt').read_bytes())
assert source_sha == '271d9645bc5dfa7568f0f76be6914abefb5968b0d74332eadbc0bd831e37ddad'
captures = json.loads((ROOT / 'capture-list.json').read_text())
assert len(captures) == 34
with tarfile.open(ROOT / 'captures.tar.gz', 'r:gz') as archive:
    names = set(archive.getnames())
    for name in captures:
        for required in ['command.json', 'result.json', 'stdout-stderr.log']:
            assert f'{name}/{required}' in names, (name, required)
    final = json.load(archive.extractfile('tenka-color-layer-f03-source-final-c1/stdout-stderr.log'))
    assert final == {'revision': raw['source'], 'checked': 1633, 'problems': [], 'extras': []}
    before = archive.extractfile('tenka-color-layer-f03-deps-before-c1/stdout-stderr.log').read()
    after = archive.extractfile('tenka-color-layer-f03-deps-after-c1/stdout-stderr.log').read()
    assert before == after
    assert b'node_modules/playwright/package.json' in before
    trace = archive.extractfile('tenka-color-layer-f03-trace-inventory-c1/stdout-stderr.log').read().decode()
    assert '70cbd243978950439bae5bc2cd24fe32809ad3c3ca428b0b0b6cfd2bb61ecaba' in trace
    assert '59566808 ' in trace
print('verified: one RED native observation, 34 local captures, static styles, layer counts, final source')
