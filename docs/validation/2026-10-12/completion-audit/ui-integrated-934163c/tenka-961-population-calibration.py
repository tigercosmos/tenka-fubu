import hashlib,json,subprocess
from pathlib import Path
root=Path('/Users/tigercosmos/tenka-fubu')
paths=['src/data/scenarios/s1560/districts.json','src/core/balance.ts','plan/14-scenario-data.md','plan/15-balance.md','plan/00-foundations.md']
proof=[]
for name in paths:
 b=(root/name).read_bytes();assert b==subprocess.check_output(['git','show','961f0ae:'+name],cwd=root);proof.append({'path':name,'sha256':hashlib.sha256(b).hexdigest()})
rows=json.loads((root/paths[0]).read_text());pop=sum(x['population'] for x in rows);koku=sum(x['kokudaka'] for x in rows)
print(json.dumps({'source':'961f0ae','sourceProof':proof,'scope':'Read-only initial district population to kokudaka ratio. Does not evaluate castle base capacity, policy, facilities, recruitment, or dynamic balance. No invented approximation tolerance.','districtCount':len(rows),'population':pop,'kokudaka':koku,'populationPerKoku':pop/koku,'populationContributionAtPinned0025':pop*.025/koku,'districts':[{'id':x['id'],'population':x['population'],'kokudaka':x['kokudaka'],'populationPerKoku':x['population']/x['kokudaka']} for x in rows]},indent=2))
