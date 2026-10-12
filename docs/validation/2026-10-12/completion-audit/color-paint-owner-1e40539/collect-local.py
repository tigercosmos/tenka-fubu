"""Copy compact raw run packages from sim4; keep full browser outputs remote."""

import pathlib
import subprocess


HERE = pathlib.Path(__file__).resolve().parent
RUNS = {
    'diagnostic': 'color-owner-1e40539-c1',
    'original': 'color-original-achromatopsia-1e40539-c1',
}
ROOT = '/tmp/tenka-battle-79682cd/runs'
NAMES = (
    'report.json.gz', 'stdout-stderr.log.gz', 'metadata.tar.gz',
    'browser-inventory.json', 'package-inventory.json',
)


for label, name in RUNS.items():
    target = HERE / label
    target.mkdir(exist_ok=False)
    for filename in NAMES:
        remote = f'sim4:{ROOT}/{name}/{filename}'
        subprocess.run(['scp', remote, str(target / filename)], check=True)
    print(f'{label}: copied {len(NAMES)} compact artifacts', flush=True)
