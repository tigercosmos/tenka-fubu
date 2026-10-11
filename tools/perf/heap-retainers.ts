import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface HeapSnapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      edge_fields: string[];
      node_types: (string[] | string)[];
      edge_types: (string[] | string)[];
    };
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

/** Shape-based identification survives bundled constructor renaming. Not a leak verdict. */
export function analyzeHeapRetainers(snapshot: HeapSnapshot, trackedIds: readonly number[] = []) {
  const meta = snapshot.snapshot.meta;
  const nodeWidth = meta.node_fields.length,
    edgeWidth = meta.edge_fields.length;
  const field = (fields: string[], name: string) => {
    const index = fields.indexOf(name);
    if (index < 0) throw new Error(`Missing heap field: ${name}`);
    return index;
  };
  const nt = field(meta.node_fields, 'type'),
    nn = field(meta.node_fields, 'name');
  const nid = field(meta.node_fields, 'id'),
    nc = field(meta.node_fields, 'edge_count');
  const et = field(meta.edge_fields, 'type'),
    en = field(meta.edge_fields, 'name_or_index');
  const to = field(meta.edge_fields, 'to_node');
  const nodeTypes = meta.node_types[nt],
    edgeTypes = meta.edge_types[et];
  if (
    !Array.isArray(nodeTypes) ||
    !Array.isArray(edgeTypes) ||
    snapshot.nodes.length % nodeWidth ||
    snapshot.edges.length % edgeWidth
  )
    throw new Error('Invalid heap metadata or array lengths');
  const count = snapshot.nodes.length / nodeWidth;
  if (count === 0) throw new Error('Empty heap snapshot');
  const indexIn = (index: number, values: readonly unknown[]) =>
    Number.isSafeInteger(index) && index >= 0 && index < values.length;
  const starts = new Uint32Array(count + 1);
  let cursor = 0;
  for (let node = 0; node < count; node++) {
    if (
      !indexIn(snapshot.nodes[node * nodeWidth + nt]!, nodeTypes) ||
      !indexIn(snapshot.nodes[node * nodeWidth + nn]!, snapshot.strings) ||
      !Number.isSafeInteger(snapshot.nodes[node * nodeWidth + nid])
    )
      throw new Error('Invalid heap node metadata');
    starts[node] = cursor;
    const edges = snapshot.nodes[node * nodeWidth + nc]!;
    if (!Number.isSafeInteger(edges) || edges < 0) throw new Error('Invalid heap edge count');
    cursor += edges * edgeWidth;
  }
  starts[count] = cursor;
  if (cursor !== snapshot.edges.length) throw new Error('Heap edge counts do not match array');
  const name = (node: number) => snapshot.strings[snapshot.nodes[node * nodeWidth + nn]!]!;
  const id = (node: number) => snapshot.nodes[node * nodeWidth + nid]!;
  const target = (edge: number) => {
    const offset = snapshot.edges[edge + to]!;
    if (
      !Number.isSafeInteger(offset) ||
      offset < 0 ||
      offset % nodeWidth ||
      offset >= snapshot.nodes.length
    )
      throw new Error('Invalid heap edge target');
    return offset / nodeWidth;
  };
  const edgeType = (edge: number) => edgeTypes[snapshot.edges[edge + et]!]!;
  const edgeName = (edge: number) =>
    ['element', 'hidden'].includes(edgeType(edge))
      ? String(snapshot.edges[edge + en])
      : snapshot.strings[snapshot.edges[edge + en]!]!;
  // Validate unreachable edges too: a root traversal alone is not a format check.
  for (let edge = 0; edge < snapshot.edges.length; edge += edgeWidth) {
    target(edge);
    if (!indexIn(snapshot.edges[edge + et]!, edgeTypes)) throw new Error('Invalid heap edge type');
    const nameIndex = snapshot.edges[edge + en]!;
    if (['element', 'hidden'].includes(edgeType(edge))) {
      if (!Number.isSafeInteger(nameIndex) || nameIndex < 0)
        throw new Error('Invalid heap edge index');
    } else if (!indexIn(nameIndex, snapshot.strings)) throw new Error('Invalid heap edge name');
  }
  // Shortest strong root path only; weak edges do not establish retention.
  const parent = new Int32Array(count).fill(-1),
    parentEdge = new Int32Array(count).fill(-1);
  const queue = new Uint32Array(count);
  let head = 0,
    tail = 1;
  queue[0] = 0;
  parent[0] = 0;
  while (head < tail) {
    const node = queue[head++]!;
    for (let edge = starts[node]!; edge < starts[node + 1]!; edge += edgeWidth) {
      const next = target(edge);
      if (edgeType(edge) === 'weak' || parent[next] !== -1) continue;
      parent[next] = node;
      parentEdge[next] = edge;
      queue[tail++] = next;
    }
  }
  const retainingPath = (node: number) => {
    if (parent[node] === -1) return null;
    const path = [];
    while (node !== 0) {
      const previous = parent[node]!,
        edge = parentEdge[node]!;
      path.push({
        fromId: id(previous),
        fromName: name(previous),
        edgeType: edgeType(edge),
        edge: edgeName(edge),
        toId: id(node),
        toName: name(node),
      });
      node = previous;
    }
    return path.reverse();
  };
  const objects = [];
  const tracked = new Set(trackedIds);
  const trackedNodes = [];
  const cacheObjects = [];
  const cacheCandidates: Record<string, number> = {};
  for (let node = 0; node < count; node++) {
    const nodeName = name(node);
    if (tracked.has(id(node)))
      trackedNodes.push({ id: id(node), name: nodeName, strongRootPath: retainingPath(node) });
    if (
      nodeName === '<canvas width="512" height="512">' ||
      nodeName === 'CanvasRenderingContext2D'
    ) {
      cacheCandidates[nodeName] = (cacheCandidates[nodeName] ?? 0) + 1;
      cacheObjects.push({
        id: id(node),
        name: nodeName,
        nodeType: nodeTypes[snapshot.nodes[node * nodeWidth + nt]!],
        strongRootPath: retainingPath(node),
      });
    }
    if (nodeTypes[snapshot.nodes[node * nodeWidth + nt]!] !== 'object') continue;
    const properties = new Map<string, number>();
    for (let edge = starts[node]!; edge < starts[node + 1]!; edge += edgeWidth)
      if (edgeType(edge) === 'property') properties.set(edgeName(edge), target(edge));
    const has = (...keys: string[]) => keys.every((key) => properties.has(key));
    const value = (key: string) => (properties.has(key) ? name(properties.get(key)!) : null);
    const family = has('nodeParts', 'armyParts', 'staticData', 'view', 'disposed')
      ? 'MapRenderer-shape'
      : has('stage', 'renderer', '_ticker', '_resizeTo')
        ? 'PixiApplication-shape'
        : value('renderPipeId') === 'bitmapText'
          ? 'PixiBitmapText'
          : value('renderPipeId') === 'graphics'
            ? 'PixiGraphics'
            : has('source', 'frame', 'orig', 'uvs')
              ? 'PixiTexture-shape'
              : null;
    if (family !== null)
      objects.push({
        id: id(node),
        name: nodeName,
        family,
        // Raw target names are NOT decoded booleans (e.g. V8 system / Oddball).
        propertyTargetNames: {
          disposed: value('disposed'),
          destroyed: value('destroyed'),
          initialized: value('initialized'),
          app: value('app'),
        },
        strongRootPath: retainingPath(node),
      });
  }
  const counts: Record<string, number> = {};
  for (const object of objects) counts[object.family] = (counts[object.family] ?? 0) + 1;
  return {
    scope:
      'post-GC-snapshot/shape-identification/shortest-strong-root-path/not-retained-size-or-leak-verdict',
    counts,
    cacheCandidates,
    cacheObjects,
    objects,
    trackedNodes,
  };
}

/** Caller must supply chronological snapshots from the SAME V8 isolate/run (stable IDs).
 * Absence proves only that the specifically identified before IDs are absent after GC.
 * It does not prove absence of other leaks or identify allocation ages for new objects.
 */
export function compareHeapRetainers(before: HeapSnapshot, after: HeapSnapshot) {
  const beforeAnalysis = analyzeHeapRetainers(before);
  const candidates = beforeAnalysis.objects.filter(
    (object) => object.family === 'MapRenderer-shape' || object.family === 'PixiApplication-shape',
  );
  const afterAnalysis = analyzeHeapRetainers(
    after,
    candidates.map((object) => object.id),
  );
  return {
    prerequisite: 'same-run/same-V8-isolate/stable-node-IDs/post-GC/chronological-pair',
    scope: 'identified-before-object-ID-survival/not-general-no-leak-verdict',
    candidates: candidates.map((object) => ({
      beforeId: object.id,
      family: object.family,
      afterNode: afterAnalysis.trackedNodes.find((node) => node.id === object.id) ?? null,
    })),
    before: beforeAnalysis,
    after: afterAnalysis,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = process.argv.slice(2);
  if (paths[0] === '--pair') {
    if (paths.length !== 3)
      throw new Error('Usage: tsx tools/perf/heap-retainers.ts --pair <before> <after>');
    console.log(
      JSON.stringify(
        {
          paths: paths.slice(1),
          ...compareHeapRetainers(
            JSON.parse(readFileSync(paths[1]!, 'utf8')) as HeapSnapshot,
            JSON.parse(readFileSync(paths[2]!, 'utf8')) as HeapSnapshot,
          ),
        },
        null,
        2,
      ),
    );
  } else {
    if (paths.length === 0)
      throw new Error('Usage: tsx tools/perf/heap-retainers.ts <snapshot> [snapshot...]');
    console.log(
      JSON.stringify(
        paths.map((path) => ({
          path,
          ...analyzeHeapRetainers(JSON.parse(readFileSync(path, 'utf8')) as HeapSnapshot),
        })),
        null,
        2,
      ),
    );
  }
}
