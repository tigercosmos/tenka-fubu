from pathlib import Path
import gzip,hashlib,json,shutil,base64,subprocess
repo=Path('/Users/tigercosmos/tenka-fubu')
out=repo/'docs/validation/2026-10-12/completion-audit/reports-responsive-961f0ae'
out.mkdir(exist_ok=False)
names=['tenka-report-format-01','tenka-reports-prepare-capture','tenka-reports-overlay-02','tenka-reports-build-01','tenka-reports-native-01','tenka-reports-interrupt-observer-01','tenka-report-format-02','tenka-reports-overlay-03','tenka-reports-types-01','tenka-reports-native-02','tenka-reports-density-overlay-01','tenka-reports-unit-01','tenka-reports-build-02','tenka-reports-candidate-source-before','tenka-reports-native-03','tenka-reports-candidate-source-after','tenka-reports-eslint-01','tenka-reports-format-check-01','tenka-reports-commit-01']
external=[]
for name in names:
 for p in sorted((Path('/tmp')/name).rglob('*')):
  if not p.is_file():continue
  raw=p.read_bytes();rel=Path('runs')/name/p.relative_to(Path('/tmp')/name)
  if p.suffix=='.zip':
   external.append({'path':str(p),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'note':'Original trace retained externally; interrupted native-01 may be truncated.'});continue
  dest=out/rel;dest.parent.mkdir(parents=True,exist_ok=True)
  if p.suffix in ['.log','.json','.ts','.py']:
   dest=dest.with_name(dest.name+'.gz');dest.write_bytes(gzip.compress(raw,mtime=0))
  else:dest.write_bytes(raw)
for p in ['/tmp/tenka-validation-capture-961f0ae.py','/tmp/tenka-reports-verify-source.py','/tmp/tenka-report-prepare-961.py','/tmp/tenka-package-reports.py']:
 shutil.copyfile(p,out/Path(p).name)
(out/'external-traces.json').write_text(json.dumps(external,indent=2)+'\n')
source=['e2e/report-compact-presentation.spec.ts','src/ui/components/ReportStack/ReportStack.module.css','src/ui/components/ReportStack/ReportStack.spec.tsx']
pins={rev:{p:hashlib.sha256(subprocess.check_output(['git','show',f'{rev}:{p}'],cwd=repo)).hexdigest() for p in source} for rev in ['961f0ae','5f250eb']}
(out/'source-hashes.json').write_text(json.dumps(pins,indent=2)+'\n')
shutil.copyfile('/tmp/tenka-reports-961f0ae/baseline-source.json',out/'baseline-source.json')
report=json.loads(Path('/tmp/tenka-reports-native-03/report.json').read_text())
rows=[]
for spec in report['suites'][0]['specs']:
 row={a['name']:json.loads(base64.b64decode(a['body'])) for a in spec['tests'][0]['results'][0]['attachments'] if a.get('contentType')=='application/json'}
 rows.append(row)
(out/'measurements.json').write_text(json.dumps(rows,indent=2,ensure_ascii=False)+'\n')
print(json.dumps({'package':str(out),'scales':len(rows),'controls':sum(len(r['report-center-controls']['measurements']) for r in rows),'externalTraces':len(external)}))
