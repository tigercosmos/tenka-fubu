import type { BattleSide, BattleState, Jin } from '@core/state/gameState';
import { UI } from '../uiConstants';

/** Logical presentation pixels, not gameplay constants. Positions returned below are CSS pixels. */
export const UI_BATTLE_GEOMETRY = UI.battleMapGeometry;
export interface BattleViewBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface BattleViewNode {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly owner: Jin['owner'];
  readonly isHonjin: boolean;
  readonly flagPower: number;
  readonly flagPowerMax: number;
  readonly defenseBonus: number;
  readonly glyphBox: BattleViewBox;
  readonly hitBox: BattleViewBox;
}
export interface BattleViewEdge {
  readonly a: string;
  readonly b: string;
  readonly from: Readonly<{ x: number; y: number }>;
  readonly to: Readonly<{ x: number; y: number }>;
  readonly moveCost: number;
}
export interface BattleViewUnit {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly side: BattleSide;
  readonly troops: number;
  readonly morale: number;
  readonly routed: boolean;
  readonly selected: boolean;
  readonly jinId: string;
  readonly moveTargetJinId: string | null;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly glyphBox: BattleViewBox;
  readonly hitBox: BattleViewBox;
}
export interface BattleView {
  readonly width: number;
  readonly height: number;
  readonly uiScale: number;
  readonly glyphScale: number;
  readonly nodes: readonly BattleViewNode[];
  readonly edges: readonly BattleViewEdge[];
  readonly units: readonly BattleViewUnit[];
}
const compareId = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
const dimension = (n: number): number => (Number.isFinite(n) ? Math.max(0, n) : 0);
const overlaps = (a: BattleViewBox, b: BattleViewBox): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

type UnitPlacement = Pick<BattleViewUnit, 'x' | 'y' | 'glyphBox' | 'hitBox'>;

/** All fallback slots are mutually disjoint and valid for every unit (no side/node restrictions). */
export function placeBattleUnitsGlobally(
  units: readonly BattleViewUnit[],
  nodes: readonly BattleViewNode[],
  slots: readonly UnitPlacement[],
): BattleViewUnit[] {
  const obstacles = nodes.map((node) => node.hitBox);
  // Nearest preferred display position, not a globally optimal assignment/anchor-distance claim.
  const orderedSlots = (unit: BattleViewUnit) =>
    slots
      .map((slot, index) => ({
        slot,
        index,
        distance: (slot.x - unit.x) ** 2 + (slot.y - unit.y) ** 2,
      }))
      .sort((a, b) => a.distance - b.distance || a.index - b.index);
  const placed: BattleViewUnit[] = [];
  for (const unit of units) {
    const free = (box: BattleViewBox) =>
      !obstacles.some((other) => overlaps(box, other)) &&
      !placed.some((other) => overlaps(box, other.hitBox));
    const position = free(unit.hitBox)
      ? unit
      : orderedSlots(unit).find(({ slot }) => free(slot.hitBox))?.slot;
    if (!position) break;
    placed.push({ ...unit, ...position });
  }
  if (placed.length === units.length) return placed;
  // A local position can consume several grid cells. Reset rather than stranding the last unit.
  // Since every unit can use every slot, choosing distinct slots is a complete matching.
  if (slots.length >= units.length) {
    const used = new Set<number>();
    return units.map((unit) => {
      const choice = orderedSlots(unit).find(({ index }) => !used.has(index))!;
      used.add(choice.index);
      return { ...unit, ...choice.slot };
    });
  }
  // Unmeasured/subminimum hosts or synthetic counts above capacity cannot guarantee readable fit.
  // Keep every surviving unit in the projection; never hide it or shrink the physical target.
  return [...placed, ...units.slice(placed.length)];
}

/** Detached, deterministic projection; no mutation, gameplay inference, or wall-clock interpolation. */
export function projectBattleView(
  battle: Readonly<BattleState>,
  width: number,
  height: number,
  uiScale: number,
  selectedUnitId: string | null,
): BattleView {
  width = dimension(width);
  height = dimension(height);
  const scale = Number.isFinite(uiScale) && uiScale > 0 ? uiScale : 1;
  const G = UI_BATTLE_GEOMETRY;
  // Fit the full three node/unit bands, not only their centers. Root UI scale stays unchanged.
  const glyphScale = Math.min(
    scale,
    width / (G.marginX * 2),
    height / (G.marginTop + G.marginBottom + G.rowPitch * 2),
  );
  const marginX = G.marginX * glyphScale;
  const marginTop = G.marginTop * glyphScale;
  const marginBottom = G.marginBottom * glyphScale;
  const boxes = (x: number, y: number, halfWidth: number, top: number, bottom: number) => {
    const glyphBox = {
      x: clamp(x - halfWidth * glyphScale, 0, Math.max(0, width - halfWidth * 2 * glyphScale)),
      y: clamp(y - top * glyphScale, 0, Math.max(0, height - (top + bottom) * glyphScale)),
      width: halfWidth * 2 * glyphScale,
      height: (top + bottom) * glyphScale,
    };
    const hitWidth = Math.min(width, Math.max(G.hitSize, glyphBox.width));
    const hitHeight = Math.min(height, Math.max(G.hitSize, glyphBox.height));
    return {
      glyphBox,
      hitBox: {
        x: clamp(glyphBox.x - (hitWidth - glyphBox.width) / 2, 0, width - hitWidth),
        y: clamp(glyphBox.y - (hitHeight - glyphBox.height) / 2, 0, height - hitHeight),
        width: hitWidth,
        height: hitHeight,
      },
    };
  };
  const nodes: BattleViewNode[] = [...battle.jins]
    .sort((a, b) => compareId(a.id, b.id))
    .map((jin) => {
      const x = marginX + (clamp(jin.col, 0, 4) / 4) * (width - marginX * 2);
      const y = marginTop + (clamp(jin.row, 0, 2) / 2) * (height - marginTop - marginBottom);
      return {
        id: jin.id,
        x,
        y,
        owner: jin.owner,
        isHonjin: jin.isHonjin,
        flagPower: jin.flagPower,
        flagPowerMax: jin.flagPowerMax,
        defenseBonus: jin.defenseBonus,
        ...boxes(x, y, G.nodeHalfWidth, G.nodeTop, G.nodeBottom),
      };
    });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const edges: BattleViewEdge[] = [...battle.edges]
    .sort((a, b) => compareId(a.a, b.a) || compareId(a.b, b.b) || a.moveCost - b.moveCost)
    .flatMap((edge) => {
      const from = byId.get(edge.a),
        to = byId.get(edge.b);
      return from && to
        ? [
            {
              a: edge.a,
              b: edge.b,
              from: { x: from.x, y: from.y },
              to: { x: to.x, y: to.y },
              moveCost: edge.moveCost,
            },
          ]
        : [];
    });
  const groups = new Map<string, { unit: BattleState['units'][number]; x: number; y: number }[]>();
  for (const unit of [...battle.units].sort((a, b) => compareId(a.id, b.id))) {
    if (unit.exited || unit.troops <= 0) continue;
    const from = byId.get(unit.jinId);
    if (!from) continue;
    const to = unit.moveTargetJinId === null ? undefined : byId.get(unit.moveTargetJinId);
    const edge = edges.find(
      (e) =>
        (e.a === unit.jinId && e.b === unit.moveTargetJinId) ||
        (e.b === unit.jinId && e.a === unit.moveTargetJinId),
    );
    const fraction =
      to && edge && edge.moveCost > 0 ? clamp(unit.moveProgress / edge.moveCost, 0, 1) : 0;
    const x = from.x + ((to?.x ?? from.x) - from.x) * fraction;
    const y = from.y + ((to?.y ?? from.y) - from.y) * fraction;
    const key = `${x}:${y}`;
    const group = groups.get(key) ?? [];
    group.push({ unit, x, y });
    groups.set(key, group);
  }
  const units: BattleViewUnit[] = [];
  for (const group of groups.values()) {
    const halfWidth = Math.min(Math.max(G.hitSize / 2, G.unitHalfWidth * glyphScale), width / 2);
    const step = Math.min(
      UI_BATTLE_GEOMETRY.stackStep * glyphScale,
      group.length > 1 ? Math.max(0, width - halfWidth * 2) / (group.length - 1) : 0,
    );
    const halfSpan = ((group.length - 1) * step) / 2;
    const centerX = clamp(group[0]!.x, halfWidth + halfSpan, width - halfWidth - halfSpan);
    group.forEach(({ unit, x: anchorX, y: anchorY }, index) => {
      const x = clamp(
        centerX + (index - (group.length - 1) / 2) * step,
        halfWidth,
        width - halfWidth,
      );
      const y = clamp(
        anchorY - (G.unitOffsetY + (index % 2) * G.stackRowOffset) * glyphScale,
        G.unitTop * glyphScale,
        Math.max(G.unitTop * glyphScale, height - G.unitBottom * glyphScale),
      );
      units.push({
        id: unit.id,
        x,
        y,
        anchorX,
        anchorY,
        ...boxes(x, y, G.unitHalfWidth, G.unitTop, G.unitBottom),
        side: unit.side,
        troops: unit.troops,
        morale: unit.morale,
        routed: unit.routed,
        selected: unit.id === selectedUnitId,
        jinId: unit.jinId,
        moveTargetJinId: unit.moveTargetJinId,
      });
    });
  }
  units.sort((a, b) => compareId(a.id, b.id));
  const slots: UnitPlacement[] = [];
  const slotWidth = Math.max(G.hitSize, G.unitHalfWidth * 2 * glyphScale);
  const slotHeight = Math.max(G.hitSize, (G.unitTop + G.unitBottom) * glyphScale);
  const gap = G.placementGap * glyphScale;
  for (let top = 0; top + slotHeight <= height; top += slotHeight + gap) {
    for (let left = 0; left + slotWidth <= width; left += slotWidth + gap) {
      const x = left + slotWidth / 2;
      const y =
        top + (slotHeight - (G.unitTop + G.unitBottom) * glyphScale) / 2 + G.unitTop * glyphScale;
      const position = { x, y, ...boxes(x, y, G.unitHalfWidth, G.unitTop, G.unitBottom) };
      if (!nodes.some((node) => overlaps(position.hitBox, node.hitBox))) slots.push(position);
    }
  }
  return {
    width,
    height,
    uiScale: scale,
    glyphScale,
    nodes,
    edges,
    units: placeBattleUnitsGlobally(units, nodes, slots),
  };
}
