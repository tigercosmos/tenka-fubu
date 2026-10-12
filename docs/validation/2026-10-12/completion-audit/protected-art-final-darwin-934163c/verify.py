from pathlib import Path
import gzip,hashlib,json,subprocess
HERE=Path(__file__).resolve().parent
REPO=HERE.parents[4]
def read(run,name):return gzip.decompress((HERE/'raw'/run/(name+'.gz')).read_bytes())
def main():
 for name,expected in json.loads((HERE/'manifest.json').read_text()).items():
  assert hashlib.sha256((HERE/name).read_bytes()).hexdigest()==expected,name
 before=json.loads(read('tenka-ui-darwin-source-before-934163c','stdout-stderr.log'))
 after=json.loads(read('tenka-ui-darwin-source-after-934163c','stdout-stderr.log'))
 assert before==after and before['inputCount']==1589
 assert before['head'].startswith('934163c')
 report=json.loads(read('tenka-ui-darwin-visual-934163c','report.json'))
 assert report['stats']['expected']==4 and report['stats']['unexpected']==1
 log=read('tenka-ui-darwin-visual-934163c','stdout-stderr.log').decode()
 for count in [185869,269381,291228]:assert str(count)+' pixels' in log
 comparison=json.loads((HERE/'previous-to-final.json').read_text())
 assert [r['exactRgbChangedPixels'] for r in comparison]==[17065,19258,21509]
 for row in comparison:
  preset=row['camera']
  assert hashlib.sha256((HERE/row['current']).read_bytes()).hexdigest()==row['currentSha256']
  assert hashlib.sha256((HERE.parent/row['previous']).read_bytes()).hexdigest()==row['previousSha256']
  expected=subprocess.check_output(['git','show',before['head']+f':e2e/visual.spec.ts-snapshots/strategy-{preset}-chromium-darwin.png'],cwd=REPO)
  assert expected==(HERE/f'strategy-{preset}-expected.png').read_bytes()
  raw=next((HERE/'raw'/'tenka-ui-darwin-visual-934163c'/'browser-results').rglob(f'strategy-{preset}-actual.png'))
  assert raw.read_bytes()==(HERE/row['current']).read_bytes()
 print('Darwin934163c verified:4 originalPASS/protected3viewsRED,1589 unchangedinputs,referencebytes preserved')
if __name__=='__main__':main()
