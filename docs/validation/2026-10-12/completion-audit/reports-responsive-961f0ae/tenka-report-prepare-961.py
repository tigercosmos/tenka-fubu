import hashlib,json,shutil,subprocess
from pathlib import Path
root=Path('/Users/tigercosmos/tenka-fubu'); dest=Path('/tmp/tenka-reports-961f0ae'); dest.mkdir()
paths=['src','e2e','tests','public','rust','tools','plan','package.json','package-lock.json','index.html','milestone.json','tsconfig.json','tsconfig.core.json','vite.config.ts','vitest.workspace.ts','playwright.config.ts','eslint.config.js','.prettierrc.json','.prettierignore','.gitignore']
a=subprocess.Popen(['git','archive','961f0ae',*paths],cwd=root,stdout=subprocess.PIPE)
b=subprocess.run(['tar','-xf','-','-C',str(dest)],stdin=a.stdout);a.stdout.close();assert b.returncode==0 and a.wait()==0
names=subprocess.check_output(['git','ls-files','-z',*paths],cwd=root).decode().split('\0'); inventory=[]
for name in names:
 if not name:continue
 data=(dest/name).read_bytes(); expected=subprocess.check_output(['git','show','961f0ae:'+name],cwd=root);assert data==expected
 inventory.append({'path':name,'sha256':hashlib.sha256(data).hexdigest()})
with (dest/'baseline-source.json').open('x') as f:json.dump(inventory,f,indent=2)
overlay='e2e/report-compact-presentation.spec.ts';shutil.copy2(root/overlay,dest/overlay)
with (dest/'overlay-source.json').open('x') as f:json.dump({'path':overlay,'sha256':hashlib.sha256((dest/overlay).read_bytes()).hexdigest()},f,indent=2)
(dest/'node_modules').symlink_to(root/'node_modules',target_is_directory=True)
print(json.dumps({'destination':str(dest),'baselineInputs':len(inventory),'overlay':overlay,'dependencies':'reused local node_modules symlink; not fresh'}))
