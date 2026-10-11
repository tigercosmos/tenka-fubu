export interface RibbonRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface CastleRibbonCandidate {
  id: string;
  baseline: RibbonRect;
  anchor: { x: number; y: number };
  selected?: boolean;
  critical?: boolean;
  target?: boolean;
  leaderObstacles?: readonly RibbonRect[];
}
export interface CastleRibbonPlacement {
  offset: { x: number; y: number };
  rect: RibbonRect;
  overlapArea: number;
  baselineOverlapArea: number;
  unresolved: boolean;
  triedPlacements: number;
  budgetLimited: boolean;
  leader: { start: { x: number; y: number }; end: { x: number; y: number }; visible: boolean };
}

const LIMIT = 48;
const GAP = 4;
const WORK_LIMIT = 1_000_000;
function leaderEnd(anchor: { x: number; y: number }, rect: RibbonRect) {
  return {
    x: Math.max(rect.x, Math.min(anchor.x, rect.x + rect.width)),
    y: Math.max(rect.y, Math.min(anchor.y, rect.y + rect.height)),
  };
}
/** Open rectangle interior: edge/corner contact alone is not a crossing. */
function crossesInterior(
  start: { x: number; y: number },
  end: { x: number; y: number },
  rect: RibbonRect,
) {
  let low = 0,
    high = 1;
  for (const [a, b, min, max] of [
    [start.x, end.x, rect.x, rect.x + rect.width],
    [start.y, end.y, rect.y, rect.y + rect.height],
  ] as const) {
    const delta = b - a;
    if (delta === 0) {
      if (a <= min || a >= max) return false;
    } else {
      const t1 = (min - a) / delta,
        t2 = (max - a) / delta;
      low = Math.max(low, Math.min(t1, t2));
      high = Math.min(high, Math.max(t1, t2));
    }
  }
  return low < high;
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
function overlap(a: RibbonRect, b: RibbonRect, gap = 0): number {
  return (
    Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width) - Math.max(a.x - gap, b.x)) *
    Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height) - Math.max(a.y - gap, b.y))
  );
}
const priority = (candidate: CastleRibbonCandidate) =>
  candidate.selected ? 0 : candidate.critical ? 1 : candidate.target ? 2 : 3;

/** CSS-only placement. Every input keeps a result, including unresolved or budget-limited cases. */
export function layoutCastleRibbons(
  candidates: readonly CastleRibbonCandidate[],
  obstacles: readonly RibbonRect[],
  hardObstacles: readonly RibbonRect[] = [],
  observation?: { readonly onWork: (work: number) => void },
): Map<string, CastleRibbonPlacement> {
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
  const placed: RibbonRect[] = [];
  const results = new Map<string, CastleRibbonPlacement>();
  let work = 0;
  for (let index = 0; index < sorted.length; index++) {
    const candidate = sorted[index]!;
    const baseline = candidate.baseline;
    const reserved = [...fixed, ...placed, ...sorted.slice(index + 1).map((item) => item.baseline)];
    const axis = (values: number[]) =>
      [...new Set([0, ...values])]
        .filter((value) => Number.isFinite(value) && Math.abs(value) <= LIMIT)
        .sort((a, b) => Math.abs(a) - Math.abs(b) || a - b)
        .slice(0, 12);
    const xs = axis(
      reserved.flatMap((rect) => [
        rect.x - baseline.x - baseline.width - GAP,
        rect.x + rect.width + GAP - baseline.x,
      ]),
    );
    const ys = axis(
      reserved.flatMap((rect) => [
        rect.y - baseline.y - baseline.height - GAP,
        rect.y + rect.height + GAP - baseline.y,
      ]),
    );
    const offsets = [{ x: 0, y: 0 }];
    for (const x of xs)
      for (const y of ys) if (x * x + y * y <= LIMIT * LIMIT) offsets.push({ x, y });
    for (let y = -LIMIT; y <= LIMIT; y += 8)
      for (let x = -LIMIT; x <= LIMIT; x += 8)
        if (x * x + y * y <= LIMIT * LIMIT) offsets.push({ x, y });
    const unique = [
      ...new Map(offsets.map((offset) => [`${offset.x},${offset.y}`, offset])).values(),
    ];
    // Candidate generation intentionally sees every reservation. Only terms
    // provably zero for every offset in the disk can leave proposal scans.
    // Match shifted-rectangle addition order. Floating addition is monotone,
    // so evaluating the extreme offset first also contains fractional edges.
    const inSweep = (rect: RibbonRect, gap: number) => {
      const left = baseline.x - LIMIT - gap;
      const top = baseline.y - LIMIT - gap;
      const right = baseline.x + LIMIT + baseline.width + gap;
      const bottom = baseline.y + LIMIT + baseline.height + gap;
      return (
        rect.x <= right &&
        rect.x + rect.width >= left &&
        rect.y <= bottom &&
        rect.y + rect.height >= top
      );
    };
    const scoreReserved = reserved.filter((rect) => inSweep(rect, GAP));
    const localHard = hardObstacles.filter((rect) => inSweep(rect, 0));
    const score = (rect: RibbonRect, terms = reserved) => {
      let raw = 0,
        padded = 0;
      for (const obstacle of terms) {
        raw += overlap(rect, obstacle);
        padded += overlap(rect, obstacle, GAP);
      }
      return { raw, padded };
    };
    let best = { x: 0, y: 0 };
    let bestScore = score(baseline);
    const baselineOverlapArea = bestScore.raw;
    const hardBaseline = localHard.map((obstacle) => overlap(baseline, obstacle));
    let bestHardArea = hardBaseline.reduce((sum, area) => sum + area, 0);
    let triedPlacements = 1,
      budgetLimited = false;
    for (const offset of unique.slice(1)) {
      // Conservative charge includes both score intersections and every guard,
      // including loops that can reject early. Mandatory baseline/final
      // diagnostics are separately bounded by the admitted input counts.
      const proposalWork =
        hardObstacles.length === 0 && !candidate.leaderObstacles?.length
          ? scoreReserved.length
          : scoreReserved.length * 2 + localHard.length + (candidate.leaderObstacles?.length ?? 0);
      if (work + proposalWork > WORK_LIMIT) {
        budgetLimited = true;
        break;
      }
      work += proposalWork;
      triedPlacements++;
      const rect = { ...baseline, x: baseline.x + offset.x, y: baseline.y + offset.y };
      let hardArea = 0,
        hardBlocked = false;
      for (let i = 0; i < localHard.length; i++) {
        const area = overlap(rect, localHard[i]!);
        hardArea += area;
        if (area > hardBaseline[i]!) {
          hardBlocked = true;
          break;
        }
      }
      if (hardBlocked) continue;
      const end = leaderEnd(candidate.anchor, rect);
      if (
        candidate.leaderObstacles?.some((obstacle) =>
          crossesInterior(candidate.anchor, end, obstacle),
        )
      )
        continue;
      const next = score(rect, scoreReserved);
      const distance = offset.x * offset.x + offset.y * offset.y;
      const bestDistance = best.x * best.x + best.y * best.y;
      if (
        next.raw < bestScore.raw ||
        (next.raw === bestScore.raw &&
          (next.padded < bestScore.padded ||
            (next.padded === bestScore.padded &&
              (hardArea < bestHardArea || (hardArea === bestHardArea && distance < bestDistance)))))
      ) {
        best = offset;
        bestScore = next;
        bestHardArea = hardArea;
      }
    }
    const rect = { ...baseline, x: baseline.x + best.x, y: baseline.y + best.y };
    placed.push(rect);
    results.set(candidate.id, {
      offset: { ...best },
      rect,
      overlapArea: bestScore.raw,
      baselineOverlapArea,
      unresolved: bestScore.raw > 0,
      triedPlacements,
      budgetLimited,
      leader: {
        start: { ...candidate.anchor },
        end: leaderEnd(candidate.anchor, rect),
        visible:
          (best.x !== 0 || best.y !== 0) &&
          (candidate.anchor.x !== leaderEnd(candidate.anchor, rect).x ||
            candidate.anchor.y !== leaderEnd(candidate.anchor, rect).y),
      },
    });
  }
  // Later ribbons can leave their reserved baselines. Diagnostics describe the
  // final returned rectangles, not those transient reservations.
  for (const candidate of sorted) {
    const result = results.get(candidate.id)!;
    const finalObstacles = [
      ...fixed,
      ...sorted
        .filter((other) => other.id !== candidate.id)
        .map((other) => results.get(other.id)!.rect),
    ];
    result.overlapArea = finalObstacles.reduce(
      (sum, obstacle) => sum + overlap(result.rect, obstacle),
      0,
    );
    result.baselineOverlapArea = finalObstacles.reduce(
      (sum, obstacle) => sum + overlap(candidate.baseline, obstacle),
      0,
    );
    result.unresolved = result.overlapArea > 0;
  }
  observation?.onWork(work);
  return results;
}

/** No second search: only contained original-offset paint can be admitted. */
export function admitContainedCastleRibbons(
  candidates: readonly CastleRibbonCandidate[],
  original: ReadonlyMap<string, CastleRibbonPlacement>,
  compactBaselines: readonly {
    readonly id: string;
    readonly baseline: RibbonRect;
    readonly nameArea?: {
      readonly original: RibbonRect;
      readonly compact: RibbonRect;
      readonly viewport: RibbonRect;
      readonly occlusions?: readonly RibbonRect[];
    };
  }[],
  obstacles: readonly RibbonRect[],
  hardObstacles: readonly RibbonRect[],
  originalWork: number,
) {
  if (
    candidates.length > 256 ||
    compactBaselines.length > candidates.length ||
    obstacles.length > 1024 ||
    hardObstacles.length > 1024 ||
    !Number.isInteger(originalWork) ||
    originalWork < 0 ||
    originalWork > WORK_LIMIT
  )
    throw new Error('Invalid contained castle ribbon admission');
  let work = originalWork;
  const exhausted = new Error('Contained castle ribbon work exhausted');
  const charge = (count = 1): void => {
    if (work + count > WORK_LIMIT) {
      work = WORK_LIMIT;
      throw exhausted;
    }
    work += count;
  };
  const fallback = () => ({
    placements: new Map(original),
    compactIds: new Set<string>(),
    work,
    budgetLimited: true,
  });
  if (work === WORK_LIMIT) return fallback();
  const results = new Map(original),
    admitted = new Map<string, RibbonRect>();
  try {
    for (const candidate of candidates) {
      charge();
      if (!original.has(candidate.id)) return fallback();
    }
    for (const variant of compactBaselines) {
      charge();
      const candidate = candidates.find((item) => {
        charge();
        return item.id === variant.id;
      });
      if (!candidate || !original.has(variant.id) || admitted.has(variant.id)) continue;
      charge(12);
      validRect(variant.baseline);
      const before = original.get(variant.id)!;
      const rect = {
        ...variant.baseline,
        x: variant.baseline.x + before.offset.x,
        y: variant.baseline.y + before.offset.y,
      };
      charge(4);
      if (
        rect.x < before.rect.x ||
        rect.y < before.rect.y ||
        rect.x + rect.width > before.rect.x + before.rect.width ||
        rect.y + rect.height > before.rect.y + before.rect.height
      )
        continue;
      if (variant.nameArea) {
        // A measured viewport alone does not certify unobscured name paint.
        charge();
        if (!Array.isArray(variant.nameArea.occlusions)) continue;
        if (variant.nameArea.occlusions.length > 1024) return fallback();
        charge(36);
        validRect(variant.nameArea.original);
        validRect(variant.nameArea.compact);
        validRect(variant.nameArea.viewport);
        charge(3);
        // Literal canvas-clipped full glyph bounds, not the ribbon proxy.
        if (
          overlap(variant.nameArea.compact, variant.nameArea.viewport) <
          overlap(variant.nameArea.original, variant.nameArea.viewport)
        )
          continue;
        let obscured = false;
        for (const ui of variant.nameArea.occlusions as readonly RibbonRect[]) {
          charge(12);
          validRect(ui);
          charge(3);
          if (overlap(variant.nameArea.compact, ui) > overlap(variant.nameArea.original, ui)) {
            obscured = true;
            break;
          }
        }
        if (obscured) continue;
      }
      charge(6);
      const end = leaderEnd(candidate.anchor, rect);
      // Keep original leader bytes. Never create a longer tether to rescue a
      // shorter label; an altered visible endpoint keeps the full label.
      if (before.leader.visible && (end.x !== before.leader.end.x || end.y !== before.leader.end.y))
        continue;
      let blocked = false;
      for (const body of hardObstacles) {
        charge(3);
        if (overlap(rect, body) > overlap(before.rect, body)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      admitted.set(variant.id, variant.baseline);
      results.set(variant.id, { ...before, rect });
    }
    if (admitted.size === 0)
      return {
        placements: new Map(original),
        compactIds: new Set<string>(),
        work,
        budgetLimited: false,
      };
    // Diagnostics describe actual final rectangles. Every new comparison is
    // charged; exhaustion discards ALL compact admissions, not original names.
    for (const candidate of candidates) {
      const result = results.get(candidate.id)!;
      const baseline = admitted.get(candidate.id) ?? candidate.baseline;
      let area = 0,
        baselineArea = 0;
      for (const obstacle of obstacles) {
        charge(2);
        area += overlap(result.rect, obstacle);
        baselineArea += overlap(baseline, obstacle);
      }
      for (const other of candidates) {
        charge();
        if (other.id === candidate.id) continue;
        charge(2);
        const rect = results.get(other.id)!.rect;
        area += overlap(result.rect, rect);
        baselineArea += overlap(baseline, rect);
      }
      results.set(candidate.id, {
        ...result,
        overlapArea: area,
        baselineOverlapArea: baselineArea,
        unresolved: area > 0,
      });
    }
    return {
      placements: results,
      compactIds: new Set(admitted.keys()),
      work,
      budgetLimited: false,
    };
  } catch (error) {
    if (error === exhausted) return fallback();
    // Invalid measured variants fail closed without replacing the original.
    if (error instanceof Error && error.message === 'Invalid castle ribbon rectangle')
      return fallback();
    throw error;
  }
}
