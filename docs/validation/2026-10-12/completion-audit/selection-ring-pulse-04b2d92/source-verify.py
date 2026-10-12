#!/usr/bin/env python3
"""Verify exact scoped source tar and intentional pulse overlays on sim4."""
import hashlib
import json
import pathlib
import tarfile

payload = pathlib.Path('/tmp/tenka-battle-79682cd/runs/selection-pulse-5feb-payload-c1')
old = pathlib.Path('/tmp/tenka-selection-pulse-old-5feb-c1')
candidate = pathlib.Path('/tmp/tenka-selection-pulse-candidate-5feb-c1')
base = payload / 'source.tar'
old_test = payload / 'tenka-selection-pulse-oldtest-c1.tar'
overlay = payload / 'tenka-selection-pulse-overlay-c1.tar'
final_test = pathlib.Path('/tmp/tenka-battle-79682cd/runs/selection-pulse-final-test-c1/selectionPulse.pw.ts')

def validate(tar_path, runtime, exceptions=frozenset()):
    count = 0
    with tarfile.open(tar_path) as archive:
        for member in archive:
            if member.isdir() or member.name in exceptions or pathlib.PurePosixPath(member.name).name.startswith('._'):
                continue
            destination = runtime / member.name
            if member.isfile():
                source = archive.extractfile(member)
                assert source is not None
                assert destination.is_file(), destination
                assert hashlib.sha256(source.read()).digest() == hashlib.sha256(destination.read_bytes()).digest(), destination
            elif member.issym():
                assert destination.is_symlink() and destination.readlink() == pathlib.Path(member.linkname), destination
            else:
                raise AssertionError((member.name, member.type))
            count += 1
    return count

with tarfile.open(overlay) as archive:
    altered = {member.name for member in archive if member.isfile() and not pathlib.PurePosixPath(member.name).name.startswith('._')}
with tarfile.open(old_test) as archive:
    added_old = {member.name for member in archive if member.isfile() and not pathlib.PurePosixPath(member.name).name.startswith('._')}
assert len(altered) == 5, altered
assert added_old == {'tests/browser/selectionPulse.pw.ts'}

def validate_base(runtime, exceptions):
    count = 0
    with tarfile.open(base) as archive:
        for member in archive:
            if member.isdir() or member.name in exceptions:
                continue
            destination = runtime / member.name
            if member.isfile():
                source = archive.extractfile(member)
                assert source is not None
                assert destination.is_file(), destination
                assert hashlib.sha256(source.read()).digest() == hashlib.sha256(destination.read_bytes()).digest(), destination
            elif member.issym():
                assert destination.is_symlink() and destination.readlink() == pathlib.Path(member.linkname), destination
            else:
                raise AssertionError((member.name, member.type))
            count += 1
    return count

old_base = validate_base(old, set())
new_base = validate_base(candidate, altered)
new_overlay = validate(overlay, candidate, added_old)
assert (old / 'tests/browser/selectionPulse.pw.ts').read_bytes() == (candidate / 'tests/browser/selectionPulse.pw.ts').read_bytes()
assert (old / 'tests/browser/selectionPulse.pw.ts').read_bytes() == final_test.read_bytes()
assert (old / 'package-lock.json').read_bytes() == (candidate / 'package-lock.json').read_bytes()
print(json.dumps({'baseSha256': hashlib.sha256(base.read_bytes()).hexdigest(),
                  'oldUnchangedBaseFiles': old_base,
                  'candidateUnchangedBaseFiles': new_base,
                  'candidateOverlayFilesFromInitialArchive': new_overlay,
                  'oldAndCandidateTestIdentical': True,
                  'oldAndCandidateTestMatchFinalPayload': True,
                  'packageLocksIdentical': True,
                  'candidateOverlayPaths': sorted(altered)}, indent=2))
