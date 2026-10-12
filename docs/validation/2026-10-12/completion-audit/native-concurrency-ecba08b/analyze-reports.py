"""Classify complete Playwright JSON reports and terminal interrupted titles.

Usage: python3 analyze-reports.py REPORT_JSON STDOUT_LOG OUTPUT_JSON
The output retains one row per discovered test, including the complete title path.
"""

import collections
import gzip
import json
import re
import sys
from pathlib import Path


def read_text(path):
    path = Path(path)
    if path.suffix == '.gz':
        with gzip.open(path, 'rt') as stream:
            return stream.read()
    return path.read_text()


report = json.loads(read_text(sys.argv[1]))
log = read_text(sys.argv[2])
project_names = [project['name'] for project in report['config']['projects']]
assert len(project_names) == 1, project_names
project = project_names[0]
rows = []


def walk(suite, path=()):
    suite_file = suite.get('file')
    title = suite.get('title')
    prefix = path if suite_file else path + ((title,) if title else ())
    for spec in suite.get('specs', []):
        key = [project, spec['file'], spec['line'], spec['column'], *prefix, spec['title']]
        for test in spec['tests']:
            results = test['results']
            rows.append({
                'key': key,
                'project': project,
                'file': spec['file'],
                'line': spec['line'],
                'column': spec['column'],
                'titlePath': [*prefix, spec['title']],
                'testId': test.get('id'),
                'reportStatus': test['status'],
                'expectedStatus': test['expectedStatus'],
                'results': [result['status'] for result in results],
                'durationsMs': [result.get('duration') for result in results],
                'errors': [
                    ((result.get('error') or {}).get('message') or '').splitlines()[0]
                    for result in results if result.get('error')
                ],
            })
    for child in suite.get('suites', []):
        walk(child, prefix)


for suite in report['suites']:
    walk(suite)

keys = [json.dumps(row['key'], ensure_ascii=False) for row in rows]
assert len(keys) == len(set(keys)), 'duplicate full test key'

interrupt_pattern = re.compile(
    r'^  \d+\) \[([^]]+)\] › ([^\n]+?)\s*\n\n    Test was interrupted\.',
    re.M,
)
interrupted = []
for terminal_project, terminal_path in interrupt_pattern.findall(log):
    terminal_path = re.sub(r'\s+─+\s*$', '', terminal_path)
    segments = terminal_path.split(' › ')
    locator = re.fullmatch(r'(.+?):(\d+):(\d+)', segments[0])
    assert locator is not None, terminal_path
    filename, line, column = locator.groups()
    matches = [
        row for row in rows
        if row['project'] == terminal_project
        and Path(row['file']).name == Path(filename).name
        and row['line'] == int(line)
        and row['column'] == int(column)
        and row['titlePath'] == segments[1:]
    ]
    assert len(matches) == 1, (terminal_path, matches)
    row = matches[0]
    assert row['results'] == ['skipped'], (terminal_path, row['results'])
    interrupted.append(row['key'])

interrupt_keys = [json.dumps(key, ensure_ascii=False) for key in interrupted]
assert len(interrupt_keys) == len(set(interrupt_keys)), 'duplicate terminal interruption'
interrupt_set = set(interrupt_keys)
for row in rows:
    key = json.dumps(row['key'], ensure_ascii=False)
    if key in interrupt_set:
        row['category'] = 'terminalInterrupted'
    elif not row['results']:
        row['category'] = 'notDispatched'
    elif row['results'][-1] == 'skipped':
        row['category'] = 'otherSkipped'
    else:
        row['category'] = row['results'][-1]

counts = dict(sorted(collections.Counter(row['category'] for row in rows).items()))
assert sum(counts.values()) == len(rows)
output = {
    'projectNames': project_names,
    'stats': report['stats'],
    'discovered': len(rows),
    'categories': counts,
    'resultLengths': dict(sorted(collections.Counter(len(row['results']) for row in rows).items())),
    'terminalInterrupted': interrupted,
    'rows': rows,
}
Path(sys.argv[3]).open('x').write(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: output[key] for key in ('discovered', 'stats', 'categories', 'resultLengths')}, ensure_ascii=False, indent=2))
