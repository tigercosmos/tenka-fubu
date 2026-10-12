#!/usr/bin/env python3
"""Verify the retained local evidence without reading the external trace tree."""
import gzip
import hashlib
import io
import json
import pathlib
import tarfile

ROOT = pathlib.Path(__file__).resolve().parent
manifest = json.loads((ROOT / "manifest.json").read_text())
for entry in manifest["files"]:
    data = (ROOT / entry["path"]).read_bytes()
    assert len(data) == entry["sizeBytes"], entry["path"]
    assert hashlib.sha256(data).hexdigest() == entry["sha256"], entry["path"]

raw_report = gzip.decompress((ROOT / "report.json.gz").read_bytes())
assert hashlib.sha256(raw_report).hexdigest() == (
    "20d16a743204f763c65c98fce26db002a6086c25c65cb1c264d3cdbb8d5d0a2c"
)
report = json.loads(raw_report)
stats = report["stats"]
assert stats["expected"] == 222
assert stats["unexpected"] == 21
assert stats["skipped"] == 119
assert round(stats["duration"]) == 300015
assert len(report["suites"]) == 103

inventory = json.loads(gzip.decompress((ROOT / "artifact-inventory.json.gz").read_bytes()))
assert inventory["totalFiles"] == 22721
assert inventory["totalBytes"] == 5184669183
log_rows = [row for row in inventory["files"] if row["path"].endswith("earned-regional-route-generation.log") and "/attachments/" not in row["path"]]
assert sorted(row["sha256"] for row in log_rows) == sorted([
    "961e716bc4d08700b75fdfaac7ec85530aa2e91232a34ffc1cec968ef57d3e76",
    "52387618e7210a8960452b966b303f15d49db551b897d7512ed11256671e8bbf",
    "b6117ab213c952db6deb6d72ad7e4e768a2f522bfa2c151e3da02738f6b27154",
])
with tarfile.open(fileobj=io.BytesIO((ROOT / "earned-generator-logs.tar.gz").read_bytes()), mode="r:gz") as archive:
    members = archive.getmembers()
    assert len(members) == 3
    durations = []
    for member in members:
        raw = archive.extractfile(member).read()
        matches = [row for row in log_rows if row["path"] == member.name]
        assert len(matches) == 1
        assert hashlib.sha256(raw).hexdigest() == matches[0]["sha256"]
        assert b"Test timed out in 5000ms" in raw
        durations.append(raw)
    assert len(durations) == 3

for path, base, revision, count, changed in [
    ("source/796-to-51-manifest.json.gz", "79682cd", "51abd75", 1632, 5),
    ("source/51-to-8ea-manifest.json.gz", "51abd75", "8ea965a", 1632, 1),
]:
    source = json.loads(gzip.decompress((ROOT / path).read_bytes()))
    assert source["base"].startswith(base)
    assert source["revision"].startswith(revision)
    assert len(source["entries"]) == count
    assert len(source["archivePaths"]) == changed
    assert source["deletedPaths"] == []
    tar_path = path.replace("-manifest.json.gz", "-source.tar.gz")
    assert hashlib.sha256(gzip.decompress((ROOT / tar_path).read_bytes())).hexdigest() == source["archiveSha256"]

save = gzip.decompress((ROOT / "isolated-earned-regional.tfusave.gz").read_bytes())
assert len(save) == 155056
assert hashlib.sha256(save).hexdigest() == "6fb93a190a467c5184580c45c2df1aadcf67b3d1b4bd447dc91a30ed001d9d39"
print(json.dumps({"files": len(manifest["files"]), "stats": stats, "externalTraceFiles": inventory["totalFiles"]}, indent=2))
