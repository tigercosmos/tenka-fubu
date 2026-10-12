import hashlib,json,pathlib,subprocess,time,sys
root=pathlib.Path('/Users/tigercosmos/tenka-fubu')
out=pathlib.Path(sys.argv[1]);out.mkdir(exist_ok=False)
head=subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()
paths=subprocess.check_output(['git','ls-files','-z','src','e2e','tests','tools','public','rust','plan','package.json','package-lock.json','index.html','*.config.*','tsconfig*.json'],cwd=root).decode().split('\0')
paths=sorted(set(p for p in paths if p))
def proof(label):
 rows=[]
 for p in paths:
  expected=hashlib.sha256(subprocess.check_output(['git','show',head+':'+p],cwd=root)).hexdigest()
  actual=hashlib.sha256((root/p).read_bytes()).hexdigest()
  rows.append(dict(path=p,expected=expected,actual=actual))
 data=dict(head=head,passed=all(r['expected']==r['actual'] for r in rows),rows=rows)
 with (out/(label+'.json')).open('x') as f:json.dump(data,f,indent=2)
 assert data['passed']
proof('source-before')
commands=[
 ('focused',['node_modules/.bin/vitest','run','src/app/hotkeys.spec.ts','src/ui/components/ReportStack/ReportStack.spec.tsx','src/ui/components/Panel/SharedPanelFrame.spec.tsx','src/ui/screens/MainScreen','src/ui/screens/SettingsPanel.spec.tsx','src/ui/screens/SettingsWarRoom.spec.tsx','src/ui/screens/SaveLoadPanel.spec.tsx','src/ui/screens/SaveLoadWarRoom.spec.tsx','src/ui/screens/ReportsPanel.spec.tsx','src/ui/screens/OfficerList.spec.tsx','tests/app/useSaveLoad.spec.tsx']),
 ('typecheck',['npm','run','typecheck']),
 ('eslint',['node_modules/.bin/eslint','.']),
 ('data',['npm','run','validate:data']),
 ('assets',['npm','run','validate:assets']),
 ('build',['npm','run','build']),
 ('bundle',['npm','run','validate:bundle']),
]
statuses=[]
for label,cmd in commands:
 start=time.monotonic()
 with (out/(label+'.log')).open('xb',buffering=0) as f:
  result=subprocess.run(cmd,cwd=root,stdout=f,stderr=subprocess.STDOUT)
 row=dict(label=label,command=cmd,exit=result.returncode,seconds=time.monotonic()-start)
 statuses.append(row);print(json.dumps(row),flush=True)
 with (out/(label+'.result.json')).open('x') as f:json.dump(row,f,indent=2)
proof('source-after')
with (out/'status.json').open('x') as f:json.dump(statuses,f,indent=2)
sys.exit(0 if all(x['exit']==0 for x in statuses) else 1)
