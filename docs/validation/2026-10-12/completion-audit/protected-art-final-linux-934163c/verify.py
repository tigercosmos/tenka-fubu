"""Verify the final Linux visual and responsive evidence without changing references."""

import hashlib
import json
import pathlib
import re
import tarfile

from PIL import Image, ImageChops

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]
SCALES = {round(0.8 + step * 0.05, 2) for step in range(15)}


def archive_json(archive: tarfile.TarFile, name: str):
    file = archive.extractfile(name)
    assert file is not None, name
    return json.load(file)


def specs(suites):
    for suite in suites:
        yield from suite.get("specs", [])
        yield from specs(suite.get("suites", []))


for row in (HERE / "SHA256SUMS").read_text().splitlines():
    expected, filename = row.split("  ", 1)
    assert hashlib.sha256((HERE / filename).read_bytes()).hexdigest() == expected, filename

with tarfile.open(HERE / "raw-final-runs.tar.gz") as archive:
    expected_stats = {
        "visual-five-final": (4, 1, 5),
        "report15-final": (15, 0, 15),
        "nonpolicy45-final": (45, 0, 45),
    }
    for run, (passed, failed, total) in expected_stats.items():
        root = f"runs/{run}/"
        report = archive_json(archive, root + "report.json")
        result = archive_json(archive, root + "result.json")
        assert (report["stats"]["expected"], report["stats"]["unexpected"]) == (passed, failed)
        assert report["stats"]["skipped"] == report["stats"]["flaky"] == 0
        cases = list(specs(report["suites"]))
        assert len(cases) == total
        statuses = [case["tests"][0]["results"][0]["status"] for case in cases]
        assert statuses.count("passed") == passed and statuses.count("failed") == failed
        assert result["exitCode"] == (1 if failed else 0)
        if run == "report15-final":
            assert {float(re.search(r"scale ([0-9.]+)$", case["title"]).group(1)) for case in cases} == SCALES
        elif run == "nonpolicy45-final":
            assert {
                (case["title"].split(" ", 1)[0], float(re.search(r"uiScale ([0-9.]+)$", case["title"]).group(1)))
                for case in cases
            } == {(surface, scale) for surface in ("officer", "settings", "save") for scale in SCALES}
        else:
            assert next(case for case in cases if case["tests"][0]["results"][0]["status"] == "failed")["title"].startswith("three camera baselines")
            log = archive.extractfile(root + "stdout-stderr.log").read().decode()
            assert [int(value) for value in re.findall(r"(\d+) pixels \(ratio [^\n]+ are different\.", log)][::3] == [187648, 271202, 292387]

    for mode, before, after, count in (
        ("source", "source-final-before-build", "source-final-after", 1633),
        ("deps", "deps-pre-overlay", "deps-final-after", 29),
    ):
        first = archive_json(archive, f"runs/{before}/stdout-stderr.log")
        last = archive_json(archive, f"runs/{after}/stdout-stderr.log")
        assert first["mode"] == last["mode"] == mode
        assert first["inventory"] == last["inventory"]
        assert not first["mismatches"] and not last["mismatches"]
        assert first.get("files", first.get("targets")) == count

previous = json.loads((HERE / "since-candidate.json").read_text())
for row in previous:
    preset = row["camera"]
    actual = HERE / f"strategy-{preset}-actual.png"
    expected = HERE / f"strategy-{preset}-expected.png"
    protected = REPO / "e2e/visual.spec.ts-snapshots" / f"strategy-{preset}-chromium-linux.png"
    older = HERE.parent / "protected-art-candidate-one-one" / actual.name
    assert expected.read_bytes() == protected.read_bytes()
    assert hashlib.sha256(actual.read_bytes()).hexdigest() == row["finalSha256"]
    assert hashlib.sha256(older.read_bytes()).hexdigest() == row["previousSha256"]
    with Image.open(actual) as current_image, Image.open(older) as previous_image:
        difference = ImageChops.difference(current_image.convert("RGB"), previous_image.convert("RGB"))
        assert sum(any(channel for channel in pixel) for pixel in difference.getdata()) == row["changedExactRgbPixels"]
        assert list(difference.getbbox()) == row["changedBounds"]

print("PASS: artifact hashes, 4+1 visual cases, report15, nonpolicy45, source/deps, references, prior-image comparison")
