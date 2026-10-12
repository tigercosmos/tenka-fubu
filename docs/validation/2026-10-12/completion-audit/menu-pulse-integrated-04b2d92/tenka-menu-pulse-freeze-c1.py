import json,subprocess
from pathlib import Path
repo=Path('/Users/tigercosmos/tenka-fubu')
out=Path('/tmp/tenka-menu-pulse-freeze-proof-c1');out.mkdir()
def capture(name,args):
 with (out/(name+'.stdout')).open('xb') as log,(out/(name+'.stderr')).open('xb') as err:
  r=subprocess.run(args,cwd=repo,stdout=log,stderr=err)
 assert r.returncode==0,(name,r.returncode)
 return (out/(name+'.stdout')).read_text().strip()
head=capture('head',['git','rev-parse','HEAD'])
assert not capture('tracked-status',['git','status','--porcelain','--untracked-files=no'])
scope=capture('scope',['git','diff','--name-only','5febce9',head]).splitlines()
assert len(scope)==7,scope
(out/'scope.json').write_text(json.dumps(scope,indent=2)+'\n')
(out/'head.json').write_text(json.dumps({'revision':head},indent=2)+'\n')
print(json.dumps({'revision':head,'files':scope}),flush=True)
