#!/usr/bin/env python3
"""Verify the actor-depth projection correction and retained controls."""
import hashlib
import json
import pathlib
import subprocess
import tarfile

here = pathlib.Path(__file__).resolve().parent
repo = here.parents[4]
commit = '146414688dc2ceceb81042aeed6984ddf0687926'
base = '8ea965a2c3feada6118d6d65712ebe43f577ad03'
changed = subprocess.check_output([
    'git', '-C', str(repo), 'diff', '--name-only', base, commit, '--',
    'src/ui/map', 'src/app', 'src/data/map', 'src/data/scenarios/s1560',
    'e2e/fixtures.ts', 'playwright.config.ts',
]).decode().strip()
assert changed == '', changed
final_source = subprocess.check_output(['git', '-C', str(repo), 'show', f'{commit}:e2e/actor-depth-layout.spec.ts'])

def read_json(archive, path):
    return json.load(archive.extractfile(path))

with tarfile.open(here / 'native-raw.tar.gz') as raw:
    for name, expected, unexpected, exit_code in [
        ('tenka-actor-depth-old-all3-8ea', 2, 1, 1),
        ('tenka-actor-depth-candidate-all3', 3, 0, 0),
        ('tenka-actor-depth-final-all3', 3, 0, 0),
    ]:
        stats = read_json(raw, f'{name}/report.json')['stats']
        result = read_json(raw, f'{name}/result.json')
        assert (stats['expected'], stats['unexpected'], stats['skipped'], stats['flaky']) == (expected, unexpected, 0, 0), name
        assert result['exitCode'] == exit_code, name
    old_log = raw.extractfile('tenka-actor-depth-old-all3-8ea/stdout-stderr.log').read()
    assert b'2768.4' in old_log and b'2774' in old_log
with tarfile.open(here / 'local-raw.tar.gz') as raw:
    comparator = read_json(raw, 'tenka-actor-depth-format-equivalence-ast-v2/stdout-stderr.log')
    assert comparator['astIdentical'] and comparator['javascriptIdentical']
    assert hashlib.sha256(final_source).hexdigest() == comparator['finalSourceSha256']
    preformat = raw.extractfile('tenka-actor-depth-preformat-native.ts').read()
    assert hashlib.sha256(preformat).hexdigest() == comparator['oldSourceSha256']
    for run in ('tenka-actor-depth-typecheck-candidate', 'tenka-actor-depth-final-eslint', 'tenka-actor-depth-final-prettier-v2'):
        assert read_json(raw, f'{run}/result.json')['exitCode'] == 0, run
print('PASS: old 1 RED/2 PASS, final 3/3 PASS; unchanged map runtime scope; exact projected Y oracle; AST and JavaScript identical after formatting')
