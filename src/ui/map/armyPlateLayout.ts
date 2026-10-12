export interface PlateRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ArmyPlateCandidate {
  id: string;
  rect: PlateRect;
  priority: number;
  /** CSS anchor in the same coordinate frame as rect; legacy placement ignores it. */
  anchor?: { x: number; y: number };
}

export interface ArmyPlateLayoutOptions {
  maxOffset: number;
  canvas?: PlateRect;
  screenOcclusions?: readonly PlateRect[];
}

export const ARMY_PLATE_REFINEMENT_LIMITS = Object.freeze({
  candidates: 32,
  fixedObstacles: 256,
  screenOcclusions: 16,
  axis: 40,
  proposals: 2400,
  passes: 4,
  comparisons: 4_000_000,
});

const GAP = 4;
const LIMIT = 48;
const MAX_FOREGROUND_ESCAPES = 128;

export const ARMY_SEED_READABILITY_LIMITS = Object.freeze({
  candidates: 32,
  fixed: 256,
  content: 128,
  hud: 16,
  proposals: 512,
  passes: 2,
  comparisons: 1_000_000,
});

/** Post-seed, opt-in readability only. Every original seed constraint remains a ceiling. */
export function refineArmyPlateSeedReadability(
  candidates: readonly ArmyPlateCandidate[],
  seed: ReadonlyMap<string, { x: number; y: number }>,
  baseFixed: readonly PlateRect[],
  castleContent: readonly PlateRect[],
  options: ArmyPlateLayoutOptions,
  townContent?: readonly PlateRect[],
): Map<string, { x: number; y: number }> {
  const budget = { work: 0, passes: 0 };
  // Towns cannot replace the already accepted castle-readability objective.
  // Both stages share the original invocation's search and comparison caps.
  (townContent ?? []).forEach(validate);
  const townAdmitted =
    !!townContent?.length &&
    candidates.length <= ARMY_SEED_READABILITY_LIMITS.candidates &&
    baseFixed.length + castleContent.length <= ARMY_SEED_READABILITY_LIMITS.fixed &&
    castleContent.length + townContent.length <= ARMY_SEED_READABILITY_LIMITS.content &&
    (options.screenOcclusions?.length ?? 0) <= ARMY_SEED_READABILITY_LIMITS.hud;
  // Reserve the second shared pass for visible town models when present.
  const resolved = refineArmyPlateSeedReadabilityPass(
    candidates,
    seed,
    baseFixed,
    castleContent,
    options,
    undefined,
    budget,
    townAdmitted ? 1 : ARMY_SEED_READABILITY_LIMITS.passes,
  );
  if (!townAdmitted) return resolved;
  return refineArmyPlateSeedReadabilityPass(
    candidates,
    resolved,
    baseFixed,
    castleContent,
    options,
    townContent,
    budget,
  );
}

function refineArmyPlateSeedReadabilityPass(
  candidates: readonly ArmyPlateCandidate[],
  seed: ReadonlyMap<string, { x: number; y: number }>,
  baseFixed: readonly PlateRect[],
  castleContent: readonly PlateRect[],
  options: ArmyPlateLayoutOptions,
  townContent: readonly PlateRect[] | undefined,
  budget: { work: number; passes: number },
  stagePasses: number = ARMY_SEED_READABILITY_LIMITS.passes,
): Map<string, { x: number; y: number }> {
  const fallback = () => new Map([...seed].map(([id, offset]) => [id, { ...offset }]));
  if (!Number.isFinite(options.maxOffset) || options.maxOffset < 48 || options.maxOffset > 96)
    throw new RangeError('Invalid seed readability radius');
  if (options.canvas) validate(options.canvas);
  const hud = options.screenOcclusions ?? [];
  [...baseFixed, ...castleContent, ...(townContent ?? []), ...hud].forEach(validate);
  const ids = new Set<string>();
  for (const c of candidates) {
    validate(c.rect);
    const d = seed.get(c.id);
    if (
      ids.has(c.id) ||
      !Number.isFinite(c.priority) ||
      !d ||
      ![d.x, d.y].every(Number.isFinite) ||
      (c.anchor && ![c.anchor.x, c.anchor.y].every(Number.isFinite))
    )
      throw new Error('Invalid seed readability candidate');
    ids.add(c.id);
  }
  const limits = ARMY_SEED_READABILITY_LIMITS;
  const townMode = townContent !== undefined && townContent.length > 0;
  if (
    candidates.length > limits.candidates ||
    baseFixed.length + (townMode ? castleContent.length : 0) > limits.fixed ||
    castleContent.length + (townContent?.length ?? 0) > limits.content ||
    hud.length > limits.hud
  )
    return fallback();
  // The opt-in town goal cannot trade any individual original name/troop
  // rectangle for town visibility. Both input roles count toward existing caps.
  const fixed = townMode ? [...baseFixed, ...castleContent] : baseFixed;
  const content = townMode ? (townContent ?? []) : castleContent;
  const sorted = [...candidates].sort(
    (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  const rectAt = (c: ArmyPlateCandidate, d: { x: number; y: number }) => ({
    ...c.rect,
    x: c.rect.x + d.x,
    y: c.rect.y + d.y,
  });
  const original = sorted.map((c) => rectAt(c, seed.get(c.id)!));
  const contentCost = (r: PlateRect, ceiling = Infinity) => {
    let cost = 0;
    for (const f of content) {
      cost += bodyOverlap(r, f);
      // Costs are nonnegative and replacement requires a strict improvement.
      if (cost >= ceiling) break;
    }
    return cost;
  };
  // A clear movable seed has no strictly better content score. Avoid building
  // unrelated constraint matrices, retaining the exact seed and all its guards.
  if (sorted.every((c, i) => c.priority === 0 || contentCost(original[i]!) === 0))
    return fallback();
  if (budget.work >= limits.comparisons || budget.passes >= limits.passes) return fallback();
  const current = original.map((r) => ({ ...r }));
  const result = fallback();
  const end = (c: ArmyPlateCandidate, r: PlateRect) =>
    c.anchor
      ? {
          x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
          y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
        }
      : null;
  const crosses = (c: ArmyPlateCandidate, r: PlateRect, other: PlateRect) => {
    const a = c.anchor,
      b = end(c, r);
    if (!a || !b || (r.x === c.rect.x && r.y === c.rect.y) || (a.x === b.x && a.y === b.y))
      return false;
    let lo = 0,
      hi = 1;
    for (const [s, t, min, max] of [
      [a.x, b.x, other.x, other.x + other.width],
      [a.y, b.y, other.y, other.y + other.height],
    ] as const) {
      const d = t - s;
      if (d === 0) {
        if (s <= min || s >= max) return false;
      } else {
        const u = (min - s) / d,
          v = (max - s) / d;
        lo = Math.max(lo, Math.min(u, v));
        hi = Math.min(hi, Math.max(u, v));
      }
    }
    return lo < hi;
  };
  // Exact union visibility: split the clipped plate at each HUD boundary.
  const visible = (r: PlateRect) => {
    const canvas = options.canvas;
    const left = canvas ? Math.max(r.x, canvas.x) : r.x,
      right = canvas ? Math.min(r.x + r.width, canvas.x + canvas.width) : r.x + r.width;
    const top = canvas ? Math.max(r.y, canvas.y) : r.y,
      bottom = canvas ? Math.min(r.y + r.height, canvas.y + canvas.height) : r.y + r.height;
    if (right <= left || bottom <= top) return 0;
    const relevant = hud.filter((h) => bodyOverlap(r, h) > 0);
    if (!relevant.length) return (right - left) * (bottom - top);
    const xs = [
      ...new Set([
        left,
        right,
        ...relevant.flatMap((h) => [
          Math.max(left, Math.min(right, h.x)),
          Math.max(left, Math.min(right, h.x + h.width)),
        ]),
      ]),
    ].sort((a, b) => a - b);
    let covered = 0;
    for (let k = 1; k < xs.length; k++) {
      const x1 = xs[k - 1]!,
        x2 = xs[k]!,
        mid = (x1 + x2) / 2;
      const spans = relevant
        .filter((h) => h.x < mid && h.x + h.width > mid)
        .map((h) => [Math.max(top, h.y), Math.min(bottom, h.y + h.height)] as const)
        .filter(([a, b]) => a < b)
        .sort((a, b) => a[0] - b[0]);
      let last = top;
      for (const [a, b] of spans) {
        covered += (x2 - x1) * Math.max(0, b - Math.max(last, a));
        last = Math.max(last, b);
      }
    }
    return (right - left) * (bottom - top) - covered;
  };
  const fixedCeil = original.map((r) => fixed.map((f) => bodyOverlap(r, f)));
  const pairCeil = original.map((r) => original.map((other) => bodyOverlap(r, other)));
  const crossCeil = original.map((r, i) => original.map((other) => crosses(sorted[i]!, r, other)));
  const visibility = original.map(visible);
  for (let pass = 0; pass < stagePasses && budget.passes < limits.passes; pass++) {
    if (sorted.every((c, i) => c.priority === 0 || contentCost(current[i]!) === 0)) break;
    budget.passes++;
    let changed = false;
    for (let i = 0; i < sorted.length; i++) {
      const c = sorted[i]!;
      if (c.priority === 0 || contentCost(current[i]!) === 0) continue;
      const axes = (key: 'x' | 'y') => {
        const size = key === 'x' ? 'width' : 'height';
        return [
          ...new Set([
            0,
            result.get(c.id)![key],
            ...fixed
              .concat(content)
              .flatMap((r) => [
                r[key] - c.rect[key] - c.rect[size] - 0.5,
                r[key] + r[size] + 0.5 - c.rect[key],
              ]),
          ]),
        ]
          .filter((v) => Math.abs(v) <= options.maxOffset)
          .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
          .slice(0, 12);
      };
      let unique: { x: number; y: number }[];
      if (townMode) {
        // Preserve the global radius and all seed ceilings, but prefer a local
        // repair. Relative reach is from the ORIGINAL seed, never accumulated
        // across the two passes. The legacy proposal ordering stays unchanged.
        const seedOffset = seed.get(c.id)!;
        unique = [];
        for (let y = -24; y <= 24; y += 8)
          for (let x = -24; x <= 24; x += 8) {
            const p = { x: seedOffset.x + x, y: seedOffset.y + y };
            if (x * x + y * y <= 24 ** 2 && p.x ** 2 + p.y ** 2 <= options.maxOffset ** 2)
              unique.push(p);
          }
        unique.sort(
          (a, b) =>
            (a.x - seedOffset.x) ** 2 +
              (a.y - seedOffset.y) ** 2 -
              ((b.x - seedOffset.x) ** 2 + (b.y - seedOffset.y) ** 2) ||
            a.x - b.x ||
            a.y - b.y,
        );
      } else {
        const proposals = [{ ...result.get(c.id)! }];
        for (const x of axes('x'))
          for (const y of axes('y'))
            if (x * x + y * y <= options.maxOffset ** 2) proposals.push({ x, y });
        for (let y = -options.maxOffset; y <= options.maxOffset; y += 8)
          for (let x = -options.maxOffset; x <= options.maxOffset; x += 8)
            if (x * x + y * y <= options.maxOffset ** 2) proposals.push({ x, y });
        unique = [...new Map(proposals.map((p) => [`${p.x},${p.y}`, p])).values()].slice(
          0,
          limits.proposals,
        );
      }
      let best = result.get(c.id)!,
        bestRect = current[i]!,
        bestCost = contentCost(bestRect);
      for (const d of unique) {
        if (bestCost === 0) break;
        const r = rectAt(c, d);
        if ((budget.work += content.length) > limits.comparisons) return fallback();
        const cost = contentCost(r, bestCost);
        if (cost >= bestCost) continue;
        // Count conservative actual upper bounds, including short-circuit loops.
        if (
          (budget.work += fixed.length + 3 * sorted.length + 2 * hud.length ** 2) >
          limits.comparisons
        )
          return fallback();
        if (fixed.some((f, j) => bodyOverlap(r, f) > fixedCeil[i]![j]! + 1e-8)) continue;
        if (visible(r) + 1e-8 < visibility[i]!) continue;
        if (
          current.some(
            (other, j) =>
              j !== i &&
              (bodyOverlap(r, other) > pairCeil[i]![j]! + 1e-8 ||
                (crosses(c, r, other) && !crossCeil[i]![j]) ||
                (crosses(sorted[j]!, other, r) && !crossCeil[j]![i])),
          )
        )
          continue;
        best = d;
        bestRect = r;
        bestCost = cost;
      }
      if (best.x !== result.get(c.id)!.x || best.y !== result.get(c.id)!.y) {
        result.set(c.id, { ...best });
        current[i] = bestRect;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return result;
}

function validate(rect: PlateRect) {
  if (
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x + rect.width + GAP,
      rect.y + rect.height + GAP,
    ].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new Error('Invalid plate rectangle');
}

// Padding both rectangles by two CSS pixels reserves a four-pixel gap.
function overlap(a: PlateRect, b: PlateRect) {
  return (
    Math.max(0, Math.min(a.x + a.width + 2, b.x + b.width + 2) - Math.max(a.x - 2, b.x - 2)) *
    Math.max(0, Math.min(a.y + a.height + 2, b.y + b.height + 2) - Math.max(a.y - 2, b.y - 2))
  );
}
function bodyOverlap(a: PlateRect, b: PlateRect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}

/** CSS offsets only; no world-coordinate, visibility or input mutation. */
export function layoutArmyPlates(
  candidates: readonly ArmyPlateCandidate[],
  obstacles: readonly PlateRect[],
  castleBodies: readonly PlateRect[] = [],
  foregroundBodies: readonly PlateRect[] = [],
  options?: ArmyPlateLayoutOptions,
): Map<string, { x: number; y: number }> {
  obstacles.forEach(validate);
  castleBodies.forEach(validate);
  foregroundBodies.forEach(validate);
  const ids = new Set<string>();
  for (const c of candidates) {
    validate(c.rect);
    if (c.anchor && ![c.anchor.x, c.anchor.y].every(Number.isFinite))
      throw new Error('Invalid plate anchor');
    if (!Number.isFinite(c.priority) || ids.has(c.id)) throw new Error('Invalid plate candidate');
    ids.add(c.id);
  }
  const reserved = [...obstacles, ...castleBodies, ...foregroundBodies]
    .map((r) => ({ ...r }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const bodies = [...castleBodies].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const foreground = [...foregroundBodies].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const result = new Map<string, { x: number; y: number }>();
  const sorted = [...candidates].sort(
    (a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
  for (const { id, rect } of sorted) {
    // Every accepted proposal lies within the 48px disk. Keep all rectangles
    // for edge-derived proposal generation, but only scan possible collisions.
    // Both padded rectangles extend 2px, requiring 4px beyond the search envelope.
    const minX = rect.x - LIMIT - GAP;
    const maxX = rect.x + rect.width + LIMIT + GAP;
    const minY = rect.y - LIMIT - GAP;
    const maxY = rect.y + rect.height + LIMIT + GAP;
    const nearby = (other: PlateRect) =>
      other.x <= maxX &&
      other.x + other.width >= minX &&
      other.y <= maxY &&
      other.y + other.height >= minY;
    // Filtering preserves the original summation order, including prior plates.
    const localReserved = reserved.filter(nearby);
    const localBodies = bodies.filter(nearby);
    const localForeground = foreground.filter(nearby);
    const intersecting = reserved.filter((r) => overlap(rect, r) > 0);
    const directions = [
      { x: 0, y: Math.max(0, ...intersecting.map((r) => r.y + r.height + GAP - rect.y)) },
      { x: Math.max(0, ...intersecting.map((r) => r.x + r.width + GAP - rect.x)), y: 0 },
      { x: Math.min(0, ...intersecting.map((r) => r.x - GAP - rect.width - rect.x)), y: 0 },
      { x: 0, y: Math.min(0, ...intersecting.map((r) => r.y - GAP - rect.height - rect.y)) },
    ];
    const offsets = [{ x: 0, y: 0 }, ...directions];
    // A second edge-derived escape can clear an obstacle reached by the first move.
    for (const sign of [1, -1]) {
      const first = sign > 0 ? directions[0]!.y : directions[3]!.y;
      const edges = reserved
        .map((r) => (sign > 0 ? r.y + r.height + GAP - rect.y : r.y - GAP - rect.height - rect.y))
        .filter((y) => sign * y > sign * first && Math.abs(y) <= LIMIT)
        .sort((a, b) => sign * (a - b));
      offsets.push({ x: 0, y: edges[0] ?? sign * LIMIT });
    }
    if (castleBodies.length > 0) {
      for (const body of bodies) {
        if (overlap(rect, body) === 0) continue;
        const xs = [body.x + body.width + GAP - rect.x, body.x - GAP - rect.width - rect.x];
        const ys = [body.y + body.height + GAP - rect.y, body.y - GAP - rect.height - rect.y];
        for (const x of xs) for (const y of ys) offsets.push({ x, y });
      }
    }
    // Individual edges avoid an aggregate escape exceeding the bounded disk in dense clusters.
    // Static deterministic ordering and a fixed proposal cap bound this additional search.
    let foregroundEscapes = 0;
    for (const actor of foreground) {
      if (foregroundEscapes >= MAX_FOREGROUND_ESCAPES) break;
      if (overlap(rect, actor) === 0) continue;
      const xs = [actor.x + actor.width + GAP - rect.x, actor.x - GAP - rect.width - rect.x];
      const ys = [actor.y + actor.height + GAP - rect.y, actor.y - GAP - rect.height - rect.y];
      const local = [
        { x: 0, y: ys[0]! },
        { x: xs[0]!, y: 0 },
        { x: xs[1]!, y: 0 },
        { x: 0, y: ys[1]! },
        ...xs.flatMap((x) => ys.map((y) => ({ x, y }))),
      ];
      for (const offset of local) {
        if (foregroundEscapes >= MAX_FOREGROUND_ESCAPES) break;
        offsets.push(offset);
        foregroundEscapes++;
      }
    }
    let best = { x: 0, y: 0 },
      bestBodyArea = Infinity,
      bestForegroundArea = Infinity,
      bestArea = Infinity,
      bestDistance = Infinity;
    for (const offset of offsets) {
      const distance = offset.x * offset.x + offset.y * offset.y;
      if (distance > LIMIT * LIMIT) continue;
      const moved = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
      const bodyArea = localBodies.reduce((sum, body) => sum + bodyOverlap(moved, body), 0);
      const foregroundArea = localForeground.reduce(
        (sum, actor) => sum + bodyOverlap(moved, actor),
        0,
      );
      const area = localReserved.reduce((sum, r) => sum + overlap(moved, r), 0);
      if (
        bodyArea < bestBodyArea ||
        (bodyArea === bestBodyArea &&
          (foregroundArea < bestForegroundArea ||
            (foregroundArea === bestForegroundArea &&
              (area < bestArea || (area === bestArea && distance < bestDistance)))))
      ) {
        best = offset;
        bestBodyArea = bodyArea;
        bestForegroundArea = foregroundArea;
        bestArea = area;
        bestDistance = distance;
      }
      if (area === 0 && castleBodies.length === 0 && foreground.length === 0) break;
    }
    result.set(id, { ...best });
    reserved.push({ ...rect, x: rect.x + best.x, y: rect.y + best.y });
  }
  return options === undefined
    ? result
    : refinePlates(sorted, obstacles, castleBodies, foregroundBodies, result, options);
}

type Offset = { x: number; y: number };
type Leader = {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};
type Proposal = Offset & {
  rect: PlateRect;
  visible: number;
  full: boolean;
  /** Undefined until the proposal's primary score first remains competitive. */
  leader?: Leader | null;
};

/** Opt-in bounded search; over-cap/work exhaustion retains the exact legacy result. */
function refinePlates(
  candidates: readonly ArmyPlateCandidate[],
  ribbons: readonly PlateRect[],
  bodies: readonly PlateRect[],
  foreground: readonly PlateRect[],
  legacy: Map<string, Offset>,
  options: ArmyPlateLayoutOptions,
): Map<string, Offset> {
  if (!Number.isFinite(options.maxOffset) || options.maxOffset < LIMIT || options.maxOffset > 96)
    throw new RangeError('Invalid plate refinement radius');
  if (options.canvas) validate(options.canvas);
  const hud = [...(options.screenOcclusions ?? [])];
  hud.forEach(validate);
  const fixed = [...ribbons, ...bodies, ...foreground].sort(
    (a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height,
  );
  const limits = ARMY_PLATE_REFINEMENT_LIMITS;
  if (
    candidates.length > limits.candidates ||
    fixed.length > limits.fixedObstacles ||
    hud.length > limits.screenOcclusions
  )
    return legacy;
  hud.sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const shifted = (c: ArmyPlateCandidate, d: Offset): PlateRect => ({
    ...c.rect,
    x: c.rect.x + d.x,
    y: c.rect.y + d.y,
  });
  const prior = candidates.map((c) => shifted(c, legacy.get(c.id)!));
  const leaderFor = (i: number, rect: PlateRect): Leader | null => {
    const c = candidates[i]!,
      a = c.anchor;
    if (!a || (rect.x === c.rect.x && rect.y === c.rect.y)) return null;
    const bx = Math.max(rect.x, Math.min(a.x, rect.x + rect.width)),
      by = Math.max(rect.y, Math.min(a.y, rect.y + rect.height));
    if (a.x === bx && a.y === by) return null;
    return {
      ax: a.x,
      ay: a.y,
      dx: bx - a.x,
      dy: by - a.y,
      left: Math.min(a.x, bx),
      right: Math.max(a.x, bx),
      top: Math.min(a.y, by),
      bottom: Math.max(a.y, by),
    };
  };
  const crossing = (leader: Leader | null, other: PlateRect): boolean => {
    if (leader === null) return false;
    const { ax, ay, dx, dy } = leader;
    if (
      leader.right <= other.x ||
      leader.left >= other.x + other.width ||
      leader.bottom <= other.y ||
      leader.top >= other.y + other.height
    )
      return false;
    let low = 0,
      high = 1;
    if (dx === 0) {
      if (ax <= other.x || ax >= other.x + other.width) return false;
    } else {
      const first = (other.x - ax) / dx,
        second = (other.x + other.width - ax) / dx;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low >= high) return false;
    }
    if (dy === 0) {
      if (ay <= other.y || ay >= other.y + other.height) return false;
    } else {
      const first = (other.y - ay) / dy,
        second = (other.y + other.height - ay) / dy;
      low = Math.max(low, Math.min(first, second));
      high = Math.min(high, Math.max(first, second));
      if (low >= high) return false;
    }
    const t = (low + high) / 2,
      x = ax + dx * t,
      y = ay + dy * t;
    return x > other.x && x < other.x + other.width && y > other.y && y < other.y + other.height;
  };
  const hasAnchors = candidates.some((c) => c.anchor !== undefined);
  const crossingTotal = (rects: readonly PlateRect[]): number => {
    if (!hasAnchors) return 0;
    const leaders = rects.map((rect, i) => leaderFor(i, rect));
    let sum = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = 0; j < rects.length; j++)
        if (i !== j) sum += Number(crossing(leaders[i]!, rects[j]!));
    return sum;
  };
  const isFull = (r: PlateRect): boolean =>
    (!options.canvas ||
      (r.x >= options.canvas.x &&
        r.y >= options.canvas.y &&
        r.x + r.width <= options.canvas.x + options.canvas.width &&
        r.y + r.height <= options.canvas.y + options.canvas.height)) &&
    hud.every((h) => bodyOverlap(r, h) === 0);
  if (
    prior.every(isFull) &&
    prior.every((r, i) => prior.slice(i + 1).every((other) => bodyOverlap(r, other) === 0)) &&
    crossingTotal(prior) === 0
  )
    return legacy;
  // Disjoint rectangular union strips: each HUD intersection is counted only once.
  const xs = [...new Set(hud.flatMap((r) => [r.x, r.x + r.width]))].sort((a, b) => a - b);
  const union: PlateRect[] = [];
  for (let i = 1; i < xs.length; i++) {
    const x = xs[i - 1]!,
      right = xs[i]!,
      mid = (x + right) / 2;
    const spans = hud
      .filter((r) => mid > r.x && mid < r.x + r.width)
      .map((r) => [r.y, r.y + r.height] as const)
      .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let top: number | undefined,
      bottom = 0;
    for (const span of spans) {
      if (top === undefined) {
        top = span[0];
        bottom = span[1];
      } else if (span[0] <= bottom) bottom = Math.max(bottom, span[1]);
      else {
        union.push({ x, y: top, width: right - x, height: bottom - top });
        top = span[0];
        bottom = span[1];
      }
    }
    if (top !== undefined) union.push({ x, y: top, width: right - x, height: bottom - top });
  }
  let work = 0;
  const visible = (r: PlateRect): number => {
    const c = options.canvas;
    const clipped = c
      ? {
          x: Math.max(r.x, c.x),
          y: Math.max(r.y, c.y),
          width: Math.max(0, Math.min(r.x + r.width, c.x + c.width) - Math.max(r.x, c.x)),
          height: Math.max(0, Math.min(r.y + r.height, c.y + c.height) - Math.max(r.y, c.y)),
        }
      : r;
    return Math.max(
      0,
      clipped.width * clipped.height - union.reduce((sum, h) => sum + bodyOverlap(clipped, h), 0),
    );
  };
  const sets: Proposal[][] = [];
  const contactGuards: {
    relevant: PlateRect[];
    ceilings: number[];
    baselineVisible: number;
    fullArea: number;
    offered: number;
    seen: Map<number, Set<number>>;
  }[] = [];
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i]!,
      original = legacy.get(c.id)!;
    const baselineVisible = visible(c.rect),
      fullArea = c.rect.width * c.rect.height;
    const reach = {
      x: c.rect.x - options.maxOffset,
      y: c.rect.y - options.maxOffset,
      width: c.rect.width + 2 * options.maxOffset,
      height: c.rect.height + 2 * options.maxOffset,
    };
    // Omit only obstacles disjoint from the entire allowed disk's bounding box
    // and from the legacy rectangle; none can gain positive overlap.
    const relevant = fixed.filter(
      (f) => bodyOverlap(reach, f) > 0 || bodyOverlap(prior[i]!, f) > 0,
    );
    const fixedLimits = relevant.map((f) => bodyOverlap(prior[i]!, f));
    const all = [...fixed, ...hud, ...(options.canvas ? [options.canvas] : []), ...prior];
    const axis = (values: number[]) =>
      [...new Set([0, ...values])]
        .filter((v) => Math.abs(v) <= options.maxOffset)
        .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
        .slice(0, limits.axis);
    const ax = axis(
      all.flatMap((r) => [
        r.x - c.rect.x - c.rect.width,
        r.x + r.width - c.rect.x,
        r.x - c.rect.x - c.rect.width - GAP,
        r.x + r.width - c.rect.x + GAP,
      ]),
    );
    const ay = axis(
      all.flatMap((r) => [
        r.y - c.rect.y - c.rect.height,
        r.y + r.height - c.rect.y,
        r.y - c.rect.y - c.rect.height - GAP,
        r.y + r.height - c.rect.y + GAP,
      ]),
    );
    const proposals: Offset[] = [
      original,
      { x: 0, y: 0 },
      ...ax.flatMap((x) => ay.map((y) => ({ x, y }))),
    ];
    for (let y = -options.maxOffset; y <= options.maxOffset; y += 8)
      for (let x = -options.maxOffset; x <= options.maxOffset; x += 8) proposals.push({ x, y });
    for (const x of ax) {
      const y = Math.sqrt(options.maxOffset ** 2 - x * x);
      proposals.push({ x, y }, { x, y: -y });
    }
    for (const y of ay) {
      const x = Math.sqrt(options.maxOffset ** 2 - y * y);
      proposals.push({ x, y }, { x: -x, y });
    }
    const feasible: Proposal[] = [];
    const seen = new Map<number, Set<number>>();
    const initial = c.priority === 0 ? [original] : proposals.slice(0, limits.proposals);
    contactGuards.push({
      relevant,
      ceilings: fixedLimits,
      baselineVisible,
      fullArea,
      offered: initial.length,
      seen,
    });
    for (const p of initial) {
      // Deduplicate only after the original cap; preserve the first exact coordinate's order.
      if (seen.get(p.x)?.has(p.y)) continue;
      let ys = seen.get(p.x);
      if (ys === undefined) {
        ys = new Set<number>();
        seen.set(p.x, ys);
      }
      ys.add(p.y);
      if (p.x * p.x + p.y * p.y > options.maxOffset ** 2 + 1e-8) continue;
      const rect = shifted(c, p);
      let allowed = true;
      for (let j = 0; j < relevant.length; j++) {
        if (++work > limits.comparisons) return legacy;
        if (bodyOverlap(rect, relevant[j]!) > fixedLimits[j]! + 1e-8) {
          allowed = false;
          break;
        }
      }
      if (!allowed) continue;
      const available = visible(rect);
      if (available + 1e-7 < baselineVisible) continue;
      feasible.push({
        ...p,
        rect,
        visible: available,
        full: available >= fullArea - 1e-7,
      });
    }
    if (feasible.length === 0 || feasible.every((p) => p.visible === 0)) return legacy;
    const full = feasible.filter((p) => p.full);
    sets.push(
      (full.length ? full : feasible).sort(
        (a, b) =>
          b.visible - a.visible ||
          a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y ||
          a.x - b.x ||
          a.y - b.y,
      ),
    );
  }
  const current = sets.map((s) => s[0]!);
  const proposalLeader = (i: number, proposal: Proposal): Leader | null => {
    if (proposal.leader === undefined) proposal.leader = leaderFor(i, proposal.rect);
    return proposal.leader;
  };
  const pairCost = (
    i: number,
    p: Proposal,
    ceiling = Infinity,
  ): { pair: number; cross: number } => {
    let sum = 0,
      cross = 0;
    for (let j = 0; j < current.length; j++) {
      if (i === j) continue;
      work++;
      if (work > limits.comparisons) return { pair: Infinity, cross: Infinity };
      sum += bodyOverlap(p.rect, current[j]!.rect);
      // Nonnegative remaining areas cannot rescue a proposal already above the best pair cost.
      if (sum > ceiling + 1e-8) return { pair: sum, cross: Infinity };
    }
    // Tethers matter only after the complete primary score remains competitive.
    if (hasAnchors) {
      const leader = proposalLeader(i, p);
      for (let j = 0; j < current.length; j++) {
        if (i === j) continue;
        if (leader !== null) {
          if (++work > limits.comparisons) return { pair: Infinity, cross: Infinity };
          cross += Number(crossing(leader, current[j]!.rect));
        }
        const otherLeader = proposalLeader(j, current[j]!);
        if (otherLeader !== null) {
          if (++work > limits.comparisons) return { pair: Infinity, cross: Infinity };
          cross += Number(crossing(otherLeader, p.rect));
        }
      }
    }
    return { pair: sum, cross };
  };
  const leaderContacts = (i: number): Proposal[] => {
    const c = candidates[i]!,
      here = current[i]!,
      guard = contactGuards[i]!;
    if (guard.offered >= limits.proposals) return [];
    const xs = [here.x],
      ys = [here.y];
    const own = proposalLeader(i, here);
    for (let j = 0; j < current.length; j++) {
      if (i === j) continue;
      const other = current[j]!,
        incoming = proposalLeader(j, other);
      if ((work += 2) > limits.comparisons) return [];
      if (crossing(incoming, here.rect) && incoming) {
        for (const x of [incoming.ax, incoming.ax + incoming.dx])
          xs.push(x - c.rect.x, x - c.rect.width - c.rect.x);
        for (const y of [incoming.ay, incoming.ay + incoming.dy])
          ys.push(y - c.rect.y, y - c.rect.height - c.rect.y);
      }
      if (crossing(own, other.rect)) {
        xs.push(other.rect.x - c.rect.width - c.rect.x, other.rect.x + other.rect.width - c.rect.x);
        ys.push(
          other.rect.y - c.rect.height - c.rect.y,
          other.rect.y + other.rect.height - c.rect.y,
        );
      }
    }
    for (const r of [...guard.relevant, ...hud]) {
      if (++work > limits.comparisons) return [];
      xs.push(r.x - c.rect.width - c.rect.x, r.x + r.width - c.rect.x);
      ys.push(r.y - c.rect.height - c.rect.y, r.y + r.height - c.rect.y);
    }
    const axis = (values: number[], origin: number) =>
      [...new Set(values)]
        .filter((value) => Math.abs(value) <= options.maxOffset)
        .sort((a, b) => Math.abs(a - origin) - Math.abs(b - origin) || a - b)
        .slice(0, limits.axis);
    const sortedXs = axis(xs, here.x);
    // These internal numeric axes stay unchanged throughout the Cartesian product.
    // Preserve the empty-x path, which never evaluated the y axis before.
    const sortedYs = sortedXs.length ? axis(ys, here.y) : [];
    const offsets = sortedXs
      .flatMap((x) => sortedYs.map((y) => ({ x, y })))
      .sort(
        (a, b) =>
          (a.x - here.x) ** 2 + (a.y - here.y) ** 2 - ((b.x - here.x) ** 2 + (b.y - here.y) ** 2) ||
          a.x - b.x ||
          a.y - b.y,
      );
    const accepted: Proposal[] = [];
    for (const p of offsets.slice(0, limits.proposals - guard.offered)) {
      guard.offered++;
      if (guard.seen.get(p.x)?.has(p.y)) continue;
      let seenY = guard.seen.get(p.x);
      if (!seenY) {
        seenY = new Set<number>();
        guard.seen.set(p.x, seenY);
      }
      seenY.add(p.y);
      if (p.x * p.x + p.y * p.y > options.maxOffset ** 2 + 1e-8) continue;
      const rect = shifted(c, p);
      let allowed = true;
      for (let j = 0; j < guard.relevant.length; j++) {
        if (++work > limits.comparisons) return [];
        if (bodyOverlap(rect, guard.relevant[j]!) > guard.ceilings[j]! + 1e-8) {
          allowed = false;
          break;
        }
      }
      if (!allowed) continue;
      const available = visible(rect),
        full = available >= guard.fullArea - 1e-7;
      if (available + 1e-7 < guard.baselineVisible || (here.full && !full)) continue;
      accepted.push({ ...p, rect, visible: available, full });
    }
    return accepted;
  };
  let pendingContacts = false;
  for (let pass = 0; pass < limits.passes; pass++) {
    const contactPass: boolean = pendingContacts;
    pendingContacts = false;
    let changed = false,
      residualCrossings = 0;
    for (let i = 0; i < candidates.length; i++) {
      if (candidates[i]!.priority === 0) continue;
      let best = current[i]!,
        cost = pairCost(i, best);
      const contacts = contactPass && cost.cross > 0 ? leaderContacts(i) : [];
      if (work > limits.comparisons) return legacy;
      for (const p of contacts.length ? [...sets[i]!, ...contacts] : sets[i]!) {
        // Both primary/secondary costs have their absolute minimum. A farther point cannot win.
        if (
          cost.pair === 0 &&
          cost.cross === 0 &&
          p.x * p.x + p.y * p.y >= best.x * best.x + best.y * best.y
        )
          continue;
        const value = pairCost(i, p, cost.pair);
        if (work > limits.comparisons) return legacy;
        if (
          value.pair < cost.pair - 1e-8 ||
          (Math.abs(value.pair - cost.pair) < 1e-8 &&
            (value.cross < cost.cross ||
              (value.cross === cost.cross &&
                p.x * p.x + p.y * p.y < best.x * best.x + best.y * best.y)))
        ) {
          best = p;
          cost = value;
        }
      }
      changed ||= current[i]!.x !== best.x || current[i]!.y !== best.y;
      current[i] = best;
      residualCrossings += cost.cross;
    }
    // A stalled ordinary sweep can select contact mode for the NEXT sweep,
    // never a second traversal in this iteration. Existing charged scores are
    // exact when nothing moved; clean layouts require no additional scan.
    pendingContacts = !changed && !contactPass && hasAnchors && residualCrossings > 0;
    if (!changed && !pendingContacts) break;
  }
  const pairTotal = (rects: readonly PlateRect[]): number => {
    let sum = 0;
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) sum += bodyOverlap(rects[i]!, rects[j]!);
    return sum;
  };
  const proposedRects = current.map((p) => p.rect),
    proposedPairs = pairTotal(proposedRects),
    legacyPairs = pairTotal(prior);
  if (
    proposedPairs > legacyPairs + 1e-8 ||
    (Math.abs(proposedPairs - legacyPairs) <= 1e-8 &&
      crossingTotal(proposedRects) > crossingTotal(prior))
  )
    return legacy;
  return new Map(candidates.map((c, i) => [c.id, { x: current[i]!.x, y: current[i]!.y }]));
}
