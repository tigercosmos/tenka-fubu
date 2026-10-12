export interface SignalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ArmySignalCandidate {
  id: string;
  rect: SignalRect;
  priority: number;
}
export const ARMY_SIGNAL_LAYOUT = {
  maxOffset: 24,
  candidates: 256,
  obstacles: 1024,
  proposals: 64,
  overlapWork: 1_000_000,
  passes: 2,
} as const;
type Offset = { x: number; y: number };
const EXHAUSTED = new Error('Signal layout work exhausted');

function validate(rect: SignalRect) {
  if (
    ![
      rect.x,
      rect.y,
      rect.width,
      rect.height,
      rect.x + rect.width + 24,
      rect.y + rect.height + 24,
      rect.width * rect.height,
      rect.width * rect.height * (ARMY_SIGNAL_LAYOUT.candidates + ARMY_SIGNAL_LAYOUT.obstacles),
    ].every(Number.isFinite) ||
    rect.width < 0 ||
    rect.height < 0
  )
    throw new RangeError('Invalid signal rectangle');
}
function overlap(a: SignalRect, b: SignalRect) {
  return (
    Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
    Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y))
  );
}
function overlapSafeY(a: SignalRect, b: SignalRect) {
  const x = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  if (x === 0) return 0;
  return x * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}

/** CSS-only bounded coordinate relaxation. No visibility, model or world-coordinate changes.
 * Every move preserves each fixed-object baseline overlap and cannot increase total banner
 * pair overlap. Later banners remain in the objective at their current baseline positions.
 * Dense/impossible clusters and exhausted work retain residual collisions, never hide actors.
 */
export function layoutArmySignals(
  candidates: readonly ArmySignalCandidate[],
  obstacles: readonly SignalRect[],
): Map<string, Offset> {
  if (
    candidates.length > ARMY_SIGNAL_LAYOUT.candidates ||
    obstacles.length > ARMY_SIGNAL_LAYOUT.obstacles
  )
    throw new RangeError('Signal layout input limit exceeded');
  const ids = new Set<string>();
  let safeY = true;
  // Every accepted proposal moves at most 24px. This bound keeps the skipped
  // Y span finite even after that move; extreme valid inputs use the original math.
  const safeComponent = Number.MAX_VALUE / 16;
  for (const candidate of candidates) {
    validate(candidate.rect);
    safeY &&= Math.abs(candidate.rect.y) <= safeComponent && candidate.rect.height <= safeComponent;
    if (
      typeof candidate.id !== 'string' ||
      candidate.id.length === 0 ||
      ids.has(candidate.id) ||
      !Number.isFinite(candidate.priority)
    )
      throw new RangeError('Invalid signal candidate');
    ids.add(candidate.id);
  }
  obstacles.forEach((obstacle) => {
    validate(obstacle);
    safeY &&= Math.abs(obstacle.y) <= safeComponent && obstacle.height <= safeComponent;
  });
  const overlapArea = safeY ? overlapSafeY : overlap;
  const fixed = obstacles
    .map((r) => ({ ...r }))
    .sort((a, b) => a.x - b.x || a.y - b.y || a.width - b.width || a.height - b.height);
  const sorted = candidates
    .map((c) => ({ ...c, rect: { ...c.rect } }))
    .sort((a, b) => a.priority - b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const offsets = new Map(sorted.map((c) => [c.id, { x: 0, y: 0 }]));
  const current = sorted.map((c) => ({ ...c.rect }));
  let work = 0;
  const area = (a: SignalRect, b: SignalRect) => {
    if (++work > ARMY_SIGNAL_LAYOUT.overlapWork) throw EXHAUSTED;
    return overlapArea(a, b);
  };
  try {
    const baseline = sorted.map((c) => fixed.map((r) => area(c.rect, r)));
    for (let pass = 0; pass < ARMY_SIGNAL_LAYOUT.passes; pass++)
      for (let index = 0; index < sorted.length; index++) {
        const candidate = sorted[index]!,
          rect = candidate.rect,
          previous = offsets.get(candidate.id)!;
        const peerCost = (moved: SignalRect) =>
          current.reduce((sum, peer, i) => sum + (i === index ? 0 : area(moved, peer)), 0);
        const originalPeerCost = peerCost(current[index]!);
        if (originalPeerCost === 0) continue;
        const proposals: Offset[] = [];
        const seen = new Set<string>();
        const add = (offset: Offset) => {
          if (
            proposals.length >= ARMY_SIGNAL_LAYOUT.proposals ||
            offset.x * offset.x + offset.y * offset.y > 24 * 24
          )
            return;
          const key = `${offset.x},${offset.y}`;
          if (!seen.has(key)) {
            seen.add(key);
            proposals.push(offset);
          }
        };
        add({ x: 0, y: 0 });
        add(previous);
        for (const step of [8, 16, 24])
          for (const offset of [
            { x: 0, y: step },
            { x: step, y: 0 },
            { x: -step, y: 0 },
            { x: 0, y: -step },
          ])
            add(offset);
        for (const x of [-16, 16]) for (const y of [-16, 16]) add({ x, y });
        // Actual edge escapes, rather than relying only on equally spaced offsets.
        for (const other of [...fixed, ...current]) {
          if (proposals.length >= ARMY_SIGNAL_LAYOUT.proposals) break;
          if (area(current[index]!, other) === 0) continue;
          const xs = [other.x + other.width + 4 - rect.x, other.x - rect.width - 4 - rect.x];
          const ys = [other.y + other.height + 4 - rect.y, other.y - rect.height - 4 - rect.y];
          for (const y of ys) add({ x: 0, y });
          for (const x of xs) add({ x, y: 0 });
          for (const x of xs) for (const y of ys) add({ x, y });
        }
        let best = previous,
          bestPeer = originalPeerCost,
          bestFixed = Infinity,
          bestDistance = previous.x * previous.x + previous.y * previous.y;
        for (const offset of proposals) {
          const moved = { ...rect, x: rect.x + offset.x, y: rect.y + offset.y };
          let fixedCost = 0,
            eligible = true;
          for (let i = 0; i < fixed.length; i++) {
            const value = area(moved, fixed[i]!);
            if (value > baseline[index]![i]!) {
              eligible = false;
              break;
            }
            fixedCost += value;
          }
          if (!eligible) continue;
          const peers = peerCost(moved),
            distance = offset.x * offset.x + offset.y * offset.y;
          if (peers > originalPeerCost) continue;
          if (
            peers < bestPeer ||
            (peers === bestPeer &&
              (fixedCost < bestFixed || (fixedCost === bestFixed && distance < bestDistance)))
          ) {
            best = offset;
            bestPeer = peers;
            bestFixed = fixedCost;
            bestDistance = distance;
          }
        }
        offsets.set(candidate.id, { ...best });
        current[index] = { ...rect, x: rect.x + best.x, y: rect.y + best.y };
      }
  } catch (error) {
    if (error !== EXHAUSTED) throw error;
  }
  return offsets;
}
