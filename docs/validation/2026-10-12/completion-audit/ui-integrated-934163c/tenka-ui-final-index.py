from pathlib import Path
import gzip,hashlib,json,shutil,subprocess
repo=Path('/Users/tigercosmos/tenka-fubu');base=repo/'docs/validation/2026-10-12/completion-audit'
package=base/'ui-integrated-934163c'
for name in ['tenka-ui-full-prettier-934163c','tenka-ui-package-final-934163c','tenka-ui-package-finalize-934163c','tenka-ui-linux-review-link-fix-934163c']:
 for p in (Path('/tmp')/name).rglob('*'):
  if p.is_file():
   dest=package/'raw'/name/p.relative_to(Path('/tmp')/name);dest.parent.mkdir(parents=True,exist_ok=True)
   dest.with_name(dest.name+'.gz').write_bytes(gzip.compress(p.read_bytes(),mtime=0))
for p in ['/tmp/tenka-ui-finalize-packages.py','/tmp/tenka-ui-final-index.py']:
 shutil.copyfile(p,package/Path(p).name)
subprocess.run(['node_modules/.bin/prettier','--check','CLAUDE.md','wip.md'],cwd=repo,check=True)
manifest={str(f.relative_to(package)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(package.rglob('*')) if f.is_file() and f.name!='manifest.json'}
(package/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
relative='docs/validation/2026-10-12/completion-audit/continuation-artifact-sha256.json'
historical=json.loads(subprocess.check_output(['git','show','961f0ae:'+relative],cwd=repo))
current=json.loads((repo/relative).read_text());assert current==historical
assert len(current['artifacts'])==2073
for row in current['artifacts']:
 raw=(base/row['path']).read_bytes()
 assert len(raw)==row['bytes'] and hashlib.sha256(raw).hexdigest()==row['sha256'],row['path']
names=['reports-responsive-961f0ae','nonpolicy-responsive-961f0ae','keyboard-minimum-961f0ae','ui-integrated-934163c','protected-art-final-linux-934163c','protected-art-final-darwin-934163c']
new=[]
for name in names:
 for p in sorted((base/name).rglob('*')):
  if not p.is_file():continue
  raw=p.read_bytes();row={'path':str(p.relative_to(base)),'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
  if p.suffix=='.gz':
   digest=hashlib.sha256();size=0
   with gzip.open(p,'rb') as f:
    while block:=f.read(8*1024*1024):digest.update(block);size+=len(block)
   row.update(uncompressedBytes=size,uncompressedSha256=digest.hexdigest())
  new.append(row)
assert len({r['path'] for r in current['artifacts']+new})==2073+len(new)
current['artifacts'].extend(new)
(repo/relative).write_text(json.dumps(current,indent=2,ensure_ascii=False)+'\n')
subprocess.run(['node_modules/.bin/prettier','--check',relative,str(package/'manifest.json')],cwd=repo,check=True)
print(json.dumps({'historicalRows':2073,'newRows':len(new),'totalRows':len(current['artifacts']),'historicalRowsAndBytesUnchanged':True}))
