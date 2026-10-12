"""Reconstruct temporary test overlays and check contemporaneous SHA-256 IDs."""

import hashlib
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'sources'
OUT.mkdir(exist_ok=False)
base = subprocess.check_output(
    ['git', 'show', '1649c6516e7cb2cbaf0f9bdf08859b510e8b922b:e2e/earned-alliance.spec.ts'],
    cwd=ROOT.parents[4],
).decode()
old = '''  const after = await state(page);
  expect(after.time.day).toBe(before + 1);
'''
diagnostic = '''  const after = await state(page);
  const diagnostics = await page.evaluate(() => window.__tenka.debug.getSimulationDiagnostics());
  expect(after.time.day, JSON.stringify({ before, after: after.time.day, diagnostics })).toBe(
    before + 1,
  );
'''
assert base.count(old) == 1
diagnostic_source = base.replace(old, diagnostic)
final = subprocess.check_output(
    ['git', 'show', '1e40539:e2e/earned-alliance.spec.ts'], cwd=ROOT.parents[4]
).decode()
formatted = '''  expect(
    await page.evaluate(() => window.__tenka.debug.getSimulationDiagnostics().pendingTicks),
  ).toBe(0);
'''
preformat = '''  expect(await page.evaluate(() => window.__tenka.debug.getSimulationDiagnostics().pendingTicks)).toBe(
    0,
  );
'''
assert final.count(formatted) == 1
candidate_source = final.replace(formatted, preformat)
sources = {
    'original-earned-alliance.ts.txt': (base, None),
    'diagnostic-earned-alliance.ts.txt': (
        diagnostic_source, '36f93527c332a2bb2881f2a3a9ca8c91493649e24a218fc413124b5332d33d4e',
    ),
    'candidate-preformat-earned-alliance.ts.txt': (
        candidate_source, '501a0c723edf42ca790d3f6e3020461a713b4e311919508cd50a1d72eb8d6ae0',
    ),
    'final-earned-alliance.ts.txt': (
        final, 'b97e4f5e62fc2699e2efd84739df7ff36d7785182492cd47e71ecbf8acb1c29b',
    ),
}
for name, (source, expected) in sources.items():
    data = source.encode()
    digest = hashlib.sha256(data).hexdigest()
    if expected is not None:
        assert digest == expected, (name, digest)
    (OUT / name).open('xb').write(data)
    print(name, digest)
