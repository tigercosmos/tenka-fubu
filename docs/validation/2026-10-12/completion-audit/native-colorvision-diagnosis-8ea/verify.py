#!/usr/bin/env python3
"""Check retained color-vision controls without changing acceptance criteria."""
import json
import pathlib
import tarfile
from PIL import Image

here = pathlib.Path(__file__).resolve().parent
manifest = json.loads((here / 'source-manifest-8ea.json').read_text())
assert manifest['revision'] == '8ea965a2c3feada6118d6d65712ebe43f577ad03'
assert len(manifest['entries']) == 1632

def raw_json(tar, path):
    return json.load(tar.extractfile(path))

with tarfile.open(here / 'native-raw.tar.gz') as raw:
    for name, status in [
        ('tenka-colorvision-native-achromatopsia-8ea', 127),
        ('tenka-colorvision-native-achromatopsia-8ea-nodepath', 1),
        ('tenka-colorvision-native-achromatopsia-8ea-browserpath', 1),
        ('tenka-colorvision-no-cdp-8ea', 0),
        ('tenka-colorvision-dom-probe-8ea', 0),
        ('tenka-colorvision-late-8ea', 0),
    ]:
        assert raw_json(raw, f'{name}/result.json')['exitCode'] == status, name
    for name in ('tenka-colorvision-source-before-8ea', 'tenka-colorvision-source-after-8ea'):
        proof = raw_json(raw, f'{name}/stdout-stderr.log')
        assert proof['revision'] == manifest['revision'] and proof['files'] == 1632
        assert proof['mismatches'] == ['e2e/battle-controls-acceptance.spec.ts']
    for name in ('tenka-colorvision-deps-before-8ea', 'tenka-colorvision-deps-after-8ea'):
        proof = raw_json(raw, f'{name}/stdout-stderr.log')
        assert proof['targets'] == 29 and proof['mismatches'] == []
    base = 'tenka-colorvision-native-achromatopsia-8ea-browserpath/browser-results/'
    case = next(n for n in raw.getnames() if n.startswith(base) and n.endswith('/overview-none-observation.json'))
    prefix = case.removesuffix('overview-none-observation.json')
    before = raw_json(raw, case)
    after = raw_json(raw, prefix + 'overview-restored-observation.json')
    for key in ('state', 'commands', 'canvas'):
        assert before[key] == after[key], key
    assert {k for k in before['diagnostics'] if before['diagnostics'][k] != after['diagnostics'][k]} == {'ticker'}

def changed(a, b):
    left = Image.open(here / 'images' / a).convert('RGBA')
    right = Image.open(here / 'images' / b).convert('RGBA')
    assert left.size == right.size == (1280, 720)
    coordinates = [(x,y) for y in range(720) for x in range(1280) if left.getpixel((x,y)) != right.getpixel((x,y))]
    return len(coordinates), (min(x for x,y in coordinates), min(y for x,y in coordinates), max(x for x,y in coordinates), max(y for x,y in coordinates))

assert changed('overview-none.png', 'overview-restored.png') == (416, (10, 14, 69, 63))
assert changed('first.png', 'last.png') == (385, (10, 14, 69, 63))
assert json.loads((here / 'restore-deltas.json').read_text()) == [416] + [406] * 12
print('PASS: reproduced CDP RED; no-CDP same-region drift; 12 late waits still RED; state equal; 1632 source and 29 dependency targets pinned')
