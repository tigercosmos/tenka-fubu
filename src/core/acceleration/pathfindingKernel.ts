import { BAL } from '../balance';
import type { MapNodeId, RoadEdgeId } from '../state/ids';
import type { MapGraph, MapGraphNode } from '../state/mapGraph';

interface RustExports {
  memory: { readonly buffer: ArrayBuffer };
  engine_abi_version: () => number;
  engine_alloc: (length: number) => number;
  engine_free: (pointer: number, length: number) => void;
  path_solve: (
    pointer: number,
    nodes: number,
    links: number,
    from: number,
    to: number,
    speed: number,
    embark: number,
    output: number,
  ) => number;
}
interface Topology {
  graph: MapGraph;
  ids: MapNodeId[];
  indexes: Map<MapNodeId, number>;
  edges: RoadEdgeId[];
  links: number;
  pointer: number;
  length: number;
  output: number;
}
let backend: RustExports | null = null;
let topology: Topology | null = null;
let queries = 0;
let topologyBuilds = 0;
let equivalentGraphs = new WeakSet<MapGraph>();
let currentNodeCost: ((index: number) => number) | null = null;

/** Imports evaluate only nodes actually touched by the Rust search. */
export function rustPathfindingImports(): { env: { path_node_cost: (index: number) => number } } {
  return {
    env: {
      path_node_cost: (index) => {
        if (!currentNodeCost) throw new Error('Rust path query is not active');
        return currentNodeCost(index);
      },
    },
  };
}

/** Worker boot installs an already instantiated module; core performs no I/O. */
export function installRustPathfinding(exports: Record<string, unknown>): void {
  const candidate = exports as unknown as RustExports;
  if (
    !candidate.memory?.buffer ||
    ['engine_abi_version', 'engine_alloc', 'engine_free', 'path_solve'].some(
      (name) => typeof exports[name] !== 'function',
    ) ||
    candidate.engine_abi_version() !== 1
  )
    throw new Error('Unsupported Rust pathfinding ABI');
  clearRustPathfinding();
  backend = candidate;
}

export function clearRustPathfinding(): void {
  if (backend && topology) {
    backend.engine_free(topology.pointer, topology.length);
    backend.engine_free(topology.output, topology.ids.length * 2);
  }
  topology = null;
  backend = null;
  queries = 0;
  topologyBuilds = 0;
  equivalentGraphs = new WeakSet();
}

export function isRustPathfindingReady(): boolean {
  return backend !== null;
}
export function rustPathfindingQueryCount(): number {
  return queries;
}
export function rustPathfindingTopologyBuildCount(): number {
  return topologyBuilds;
}

function sameTopology(a: MapGraph, b: MapGraph): boolean {
  if (a.nodes.size !== b.nodes.size || a.edges.size !== b.edges.size) return false;
  for (const id of a.nodes.keys()) {
    if (!b.nodes.has(id)) return false;
    const left = a.adjacency.get(id) ?? [];
    const right = b.adjacency.get(id) ?? [];
    if (left.length !== right.length || left.some((edge, index) => edge !== right[index]))
      return false;
  }
  for (const [id, edge] of a.edges) {
    const other = b.edges.get(id);
    if (
      !other ||
      edge.a !== other.a ||
      edge.b !== other.b ||
      edge.type !== other.type ||
      edge.baseDays !== other.baseDays ||
      edge.grade !== other.grade
    )
      return false;
  }
  return true;
}

// MapGraph is canonical whole-game readonly topology (02 §5.1). Daily Worker
// snapshots create new identities for the same topology; admit those by exact
// comparison. A road change must provide a rebuilt graph, not mutate an admitted
// transient graph in place. Ownership/diplomacy are always read for each query.
function prepare(graph: MapGraph, rust: RustExports): Topology {
  if (topology && (equivalentGraphs.has(graph) || sameTopology(topology.graph, graph))) {
    equivalentGraphs.add(graph);
    return topology;
  }
  if (topology) {
    rust.engine_free(topology.pointer, topology.length);
    rust.engine_free(topology.output, topology.ids.length * 2);
  }
  // Match pathfinding.ts '<' identifier tie breaking, not locale collation.
  const ids = [...graph.nodes.keys()].sort();
  const indexes = new Map(ids.map((id, index) => [id, index]));
  const edges = [...graph.edges.keys()];
  const edgeIndexes = new Map(edges.map((id, index) => [id, index]));
  const offsets = [0],
    neighbors: number[] = [],
    edgeIds: number[] = [],
    sea: number[] = [],
    movement: number[] = [];
  for (const id of ids) {
    for (const edgeId of graph.adjacency.get(id) ?? []) {
      const edge = graph.edges.get(edgeId);
      if (!edge) continue;
      const neighbor = indexes.get(edge.a === id ? edge.b : edge.a);
      if (neighbor === undefined) continue;
      neighbors.push(neighbor);
      edgeIds.push(edgeIndexes.get(edgeId)!);
      sea.push(edge.type === 'sea' ? 1 : 0);
      movement.push(edge.baseDays / (edge.type === 'sea' ? 1 : BAL.roadGradeSpeedMult[edge.grade]));
    }
    offsets.push(neighbors.length);
  }
  const links = neighbors.length;
  const length = ids.length + 1 + links * 4;
  const pointer = rust.engine_alloc(length),
    output = rust.engine_alloc(ids.length * 2);
  new Float64Array(rust.memory.buffer, pointer, length).set([
    ...offsets,
    ...neighbors,
    ...edgeIds,
    ...sea,
    ...movement,
  ]);
  topology = { graph, ids, indexes, edges, links, pointer, length, output };
  equivalentGraphs = new WeakSet([graph]);
  topologyBuilds++;
  return topology;
}

/** Null means unavailable; an empty array is a valid zero-leg path; false is unreachable. */
export function findRustPath(
  graph: MapGraph,
  query: { from: MapNodeId; to: MapNodeId; speedFactor: number },
  eligibility: (node: MapGraphNode) => { allowed: boolean; subjugateDays: number },
): RoadEdgeId[] | false | null {
  if (
    !backend ||
    !graph.nodes.has(query.from) ||
    !graph.nodes.has(query.to) ||
    !Number.isFinite(query.speedFactor) ||
    query.speedFactor <= 0
  )
    return null;
  const rust = backend;
  const cached = prepare(graph, rust);
  currentNodeCost = (index) => {
    const result = eligibility(graph.nodes.get(cached.ids[index]!)!);
    return result.allowed ? result.subjugateDays : -1;
  };
  let count: number;
  try {
    count = rust.path_solve(
      cached.pointer,
      cached.ids.length,
      cached.links,
      cached.indexes.get(query.from)!,
      cached.indexes.get(query.to)!,
      query.speedFactor,
      BAL.seaEmbarkDays,
      cached.output,
    );
  } finally {
    currentNodeCost = null;
  }
  queries++;
  if (count === -1) return false;
  if (count < 0 || count > cached.ids.length * 2) throw new Error('Invalid Rust path result');
  // Rust can grow memory during search; acquire the current buffer after returning.
  const output = new Float64Array(rust.memory.buffer, cached.output, count);
  return Array.from(output, (index) => cached.edges[index]!);
}
