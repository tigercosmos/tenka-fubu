import gzip, hashlib, json
from pathlib import Path
p=Path(__file__).resolve().parent
for line in (p/'SHA256SUMS').read_text().splitlines():
 h,n=line.split('  ',1); assert hashlib.sha256((p/n).read_bytes()).hexdigest()==h,n
def raw(d,n): return gzip.decompress((p/'raw'/d/(n+'.gz')).read_bytes())
def obj(d,n): return json.loads(raw(d,n))
d='tenka-menu-pulse-integrated-c1'
s=obj(d,'status.json'); assert len(s)==10
assert {x['label']:x['exitCode'] for x in s}=={'focused':0,'typecheck':0,'eslint':1,'data':0,'assets':0,'build':0,'bundle':0,'discovery':0,'gallery-discovery':0,'format':0}
a=obj(d,'source-before.json'); assert a==obj(d,'source-after.json') and a['passed']
assert a['revision']=='04b2d922bcdf80fab8aca3d6f41d2234970166b1' and len(a['rows'])==1648
assert all(r['actualBlob']==r['expectedBlob'] and r['modeMatches'] for r in a['rows'])
b=obj(d,'source-before-pixi.json'); assert len(b)==29 and b==obj(d,'source-after-pixi.json')
assert all(r['expected']==r['actual'] for r in b)
assert b'247 passed (247)' in raw(d,'focused.log')
assert b'Total: 440 tests in 106 files' in raw(d,'discovery.log')
assert b'Total: 8 tests in 4 files' in raw(d,'gallery-discovery.log')
assert raw(d,'eslint.log').count(b'Parsing error:')==5
assert obj('tenka-menu-pulse-full-lint-c2','result.json')['exitCode']==0
assert b'0 errors, 2 warnings' in raw('tenka-menu-pulse-full-lint-c2','stdout-stderr.log')
assert len(obj('tenka-menu-pulse-freeze-proof-c1','scope.json'))==7
assert not raw('tenka-menu-pulse-freeze-proof-c1','tracked-status.stdout').strip()
print('PASS: hashes,1648 source/29 dependencies,247 tests,all checks,original ESLint RED and separate full lint PASS')
