import subprocess,json,hashlib,os
from pathlib import Path
root=Path('/Users/tigercosmos/tenka-fubu');out=Path('/tmp/tenka-wizard-correction-commit-c1');out.mkdir(exist_ok=False)
checks=Path('/tmp/tenka-wizard-correction-checks-c1')
expected=json.loads((checks/'after.json').read_text());assert expected==json.loads((checks/'before.json').read_text())
assert all(x['exitCode']==0 for x in json.loads((checks/'status.json').read_text()))
for p,h in expected.items():assert hashlib.sha256((root/p).read_bytes()).hexdigest()==h
commands=[('stage',['git','add','--',*expected]),('scope',['git','diff','--cached','--name-only']),('check',['git','diff','--cached','--check']),('commit',['git','commit','-m','fix(ui): 修正大名卡片截字並補齊開局字型 [M8-17][M8-23]']),('head',['git','rev-parse','HEAD'])]
for label,argv in commands:
 with (out/(label+'.command.json')).open('x') as f:json.dump(argv,f)
 with (out/(label+'.log')).open('xb',buffering=0) as f:
  os.fsync(f.fileno());r=subprocess.run(argv,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 with (out/(label+'.result.json')).open('x') as f:json.dump({'exitCode':r.returncode},f)
 r.check_returncode()
 if label=='scope':assert set((out/'scope.log').read_text().splitlines())==set(expected)
print((out/'head.log').read_text(),flush=True)
