import json, os, subprocess, time, hashlib
from pathlib import Path
root=Path('/Users/tigercosmos/tenka-fubu');out=Path('/tmp/tenka-wizard-correction-checks-c1');out.mkdir(exist_ok=False)
paths=['public/fonts/noto-serif-tc-subset.manifest.json','public/fonts/noto-serif-tc-subset.woff2','src/ui/screens/DaimyoSelect.module.css','e2e/new-game-wizard.spec.ts']
def proof(label):
 rows={name:hashlib.sha256((root/name).read_bytes()).hexdigest() for name in paths}
 with (out/(label+'.json')).open('x') as f:json.dump(rows,f,indent=2)
 return rows
before=proof('before')
commands=[('focused',['node_modules/.bin/vitest','run','tests/data/font-coverage.spec.ts','src/ui/screens/DaimyoSelect.spec.tsx','src/ui/screens/NewGameOptionsScreen.spec.tsx']),('typecheck',['npm','run','typecheck']),('eslint',['node_modules/.bin/eslint','e2e/new-game-wizard.spec.ts']),('data',['npm','run','validate:data']),('assets',['npm','run','validate:assets']),('build',['npm','run','build']),('bundle',['npm','run','validate:bundle']),('discovery',['node_modules/.bin/playwright','test','--list','--project=chromium']),('format',['node_modules/.bin/prettier','--check']+[p for p in paths if not p.endswith('.woff2')]),('diffcheck',['git','diff','--check'])]
statuses=[]
for label,argv in commands:
 with (out/(label+'.command.json')).open('x') as f:json.dump({'argv':argv,'cwd':str(root)},f)
 t=time.monotonic()
 with (out/(label+'.log')).open('xb',buffering=0) as f:
  os.fsync(f.fileno());r=subprocess.run(argv,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 row={'label':label,'exitCode':r.returncode,'seconds':time.monotonic()-t};statuses.append(row)
 with (out/(label+'.result.json')).open('x') as f:json.dump(row,f)
 print(json.dumps(row),flush=True)
after=proof('after');assert before==after
with (out/'status.json').open('x') as f:json.dump(statuses,f,indent=2)
raise SystemExit(0 if all(r['exitCode']==0 for r in statuses) else 1)
