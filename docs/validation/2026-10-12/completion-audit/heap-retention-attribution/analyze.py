#!/usr/bin/env python3
"""Compare two chronological V8 heap snapshots from the same isolate.

This reports self size, object identity, and shortest strong root paths. It
does not compute retained size or decide whether an object is a leak.
"""

import collections
import gzip
import hashlib
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent / "batch-bind-group-cache" / "native"
FILES = (
    SOURCE / "00-before-remounts.heapsnapshot.gz",
    SOURCE / "01-after-remounts.heapsnapshot.gz",
    SOURCE / "02-remount-heap-samples.json.gz",
)
PIXIFILE = HERE / "BitmapFontManager.js.gz"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class Snapshot:
    def __init__(self, path):
        raw = path.read_bytes()
        self.source = {"path": str(path.relative_to(HERE.parent)), "sha256": sha256(raw)}
        self.data = json.loads(gzip.decompress(raw))
        meta = self.data["snapshot"]["meta"]
        self.nf = {key: i for i, key in enumerate(meta["node_fields"])}
        self.ef = {key: i for i, key in enumerate(meta["edge_fields"])}
        self.nw = len(self.nf)
        self.ew = len(self.ef)
        self.ntypes = meta["node_types"][self.nf["type"]]
        self.etypes = meta["edge_types"][self.ef["type"]]
        self.nodes = self.data["nodes"]
        self.edges = self.data["edges"]
        self.strings = self.data["strings"]
        self.count = len(self.nodes) // self.nw
        assert len(self.nodes) % self.nw == 0
        self.starts = [0] * (self.count + 1)
        for i in range(self.count):
            self.starts[i + 1] = self.starts[i] + self.attr(i, "edge_count") * self.ew
        assert self.starts[-1] == len(self.edges)
        self.by_id = {self.attr(i, "id"): i for i in range(self.count)}

    def attr(self, i, key):
        return self.nodes[i * self.nw + self.nf[key]]

    def name(self, i):
        return self.strings[self.attr(i, "name")]

    def kind(self, i):
        return self.ntypes[self.attr(i, "type")]

    def edges_of(self, i):
        for pos in range(self.starts[i], self.starts[i + 1], self.ew):
            kind = self.etypes[self.edges[pos + self.ef["type"]]]
            label = self.edges[pos + self.ef["name_or_index"]]
            label = str(label) if kind in ("element", "hidden") else self.strings[label]
            target_offset = self.edges[pos + self.ef["to_node"]]
            assert target_offset % self.nw == 0
            target = target_offset // self.nw
            assert 0 <= target < self.count
            yield kind, label, target

    def property(self, i, key):
        return next((target for kind, label, target in self.edges_of(i)
                     if kind == "property" and label == key), None)

    def group(self):
        out = collections.defaultdict(lambda: [0, 0])
        for i in range(self.count):
            row = out[(self.kind(i), self.name(i))]
            row[0] += 1
            row[1] += self.attr(i, "self_size")
        return out

    def strong_paths(self):
        parent = [-1] * self.count
        edge = [None] * self.count
        parent[0] = 0
        queue = collections.deque([0])
        while queue:
            i = queue.popleft()
            for kind, label, target in self.edges_of(i):
                if kind == "weak" or parent[target] != -1:
                    continue
                parent[target] = i
                edge[target] = (kind, label)
                queue.append(target)
        return parent, edge

    def path(self, i, parents):
        parent, edge = parents
        steps = []
        while i and parent[i] != -1:
            source = parent[i]
            kind, label = edge[i]
            steps.append({"fromId": self.attr(source, "id"),
                          "from": self.name(source), "edgeType": kind,
                          "edge": label, "toId": self.attr(i, "id"),
                          "to": self.name(i)})
            i = source
        return list(reversed(steps)) if i == 0 else None


def family(before, after, kind, name, paths, samples=1):
    old = {before.attr(i, "id"): i for i in range(before.count)
           if before.kind(i) == kind and before.name(i) == name}
    new = {after.attr(i, "id"): i for i in range(after.count)
           if after.kind(i) == kind and after.name(i) == name}
    stable = old.keys() & new.keys()
    added = sorted((i for ident, i in new.items() if ident not in old),
                   key=lambda i: after.attr(i, "self_size"), reverse=True)
    removed = [i for ident, i in old.items() if ident not in new]
    result = {
        "kind": kind, "name": name,
        "before": {"count": len(old), "selfBytes": sum(before.attr(i, "self_size") for i in old.values())},
        "after": {"count": len(new), "selfBytes": sum(after.attr(i, "self_size") for i in new.values())},
        "stableCount": len(stable),
        "stableSelfDelta": sum(after.attr(new[ident], "self_size") - before.attr(old[ident], "self_size") for ident in stable),
        "newSelfBytes": sum(after.attr(i, "self_size") for i in added),
        "goneSelfBytes": sum(before.attr(i, "self_size") for i in removed),
        "largestNew": [{"id": after.attr(i, "id"), "selfBytes": after.attr(i, "self_size"),
                        "strongRootPath": after.path(i, paths)} for i in added[:samples]],
    }
    return result


def main():
    before, after = (Snapshot(path) for path in FILES[:2])
    with gzip.open(FILES[2], "rt") as fh:
        samples = json.load(fh)["usedHeapBytes"]
    paths = after.strong_paths()
    groups0, groups1 = before.group(), after.group()
    biggest = sorted(set(groups0) | set(groups1),
                     key=lambda key: groups1[key][1] - groups0[key][1], reverse=True)[:20]
    group_deltas = [{"kind": key[0], "name": key[1],
                     "countDelta": groups1[key][0] - groups0[key][0],
                     "selfBytesDelta": groups1[key][1] - groups0[key][1]}
                    for key in biggest]
    tracked = [("object", "K4"), ("object", "Li"), ("object", "o_"),
               ("object", "Fg"), ("code", "system / InstructionStream"),
               ("code", "system / TrustedByteArray"),
               ("array", "(object elements)"),
               ("native", "system / JSArrayBufferData"),
               ("native", "PerformanceLongAnimationFrameTiming"),
               ("native", "PerformanceScriptTiming")]
    families = [family(before, after, kind, name, paths) for kind, name in tracked]
    cache = []
    for snap in (before, after):
        owner = next(i for i in range(snap.count)
                     if snap.name(i) == "o_" and snap.property(i, "measureCache") is not None)
        manager = snap.property(owner, "measureCache")
        items = snap.property(manager, "items")
        entries = [(label, target) for kind, label, target in snap.edges_of(items)
                   if kind == "property" and label != "__proto__"]
        cache.append({"ownerId": snap.attr(owner, "id"),
                      "managerId": snap.attr(manager, "id"),
                      "itemsId": snap.attr(items, "id"),
                      "entries": len(entries),
                      "sampleEntry": {"key": entries[0][0],
                                      "valueId": snap.attr(entries[0][1], "id"),
                                      "strongRootPath": snap.path(entries[0][1], paths)}
                      if snap is after else None})
    growing = []
    for ident, i in after.by_id.items():
        old = before.by_id.get(ident)
        if old is None:
            continue
        delta = after.attr(i, "self_size") - before.attr(old, "self_size")
        if delta > 0:
            growing.append((delta, i))
    growing.sort(reverse=True)
    pixi_source = gzip.decompress(PIXIFILE.read_bytes())
    assert b"this.measureCache = tinyLru.lru(1e3);" in pixi_source
    output = {
        "scope": "same-isolate chronological post-GC pair; self size and shortest strong root paths; no retained-size or leak verdict",
        "inputs": [snap.source for snap in (before, after)],
        "runtimeSamples": {"path": str(FILES[2].relative_to(HERE.parent)),
                           "sha256": sha256(FILES[2].read_bytes()),
                           "count": len(samples), "first": samples[0],
                           "last": samples[-1], "delta": samples[-1] - samples[0],
                           "last20Delta": samples[-1] - samples[-20]},
        "pixiSource": {"path": PIXIFILE.name, "sha256": sha256(PIXIFILE.read_bytes()),
                       "uncompressedSha256": sha256(pixi_source),
                       "observedLimit": 1000},
        "snapshot": {"beforeNodeCount": before.count, "afterNodeCount": after.count,
                     "beforeSelfBytes": sum(row[1] for row in groups0.values()),
                     "afterSelfBytes": sum(row[1] for row in groups1.values())},
        "largestPositiveGroups": group_deltas,
        "trackedFamilies": families,
        "bitmapLayoutCache": {"before": cache[0], "after": cache[1]},
        "largestStableGrowth": [{"id": after.attr(i, "id"), "kind": after.kind(i),
                                 "name": after.name(i), "beforeSelfBytes": after.attr(i, "self_size") - delta,
                                 "afterSelfBytes": after.attr(i, "self_size"),
                                 "delta": delta, "strongRootPath": after.path(i, paths)}
                                for delta, i in growing[:6]],
    }
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
