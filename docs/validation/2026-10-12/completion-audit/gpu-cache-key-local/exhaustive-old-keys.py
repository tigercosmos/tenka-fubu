#!/usr/bin/env python3
"""Check every indexed _gpuData value on the 109 long-lived cache owners."""
import gzip
import hashlib
import json
import types
from pathlib import Path

HERE = Path(__file__).resolve().parent
EVID = HERE.parent / 'heap-current-2d872d7'
PARSER = EVID / 'post-cap-analysis.py.gz'
module = types.ModuleType('snapshot_parser')
module.__file__ = str(PARSER)
module.__name__ = 'snapshot_parser'
exec(compile(gzip.decompress(PARSER.read_bytes()), str(PARSER), 'exec'), module.__dict__)
module.HERE = EVID / 'scratch'
FILES = [
    EVID / 'diagnostic-results__heap-diagnostic-M6-V11-vis-4c5e6-counts-without-context-loss-chromium__after-120-remounts.heapsnapshot.gz',
    EVID / 'diagnostic-results__heap-diagnostic-M6-V11-vis-4c5e6-counts-without-context-loss-chromium__after-remounts.heapsnapshot.gz',
]

def inspect(path, current_key):
    snapshot = module.Snapshot(path)
    owners = []
    for parent in range(snapshot.count):
        if snapshot.kind(parent) != 'object':
            continue
        cache = snapshot.property(parent, '_gpuData')
        if cache is None:
            continue
        indexed = {int(label): target for kind, label, target in snapshot.edges_of(cache)
                   if kind == 'element'}
        if len(indexed) < 100:
            continue
        old_keys = sorted(key for key in indexed if key < current_key)
        bad = [{'key': key, 'id': snapshot.attr(indexed[key], 'id'),
                'name': snapshot.name(indexed[key]), 'kind': snapshot.kind(indexed[key])}
               for key in old_keys
               if not (snapshot.attr(indexed[key], 'id') == 65
                       and snapshot.name(indexed[key]) == 'null'
                       and snapshot.kind(indexed[key]) == 'native')]
        current = indexed[current_key]
        owners.append({'parentId': snapshot.attr(parent, 'id'),
                       'mapId': snapshot.attr(cache, 'id'),
                       'oldKeyCount': len(old_keys),
                       'oldKeysContiguous': old_keys == list(range(current_key)),
                       'oldNonNull': bad,
                       'currentKey': current_key,
                       'currentValueId': snapshot.attr(current, 'id'),
                       'currentValueKind': snapshot.kind(current)})
    assert len(owners) == 109, len(owners)
    assert all(row['oldKeysContiguous'] and not row['oldNonNull'] for row in owners)
    assert all(row['currentValueId'] != 65 for row in owners)
    return {'path': str(path.relative_to(EVID)), 'compressedSha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'ownerCount': len(owners), 'oldKeysChecked': sum(row['oldKeyCount'] for row in owners),
            'nonNullOldKeys': sum(len(row['oldNonNull']) for row in owners),
            'owners': owners}

result = [inspect(FILES[0], 130), inspect(FILES[1], 250)]
assert {(row['parentId'], row['mapId']) for row in result[0]['owners']} == {
    (row['parentId'], row['mapId']) for row in result[1]['owners']}
print(json.dumps(result, indent=2))
