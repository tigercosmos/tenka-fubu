"""Compare exact per-title Playwright outcomes from the two frozen-source runs."""

import collections
import json
import sys
from pathlib import Path


first = json.loads(Path(sys.argv[1]).read_text())
second = json.loads(Path(sys.argv[2]).read_text())


def index(report):
    rows = {json.dumps(row['key'], ensure_ascii=False): row for row in report['rows']}
    assert len(rows) == report['discovered']
    return rows


first_rows = index(first)
second_rows = index(second)
assert first_rows.keys() == second_rows.keys()
transitions = []
for key in sorted(first_rows):
    before, after = first_rows[key], second_rows[key]
    transitions.append({
        'key': before['key'],
        'w4': before['category'],
        'w8': after['category'],
        'w4Results': before['results'],
        'w8Results': after['results'],
        'w4Errors': before['errors'],
        'w8Errors': after['errors'],
    })
counts = dict(sorted(collections.Counter((row['w4'], row['w8']) for row in transitions).items()))
output = {
    'sourceRevision': 'ecba08b76b772a598a6e6ceb61615b648c765170',
    'discovered': len(transitions),
    'transitionCounts': [
        {'w4': pair[0], 'w8': pair[1], 'count': count}
        for pair, count in counts.items()
    ],
    'rows': transitions,
}
Path(sys.argv[3]).open('x').write(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: output[key] for key in ('discovered', 'transitionCounts')}, indent=2))
