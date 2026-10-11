import type { MapGraph } from '@core/state/mapGraph';
import type { CastleTier } from '@core/state/enums';
import type { OutlineGeometry } from '../displayCoast';
import { edgeVisualPolyline, pointAtPolyline, tangentAtPolyline } from '../roads/roadGeometry';
import { TERRAIN_RELIEF } from '../mapViewConfig';

export interface TownPoint {
  readonly x: number;
  readonly y: number;
}
export interface TownCapsule {
  readonly id?: string;
  readonly a: TownPoint;
  readonly b: TownPoint;
  readonly radius: number;
}
export interface SettlementContext {
  readonly land: OutlineGeometry;
  readonly lakes: readonly (readonly TownPoint[])[];
  readonly obstacles: readonly TownCapsule[];
  readonly crests?: readonly TownCrest[];
}
export interface TownCrest {
  readonly id: string;
  readonly mass: readonly TownPoint[];
  readonly ridges: readonly (readonly TownPoint[])[];
}
export const TOWN_LIMITS = {
  towns: 128,
  houses: 1024,
  perTown: 8,
  slots: 12,
  queries: 2_000_000,
  boundaryPoints: 8192,
  obstacles: 16384,
  maxOrigin: 80,
} as const;
export interface TownHouse {
  readonly castleId: string;
  readonly approachId: string;
  readonly center: TownPoint;
  readonly footprint: readonly TownPoint[];
  readonly shadow: readonly TownPoint[];
  readonly walls: readonly (readonly TownPoint[])[];
  readonly roofs: readonly (readonly TownPoint[])[];
}
export interface TownGeometry {
  readonly houses: readonly TownHouse[];
  readonly attempted: number;
  readonly rejected: number;
  readonly limited: boolean;
}
const cross = (a: TownPoint, b: TownPoint, c: TownPoint) =>
  (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
const inside = (p: TownPoint, polygon: readonly TownPoint[]) => {
  let yes = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!,
      b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x)
      yes = !yes;
  }
  return yes;
};
const intersects = (a: TownPoint, b: TownPoint, c: TownPoint, d: TownPoint) =>
  Math.max(a.x, b.x) >= Math.min(c.x, d.x) &&
  Math.max(c.x, d.x) >= Math.min(a.x, b.x) &&
  Math.max(a.y, b.y) >= Math.min(c.y, d.y) &&
  Math.max(c.y, d.y) >= Math.min(a.y, b.y) &&
  cross(a, b, c) * cross(a, b, d) <= 0 &&
  cross(c, d, a) * cross(c, d, b) <= 0;
function distance(p: TownPoint, a: TownPoint, b: TownPoint) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
const finite = (p: TownPoint) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
const freezePoints = (p: readonly TownPoint[]) =>
  Object.freeze(p.map((v) => Object.freeze({ ...v })));
function house(
  castleId: string,
  approachId: string,
  center: TownPoint,
  dx: number,
  dy: number,
): TownHouse {
  const point = (x: number, y: number, z = 0) => ({
    x: center.x + dx * x - dy * y,
    y: center.y + dy * x + dx * y - z,
  });
  const a = point(-5, -3),
    b = point(5, -3),
    c = point(5, 3),
    d = point(-5, 3);
  const up = (p: TownPoint) => ({ x: p.x, y: p.y - 3 });
  const ridgeA = point(-5, 0, 5),
    ridgeB = point(5, 0, 5);
  const shadow = [a, b, c, d].map((p) => ({ x: p.x + 2, y: p.y + 2 }));
  // Conservative AABB contains ALL roofs, walls and the southeast shadow.
  const all = [a, b, c, d, up(a), up(b), up(c), up(d), ridgeA, ridgeB, ...shadow],
    xs = all.map((p) => p.x),
    ys = all.map((p) => p.y);
  const x = Math.min(...xs) - 0.3,
    y = Math.min(...ys) - 0.3,
    r = Math.max(...xs) + 0.3,
    bottom = Math.max(...ys) + 0.3;
  return Object.freeze({
    castleId,
    approachId,
    center: Object.freeze({ ...center }),
    footprint: freezePoints([
      { x, y },
      { x: r, y },
      { x: r, y: bottom },
      { x, y: bottom },
    ]),
    shadow: freezePoints(shadow),
    // Screen elevation is WORLD -Y, not the rotating road's local axes.
    // Choose the two CCW base edges whose outward normals face world +Y.
    walls: Object.freeze([
      freezePoints(dy >= 0 ? [b, c, up(c), up(b)] : [d, a, up(a), up(d)]),
      freezePoints(dx >= 0 ? [c, d, up(d), up(c)] : [a, b, up(b), up(a)]),
    ]),
    roofs: Object.freeze([
      freezePoints([up(a), up(b), ridgeB, ridgeA]),
      freezePoints([ridgeA, ridgeB, up(c), up(d)]),
    ]),
  });
}
/** Build-only original town geometry. Invalid context fails closed; unsafe slots are omitted, never clamped. */
export function buildSettlementGeometry(
  graph: MapGraph,
  tiers: Readonly<Record<string, CastleTier>>,
  context: SettlementContext,
): TownGeometry {
  const empty = Object.freeze({
    houses: Object.freeze([]),
    attempted: 0,
    rejected: 0,
    limited: true,
  });
  const land = context.land.polygons.map((p) =>
    Array.from({ length: p.points.length / 2 }, (_, i) => ({
      x: p.points[i * 2]!,
      y: p.points[i * 2 + 1]!,
    })),
  );
  const rings = [...land, ...context.lakes];
  const crests = context.crests ?? [];
  if (
    !land.length ||
    crests.length > TOWN_LIMITS.boundaryPoints ||
    crests.length + crests.reduce((n, c) => n + c.ridges.length, 0) > TOWN_LIMITS.boundaryPoints ||
    context.obstacles.length > TOWN_LIMITS.obstacles ||
    rings.reduce((n, p) => n + p.length, 0) > TOWN_LIMITS.boundaryPoints ||
    rings.some((p) => p.length < 3 || !p.every(finite)) ||
    crests.reduce((n, c) => n + c.mass.length + c.ridges.reduce((s, r) => s + r.length, 0), 0) >
      TOWN_LIMITS.boundaryPoints ||
    crests.some(
      (c) => c.mass.length < 3 || !c.mass.every(finite) || c.ridges.some((r) => !r.every(finite)),
    ) ||
    context.land.polygons.some((p) => p.points.length % 2) ||
    context.obstacles.some(
      (p) =>
        !finite(p.a) ||
        !finite(p.b) ||
        !Number.isFinite(p.radius) ||
        p.radius < 0 ||
        p.radius > 256,
    )
  )
    return empty;
  let queries = 0,
    attempted = 0,
    rejected = 0,
    limited = false;
  const houses: TownHouse[] = [];
  const tick = () => {
    if (++queries > TOWN_LIMITS.queries) {
      limited = true;
      return false;
    }
    return true;
  };
  const safe = (h: TownHouse) => {
    const p = h.footprint;
    const min = p[0]!,
      max = p[2]!;
    const apart = (a: TownPoint, b: TownPoint, r = 0) =>
      Math.max(a.x, b.x) + r < min.x ||
      Math.min(a.x, b.x) - r > max.x ||
      Math.max(a.y, b.y) + r < min.y ||
      Math.min(a.y, b.y) - r > max.y;
    if (!land.some((ring) => p.every((v) => inside(v, ring)))) return false;
    for (const ring of rings) {
      if (!tick()) return false;
      if (inside(ring[0]!, p)) return false;
      for (let i = 0; i < ring.length; i++)
        for (let j = 0; j < p.length; j++) {
          if (apart(ring[i]!, ring[(i + 1) % ring.length]!)) continue;
          if (
            !tick() ||
            intersects(ring[i]!, ring[(i + 1) % ring.length]!, p[j]!, p[(j + 1) % p.length]!)
          )
            return false;
        }
    }
    if (context.lakes.some((ring) => p.some((v) => inside(v, ring)))) return false;
    // Conservative separate intersections: footprint touches authored mass AND
    // an r=hillRidgeWidth crest capsule. This is NOT exact triple clipping.
    for (const crest of crests) {
      if (!tick()) return false;
      let touchesMass =
        p.some((v) => inside(v, crest.mass)) || crest.mass.some((v) => inside(v, p));
      if (!touchesMass)
        for (let i = 0; i < crest.mass.length && !touchesMass; i++) {
          const a = crest.mass[i]!,
            b = crest.mass[(i + 1) % crest.mass.length]!;
          if (apart(a, b)) continue;
          if (!tick()) return false;
          touchesMass = p.some((v, j) => intersects(a, b, v, p[(j + 1) % p.length]!));
        }
      if (!touchesMass) continue;
      for (const ridge of crest.ridges)
        for (let i = 0; i < ridge.length; i++) {
          if (!tick()) return false;
          const a = ridge[i]!,
            b = ridge[Math.min(i + 1, ridge.length - 1)]!;
          if (apart(a, b, TERRAIN_RELIEF.hillRidgeWidth)) continue;
          if (inside(a, p) || inside(b, p)) return false;
          for (let j = 0; j < p.length; j++) {
            const v = p[j]!,
              w = p[(j + 1) % p.length]!;
            if (
              intersects(a, b, v, w) ||
              Math.min(
                distance(v, a, b),
                distance(w, a, b),
                distance(a, v, w),
                distance(b, v, w),
              ) <= TERRAIN_RELIEF.hillRidgeWidth
            )
              return false;
          }
        }
    }
    for (const o of context.obstacles) {
      if (!tick()) return false;
      if (apart(o.a, o.b, o.radius)) continue;
      if (inside(o.a, p) || inside(o.b, p)) return false;
      for (let j = 0; j < p.length; j++) {
        const a = p[j]!,
          b = p[(j + 1) % p.length]!;
        if (
          intersects(a, b, o.a, o.b) ||
          Math.min(
            distance(a, o.a, o.b),
            distance(b, o.a, o.b),
            distance(o.a, a, b),
            distance(o.b, a, b),
          ) <= o.radius
        )
          return false;
      }
    }
    return !houses.some(
      (other) =>
        p.some((v) => inside(v, other.footprint)) ||
        other.footprint.some((v) => inside(v, p)) ||
        p.some((a, i) =>
          other.footprint.some((b, j) =>
            intersects(
              a,
              p[(i + 1) % p.length]!,
              b,
              other.footprint[(j + 1) % other.footprint.length]!,
            ),
          ),
        ),
    );
  };
  const nodes = [...graph.nodes.values()]
    .filter((n) => n.kind === 'castle' && tiers[n.id] === 'main')
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (nodes.length > TOWN_LIMITS.towns) limited = true;
  for (const node of nodes.slice(0, TOWN_LIMITS.towns)) {
    const ownRadius = context.obstacles.find((o) => o.id === `node:${node.id}`)?.radius ?? 0;
    const approaches = (graph.adjacency.get(node.id) ?? [])
      .map((id) => graph.edges.get(id))
      .filter((e) => e?.type === 'land')
      .sort((a, b) => b!.grade - a!.grade || (a!.id < b!.id ? -1 : 1));
    let accepted = 0;
    for (
      let slot = 0;
      slot < TOWN_LIMITS.slots &&
      accepted < TOWN_LIMITS.perTown &&
      houses.length < TOWN_LIMITS.houses &&
      !limited;
      slot++
    ) {
      const edge = approaches[Math.floor(slot / 4) % Math.min(3, approaches.length)];
      if (!edge) break;
      const raw = edgeVisualPolyline(edge, graph);
      if (!raw || raw.length < 2) continue;
      const pts = edge.a === node.id ? raw : [...raw].reverse();
      const len = pts
        .slice(1)
        .reduce((sum, p, i) => sum + Math.hypot(p.x - pts[i]!.x, p.y - pts[i]!.y), 0);
      if (!len) continue;
      // Short approaches stay on their actual route, not beyond a nearby node or waypoint.
      const along = Math.min(slot % 4 < 2 ? 30 : 45, len * (slot % 4 < 2 ? 0.2 : 0.8));
      const station = pointAtPolyline(pts, along / len),
        angle = tangentAtPolyline(pts, along / len);
      if (!station || angle === null) continue;
      const dx = Math.cos(angle),
        dy = Math.sin(angle);
      const template = house(node.id, edge.id, { x: 0, y: 0 }, dx, dy);
      const footprintRadius = Math.max(...template.footprint.map((p) => Math.hypot(p.x, p.y)));
      // Derive a side street's depth from the admitted model envelope and complete
      // oriented roof/wall/shadow footprint; NEVER reduce an existing obstacle radius.
      const side = (slot % 2 ? 1 : -1) * Math.max(14, ownRadius + footprintRadius + 1);
      const h = house(
        node.id,
        edge.id,
        { x: station.x - dy * side, y: station.y + dx * side },
        dx,
        dy,
      );
      attempted++;
      if (
        Math.hypot(h.center.x - node.pos.x, h.center.y - node.pos.y) <= TOWN_LIMITS.maxOrigin &&
        safe(h)
      ) {
        houses.push(h);
        accepted++;
      } else rejected++;
    }
  }
  return Object.freeze({ houses: Object.freeze(houses), attempted, rejected, limited });
}
