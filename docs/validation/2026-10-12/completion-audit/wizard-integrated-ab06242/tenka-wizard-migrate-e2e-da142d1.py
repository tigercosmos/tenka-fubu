"""Migrate only the inventoried direct final-start calls, preserving every other test byte."""
from pathlib import Path
import hashlib
import json
import sys

repo = Path('/Users/tigercosmos/tenka-fubu')
baseline = Path('/tmp/tenka-wizard-migration-baseline-da142d1/stdout-stderr.log').read_text()
names = sorted({line.split(':')[0] for line in baseline.splitlines() if line.startswith('e2e/')})
assert len(names) == 57
batch = int(sys.argv[1])
assert batch in (1, 2)
selected = names[:28] if batch == 1 else names[28:]
old = "await page.getByTestId('newgame-start').click();"
new = 'await completeNewGameWizard(page);'
added_import = "import { completeNewGameWizard } from './new-game-wizard';\n"
records = []
for name in selected:
    path = repo / name
    before = path.read_text()
    count = before.count(old)
    assert count >= 1, name
    assert 'completeNewGameWizard' not in before, name
    after = added_import + before.replace(old, new)
    assert after.removeprefix(added_import).replace(new, old) == before
    path.write_text(after)
    records.append({'path': name, 'replacements': count,
                    'beforeSha256': hashlib.sha256(before.encode()).hexdigest(),
                    'afterSha256': hashlib.sha256(after.encode()).hexdigest()})
print(json.dumps({'batch': batch, 'files': len(records),
                  'replacements': sum(row['replacements'] for row in records), 'records': records}, indent=2))
