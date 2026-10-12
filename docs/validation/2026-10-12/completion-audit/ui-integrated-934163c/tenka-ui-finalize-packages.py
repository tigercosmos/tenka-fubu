from pathlib import Path
import gzip,hashlib,json,subprocess,shutil
repo=Path('/Users/tigercosmos/tenka-fubu');base=repo/'docs/validation/2026-10-12/completion-audit'
report=base/'reports-responsive-961f0ae'
for name in ['tenka-reports-package-01','tenka-reports-package-finalize-01','tenka-reports-evidence-format-01','tenka-reports-evidence-format-fix-01']:
 for p in (Path('/tmp')/name).rglob('*'):
  if p.is_file():
   dest=report/'runs'/name/p.relative_to(Path('/tmp')/name);dest.parent.mkdir(parents=True,exist_ok=True)
   dest.with_name(dest.name+'.gz').write_bytes(gzip.compress(p.read_bytes(),mtime=0))
shutil.copyfile('/tmp/tenka-961-population-calibration.py',base/'ui-integrated-934163c'/'tenka-961-population-calibration.py')
packages=[report,base/'ui-integrated-934163c',base/'protected-art-final-darwin-934163c']
subprocess.run(['node_modules/.bin/prettier','--write',*[str(p) for p in packages],'CLAUDE.md','wip.md',str(base/'README.md')],cwd=repo,check=True)
for p in packages:
 files={str(f.relative_to(p)):hashlib.sha256(f.read_bytes()).hexdigest() for f in sorted(p.rglob('*')) if f.is_file() and f.name!='manifest.json'}
 (p/'manifest.json').write_text(json.dumps(files,indent=2)+'\n')
for p in packages:
 subprocess.run(['python3',str(p/'verify.py')],cwd=repo,check=True)
