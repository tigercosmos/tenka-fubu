"""Check the immutable Home/M evidence against its source commits."""

from __future__ import annotations

import gzip
import hashlib
import json
import subprocess
from pathlib import Path


HERE = Path(__file__).resolve().parent
REPO = HERE.parents[4]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_log(name: str) -> str:
    with gzip.open(HERE / name, "rt") as stream:
        return stream.read()


def main() -> None:
    manifest = json.loads((HERE / "manifest.json").read_text())
    for name, expected in manifest["files"].items():
        actual = sha256((HERE / name).read_bytes())
        assert actual == expected, (name, actual, expected)

    sources = json.loads((HERE / "source-hashes.json").read_text())
    for revision, files in sources.items():
        for path, expected in files.items():
            data = subprocess.check_output(["git", "show", f"{revision}:{path}"], cwd=REPO)
            assert sha256(data) == expected, (revision, path)
    diff = subprocess.check_output(
        ["git", "diff", "7d37c28", "f03ba63", "--", *sources["f03ba63"].keys()],
        cwd=REPO,
    )
    assert diff == (HERE / "source.patch").read_bytes()

    before = json.loads((HERE / "tenka-home-m-native-baseline.json").read_text())
    after = json.loads((HERE / "tenka-home-m-native-candidate.json").read_text())
    for result in (before, after):
        assert result["errors"] == []
        assert result["baselineSelection"] is None
        assert len(result["guardResults"]) == 3
        assert all(item["focused"] and item["minimap"] == 1 and item["selection"] is None
                   for item in result["guardResults"])
        assert result["before"]["view"]["selection"] is None
    assert before["afterM"]["minimap"] == 1
    assert before["afterHome"]["view"]["selection"] is None
    assert after["afterM"]["minimap"] == 0
    assert after["afterHome"]["view"]["selection"] == {
        "kind": "node", "id": "castle.kiyosu"
    }
    assert [event["defaultPrevented"] for event in before["afterHome"]["observed"]] == [False] * 6
    assert [event["defaultPrevented"] for event in after["afterHome"]["observed"]] == [False] * 4 + [True] * 2
    assert "Tests  2 failed | 18 passed" in read_log("tenka-hotkey-red-vitest.log.gz")
    assert "Tests  20 passed" in read_log("tenka-hotkey-green-vitest.log.gz")
    assert "7 passed" in read_log("tenka-hotkey-crossscreen-serial.log.gz")
    assert "error" not in read_log("tenka-hotkey-typecheck.log.gz").lower()
    print("Home/M evidence verified")


if __name__ == "__main__":
    main()
