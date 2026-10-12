#!/usr/bin/env python3
"""Check the retained wizard evidence without running the game or a browser."""

import hashlib
import io
import json
import re
import tarfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_blob(data: bytes) -> str:
    return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()


def package_hashes() -> None:
    rows = (ROOT / "SHA256SUMS").read_text().splitlines()
    expected = {}
    for row in rows:
        match = re.fullmatch(r"([0-9a-f]{64})  (.+)", row)
        assert match, row
        assert match[2] not in expected, match[2]
        expected[match[2]] = match[1]
    actual = {
        path.relative_to(ROOT).as_posix()
        for path in ROOT.rglob("*")
        if path.is_file() and path.name != "SHA256SUMS"
    }
    assert set(expected) == actual, (sorted(set(expected) - actual), sorted(actual - set(expected)))
    for name, sha in expected.items():
        assert digest((ROOT / name).read_bytes()) == sha, name
    print(f"package files: {len(expected)} SHA-256 matches")


def source_archive() -> None:
    manifest = json.loads((ROOT / "source/manifest.json").read_text())
    assert manifest["revision"] == "b6aca268afce05e99ae2a2f76538aa9e660bf344"
    assert manifest["base"] == "5163242673c7261f836a808be96e94740529c80e"
    assert len(manifest["entries"]) == 1641
    assert manifest["deletedPaths"] == []
    assert manifest["archivePaths"] == sorted(
        [
            "e2e/new-game-wizard.spec.ts",
            "src/ui/screens/DaimyoSelect.module.css",
            "src/ui/screens/NewGameOptionsScreen.module.css",
            "src/ui/screens/ScenarioSelect.module.css",
        ]
    )
    data = (ROOT / "source/source.tar").read_bytes()
    assert digest(data) == manifest["archiveSha256"]
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        files = {member.name: archive.extractfile(member).read() for member in archive if member.isfile()}
    assert set(files) == set(manifest["archivePaths"])
    for name, blob in files.items():
        assert git_blob(blob) == manifest["entries"][name]["gitBlob"], name
    print("source: b6 commit, 1641 inputs, four exact changed blobs")


def native_reports() -> None:
    expected = {
        "tenka-m8-wizard-old-native-01": (0, 1),
        "tenka-m8-ab-native-01": (2, 1),
        "tenka-m8-scroll-native-01": (3, 0),
        "tenka-m8-scroll-v2-native-01": (3, 0),
        "tenka-m8-final-native-01": (1, 15),
        "tenka-m8-oldcss-native-01": (0, 1),
        "tenka-m8-0a-native-01": (13, 3),
        "tenka-m8-516-native-01": (14, 2),
        "tenka-m8-b6-native-01": (16, 0),
        "tenka-m8-wizard-font-audit-native-01": (1, 0),
    }
    with tarfile.open(ROOT / "native/native-raw.tar.gz") as archive:
        members = {member.name: member for member in archive if member.isfile()}
        for run, counts in expected.items():
            report = json.load(archive.extractfile(members[f"{run}/report.json"]))
            result = json.load(archive.extractfile(members[f"{run}/result.json"]))
            assert (report["stats"]["expected"], report["stats"]["unexpected"]) == counts, run
            assert result["exitCode"] == (0 if counts[1] == 0 else 1), run
            for required in ("command.json", "stdout-stderr.log", "process.json"):
                assert f"{run}/{required}" in members, (run, required)
        final = json.load(archive.extractfile(members["tenka-m8-b6-native-01/report.json"]))
        assert final["stats"]["skipped"] == final["stats"]["flaky"] == 0
        assert final["stats"]["duration"] == 62486.239
    print("native reports: all ten historical and final outcomes match")


def font_audit() -> None:
    audit = json.loads((ROOT / "native/font-audit-516.json").read_text())
    assert set(audit) == {
        "scenario", "daimyo-unselected", "daimyo-selected", "difficulty", "seed-valid", "seed-invalid"
    }
    expected = {
        "scenario": ("返回",),
        "daimyo-selected": ("返回", "下一步", "織田信長"),
        "difficulty": ("返回", "下一步", "初級", "中級", "上級"),
        "seed-invalid": ("返回", "開始遊戲", "請輸入 0 到 4294967295 的整數。"),
    }
    for step, texts in expected.items():
        rows = audit[step]["below12"]
        assert all(row["fontPx"] == 11.2 for row in rows), step
        for value in texts:
            assert any(value == row["text"] for row in rows), (step, value)
    print("font audit: measured 11.2 px text on the frozen 516 source")


def images() -> None:
    rows = (ROOT / "native/remote-browser-results.sha256").read_text().splitlines()
    inventory = {}
    for row in rows:
        match = re.fullmatch(r"([0-9a-f]{64})  (browser-results/.+)", row)
        assert match, row
        assert match[2] not in inventory, match[2]
        inventory[match[2]] = match[1]
    assert len(inventory) == 166
    selected = list((ROOT / "images").rglob("*"))
    files = [path for path in selected if path.is_file()]
    assert len(files) == 33
    for path in files:
        name = "browser-results/" + path.relative_to(ROOT / "images").as_posix()
        assert name in inventory, name
        assert digest(path.read_bytes()) == inventory[name], name
    print("browser output: 166 inventoried files, 33 selected local files match")


def local_checks() -> None:
    with tarfile.open(ROOT / "local-checks/captures.tar.gz") as archive:
        names = set(archive.getnames())
    for prefix in (
        "tenka-wizard-catalog-check-commit-c1/",
        "tenka-wizard-typography-checks-c1/",
        "tenka-wizard-base-font-checks-c1/",
        "tenka-m8-b6-host-before-01/",
        "tenka-m8-b6-source-after-01/",
        "tenka-wizard-font-audit-516.spec.ts",
    ):
        assert any(name.startswith(prefix) for name in names), prefix
    print("local captures: catalog, typography, font, setup, source checks retained")


package_hashes()
source_archive()
native_reports()
font_audit()
images()
local_checks()
print("PASS")
