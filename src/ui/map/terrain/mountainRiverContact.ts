export type MountainRiverPoint = Readonly<{ x: number; y: number }>;
/** Actual emitted round-capped water segment; radius includes its original taper. */
export type MountainRiverCapsule = Readonly<{
  id: string;
  a: MountainRiverPoint;
  b: MountainRiverPoint;
  radius: number;
}>;
/** Center-relative world extent of a texel's complete linear-filter basis support. */
export type MountainRiverFilterSupport = Readonly<{ width: number; height: number }>;

const outerBankDistance = 8;
const maxContacts = 64;
const finitePoint = (p: MountainRiverPoint) =>
  Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(p.x) <= 1e6 && Math.abs(p.y) <= 1e6;
const identity = () => 1;

/** Pure static preparation only: no raster allocation, ownership, or native valley claim.
 * Invalid input preserves the original presentation. The caller decides the mountain
 * scope; this function never changes canonical water/land/relief geometry.
 */
export function prepareMountainRiverContact(
  contacts: readonly MountainRiverCapsule[],
): (point: MountainRiverPoint, support?: MountainRiverFilterSupport) => number {
  if (
    contacts.length === 0 ||
    contacts.length > maxContacts ||
    contacts.some(
      (c) =>
        !finitePoint(c.a) ||
        !finitePoint(c.b) ||
        !Number.isFinite(c.radius) ||
        c.radius < 0 ||
        c.radius > 64,
    )
  )
    return identity;
  const segments = contacts.map((c) => {
    const dx = c.b.x - c.a.x;
    const dy = c.b.y - c.a.y;
    return { x: c.a.x, y: c.a.y, dx, dy, lengthSquared: dx * dx + dy * dy, radius: c.radius };
  });
  return (point, support) => {
    if (!finitePoint(point)) return 1;
    if (
      support &&
      (!Number.isFinite(support.width) ||
        !Number.isFinite(support.height) ||
        support.width < 0 ||
        support.height < 0)
    )
      return 1;
    const supportRadius = support ? Math.hypot(support.width, support.height) : 0;
    if (supportRadius >= outerBankDistance) return 1;
    let bankDistance = Infinity;
    for (const s of segments) {
      const t =
        s.lengthSquared > 0
          ? Math.max(
              0,
              Math.min(1, ((point.x - s.x) * s.dx + (point.y - s.y) * s.dy) / s.lengthSquared),
            )
          : 0;
      bankDistance = Math.min(
        bankDistance,
        Math.hypot(point.x - s.x - t * s.dx, point.y - s.y - t * s.dy) - s.radius,
      );
    }
    // Distance is 1-Lipschitz. A modified basis is entirely within eight world
    // units of the union bank; shortening recovery also avoids a cutoff jump.
    const recovery = outerBankDistance - supportRadius;
    if (bankDistance >= recovery) return 1;
    const t = Math.max(0, bankDistance) / recovery;
    return Math.max(0, Math.min(1, t * t * t * (10 + t * (-15 + 6 * t))));
  };
}
