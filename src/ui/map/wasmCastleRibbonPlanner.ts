import type {
  CastleRibbonCandidate,
  CastleRibbonPlacement,
  RibbonRect,
} from './sceneParts/castleRibbonLayout';

interface CastleExports {
  memory: WebAssembly.Memory;
  castle_ribbon_abi_version: () => number;
  engine_alloc: (words: number) => number;
  engine_free: (pointer: number, words: number) => void;
  castle_ribbon_solve: (pointer: number, words: number) => number;
}

function validRect(rect: RibbonRect): void {
  if (
    ![rect.x, rect.y, rect.width, rect.height, rect.x + rect.width, rect.y + rect.height].every(
      Number.isFinite,
    ) ||
    Math.abs(rect.x) > 1e9 ||
    Math.abs(rect.y) > 1e9 ||
    rect.width <= 0 ||
    rect.height <= 0 ||
    rect.width > 4096 ||
    rect.height > 4096
  )
    throw new Error('Invalid castle ribbon rectangle');
}

const priority = (candidate: CastleRibbonCandidate) =>
  candidate.selected ? 0 : candidate.critical ? 1 : candidate.target ? 2 : 3;

/** One arena shares its owner's render instance, never the simulation instance. */
export function createWasmCastleRibbonPlanner(exports: Record<string, unknown>) {
  const backend = exports as unknown as CastleExports;
  if (
    !(backend.memory instanceof WebAssembly.Memory) ||
    Object.prototype.toString.call(backend.memory.buffer) !== '[object ArrayBuffer]' ||
    typeof exports.castle_ribbon_abi_version !== 'function' ||
    typeof exports.castle_ribbon_solve !== 'function' ||
    typeof exports.engine_alloc !== 'function' ||
    typeof exports.engine_free !== 'function' ||
    backend.castle_ribbon_abi_version() !== 1
  )
    throw new Error('Unsupported castle ribbon planner ABI');
  let pointer = 0;
  let capacity = 0;
  let view: Float64Array | null = null;
  let disposed = false;
  const arenaFor = (words: number) => {
    if (words > capacity) {
      const nextCapacity = Math.max(words, capacity * 2);
      const nextPointer = backend.engine_alloc(nextCapacity);
      if (
        !Number.isSafeInteger(nextPointer) ||
        nextPointer < 0 ||
        nextPointer % 8 !== 0 ||
        nextPointer + nextCapacity * 8 > backend.memory.buffer.byteLength
      )
        throw new Error('Invalid castle ribbon planner arena');
      if (capacity) backend.engine_free(pointer, capacity);
      pointer = nextPointer;
      capacity = nextCapacity;
      view = null;
    }
    if (!view || view.buffer !== backend.memory.buffer)
      view = new Float64Array(backend.memory.buffer, pointer, capacity);
    return view;
  };
  return {
    layout(
      candidates: readonly CastleRibbonCandidate[],
      obstacles: readonly RibbonRect[],
      hardObstacles: readonly RibbonRect[] = [],
      observation?: { readonly onWork: (work: number) => void },
    ): Map<string, CastleRibbonPlacement> {
      if (disposed) throw new Error('Castle ribbon planner is disposed');
      if (candidates.length > 256 || obstacles.length > 1024 || hardObstacles.length > 1024)
        throw new Error('Castle ribbon layout count limit exceeded');
      obstacles.forEach(validRect);
      hardObstacles.forEach(validRect);
      const ids = new Set<string>();
      let leaderCount = 0;
      for (const candidate of candidates) {
        const leaders = candidate.leaderObstacles ?? [];
        leaderCount += leaders.length;
        if (leaders.length > 1024 || leaderCount > 4096)
          throw new Error('Castle ribbon leader count limit exceeded');
        leaders.forEach(validRect);
        validRect(candidate.baseline);
        if (
          !candidate.id ||
          ids.has(candidate.id) ||
          ![candidate.anchor.x, candidate.anchor.y].every(Number.isFinite)
        )
          throw new Error('Invalid castle ribbon candidate');
        ids.add(candidate.id);
      }
      const sorted = [...candidates].sort(
        (a, b) => priority(a) - priority(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      );
      const fixed = [...obstacles].sort(
        (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
      );
      const words =
        16 + sorted.length * 24 + fixed.length * 4 + hardObstacles.length * 4 + leaderCount * 4;
      const arena = arenaFor(words);
      arena.fill(0, 0, 16);
      arena[0] = 1;
      arena[1] = sorted.length;
      arena[2] = fixed.length;
      arena[3] = hardObstacles.length;
      arena[4] = leaderCount;
      arena[5] = 16;
      let index = 16;
      let leaderStart = 0;
      const rect = (value: RibbonRect) => {
        arena[index++] = value.x;
        arena[index++] = value.y;
        arena[index++] = value.width;
        arena[index++] = value.height;
      };
      for (const candidate of sorted) {
        rect(candidate.baseline);
        arena[index++] = candidate.anchor.x;
        arena[index++] = candidate.anchor.y;
        arena[index++] = leaderStart;
        arena[index++] = candidate.leaderObstacles?.length ?? 0;
        leaderStart += candidate.leaderObstacles?.length ?? 0;
      }
      for (const obstacle of fixed) rect(obstacle);
      for (const obstacle of hardObstacles) rect(obstacle);
      for (const candidate of sorted)
        for (const obstacle of candidate.leaderObstacles ?? []) rect(obstacle);
      const outputStart = index;
      const status = backend.castle_ribbon_solve(pointer, words);
      if (status === -2) throw new Error('Malformed castle ribbon planner input');
      if (status !== sorted.length)
        throw new Error(`Invalid castle ribbon planner result: ${status}`);
      // Rust vectors can grow the shared memory while solving. Decode only a current view.
      const resultArena = arenaFor(words);
      const work = resultArena[6]!;
      if (!Number.isSafeInteger(work) || work < 0 || work > 1_000_000)
        throw new Error('Invalid castle ribbon planner work');
      const results = new Map<string, CastleRibbonPlacement>();
      const flag = (value: number) => {
        if (value !== 0 && value !== 1) throw new Error('Invalid castle ribbon planner flag');
        return value === 1;
      };
      for (let row = 0; row < sorted.length; row++) {
        const candidate = sorted[row]!;
        const start = outputStart + row * 16;
        const value = (column: number) => resultArena[start + column]!;
        for (let column = 0; column < 16; column++)
          if (!Number.isFinite(value(column)))
            throw new Error('Invalid castle ribbon planner number');
        const triedPlacements = value(9);
        if (!Number.isSafeInteger(triedPlacements) || triedPlacements < 1)
          throw new Error('Invalid castle ribbon planner attempts');
        results.set(candidate.id, {
          offset: { x: value(0), y: value(1) },
          rect: {
            ...candidate.baseline,
            x: value(2),
            y: value(3),
          },
          overlapArea: value(6),
          baselineOverlapArea: value(7),
          unresolved: flag(value(8)),
          triedPlacements,
          budgetLimited: flag(value(10)),
          leader: {
            start: { ...candidate.anchor },
            end: { x: value(13), y: value(14) },
            visible: flag(value(15)),
          },
        });
      }
      observation?.onWork(work);
      return results;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (capacity) backend.engine_free(pointer, capacity);
      capacity = 0;
      view = null;
    },
  };
}
