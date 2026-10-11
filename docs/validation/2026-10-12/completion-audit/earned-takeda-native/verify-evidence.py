"""Verify preserved observations; this does not replace the native test."""

import copy
import gzip
import hashlib
import json
import math
from pathlib import Path

HERE = Path(__file__).resolve().parent


def read(name):
    return json.loads(gzip.decompress((HERE / name).read_bytes()))


def credit(state):
    return state["diplomacy"]["rows"]["clan.miyoshi|clan.takeda"]["trustAtoB"]


def close(actual, expected):
    assert math.isclose(actual, expected, rel_tol=0, abs_tol=1e-10)


def verify():
    manifest = json.loads((HERE / "manifest.json").read_text())
    for row in manifest["files"]:
        raw = (HERE / row["path"]).read_bytes()
        assert len(raw) == row["bytes"]
        assert hashlib.sha256(raw).hexdigest() == row["sha256"]
        if row["path"].endswith(".gz"):
            assert hashlib.sha256(gzip.decompress(raw)).hexdigest() == row["rawSha256"]

    prefix = read("native-CPU-prefix-green.json.gz")
    tail = read("native-tail-green.json.gz")
    save = read("native-CPU-prefix.tfusave.gz")
    assert json.loads(prefix["raw"]) == save == tail["CPUCheckpoint"]
    assert prefix["state"]["time"]["day"] == 300
    assert [row["day"] for row in prefix["dailyHashes"]] == list(range(1, 301))
    assert len(prefix["events"]) == 300
    assert [row["day"] for row in prefix["months"]] == list(range(30, 301, 30))
    for row in prefix["months"]:
        assert row["workCost"] == 16
        assert row["goldBeforeEconomy"] == row["goldBefore"] - 16
        close(row["trustAfter"] - row["trustBefore"], 7.81)
    submitted = prefix["submitted"]
    assert submitted[:2] == [
        {"day": 0, "command": {"type": "enactPolicy", "clanId": "clan.miyoshi", "policyId": "pol.enkokinko"}},
        {"day": 0, "command": {"type": "startDiploWork", "clanId": "clan.miyoshi", "target": "clan.takeda", "executorId": "off.miyoshi-nagayoshi"}},
    ]
    responses = [row for row in submitted if row["command"]["type"] == "respondPact"]
    assert responses == [{"day": 224, "command": {"type": "respondPact", "clanId": "clan.miyoshi", "proposalId": "prop.000048", "accept": False}}]
    persistent = copy.deepcopy(prefix["state"])
    assert len(persistent["ai"]["intentLog"]) == 1024
    persistent["ai"]["intentLog"] = []
    assert persistent == save["state"] == tail["nativeImport"]
    assert save["pendingCommands"] == []
    close(credit(persistent), 78.1)

    assert [state["time"]["day"] for state in tail["daily"]] == list(range(301, 333))
    assert [(row["before"], row["after"]) for row in tail["schedules"]] == [(day - 1, day) for day in range(301, 333)]
    paid = tail["paidNativeMonth"]
    assert paid["beforePaid"] == tail["daily"][28]
    assert paid["state"] == tail["daily"][29]
    close(credit(paid["state"]), 85.91)
    close(credit(paid["state"]) - credit(paid["beforePaid"]), 7.81)
    assert paid["ledger"] == ["773貫", "0貫", "302／302貫", "90貫", "0貫", "392貫", "381貫", "12,698貫", "0貫"]
    assert 12698 - 381 == paid["beforePaid"]["clans"]["clan.miyoshi"]["gold"] - 16
    assert 12698 == paid["state"]["clans"]["clan.miyoshi"]["gold"]
    allied = tail["nativeAlliance"]["allied"]
    refusal = tail["nativeRequestRefusal"]["refused"]
    assert allied == tail["daily"][30] == tail["nativeRequestRefusal"]["allied"]
    assert refusal == tail["daily"][31]
    close(credit(allied), 25.91)
    assert credit(refusal) == credit(allied)
    row = refusal["diplomacy"]["rows"]["clan.miyoshi|clan.takeda"]
    assert row["pacts"] == [{"kind": "alliance", "startDay": 331, "endDay": 2131, "vassalClanId": None}]
    assert row["refusalCooldownUntilDay"]["requestReinforce"] == 422
    reports = [r["event"] for r in refusal["reports"]]
    refused = [e for e in reports if e["type"] == "diplo.refused" and e.get("fromClanId") == "clan.miyoshi" and e.get("toClanId") == "clan.takeda" and e.get("kind") == "requestReinforce"]
    assert len(refused) == 1
    assert not any(e["type"] == "diplo.reinforceAgreed" and e.get("fromClanId") == "clan.miyoshi" and e.get("toClanId") == "clan.takeda" for e in reports)
    log = tail["nativeRequestRefusal"]["log"]
    assert log["incompleteReasons"] == ["loadedGame"]
    commands = [e for e in log["entries"] if e["command"]["type"] == "proposePact" and e["command"]["clanId"] == "clan.miyoshi"]
    assert [e["day"] for e in commands] == [31, 32]
    assert [e["command"]["kind"] for e in commands] == ["proposeAlliance", "requestReinforce"]
    assert commands[1]["command"]["reinforceAgainstClanId"] == "clan.nagao"
    red = read("selector-red-native-tail.json.gz")
    assert red["nativeAlliance"]["allied"]["time"]["day"] == 331
    assert "nativeRequestRefusal" not in red
    print("PASS: exact CPU save/import parity, 300 CPU days, 32 native days, paid month, alliance, legal request and actual refusal; RED retained")


if __name__ == "__main__":
    verify()
