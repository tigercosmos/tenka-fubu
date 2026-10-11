import type { PlateRect } from './armyPlateLayout';
import type { RoadLabelCapsule } from './roadLabelCapsules';

type Offset = Readonly<{ x: number; y: number }>;
export interface GeographicScorerInput {
  readonly rect: Readonly<PlateRect>;
  readonly baselinePrimary: number;
  readonly roadLine?: Readonly<{ normal: Offset; slack: number }> | undefined;
  readonly roadCapsules?: readonly RoadLabelCapsule[] | null | undefined;
  readonly offsets: readonly Offset[];
  readonly primary: readonly Readonly<PlateRect>[];
  readonly hard: readonly Readonly<PlateRect>[];
  readonly hardBaseline: readonly number[];
  readonly reserved: readonly Readonly<PlateRect>[];
}
interface ScorerExports {
  memory: WebAssembly.Memory;
  geographic_abi_version: () => number;
  engine_alloc: (words: number) => number;
  engine_free: (pointer: number, words: number) => void;
  geo_score: (pointer: number, words: number) => number;
}

/** A separate render instance must never evaluate simulation pathfinding imports. */
export function geographicScorerImports() {
  return {
    env: {
      path_node_cost: (index: number): number => {
        void index;
        throw new Error('Pathfinding called from geographic render instance');
      },
    },
  };
}

/** One owner retains the arena; returned offsets always belong to the caller. */
export function createWasmGeographicScorer(initialExports?: Record<string, unknown>) {
  let backend: ScorerExports | null = null;
  let pointer = 0;
  let capacity = 0;
  let view: Float64Array | null = null;
  let disposed = false;
  let initializing = false;
  let initializationController: AbortController | null = null;
  const assertLive = () => {
    if (disposed) throw new Error('Geographic scorer is disposed');
  };
  const install = (exports: Record<string, unknown>) => {
    assertLive();
    if (backend) throw new Error('Geographic scorer is already installed');
    const candidate = exports as unknown as ScorerExports;
    if (
      !(candidate.memory instanceof WebAssembly.Memory) ||
      Object.prototype.toString.call(candidate.memory.buffer) !== '[object ArrayBuffer]' ||
      typeof exports.geographic_abi_version !== 'function' ||
      typeof exports.engine_alloc !== 'function' ||
      typeof exports.engine_free !== 'function' ||
      typeof exports.geo_score !== 'function' ||
      candidate.geographic_abi_version() !== 1
    )
      throw new Error('Unsupported geographic scorer ABI');
    backend = candidate;
  };
  if (initialExports) install(initialExports);
  return {
    install,
    isReady: () => !disposed && backend !== null,
    async initialize(url = `${import.meta.env.BASE_URL}wasm/tenka_engine.wasm`): Promise<void> {
      assertLive();
      if (backend || initializing)
        throw new Error('Geographic scorer initialization already started');
      initializing = true;
      const controller = new AbortController();
      initializationController = controller;
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`Geographic scorer fetch failed: ${response.status}`);
        const bytes = await response.arrayBuffer();
        assertLive();
        const instantiated = await WebAssembly.instantiate(bytes, geographicScorerImports());
        install(instantiated.instance.exports);
      } finally {
        initializing = false;
        if (initializationController === controller) initializationController = null;
      }
    },
    score(input: GeographicScorerInput): Offset | undefined {
      assertLive();
      if (!backend) throw new Error('Geographic scorer is not ready');
      if (input.hard.length !== input.hardBaseline.length)
        throw new Error('Geographic hard baseline count mismatch');
      const capsules = input.roadCapsules;
      const capsuleCount = capsules?.length ?? 0;
      const words =
        16 +
        input.offsets.length * 2 +
        input.primary.length * 4 +
        input.hard.length * 5 +
        input.reserved.length * 4 +
        capsuleCount * 5;
      if (!Number.isSafeInteger(words) || words > 0x1fffffff)
        throw new Error('Geographic scorer arena exceeds wasm32 capacity');
      if (words > capacity) {
        const nextCapacity = Math.max(words, capacity * 2);
        const nextPointer = backend.engine_alloc(nextCapacity);
        if (
          !Number.isInteger(nextPointer) ||
          nextPointer < 0 ||
          nextPointer % 8 !== 0 ||
          nextPointer + nextCapacity * 8 > backend.memory.buffer.byteLength
        )
          throw new Error('Invalid geographic scorer arena');
        if (capacity) backend.engine_free(pointer, capacity);
        pointer = nextPointer;
        capacity = nextCapacity;
        view = null;
      }
      // Both allocation and a previous solve can grow memory and detach old views.
      if (!view || view.buffer !== backend.memory.buffer)
        view = new Float64Array(backend.memory.buffer, pointer, capacity);
      const arena = view;
      arena[0] = 1;
      arena[1] = input.rect.x;
      arena[2] = input.rect.y;
      arena[3] = input.rect.width;
      arena[4] = input.rect.height;
      arena[5] = input.baselinePrimary;
      arena[6] = input.roadLine ? 1 : 0;
      arena[7] = input.roadLine?.normal.x ?? 0;
      arena[8] = input.roadLine?.normal.y ?? 0;
      arena[9] = input.roadLine?.slack ?? 0;
      arena[10] = capsules === undefined ? 0 : capsules === null ? 1 : 2;
      arena[11] = input.offsets.length;
      arena[12] = input.primary.length;
      arena[13] = input.hard.length;
      arena[14] = input.reserved.length;
      arena[15] = capsuleCount;
      let index = 16;
      for (const offset of input.offsets) {
        arena[index++] = offset.x;
        arena[index++] = offset.y;
      }
      for (const rect of input.primary) {
        arena[index++] = rect.x;
        arena[index++] = rect.y;
        arena[index++] = rect.width;
        arena[index++] = rect.height;
      }
      for (let hardIndex = 0; hardIndex < input.hard.length; hardIndex++) {
        const rect = input.hard[hardIndex]!;
        arena[index++] = rect.x;
        arena[index++] = rect.y;
        arena[index++] = rect.width;
        arena[index++] = rect.height;
        arena[index++] = input.hardBaseline[hardIndex]!;
      }
      for (const rect of input.reserved) {
        arena[index++] = rect.x;
        arena[index++] = rect.y;
        arena[index++] = rect.width;
        arena[index++] = rect.height;
      }
      if (capsules)
        for (const capsule of capsules) {
          arena[index++] = capsule.a.x;
          arena[index++] = capsule.a.y;
          arena[index++] = capsule.b.x;
          arena[index++] = capsule.b.y;
          arena[index++] = capsule.radius;
        }
      const result = backend.geo_score(pointer, words);
      if (result === -1) return undefined;
      if (result === -2) throw new Error('Malformed geographic scorer input');
      if (!Number.isInteger(result) || result < 0 || result >= input.offsets.length)
        throw new Error(`Invalid geographic scorer result: ${result}`);
      return input.offsets[result];
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      initializationController?.abort();
      initializationController = null;
      if (backend && capacity) backend.engine_free(pointer, capacity);
      capacity = 0;
      view = null;
      backend = null;
    },
  };
}

export type WasmGeographicScorer = ReturnType<typeof createWasmGeographicScorer>;
