import gc
import gzip
import json
from pathlib import Path

base = Path('/Users/tigercosmos/tenka-fubu/docs/validation/2026-10-12/completion-audit')


def digest(path):
    with gzip.open(path, 'rt') as stream:
        report = json.load(stream)
    rows = {}

    def walk(suite, prefix=()):
        title_path = prefix + (suite.get('title') or '',)
        for spec in suite.get('specs', []):
            for test in spec['tests']:
                key = (Path(spec['file']).name, *(part for part in title_path if part), spec['title'])
                assert key not in rows, key
                results = test['results']
                rows[key] = {
                    'file': Path(spec['file']).name,
                    'title': ' › '.join([*(part for part in title_path if part), spec['title']]),
                    'status': results[-1]['status'] if results else 'notDispatched',
                    'testStatus': test['status'],
                }
        for child in suite.get('suites', []):
            walk(child, title_path)

    for suite in report['suites']:
        walk(suite)
    del report
    gc.collect()
    return rows


prior = digest(base / 'native-full-suite-8ea965a/report.json.gz')
current = digest(base / 'native-full-suite-1464146/report.json.gz')
unexpected = {'failed', 'timedOut'}
out = {
    'priorCount': len(prior),
    'currentCount': len(current),
    'added': [current[key] for key in sorted(current.keys() - prior.keys())],
    'removed': [prior[key] for key in sorted(prior.keys() - current.keys())],
    'clearedUnexpected': [
        {'file': prior[key]['file'], 'title': prior[key]['title'],
         'before': prior[key]['status'], 'after': current[key]['status']}
        for key in sorted(prior.keys() & current.keys())
        if prior[key]['status'] in unexpected and current[key]['status'] not in unexpected
    ],
    'newUnexpected': [
        {'file': current[key]['file'], 'title': current[key]['title'],
         'before': prior[key]['status'], 'after': current[key]['status']}
        for key in sorted(prior.keys() & current.keys())
        if prior[key]['status'] not in unexpected and current[key]['status'] in unexpected
    ],
    'allStatusChanges': [
        {'file': current[key]['file'], 'title': current[key]['title'],
         'before': prior[key]['status'], 'after': current[key]['status']}
        for key in sorted(prior.keys() & current.keys())
        if prior[key]['status'] != current[key]['status']
    ],
}
print(json.dumps(out, ensure_ascii=False, indent=2))
