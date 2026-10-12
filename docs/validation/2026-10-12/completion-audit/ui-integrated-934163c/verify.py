from pathlib import Path
import gzip,hashlib,json,subprocess
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
def read(run,name):
 return gzip.decompress((HERE/'raw'/run/(name+'.gz')).read_bytes())
def main():
 for name,expected in json.loads((HERE/'manifest.json').read_text()).items():
  assert hashlib.sha256((HERE/name).read_bytes()).hexdigest()==expected,name
 before=json.loads(read('tenka-ui-integrated-934163c','source-before.json'))
 after=json.loads(read('tenka-ui-integrated-934163c','source-after.json'))
 assert before==after and before['passed'] and len(before['rows'])==1589
 assert before['head'].startswith('934163c')
 for row in before['rows']:
  assert row['expected']==row['actual']
  data=subprocess.check_output(['git','show',before['head']+':'+row['path']],cwd=REPO)
  assert hashlib.sha256(data).hexdigest()==row['expected'],row['path']
 statuses=json.loads(read('tenka-ui-integrated-934163c','status.json'))
 assert [r['label'] for r in statuses]==['focused','typecheck','eslint','data','assets','build','bundle']
 assert all(r['exit']==0 for r in statuses)
 assert '227 passed' in read('tenka-ui-integrated-934163c','focused.log').decode()
 assert '7 passed' in read('tenka-ui-sourcecontracts-934163c','stdout-stderr.log').decode()
 report=json.loads(read('tenka-ui-darwin-crossscreen-934163c','report.json'))
 assert report['stats']['expected']==6 and report['stats']['unexpected']==0
 assert json.loads(read('tenka-961f0ae-balance-audit-01','result.json'))['exitCode']==1
 print('Integrated934163c verified:1589 Git inputs,227+7 tests,6 browser cases,all scoped checksPASS;balance RED preserved')
if __name__=='__main__':main()
