from pathlib import Path
import hashlib,json,subprocess
root=Path('/Users/tigercosmos/tenka-fubu')
original=json.loads(Path('/tmp/tenka-ui-integrated-934163c/source-before.json').read_text())
assert subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip()==original['head']
rows=[]
for row in original['rows']:
 actual=hashlib.sha256((root/row['path']).read_bytes()).hexdigest()
 assert actual==row['expected'],row['path']
 rows.append({'path':row['path'],'sha256':actual})
print(json.dumps({'head':original['head'],'inputCount':len(rows),'inputs':rows},indent=2))
