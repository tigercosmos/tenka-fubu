import { RIVER_TAPER_HEAD } from '../mapViewConfig';

export interface RiverPoint {
  readonly x: number;
  readonly y: number;
}
export interface RiverKeepout {
  readonly a: RiverPoint;
  readonly b: RiverPoint;
  readonly radius: number;
}
export interface RiverDisplaySegment {
  readonly a: RiverPoint;
  readonly b: RiverPoint;
  readonly width: number;
  readonly sourceSegment: number;
}
export interface RiverDisplayConstraints {
  readonly boundaryPolygons: readonly (readonly RiverPoint[])[];
  readonly obstacles: readonly RiverKeepout[];
}
export const NATURAL_RIVER = {
  maxDeviation: 8,
  steps: 8,
  maxObstacles: 8192,
  maxBoundaryPoints: 4096,
  maxQueries: 2_000_000,
} as const;

function hull(points: readonly RiverPoint[]) {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (a: RiverPoint, b: RiverPoint, c: RiverPoint) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const lower: RiverPoint[] = [],
    upper: RiverPoint[] = [];
  for (const p of sorted) {
    while (lower.length > 1 && cross(lower.at(-2)!, lower.at(-1)!, p) <= 0) lower.pop();
    lower.push(p);
  }
  for (const p of sorted.reverse()) {
    while (upper.length > 1 && cross(upper.at(-2)!, upper.at(-1)!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}
function inside(p: RiverPoint, polygon: readonly RiverPoint[]) {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
}
function segmentDistance(a: RiverPoint, b: RiverPoint, c: RiverPoint, d: RiverPoint) {
  return intersects(a, b, c, d)
    ? 0
    : Math.min(distance(a, c, d), distance(b, c, d), distance(c, a, b), distance(d, a, b));
}
// Exact line-parameter intersection with a capsule: endpoint disks plus the
// finite axial strip. No sample can miss a narrow pre-existing contact.
function contactIntervals(a: RiverPoint, b: RiverPoint, k: RiverKeepout, radius: number) {
  const intervals: [number, number][] = [];
  const dx = b.x - a.x,
    dy = b.y - a.y,
    n = dx * dx + dy * dy;
  for (const c of [k.a, k.b]) {
    const x = a.x - c.x,
      y = a.y - c.y,
      linear = 2 * (x * dx + y * dy),
      constant = x * x + y * y - radius * radius,
      disc = linear * linear - 4 * n * constant;
    if (disc >= 0) {
      const root = Math.sqrt(disc),
        lo = Math.max(0, (-linear - root) / (2 * n)),
        hi = Math.min(1, (-linear + root) / (2 * n));
      if (lo <= hi) intervals.push([lo, hi]);
    }
  }
  const ex = k.b.x - k.a.x,
    ey = k.b.y - k.a.y,
    length = Math.hypot(ex, ey);
  if (length > 0) {
    let lo = 0,
      hi = 1;
    const clip = (start: number, delta: number, min: number, max: number) => {
      if (delta === 0) return start >= min && start <= max;
      const x = (min - start) / delta,
        y = (max - start) / delta;
      lo = Math.max(lo, Math.min(x, y));
      hi = Math.min(hi, Math.max(x, y));
      return lo <= hi;
    };
    const x = a.x - k.a.x,
      y = a.y - k.a.y;
    if (
      clip((x * ex + y * ey) / length, (dx * ex + dy * ey) / length, 0, length) &&
      clip((x * ey - y * ex) / length, (dx * ey - dy * ex) / length, -radius, radius)
    )
      intervals.push([lo, hi]);
  }
  return intervals;
}

/** Convex control hull certificate, not a sampled curve guarantee. Only accepted
 * source intervals change; the raw first/last/contact capsules remain identical.
 */
export function buildNaturalDisplayRiver(
  points: readonly RiverPoint[],
  baseWidth: number,
  keepouts: readonly RiverKeepout[] | null,
  constraints: RiverDisplayConstraints | null,
  lakes: readonly (readonly RiverPoint[])[] = [],
  options: Readonly<{ composePinnedJunctions?: boolean }> = {},
) {
  const raw = buildDisplayRiver(points, baseWidth, null).rawSegments;
  const decisions: Readonly<{
    sourceSegment: number;
    accepted: boolean;
    controls: readonly RiverPoint[];
    reason: string;
  }>[] = [];
  const junctions: Readonly<{ sourceSegment: number; controls: readonly RiverPoint[] }>[] = [];
  const fallback = () =>
    Object.freeze({
      rawSegments: raw,
      displaySegments: raw,
      curvedCorners: 0,
      corridorRadius: 0,
      decisions: Object.freeze(decisions),
      junctions: Object.freeze(junctions),
    });
  const boundaries = constraints?.boundaryPolygons ?? [];
  if (
    !constraints ||
    boundaries.length === 0 ||
    !keepouts ||
    raw.length < 2 ||
    keepouts.length > DISPLAY_RIVER.maxKeepouts ||
    constraints.obstacles.length > NATURAL_RIVER.maxObstacles ||
    boundaries.reduce((n, p) => n + p.length, 0) > NATURAL_RIVER.maxBoundaryPoints ||
    lakes.reduce((n, p) => n + p.length, 0) > NATURAL_RIVER.maxBoundaryPoints ||
    [...boundaries, ...lakes].some((p) => p.length < 3 || p.some((v) => !finite(v))) ||
    [...keepouts, ...constraints.obstacles].some(
      (k) =>
        !finite(k.a) ||
        !finite(k.b) ||
        !Number.isFinite(k.radius) ||
        k.radius < 0 ||
        k.radius > 4096,
    ) ||
    raw.some((s) => Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) <= 1e-8)
  )
    return fallback();
  const pinned = raw.map(
    (s, i) =>
      i === 0 ||
      i === raw.length - 1 ||
      keepouts.some((k) => segmentDistance(s.a, s.b, k.a, k.b) <= k.radius + s.width / 2) ||
      lakes.some(
        (p) =>
          inside(s.a, p) ||
          inside(s.b, p) ||
          p.some((a, j) => segmentDistance(s.a, s.b, a, p[(j + 1) % p.length]!) <= s.width / 2),
      ),
  );
  const display: RiverDisplaySegment[] = [];
  let accepted = 0,
    queries = 0;
  const blocked = (polygon: readonly RiverPoint[], radius: number, sourceIndex: number) => {
    if (!boundaries.some((boundary) => polygon.every((p) => inside(p, boundary)))) return true;
    const nonadjacent = raw
      .filter((_, index) => Math.abs(index - sourceIndex) > 1)
      .map((s) => ({ a: s.a, b: s.b, radius: s.width / 2 }));
    for (const obstacle of [...keepouts, ...constraints.obstacles, ...nonadjacent]) {
      if (++queries > NATURAL_RIVER.maxQueries) return true;
      if (
        inside(obstacle.a, polygon) ||
        inside(obstacle.b, polygon) ||
        polygon.some(
          (p, i) =>
            segmentDistance(p, polygon[(i + 1) % polygon.length]!, obstacle.a, obstacle.b) <=
            radius + obstacle.radius,
        )
      )
        return true;
    }
    for (const boundary of [...boundaries, ...lakes]) {
      if (inside(boundary[0]!, polygon)) return true;
      for (let i = 0; i < boundary.length; i++) {
        if (++queries > NATURAL_RIVER.maxQueries) return true;
        if (
          polygon.some(
            (p, j) =>
              segmentDistance(
                p,
                polygon[(j + 1) % polygon.length]!,
                boundary[i]!,
                boundary[(i + 1) % boundary.length]!,
              ) <= radius,
          )
        )
          return true;
      }
    }
    return false;
  };
  for (let i = 0; i < raw.length; i++) {
    const source = raw[i]!;
    if (pinned[i]) {
      display.push(source);
      decisions.push(
        Object.freeze({
          sourceSegment: i,
          accepted: false,
          controls: Object.freeze([source.a, source.b]),
          reason: 'protected-contact',
        }),
      );
      continue;
    }
    const direction = (index: number) => {
      const s = raw[index]!,
        l = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y);
      return { x: (s.b.x - s.a.x) / l, y: (s.b.y - s.a.y) / l };
    };
    const current = direction(i),
      previous = direction(i - 1),
      next = direction(i + 1);
    const unit = (a: RiverPoint, b: RiverPoint) => {
      const n = Math.hypot(a.x + b.x, a.y + b.y);
      return n > 1e-8 ? { x: (a.x + b.x) / n, y: (a.y + b.y) / n } : current;
    };
    const start = pinned[i - 1] ? previous : unit(previous, current),
      end = pinned[i + 1] ? next : unit(current, next);
    const length = Math.hypot(source.b.x - source.a.x, source.b.y - source.a.y);
    const originalControls = [
      source.a,
      { x: source.a.x + start.x * length * 0.25, y: source.a.y + start.y * length * 0.25 },
      { x: source.b.x - end.x * length * 0.25, y: source.b.y - end.y * length * 0.25 },
      source.b,
    ];
    const evaluate = (c: readonly RiverPoint[], t: number) => {
      const u = 1 - t;
      return {
        x:
          u * u * u * c[0]!.x +
          3 * u * u * t * c[1]!.x +
          3 * u * t * t * c[2]!.x +
          t * t * t * c[3]!.x,
        y:
          u * u * u * c[0]!.y +
          3 * u * u * t * c[1]!.y +
          3 * u * t * t * c[2]!.y +
          t * t * t * c[3]!.y,
      };
    };
    const contacts = [...keepouts, ...constraints.obstacles]
      .flatMap((k) => contactIntervals(source.a, source.b, k, k.radius + source.width / 2))
      .sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const interval of contacts) {
      const last = merged.at(-1);
      if (last && interval[0] <= last[1]) last[1] = Math.max(last[1], interval[1]);
      else merged.push([...interval]);
    }
    const free: [number, number][] = [];
    let cursor = 0;
    for (const interval of merged) {
      if (cursor < interval[0]) free.push([cursor, interval[0]]);
      cursor = Math.max(cursor, interval[1]);
    }
    if (cursor < 1) free.push([cursor, 1]);
    const windows: { lo: number; hi: number; halves: readonly RiverPoint[][] }[] = [];
    windowSearch: for (const [freeLo, freeHi] of free)
      for (let attempt = 0; attempt < 5; attempt++) {
        if (
          display.length + (windows.length + 1) * 10 + raw.length - i >
          DISPLAY_RIVER.maxOutputSegments
        )
          break windowSearch;
        // Inset both ends into the exact clear interval. Outside the window the
        // original centerline/capsules are emitted, including every old contact.
        const inset = (freeHi - freeLo) * (0.1 + attempt * 0.075),
          lo = freeLo + inset,
          hi = freeHi - inset;
        if ((hi - lo) * length < 8) break;
        const at = (t: number) => ({
          x: source.a.x + (source.b.x - source.a.x) * t,
          y: source.a.y + (source.b.y - source.a.y) * t,
        });
        const entry = at(lo),
          exit = at(hi),
          t = (lo + hi) / 2,
          baseline = at(t),
          desired = evaluate(originalControls, t);
        const offset = { x: desired.x - baseline.x, y: desired.y - baseline.y };
        // Discard longitudinal reparameterization; only the neighbor-derived
        // transverse component changes the bank shape.
        const lateral = offset.x * -current.y + offset.y * current.x;
        if (Math.abs(lateral) < 1e-6) break;
        const midpoint = {
          x: baseline.x - current.y * lateral,
          y: baseline.y + current.x * lateral,
        };
        const strength = ((hi - lo) * length) / 6;
        const halves = [
          [
            entry,
            { x: entry.x + current.x * strength, y: entry.y + current.y * strength },
            { x: midpoint.x - current.x * strength, y: midpoint.y - current.y * strength },
            midpoint,
          ],
          [
            midpoint,
            { x: midpoint.x + current.x * strength, y: midpoint.y + current.y * strength },
            { x: exit.x - current.x * strength, y: exit.y - current.y * strength },
            exit,
          ],
        ];
        // A capsule is convex: every Bezier control inside it certifies the
        // complete continuous cubic, then its chordal paint plus radius.
        if (
          halves.some((controls) =>
            controls.some((p) => distance(p, source.a, source.b) > NATURAL_RIVER.maxDeviation),
          )
        )
          continue;
        if (
          halves.some((controls) => {
            const swept = hull(controls);
            return swept.length < 3 || blocked(swept, source.width / 2, i);
          })
        )
          continue;
        windows.push({ lo, hi, halves });
        break;
      }
    if (!windows.length) {
      display.push(source);
      decisions.push(
        Object.freeze({
          sourceSegment: i,
          accepted: false,
          controls: Object.freeze([source.a, source.b]),
          reason: queries > NATURAL_RIVER.maxQueries ? 'query-budget' : 'unsafe-hull',
        }),
      );
      continue;
    }
    let a = source.a;
    const add = (b: RiverPoint) => {
      if (a.x === b.x && a.y === b.y) return;
      const frozen = frozenPoint(b);
      display.push(Object.freeze({ a, b: frozen, width: source.width, sourceSegment: i }));
      a = frozen;
    };
    for (const window of windows) {
      add(window.halves[0]![0]!);
      for (const controls of window.halves)
        for (let step = 1; step <= NATURAL_RIVER.steps / 2; step++)
          add(
            step === NATURAL_RIVER.steps / 2
              ? controls[3]!
              : evaluate(controls, step / (NATURAL_RIVER.steps / 2)),
          );
    }
    add(source.b);
    accepted++;
    decisions.push(
      Object.freeze({
        sourceSegment: i,
        accepted: true,
        controls: Object.freeze(
          windows.flatMap((w) => w.halves.flatMap((c) => c.map(frozenPoint))),
        ),
        reason: 'control-hull-certified',
      }),
    );
  }
  if (!accepted || display.length > DISPLAY_RIVER.maxOutputSegments) return fallback();
  // A natural interior window must not undo an already smooth local junction.
  // Only its remaining straight collar may change: the pinned outgoing source
  // (including the complete final/mouth capsule) and every accepted window stay
  // identical. A one-sided cubic meets that raw outgoing tangent at the anchor.
  if (options.composePinnedJunctions) {
    for (let i = 0; i + 1 < raw.length; i++) {
      if (!decisions[i]?.accepted || !pinned[i + 1]) continue;
      let index = display.length - 1;
      while (index >= 0 && display[index]!.sourceSegment !== i) index--;
      if (index < 0) continue;
      const tail = display[index]!,
        source = raw[i]!,
        next = raw[i + 1]!;
      const length = Math.hypot(source.b.x - source.a.x, source.b.y - source.a.y),
        nextLength = Math.hypot(next.b.x - next.a.x, next.b.y - next.a.y),
        collar = Math.hypot(tail.b.x - tail.a.x, tail.b.y - tail.a.y);
      const u = { x: (source.b.x - source.a.x) / length, y: (source.b.y - source.a.y) / length },
        v = { x: (next.b.x - next.a.x) / nextLength, y: (next.b.y - next.a.y) / nextLength };
      if (Math.abs(u.x * v.y - u.y * v.x) < 1e-8 || collar < 0.25) continue;
      if (display.length + DISPLAY_RIVER.steps > DISPLAY_RIVER.maxOutputSegments) continue;
      const initialRun = Math.min(
        DISPLAY_RIVER.maxRun,
        length * DISPLAY_RIVER.adjacentFraction,
        nextLength * DISPLAY_RIVER.adjacentFraction,
        Math.min(source.width, next.width) * 1.5,
        collar,
      );
      for (let attempt = 0; attempt < 5; attempt++) {
        const run = initialRun / 2 ** attempt;
        if (run < 0.25) break;
        const entry =
            run === collar ? tail.a : { x: source.b.x - u.x * run, y: source.b.y - u.y * run },
          controls = [
            entry,
            { x: entry.x + (u.x * run) / 3, y: entry.y + (u.y * run) / 3 },
            { x: source.b.x - (v.x * run) / 3, y: source.b.y - (v.y * run) / 3 },
            source.b,
          ];
        if (
          controls.some((p) => distance(p, source.a, source.b) > NATURAL_RIVER.maxDeviation) ||
          blocked(hull(controls), source.width / 2, i)
        )
          continue;
        const replacements: RiverDisplaySegment[] = [];
        let a = tail.a;
        const add = (b: RiverPoint) => {
          if (a.x === b.x && a.y === b.y) return;
          const frozen = frozenPoint(b);
          replacements.push(Object.freeze({ a, b: frozen, width: source.width, sourceSegment: i }));
          a = frozen;
        };
        add(entry);
        for (let step = 1; step <= DISPLAY_RIVER.steps; step++) {
          const t = step / DISPLAY_RIVER.steps,
            s = 1 - t;
          add(
            step === DISPLAY_RIVER.steps
              ? source.b
              : {
                  x:
                    s * s * s * controls[0]!.x +
                    3 * s * s * t * controls[1]!.x +
                    3 * s * t * t * controls[2]!.x +
                    t * t * t * controls[3]!.x,
                  y:
                    s * s * s * controls[0]!.y +
                    3 * s * s * t * controls[1]!.y +
                    3 * s * t * t * controls[2]!.y +
                    t * t * t * controls[3]!.y,
                },
          );
        }
        display.splice(index, 1, ...replacements);
        junctions.push(
          Object.freeze({ sourceSegment: i, controls: Object.freeze(controls.map(frozenPoint)) }),
        );
        break;
      }
    }
  }
  return Object.freeze({
    rawSegments: raw,
    displaySegments: Object.freeze(display),
    curvedCorners: accepted,
    corridorRadius: NATURAL_RIVER.maxDeviation,
    decisions: Object.freeze(decisions),
    junctions: Object.freeze(junctions),
  });
}
export const DISPLAY_RIVER = {
  maxInput: 256,
  maxOutputSegments: 4096,
  maxKeepouts: 256,
  maxRun: 12,
  adjacentFraction: 0.2,
  steps: 8,
} as const;
const finite = (p: RiverPoint) =>
  Number.isFinite(p.x) &&
  Number.isFinite(p.y) &&
  Math.abs(p.x) <= 1_000_000 &&
  Math.abs(p.y) <= 1_000_000;
function distance(p: RiverPoint, a: RiverPoint, b: RiverPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    n = dx * dx + dy * dy;
  const t = n ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / n)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
function intersects(a: RiverPoint, b: RiverPoint, c: RiverPoint, d: RiverPoint) {
  const cross = (p: RiverPoint, q: RiverPoint, r: RiverPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
    Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
    Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
    Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
    cross(a, b, c) * cross(a, b, d) <= 0 &&
    cross(c, d, a) * cross(c, d, b) <= 0
  );
}
const frozenPoint = (p: RiverPoint) => Object.freeze({ x: p.x, y: p.y });

/** Local display interpolation, not a reconstructed river. The caller MUST clip all paint to rawSegments.
 * Exact raw endpoint capsules / protected segments remain painted. No random meanders.
 */
export function buildDisplayRiver(
  points: readonly RiverPoint[],
  baseWidth: number,
  keepouts: readonly RiverKeepout[] | null = [],
  taper = RIVER_TAPER_HEAD,
) {
  const invalid =
    points.length < 2 ||
    points.length > DISPLAY_RIVER.maxInput ||
    points.some((p) => !finite(p)) ||
    !Number.isFinite(baseWidth) ||
    baseWidth <= 0 ||
    baseWidth > 128 ||
    !Number.isFinite(taper) ||
    taper <= 0 ||
    taper > 1;
  const rawSegments: RiverDisplaySegment[] = [];
  if (!invalid)
    for (let i = 0; i < points.length - 1; i++) {
      const a = frozenPoint(points[i]!),
        b = frozenPoint(points[i + 1]!);
      const width =
        baseWidth * (points.length > 2 ? taper + ((1 - taper) * i) / (points.length - 2) : 1);
      rawSegments.push(Object.freeze({ a, b, width, sourceSegment: i }));
    }
  const raw = Object.freeze(rawSegments);
  const fallback = () =>
    Object.freeze({ rawSegments: raw, displaySegments: raw, curvedCorners: 0 });
  if (
    invalid ||
    raw.some(
      (s) =>
        !Number.isFinite(Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)) ||
        Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y) <= 1e-8,
    ) ||
    keepouts === null ||
    keepouts.length > DISPLAY_RIVER.maxKeepouts ||
    keepouts.some(
      (k) =>
        !finite(k.a) ||
        !finite(k.b) ||
        !Number.isFinite(k.radius) ||
        k.radius < 0 ||
        k.radius > 4096,
    )
  )
    return fallback();
  const pinned = raw.map((s) =>
    keepouts.some(
      (k) =>
        intersects(s.a, s.b, k.a, k.b) ||
        Math.min(
          distance(s.a, k.a, k.b),
          distance(s.b, k.a, k.b),
          distance(k.a, s.a, s.b),
          distance(k.b, s.a, s.b),
        ) <=
          k.radius + s.width / 2,
    ),
  );
  const display: RiverDisplaySegment[] = [];
  let current = raw[0]!.a,
    corners = 0;
  const add = (b: RiverPoint, index: number) => {
    if (current.x === b.x && current.y === b.y) return;
    display.push(
      Object.freeze({
        a: current,
        b: frozenPoint(b),
        width: raw[index]!.width,
        sourceSegment: index,
      }),
    );
    current = display.at(-1)!.b;
  };
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[i - 1]!,
      p = points[i]!,
      b = points[i + 1]!;
    const dx = p.x - a.x,
      dy = p.y - a.y,
      ex = b.x - p.x,
      ey = b.y - p.y;
    const before = Math.hypot(dx, dy),
      after = Math.hypot(ex, ey);
    if (pinned[i - 1] || pinned[i] || Math.abs(dx * ey - dy * ex) < 1e-8) {
      add(p, i - 1);
      continue;
    }
    const run = Math.min(
      DISPLAY_RIVER.maxRun,
      before * DISPLAY_RIVER.adjacentFraction,
      after * DISPLAY_RIVER.adjacentFraction,
      Math.min(raw[i - 1]!.width, raw[i]!.width) * 1.5,
    );
    const entry = { x: p.x - (dx * run) / before, y: p.y - (dy * run) / before };
    const exit = { x: p.x + (ex * run) / after, y: p.y + (ey * run) / after };
    add(entry, i - 1);
    const tx = dx / before + ex / after,
      ty = dy / before + ey / after,
      tangentLength = Math.hypot(tx, ty);
    if (tangentLength < 1e-8) {
      add(p, i - 1);
      continue;
    }
    // Match the entry/exit derivative strength. A half-strength shared derivative
    // concentrates the flattened turn at the retained raw anchor instead of
    // distributing it across both local halves (notably Fuji and Shinano).
    const tangent = { x: (tx / tangentLength) * run, y: (ty / tangentLength) * run };
    const half = (
      start: RiverPoint,
      end: RiverPoint,
      da: RiverPoint,
      db: RiverPoint,
      index: number,
    ) => {
      for (let step = 1; step <= DISPLAY_RIVER.steps / 2; step++) {
        const t = step / (DISPLAY_RIVER.steps / 2),
          u = 1 - t;
        add(
          step === DISPLAY_RIVER.steps / 2
            ? end
            : {
                x:
                  u * u * u * start.x +
                  3 * u * u * t * (start.x + da.x / 3) +
                  3 * u * t * t * (end.x - db.x / 3) +
                  t * t * t * end.x,
                y:
                  u * u * u * start.y +
                  3 * u * u * t * (start.y + da.y / 3) +
                  3 * u * t * t * (end.y - db.y / 3) +
                  t * t * t * end.y,
              },
          index,
        );
      }
    };
    half(entry, p, { x: (dx / before) * run, y: (dy / before) * run }, tangent, i - 1);
    half(p, exit, tangent, { x: (ex / after) * run, y: (ey / after) * run }, i);
    corners++;
  }
  add(raw.at(-1)!.b, raw.length - 1);
  if (!corners || display.length > DISPLAY_RIVER.maxOutputSegments) return fallback();
  return Object.freeze({
    rawSegments: raw,
    displaySegments: Object.freeze(display),
    curvedCorners: corners,
  });
}
