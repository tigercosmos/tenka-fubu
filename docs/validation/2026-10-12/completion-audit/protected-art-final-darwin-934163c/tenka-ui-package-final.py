from pathlib import Path
import gzip,hashlib,json,shutil
from PIL import Image,ImageChops
repo=Path('/Users/tigercosmos/tenka-fubu')
base=repo/'docs/validation/2026-10-12/completion-audit'
integrated=base/'ui-integrated-934163c';integrated.mkdir(exist_ok=False)
darwin=base/'protected-art-final-darwin-934163c'
def archive(directory,names):
 external=[]
 for name in names:
  root=Path('/tmp')/name
  for p in sorted(root.rglob('*')):
   if not p.is_file():continue
   raw=p.read_bytes()
   if p.suffix=='.zip':
    external.append({'path':str(p),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()});continue
   out=directory/'raw'/name/p.relative_to(root);out.parent.mkdir(parents=True,exist_ok=True)
   if p.suffix in ['.png','.jpg','.jpeg']:out.write_bytes(raw)
   else:out.with_name(out.name+'.gz').write_bytes(gzip.compress(raw,mtime=0))
 (directory/'external-traces.json').write_text(json.dumps(external,indent=2)+'\n')
archive(integrated,['tenka-ui-integrated-934163c','tenka-ui-integrated-934163c-launch','tenka-ui-sourcecontracts-934163c','tenka-ui-darwin-crossscreen-934163c','tenka-961f0ae-balance-audit-01','tenka-961-population-calibration-run'])
archive(darwin,['tenka-ui-darwin-visual-934163c','tenka-ui-darwin-source-before-934163c','tenka-ui-darwin-source-after-934163c','tenka-ui-darwin-review-copy-934163c'])
for directory in [integrated,darwin]:
 for path in ['/tmp/tenka-validation-capture-961f0ae.py','/tmp/tenka-ui-integrated-run.py','/tmp/tenka-ui-native-sourceproof.py','/tmp/tenka-ui-package-final.py']:
  shutil.copyfile(path,directory/Path(path).name)
rows=[]
for preset in ['overview','operational','close']:
 before=base/'protected-art-integrated-darwin'/f'strategy-{preset}-actual.png'
 after=darwin/f'strategy-{preset}-actual.png'
 a=Image.open(before).convert('RGB');b=Image.open(after).convert('RGB');assert a.size==b.size
 diff=ImageChops.difference(a,b)
 count=sum(1 for pixel in diff.getdata() if any(pixel))
 rows.append({'camera':preset,'previous':str(before.relative_to(base)),'previousSha256':hashlib.sha256(before.read_bytes()).hexdigest(),'current':after.name,'currentSha256':hashlib.sha256(after.read_bytes()).hexdigest(),'exactRgbChangedPixels':count,'boundsExclusive':diff.getbbox()})
(darwin/'previous-to-final.json').write_text(json.dumps(rows,indent=2)+'\n')
print(json.dumps({'integrated':str(integrated),'darwin':str(darwin),'comparison':rows},indent=2))
