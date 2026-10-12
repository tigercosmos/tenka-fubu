"""Verify the captured overlay source, native outcomes, and review PNG copies."""

import hashlib
import json
import pathlib
import subprocess
import tarfile


HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parents[4]


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def git_rows(data: bytes) -> dict[str, str]:
    rows = {}
    for item in data.split(b"\0"):
        if not item:
            continue
        metadata, name = item.split(b"\t", 1)
        rows[name.decode()] = metadata.split()[-1].decode()
    return rows


with tarfile.open(HERE / "overlay-runs.tar.gz", "r:gz") as archive:
    members = {member.name: member for member in archive.getmembers()}

    def read(name: str) -> bytes:
        return archive.extractfile(members[name]).read()

    def only(prefix: str, suffix: str) -> bytes:
        names = [name for name in members if name.startswith(prefix) and name.endswith(suffix)]
        assert len(names) == 1, (prefix, suffix, names)
        return read(names[0])

    def proof(run: str, count_key: str, count: int) -> None:
        row = json.loads(read(f"runs/{run}/stdout-stderr.log"))
        assert row[count_key] == count, (run, row.get(count_key))
        assert row["mismatches"] == [], (run, row["mismatches"])
        assert json.loads(read(f"runs/{run}/result.json"))["exitCode"] == 0

    proof("source-before", "files", 1633)
    proof("source-final-corrected", "files", 1635)
    proof("deps-before", "targets", 29)
    proof("deps-after", "targets", 29)

    source_final = git_rows(read("source-final-git-tree.z"))
    committed = subprocess.run(
        ["git", "ls-tree", "-rz", "51abd75"], cwd=REPO, check=True, capture_output=True
    )
    committed_rows = git_rows(committed.stdout)
    assert len(source_final) == 1635
    assert all(committed_rows.get(path) == blob for path, blob in source_final.items())

    expected = {
        "ending-crest-red-15": (0, 1),
        "ending-safe-center-15": (15, 0),
        "event-all15": (15, 0),
        "proposal-month-keyboard-all15": (15, 0),
        "final-exact-focused": (3, 0),
    }
    for run, (passed, failed) in expected.items():
        report = json.loads(read(f"runs/{run}/report.json"))
        assert (report["stats"]["expected"], report["stats"]["unexpected"]) == (
            passed,
            failed,
        ), run

    before = json.loads(
        only("runs/ending-crest-red-15/browser-results/", "/ending-1.5.json")
    )
    after = json.loads(
        only("runs/ending-safe-center-15/browser-results/", "/ending-1.5.json")
    )
    assert before["initial"]["crestTop"] < 0
    assert after["initial"]["crestTop"] >= 0

    review = json.loads((HERE / "review/manifest.json").read_text())
    assert len(review) == 11
    for row in review:
        original = read(row["archiveMember"])
        copied = (HERE / "review" / row["review"]).read_bytes()
        assert copied == original
        assert len(copied) == row["bytes"]
        assert sha256(copied) == row["sha256"]

for line in (HERE / "SHA256SUMS").read_text().splitlines():
    expected_hash, path = line.split(maxsplit=1)
    assert sha256((HERE / path).read_bytes()) == expected_hash, path

print("PASS: 1633→1635 exact inputs, 29 dependencies, native outcomes, 11 review images, hashes")
