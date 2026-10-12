"""Verify the frozen M8-23 non-policy evidence package."""

import hashlib
import json
import pathlib
import re
import subprocess
import tarfile

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]
TEST_SHA256 = "35f878b6bec964e5211cea35251389432bb5f7fc19cefcb61ac8aaf0bf081255"
SCALES = {round(0.8 + step * 0.05, 2) for step in range(15)}


def archive_json(archive: tarfile.TarFile, name: str):
    member = archive.extractfile(name)
    assert member is not None, name
    return json.load(member)


for line in (HERE / "SHA256SUMS").read_text().splitlines():
    expected, name = line.split("  ", 1)
    actual = hashlib.sha256((HERE / name).read_bytes()).hexdigest()
    assert actual == expected, name

committed_test = subprocess.check_output(
    ["git", "show", "cf9fb7e:e2e/nonpolicy-responsive.spec.ts"], cwd=REPO
)
assert hashlib.sha256(committed_test).hexdigest() == TEST_SHA256

with tarfile.open(HERE / "raw-final-runs.tar.gz") as archive:
    run = "runs/nonpolicy-all15-final/"
    report = archive_json(archive, run + "report.json")
    result = archive_json(archive, run + "result.json")
    assert result["exitCode"] == 0
    assert report["stats"]["expected"] == 45
    assert report["stats"]["skipped"] == 0
    assert report["stats"]["unexpected"] == 0
    assert report["stats"]["flaky"] == 0
    specs = [spec for suite in report["suites"] for spec in suite["specs"]]
    assert len(specs) == 45
    cases = set()
    for spec in specs:
        assert spec["ok"] and len(spec["tests"]) == 1
        assert [r["status"] for r in spec["tests"][0]["results"]] == ["passed"]
        title = spec["title"]
        scale = float(re.search(r"uiScale ([0-9.]+)$", title).group(1))
        surface = title.split(" ", 1)[0]
        cases.add((surface, scale))
    assert cases == {(surface, scale) for surface in ("officer", "settings", "save") for scale in SCALES}

    for mode, count in (("source", 1631), ("deps", 29)):
        before = archive_json(archive, f"runs/{mode}-before/stdout-stderr.log")
        after = archive_json(archive, f"runs/{mode}-after/stdout-stderr.log")
        assert before["inventory"] == after["inventory"]
        assert not before["mismatches"] and not after["mismatches"]
        assert before.get("files", before.get("targets")) == count
        assert archive_json(archive, f"runs/{mode}-after/result.json")["exitCode"] == 0

print("PASS: hashes, committed test, 45 cases, 1,631 source files, 29 dependency targets")
