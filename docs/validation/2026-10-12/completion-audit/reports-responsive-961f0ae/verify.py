from pathlib import Path
import base64, gzip, hashlib, json, subprocess

HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]

def read(run, name):
    return gzip.decompress((HERE / 'runs' / run / (name + '.gz')).read_bytes())

def main():
    manifest = json.loads((HERE / 'manifest.json').read_text())
    for path, expected in manifest.items():
        assert hashlib.sha256((HERE / path).read_bytes()).hexdigest() == expected, path
    pins = json.loads((HERE / 'source-hashes.json').read_text())
    for revision, files in pins.items():
        for path, expected in files.items():
            data = subprocess.check_output(['git', 'show', revision + ':' + path], cwd=REPO)
            assert hashlib.sha256(data).hexdigest() == expected, (revision, path)
    before = json.loads(read('tenka-reports-candidate-source-before', 'stdout-stderr.log'))
    after = json.loads(read('tenka-reports-candidate-source-after', 'stdout-stderr.log'))
    assert before == after and before['inputCount'] == 1552
    assert before['overlays'] == pins['5f250eb']
    original = json.loads(read('tenka-reports-native-02', 'report.json'))
    candidate = json.loads(read('tenka-reports-native-03', 'report.json'))
    assert original['stats']['expected'] == 14 and original['stats']['unexpected'] == 1
    assert candidate['stats']['expected'] == 15 and candidate['stats']['unexpected'] == 0
    failed = [s for s in original['suites'][0]['specs'] if not s['ok']]
    assert len(failed) == 1 and failed[0]['title'].endswith('scale 0.9')
    result = failed[0]['tests'][0]['results'][0]
    density = json.loads(base64.b64decode(next(a['body'] for a in result['attachments'] if a['name'] == 'native-report-density')))
    assert density['observations']['cards'][0]['height'] == 57.65625
    assert json.loads(read('tenka-reports-native-01', 'result.json'))['exitCode'] == 130
    rows = json.loads((HERE / 'measurements.json').read_text())
    assert [r['native-report-density']['scale'] for r in rows] == [round(.8+i*.05, 2) for i in range(15)]
    count = 0
    for row in rows:
        density = row['native-report-density']['observations']
        for card in density['cards']:
            assert card['height'] <= max(56, density['rem'] * 3.5)
            assert not card['overflow']
            for item in card['texts']:
                assert item['font'] >= 12 and all(r['contained'] for r in item['rects'])
        for control in row['report-center-controls']['measurements']:
            count += 1
            assert control['width'] >= 32 and control['height'] >= 32 and control['hit']
            assert 0 <= control['left'] <= control['right'] <= 1280
            assert 0 <= control['top'] <= control['bottom'] <= 720
        for item in row['report-center-text']['textMeasurements']:
            assert item['font'] >= 12 and item['contained'] and not item['overflow']
    assert count == 195
    assert '29 passed' in read('tenka-reports-unit-01', 'stdout-stderr.log').decode()
    print('Report evidence verified: original density RED; candidate15 PASS,195 controls,1552 source inputs')

if __name__ == '__main__':
    main()
