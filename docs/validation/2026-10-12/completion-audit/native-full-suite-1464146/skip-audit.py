import gzip
import json
import re
import sys
from pathlib import Path

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path('/Users/tigercosmos/tenka-fubu/docs/validation/2026-10-12/completion-audit/native-full-suite-1464146')
log_path = Path(sys.argv[2]) if len(sys.argv) > 2 else root / 'stdout-stderr.log.gz'
with gzip.open(root / 'report.json.gz', 'rt') as f:
    report = json.load(f)
if log_path.suffix == '.gz':
    with gzip.open(log_path, 'rt') as f:
        log = f.read()
else:
    log = log_path.read_text()
rows = []


def walk(suite):
    for spec in suite.get('specs', []):
        for test in spec['tests']:
            rows.append({
                'file': Path(spec['file']).name,
                'title': spec['title'],
                'status': test['status'],
                'results': [result['status'] for result in test['results']],
            })
    for child in suite.get('suites', []):
        walk(child)


for suite in report['suites']:
    walk(suite)

active = []
for entry in re.findall(r'^  \d+\) \[chromium\] › (.+?) \n\n    Test was interrupted\.', log, re.M):
    filename = entry.split(':', 1)[0].split('/')[-1]
    title = entry.split(' › ')[-1]
    matches = [row for row in rows if row['file'] == filename and row['title'] == title]
    assert len(matches) == 1 and matches[0]['results'] == ['skipped'], (filename, title, matches)
    active.append({'file': filename, 'title': title, 'matches': matches})

output = {
    'discovered': len(rows),
    'resultLengths': {str(length): sum(len(row['results']) == length for row in rows)
                      for length in sorted({len(row['results']) for row in rows})},
    'resultStatuses': {status: sum(bool(row['results']) and row['results'][-1] == status for row in rows)
                       for status in sorted({row['results'][-1] for row in rows if row['results']})},
    'terminalInterrupted': active,
    'emptyResultTotal': sum(not row['results'] for row in rows),
    'notDispatched': sum(not row['results'] for row in rows),
    'otherSkipped': sum(row['results'] == ['skipped'] for row in rows) - len(active),
}
print(json.dumps(output, ensure_ascii=False, indent=2))
