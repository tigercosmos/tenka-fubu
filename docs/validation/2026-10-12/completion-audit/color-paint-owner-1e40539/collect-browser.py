"""Copy selected exact browser outputs; full hashed trees remain on sim4."""

import gzip
import json
import pathlib
import subprocess


HERE = pathlib.Path(__file__).resolve().parent
RUNS = {
    'diagnostic': 'color-owner-1e40539-c1',
    'original': 'color-original-achromatopsia-1e40539-c1',
}


for label, name in RUNS.items():
    inventory = json.loads((HERE / label / 'browser-inventory.json').read_text())
    browser = HERE / label / 'browser-selected'
    browser.mkdir(exist_ok=False)
    for row in inventory['files']:
        relative = pathlib.PurePosixPath(row['path'])
        if relative.suffix == '.png':
            target = browser.joinpath(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            subprocess.run(['scp', f"sim4:{inventory['root']}/{row['path']}", str(target)], check=True)
        elif relative.suffix == '.json' and relative.name not in {'.last-run.json'}:
            target = browser.joinpath(*relative.parts).with_suffix('.json.gz')
            target.parent.mkdir(parents=True, exist_ok=True)
            with target.open('xb') as stream:
                process = subprocess.run(
                    ['ssh', 'sim4', 'gzip', '-c', f"{inventory['root']}/{row['path']}"],
                    stdout=stream,
                    check=True,
                )
                assert process.returncode == 0
    print(f'{label}: copied PNG and compressed JSON selected outputs', flush=True)
