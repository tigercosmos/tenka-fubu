from pathlib import Path
import subprocess,json,os,sys
root=Path(sys.argv[1]).resolve()
env=dict(os.environ)
controls=[('drift-sign','src/core/systems/diplomacy.ts','-Math.sign(value) * Math.min','Math.sign(value) * Math.min'),('exclusive-threshold','src/core/systems/diplomacy.ts',">=\n          BAL.dipAcceptThreshold",">\n          BAL.dipAcceptThreshold"),('wrong-awe-loser-level','src/core/systems/awe.ts','BAL.aweSentimentLoserHit[index]','BAL.aweSentimentLoserHit[0]'),('wrong-awe-neighbor-level','src/core/systems/awe.ts','BAL.aweSentimentNeighborHit[index]','BAL.aweSentimentLoserHit[index]')]
rows=[]
for name,path,old,new in controls:
 f=root/path;original=f.read_text();assert original.count(old)==1,(name,original.count(old))
 try:
  f.write_text(original.replace(old,new))
  result=subprocess.run(['node_modules/.bin/vitest','run','tests/core/m6DiplomacyAcceptance.spec.ts','--project','core','--minWorkers=1','--maxWorkers=1'],cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
  (root/('fault-'+name+'.log')).write_text(result.stdout)
  rows.append({'name':name,'file':path,'replace':old,'with':new,'exitCode':result.returncode})
  assert result.returncode==1,(name,result.returncode)
 finally:f.write_text(original)
(root/'fault-controls.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps(rows,indent=2))
