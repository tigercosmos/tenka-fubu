import type { PlateRect } from './armyPlateLayout';
import type { GeographicScorerInput } from './wasmGeographicScorer';

type Offset = Readonly<{ x: number; y: number }>;
type Rect = Readonly<PlateRect>;
interface PreparationExports {
  memory: WebAssembly.Memory;
  engine_alloc: (words: number) => number;
  engine_free: (pointer: number, words: number) => void;
  geographic_preparation_abi_version: () => number;
  geographic_abi_version: () => number;
  geo_score: (pointer: number, words: number) => number;
  geo_prepare: (frame: number, frameWords: number, prep: number, capacity: number) => number;
  geo_score_prepared: (
    frame: number,
    frameWords: number,
    prep: number,
    prepWords: number,
    road: number,
    roadWords: number,
  ) => number;
}
export interface GeographicPreparedLabel {
  readonly firstOffsets: readonly Offset[];
  readonly xs: readonly number[];
  readonly ys: readonly number[];
  readonly nearPrimary: readonly Rect[];
  readonly nearHard: readonly Rect[];
  readonly nearReserved: readonly Rect[];
  readonly nearPrimaryIndices: readonly number[];
  readonly nearHardIndices: readonly number[];
  readonly nearReservedIndices: readonly number[];
}
export interface GeographicPreparationOptions {
  /** Explicit resource mode override. Undefined does not choose a production budget. */
  readonly capacityBudgetWords?: number;
}
const MAX_WORDS = 0x0fffffff;
const disk: readonly Offset[] = (() => {
  const values: Offset[] = [];
  for (let y = -48; y <= 48; y += 8)
    for (let x = -48; x <= 48; x += 8) if (x * x + y * y <= 48 * 48) values.push({ x, y });
  return values;
})();
function validRect(rect: Rect) {
  if (
    !Number.isFinite(rect.x) ||
    !Number.isFinite(rect.y) ||
    !Number.isFinite(rect.width) ||
    !Number.isFinite(rect.height) ||
    !Number.isFinite(rect.x + rect.width + 4) ||
    !Number.isFinite(rect.y + rect.height + 4) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new Error('Invalid geographic label rectangle');
}
function count(value: number, limit: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > limit)
    throw new Error(`Invalid geographic preparation ${name}`);
  return value;
}

/** The signature stays JavaScript and retains caller objects and their own key order. */
export function geographicPreparationSignature(
  rect: Rect,
  roadLine: GeographicScorerInput['roadLine'],
  roadCapsules: GeographicScorerInput['roadCapsules'],
  prepared: GeographicPreparedLabel,
): string {
  return JSON.stringify([
    rect,
    roadLine,
    roadCapsules === undefined,
    roadCapsules,
    prepared.firstOffsets,
    prepared.xs,
    prepared.ys,
    prepared.nearPrimary,
    prepared.nearHard,
    prepared.nearReserved,
  ]);
}

/** Owns only render-instance arenas. Capacity mode requires the caller's existing JS prep/Rust scorer. */
export function createWasmGeographicPreparation(
  exports: Record<string, unknown>,
  options: GeographicPreparationOptions = {},
) {
  const backend = exports as unknown as PreparationExports;
  if (
    !(backend.memory instanceof WebAssembly.Memory) ||
    Object.prototype.toString.call(backend.memory.buffer) !== '[object ArrayBuffer]' ||
    typeof exports.engine_alloc !== 'function' ||
    typeof exports.engine_free !== 'function' ||
    typeof exports.geographic_preparation_abi_version !== 'function' ||
    typeof exports.geographic_abi_version !== 'function' ||
    typeof exports.geo_score !== 'function' ||
    typeof exports.geo_prepare !== 'function' ||
    typeof exports.geo_score_prepared !== 'function' ||
    backend.geographic_preparation_abi_version() !== 1 ||
    backend.geographic_abi_version() !== 1
  )
    throw new Error('Unsupported geographic preparation ABI');
  const budget = options.capacityBudgetWords;
  if (budget !== undefined && (!Number.isSafeInteger(budget) || budget < 0))
    throw new Error('Invalid geographic preparation capacity budget');
  const arena = () => {
    let pointer = 0,
      capacity = 0;
    let view: Float64Array | null = null;
    return {
      get pointer() {
        return pointer;
      },
      get capacity() {
        return capacity;
      },
      ensure(words: number) {
        count(words, MAX_WORDS, 'arena words');
        if (words > capacity) {
          const rawPointer = backend.engine_alloc(words);
          if (!Number.isInteger(rawPointer) || rawPointer < -0x80000000 || rawPointer > 0xffffffff)
            throw new Error('Invalid geographic preparation arena pointer');
          const next = rawPointer >>> 0;
          if (
            !Number.isSafeInteger(next) ||
            next <= 0 ||
            next % 8 ||
            next + words * 8 > backend.memory.buffer.byteLength
          )
            throw new Error('Invalid geographic preparation arena');
          if (capacity) backend.engine_free(pointer, capacity);
          pointer = next;
          capacity = words;
          view = null;
        }
      },
      getView() {
        if (!view || view.buffer !== backend.memory.buffer)
          view = new Float64Array(backend.memory.buffer, pointer, capacity);
        return view;
      },
      release() {
        if (capacity) backend.engine_free(pointer, capacity);
        capacity = 0;
        view = null;
      },
    };
  };
  const frame = arena(),
    prep = arena(),
    road = arena();
  let disposed = false,
    mode: 'wasm' | 'capacity' | null = null;
  let token = 0,
    revision = 0,
    k = 0,
    placedCapacity = 0,
    frameWords = 0,
    prepCapacity = 0;
  let primary: readonly Rect[] = [],
    hard: readonly Rect[] = [];
  const placed: Rect[] = [];
  let active: {
    label: GeographicPreparedLabel;
    token: number;
    revision: number;
    k: number;
    rect: Rect;
    prepWords: number;
  } | null = null;
  const live = () => {
    if (disposed) throw new Error('Geographic preparation is disposed');
  };
  const wasm = () => {
    live();
    if (mode !== 'wasm') throw new Error('Geographic preparation is not in WASM mode');
  };
  const packRect = (view: Float64Array, index: number, value: Rect) => {
    view[index] = value.x;
    view[index + 1] = value.y;
    view[index + 2] = value.width;
    view[index + 3] = value.height;
  };
  const assertActive = (label: GeographicPreparedLabel) => {
    wasm();
    if (
      !active ||
      active.label !== label ||
      active.token !== token ||
      active.k !== k ||
      active.revision !== revision
    )
      throw new Error('Stale geographic preparation descriptor');
    const f = frame.getView(),
      p = prep.getView();
    if (
      f[1] !== token ||
      p[1] !== token ||
      f[5] !== k ||
      p[2] !== k ||
      f[10] !== revision ||
      p[11] !== revision
    )
      throw new Error('Stale geographic preparation identity');
    const values = active.rect;
    if (
      !Object.is(f[6], values.x) ||
      !Object.is(p[12], values.x) ||
      !Object.is(f[7], values.y) ||
      !Object.is(p[13], values.y) ||
      !Object.is(f[8], values.width) ||
      !Object.is(p[14], values.width) ||
      !Object.is(f[9], values.height) ||
      !Object.is(p[15], values.height)
    )
      throw new Error('Stale geographic preparation rectangle');
    return active;
  };
  return {
    beginFrame(sortedPrimary: readonly Rect[], sortedHard: readonly Rect[], capacity: number) {
      live();
      count(capacity, Number.MAX_SAFE_INTEGER, 'placed capacity');
      if (token === Number.MAX_SAFE_INTEGER) throw new Error('Geographic frame token exhausted');
      token++;
      revision = 0;
      k = 0;
      active = null;
      mode = null;
      placed.length = 0;
      primary = sortedPrimary;
      hard = sortedHard;
      placedCapacity = capacity;
      frameWords = 16 + 4 * (primary.length + hard.length + capacity);
      prepCapacity = 62 + 2 * primary.length + 2 * hard.length + capacity;
      const targetWords =
        Math.max(frameWords, frame.capacity) + Math.max(prepCapacity, prep.capacity);
      if (
        !Number.isSafeInteger(targetWords) ||
        frameWords > MAX_WORDS ||
        prepCapacity > MAX_WORDS ||
        (budget !== undefined && targetWords > budget)
      ) {
        mode = 'capacity';
        return {
          mode,
          requiredWords: frameWords + prepCapacity,
          allocatedWords: frame.capacity + prep.capacity,
        };
      }
      sortedPrimary.forEach(validRect);
      sortedHard.forEach(validRect);
      frame.ensure(frameWords);
      prep.ensure(prepCapacity);
      const view = frame.getView();
      view.fill(0, 0, 16);
      view[0] = 1;
      view[1] = token;
      view[2] = primary.length;
      view[3] = hard.length;
      view[4] = capacity;
      let index = 16;
      for (const value of primary) {
        packRect(view, index, value);
        index += 4;
      }
      for (const value of hard) {
        packRect(view, index, value);
        index += 4;
      }
      mode = 'wasm';
      return {
        mode,
        requiredWords: frameWords + prepCapacity,
        allocatedWords: frame.capacity + prep.capacity,
      };
    },
    prepare(rect: Rect): GeographicPreparedLabel {
      wasm();
      validRect(rect);
      if (revision === Number.MAX_SAFE_INTEGER)
        throw new Error('Geographic label revision exhausted; begin a new frame');
      revision++;
      active = null;
      const input = frame.getView();
      input[5] = k;
      input[10] = revision;
      packRect(input, 6, rect);
      const words = backend.geo_prepare(frame.pointer, frameWords, prep.pointer, prepCapacity);
      if (words === -2) throw new Error('Malformed geographic preparation input');
      count(words, prepCapacity, 'result words');
      if (words < 32) throw new Error('Invalid geographic preparation result length');
      const output = prep.getView();
      if (
        output[0] !== 1 ||
        output[1] !== token ||
        output[2] !== k ||
        output[11] !== revision ||
        !Object.is(output[12], rect.x) ||
        !Object.is(output[13], rect.y) ||
        !Object.is(output[14], rect.width) ||
        !Object.is(output[15], rect.height) ||
        output[8] !== -1 ||
        !Object.is(output[9], 0) ||
        !Object.is(output[10], 0)
      )
        throw new Error('Invalid geographic preparation result identity');
      const np = count(output[3]!, primary.length, 'primary count');
      const nh = count(output[4]!, hard.length, 'hard count');
      const nr = count(output[5]!, primary.length + hard.length + k, 'reserved count');
      const nx = count(output[6]!, 16, 'x axis count'),
        ny = count(output[7]!, 16, 'y axis count');
      if (!nx || !ny || words !== 30 + np + nh + nr + nx + ny)
        throw new Error('Invalid geographic preparation result shape');
      let index = 16;
      const indices = (length: number, limit: number) => {
        const result: number[] = [];
        let previous = -1;
        for (let i = 0; i < length; i++) {
          const value = count(output[index++]!, limit - 1, 'near index');
          if (value <= previous) throw new Error('Invalid geographic preparation index order');
          result.push(value);
          previous = value;
        }
        return result;
      };
      const nearPrimaryIndices = indices(np, primary.length);
      const nearHardIndices = indices(nh, hard.length);
      const nearReservedIndices = indices(nr, primary.length + hard.length + k);
      const firstOffsets: Offset[] = [];
      for (let i = 0; i < 7; i++) firstOffsets.push({ x: output[index++]!, y: output[index++]! });
      const axis = (length: number) => {
        const values: number[] = [];
        for (let i = 0; i < length; i++) {
          const value = output[index++]!;
          if (
            !Number.isFinite(value) ||
            Math.abs(value) > 48 ||
            (i === 0 && !Object.is(value, 0)) ||
            (i > 0 && (Math.abs(values[i - 1]!) - Math.abs(value) || values[i - 1]! - value) >= 0)
          )
            throw new Error('Invalid geographic preparation axis');
          values.push(value);
        }
        return values;
      };
      const xs = axis(nx),
        ys = axis(ny);
      const label = {
        firstOffsets,
        xs,
        ys,
        nearPrimaryIndices,
        nearHardIndices,
        nearReservedIndices,
        nearPrimary: nearPrimaryIndices.map((i) => primary[i]!),
        nearHard: nearHardIndices.map((i) => hard[i]!),
        nearReserved: nearReservedIndices.map((i) =>
          i < primary.length
            ? primary[i]!
            : i < primary.length + hard.length
              ? hard[i - primary.length]!
              : placed[i - primary.length - hard.length]!,
        ),
      };
      active = {
        label,
        token,
        revision,
        k,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        prepWords: words,
      };
      return label;
    },
    scorePrepared(
      label: GeographicPreparedLabel,
      roadLine: GeographicScorerInput['roadLine'],
      capsules: GeographicScorerInput['roadCapsules'],
    ): { x: number; y: number } | undefined {
      const descriptor = assertActive(label);
      const capsuleCount = capsules?.length ?? 0,
        words = 8 + 5 * capsuleCount;
      count(words, MAX_WORDS, 'road words');
      road.ensure(words);
      const packet = road.getView();
      packet[0] = 1;
      packet[1] = roadLine ? 1 : 0;
      packet[2] = roadLine?.normal.x ?? 0;
      packet[3] = roadLine?.normal.y ?? 0;
      packet[4] = roadLine?.slack ?? 0;
      packet[5] = capsules === undefined ? 0 : capsules === null ? 1 : 2;
      packet[6] = capsuleCount;
      packet[7] = 0;
      let index = 8;
      if (capsules)
        for (const capsule of capsules) {
          packet[index++] = capsule.a.x;
          packet[index++] = capsule.a.y;
          packet[index++] = capsule.b.x;
          packet[index++] = capsule.b.y;
          packet[index++] = capsule.radius;
        }
      // Road allocation and other owners may have grown shared memory.
      assertActive(label);
      const winner = backend.geo_score_prepared(
        frame.pointer,
        frameWords,
        prep.pointer,
        descriptor.prepWords,
        road.pointer,
        words,
      );
      if (winner === -2) throw new Error('Malformed geographic prepared score input');
      const output = prep.getView();
      if (winner === -1) {
        if (output[8] !== -1 || !Object.is(output[9], 0) || !Object.is(output[10], 0))
          throw new Error('Invalid geographic prepared no-winner result');
        return undefined;
      }
      let expected: Offset | undefined;
      if (Number.isSafeInteger(winner) && winner >= 0) {
        if (winner < 7) expected = label.firstOffsets[winner];
        else if (winner < 7 + disk.length) expected = disk[winner - 7];
        else {
          let candidate = 7 + disk.length;
          for (const y of label.ys)
            for (const x of label.xs)
              if (x * x + y * y <= 48 * 48) {
                if (candidate === winner) expected = { x, y };
                candidate++;
              }
        }
      }
      if (
        !expected ||
        output[8] !== winner ||
        !Object.is(output[9], expected.x) ||
        !Object.is(output[10], expected.y)
      )
        throw new Error('Invalid geographic prepared winner result');
      return { x: output[9]!, y: output[10]! };
    },
    appendPlaced(rect: Rect) {
      wasm();
      validRect(rect);
      if (k >= placedCapacity) throw new Error('Geographic placed capacity exhausted');
      packRect(frame.getView(), 16 + 4 * (primary.length + hard.length + k), rect);
      placed.push(rect);
      k++;
      frame.getView()[5] = k;
      active = null;
    },
    getDiagnostics: () => ({
      mode,
      frameWords,
      prepCapacity,
      frameToken: token,
      labelRevision: revision,
      placed: k,
      allocatedWords: frame.capacity + prep.capacity + road.capacity,
    }),
    dispose() {
      if (disposed) return;
      disposed = true;
      active = null;
      mode = null;
      frame.release();
      prep.release();
      road.release();
    },
  };
}
