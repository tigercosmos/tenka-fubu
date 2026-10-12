#!/usr/bin/env python3
"""Record every direct pinned Pixi renderer.uid consumer in JS/MJS runtime files."""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[5]
LIB = ROOT / 'node_modules/pixi.js/lib'
PATTERN = re.compile(r'\b(?:this\._renderer|this\.renderer|renderer)\.uid\b')
rows = []
for path in sorted(LIB.rglob('*')):
    if path.suffix not in ('.js', '.mjs'):
        continue
    for line_number, line in enumerate(path.read_text().splitlines(), 1):
        hits = list(PATTERN.finditer(line))
        for hit in hits:
            prefix = line[:hit.start()]
            suffix = line[hit.end():]
            # A direct renderer UID access must be a bracket key, not arithmetic.
            bracket_key = prefix.rfind('[') > prefix.rfind(']') and suffix.find(']') >= 0
            rows.append({'path': str(path.relative_to(ROOT)), 'line': line_number,
                         'source': line.strip(), 'bracketKey': bracket_key})
report = {'pinnedVersion': '8.19.0', 'directReferences': len(rows),
          'files': len({row['path'] for row in rows}),
          'allBracketKeys': all(row['bracketKey'] for row in rows), 'rows': rows}
print(json.dumps(report, indent=2))
