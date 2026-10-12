"""Fail-closed sim4 Node/Chromium launcher for captured validation commands.

Run under tenka-validation-capture-961f0ae.py so the complete preflight and
command stdout/stderr share one exclusive log opened before this process starts.
Usage: python3 host-launcher.py --check
       python3 host-launcher.py -- NODE_COMMAND [ARGS...]
"""

import json
import os
import subprocess
import sys
from pathlib import Path


RUNTIME_BIN = Path('/tmp/tenka-fubu-parallel-20261011.FC6Shj/runtime/bin')
BROWSER_CACHE = Path('/home/anchi/.cache/ms-playwright')
EXPECTED_CHROMIUM = BROWSER_CACHE / 'chromium-1228/chrome-linux64/chrome'


def main():
    assert RUNTIME_BIN.joinpath('node').is_file(), RUNTIME_BIN
    assert RUNTIME_BIN.joinpath('npm').exists(), RUNTIME_BIN
    assert EXPECTED_CHROMIUM.is_file(), EXPECTED_CHROMIUM
    assert Path.cwd().joinpath('node_modules/playwright/package.json').is_file()
    env = dict(os.environ)
    env['PATH'] = f'{RUNTIME_BIN}:{env.get("PATH", "")}'
    env['PLAYWRIGHT_BROWSERS_PATH'] = str(BROWSER_CACHE)
    probe = subprocess.run(
        [
            str(RUNTIME_BIN / 'node'), '-e',
            'const p=require("playwright").chromium.executablePath();'
            'console.log(JSON.stringify({node:process.version,nodePath:process.execPath,chromium:p}))',
        ],
        env=env,
        text=True,
        capture_output=True,
        check=True,
    )
    observed = json.loads(probe.stdout)
    assert observed == {
        'node': 'v22.17.0',
        'nodePath': str(RUNTIME_BIN / 'node'),
        'chromium': str(EXPECTED_CHROMIUM),
    }, observed
    print(json.dumps({**observed, 'browserCache': str(BROWSER_CACHE)}), flush=True)
    if sys.argv[1:] == ['--check']:
        return
    assert len(sys.argv) >= 3 and sys.argv[1] == '--', sys.argv
    argv = sys.argv[2:]
    os.execvpe(argv[0], argv, env)


if __name__ == '__main__':
    main()
