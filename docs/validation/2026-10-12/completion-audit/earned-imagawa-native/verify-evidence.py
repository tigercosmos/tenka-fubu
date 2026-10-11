"""Check the preserved raw observations without running or modifying the game."""

import copy
import gzip
import hashlib
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads(gzip.decompress((HERE / name).read_bytes()))


def persistent(state):
    result = copy.deepcopy(state)
    result["ai"]["intentLog"] = []
    return result


def verify():
    manifest = json.loads((HERE / "manifest.json").read_text())
    for row in manifest["files"]:
        raw = (HERE / row["path"]).read_bytes()
        assert len(raw) == row["bytes"]
        assert hashlib.sha256(raw).hexdigest() == row["sha256"]
        if row["path"].endswith(".gz"):
            assert hashlib.sha256(gzip.decompress(raw)).hexdigest() == row["rawSha256"]
    source = read("runtime-file-verification.json.gz")
    assert source["checkedFiles"] == 725 and source["mismatches"] == []
    assert source["runtimeCommit"] == manifest["runtimeCommit"]
    original = read("tenka-imagawa-natural-42.json.gz")
    control = read("CPU-native-control-green.json.gz")
    native = read("native-tail-green.json.gz")
    save = read("CPU-checkpoint240.tfusave.gz")
    assert original["seed"] == 42
    assert original["initial"] == control["initial"]
    assert control["initial"]["meta"]["playerClanId"] == "clan.miyoshi"
    assert control["initial"]["clans"]["clan.miyoshi"]["gold"] == 8900
    target = "off.miura-masatoshi"
    assert control["initial"]["officers"][target]["loyalty"] == 61
    assert json.loads(control["checkpointRaw"]) == save == native["CPUCheckpoint"]
    assert save["state"] == control["checkpointState"] == native["nativeImport"]
    assert save["pendingCommands"] == []
    assert persistent(original["months"][7]) == save["state"]
    assert persistent(original["state"]) == persistent(control["state"])
    assert save["state"]["time"]["day"] == 240
    assert save["state"]["officers"][target]["clanId"] == "clan.imagawa"
    assert save["state"]["officers"][target]["loyalty"] == 25
    assert [row["day"] for row in control["days"]] == list(range(1, 301))
    assert len(control["events"]) == 300
    assert [s["time"]["day"] for s in control["months"]] == list(range(30, 301, 30))
    assert [s["officers"][target]["loyalty"] for s in control["months"]] == [61, 61, 61, 41, 43, 33, 35, 25, 27, 47]
    events = [event for day in control["events"] for event in day]
    rumors = [e for e in events if e["type"] == "plot.succeeded" and e["kind"] == "rumor" and e["actorClanId"] == "clan.miyoshi" and e["targetOfficerId"] == target]
    assert [e["day"] for e in rumors] == [120, 180, 240]
    assert any(e["type"] == "clan.succession" and e["day"] == 120 and e["clanId"] == "clan.imagawa" and e["heirId"] == "off.sekiguchi-chikanaga" for e in events)
    poach = [s for s in control["submitted"] if s["command"]["type"] == "startPlot" and s["command"]["kind"] == "poach" and s["command"]["targetOfficerId"] == target]
    assert len(poach) == 1
    assert poach[0]["day"] == 240 and poach[0]["targetLoyalty"] == 25
    assert poach[0]["successRate"] == 0.31875 and poach[0]["command"]["investGold"] == 1000
    assert [s["time"]["day"] for s in native["daily"]] == list(range(241, 301))
    assert [(s["before"], s["after"]) for s in native["schedules"]] == [(d - 1, d) for d in range(241, 301)]
    assert len(control["referenceTail"]) == 60
    for actual, expected in zip(native["daily"], control["referenceTail"], strict=True):
        # Exactly the normal save omission; no other field is normalized.
        assert persistent(actual) == expected
    final = native["final"]["state"]
    assert final == native["daily"][-1]
    assert final["officers"][target]["clanId"] == "clan.miyoshi"
    assert final["officers"][target]["status"] == "serving"
    assert final["officers"][target]["loyalty"] == 47
    assert final["officers"][target]["locationCastleId"] == "castle.akutagawa"
    assert any(e["type"] == "officer.recruited" and e["day"] == 300 and e["officerId"] == target and e["source"] == "poach" for e in events)
    assert any(e["type"] == "plot.exposed" and e["day"] == 270 and e["kind"] == "poach" and e["targetOfficerId"] == "off.yui-masanobu" for e in events)
    assert native["choices"] == ["proposal:全部駁回"] * 3
    log = native["final"]["log"]
    assert log["incompleteReasons"] == ["loadedGame"]
    orders = [e for e in log["entries"] if e["command"]["type"] == "startPlot" and e["command"]["clanId"] == "clan.miyoshi"]
    planned = [s for s in control["submitted"] if s["day"] >= 240 and s["command"]["type"] == "startPlot"]
    assert [e["command"] for e in orders] == [s["command"] for s in planned]
    assert [e["day"] for e in orders] == [1, 1, 31]
    compiled = gzip.decompress((HERE / "native-equivalent.mjs.gz").read_bytes())
    equivalence = read("native-run-final-js-equivalence.json.gz")
    assert equivalence["identicalExecutableJavaScript"] is True
    assert hashlib.sha256(compiled).hexdigest() == equivalence["sha256"]
    print("PASS: earned CPU240/import parity, original/control agreement, all 60 native full states/RNG, real failure270 and recruitment300")


if __name__ == "__main__":
    verify()
