import type { MapStaticData, MapViewState } from '../mapViewTypes';
import type { TerritoryGrid } from '../territoryGrid';
import { armyWorldPos } from '../dirty';
import { edgeVisualPolyline } from '../roads/roadGeometry';
import { MAPVIEW } from '../mapViewConfig';
import { clanDyeNum, TOKENS_NUM } from '@ui/styles/tokens';

export type MapAnalysisMode = MapViewState['analysisMode'];

/** Presentation colors, shared by renderer and React legend. */
import { ANALYSIS_COLORS } from './analysisColors';
export { ANALYSIS_COLORS } from './analysisColors';

export interface AnalysisMark {
  points: readonly number[];
  color: number;
  width: number;
  /** Circle radius; omitted for polylines. */
  radius?: number;
  /** A second ring distinguishes main castles without relying on hue. */
  double?: boolean;
  dashed?: boolean;
}

export function supplyColor(foodDays: number): number {
  return foodDays < MAPVIEW.armySupplyCriticalDays
    ? ANALYSIS_COLORS.critical
    : foodDays < MAPVIEW.armySupplyLowDays
      ? ANALYSIS_COLORS.low
      : ANALYSIS_COLORS.healthy;
}

export function defenseColor(ratio: number): number {
  return ratio < 0.3
    ? ANALYSIS_COLORS.critical
    : ratio < 0.5
      ? ANALYSIS_COLORS.low
      : ANALYSIS_COLORS.healthy;
}

/** Only actual model facts enter the overlay; roads have grades, not invented traffic limits. */
export function buildAnalysisMarks(
  data: MapStaticData,
  view: MapViewState,
  mode: MapAnalysisMode,
): AnalysisMark[] {
  const marks: AnalysisMark[] = [];
  if (mode === 'roadCapacity') {
    for (const edge of data.graph.edges.values()) {
      const points = edgeVisualPolyline(edge, data.graph);
      if (points === null) continue;
      marks.push({
        points: points.flatMap((point) => [point.x, point.y]),
        color:
          edge.type === 'sea'
            ? ANALYSIS_COLORS.sea
            : ([ANALYSIS_COLORS.critical, ANALYSIS_COLORS.low, ANALYSIS_COLORS.healthy][
                edge.grade - 1
              ] ?? ANALYSIS_COLORS.neutral),
        width: 5 + edge.grade * 2,
        dashed: edge.type === 'sea',
      });
    }
  } else if (mode === 'supply') {
    for (const army of view.armies) {
      const pos = armyWorldPos(army, data.graph);
      if (pos === null) continue;
      const critical = army.foodDays < MAPVIEW.armySupplyCriticalDays;
      marks.push({
        points: [pos.x, pos.y],
        color: supplyColor(army.foodDays),
        width: critical ? 5 : 3,
        radius: 24,
        double: critical,
      });
    }
  } else if (mode === 'terrainAdvantage') {
    const terrain = new Map<string, 'plain' | 'mountain'>(
      view.castles.map((castle) => [castle.id, castle.terrainKind]),
    );
    for (const node of data.graph.nodes.values()) {
      const kind = terrain.get(node.kind === 'castle' ? node.id : (node.castleId ?? ''));
      if (kind === undefined) continue;
      // Castle terrain is the only authoritative terrain classification in this view contract.
      // Do not extrapolate its mountain/plain classification to all surrounding districts.
      if (node.kind !== 'castle') continue;
      marks.push({
        points: [node.pos.x, node.pos.y],
        color: ANALYSIS_COLORS[kind],
        width: 4,
        radius: 32,
        double: kind === 'mountain',
      });
    }
  } else if (mode === 'castleDefense') {
    for (const castle of view.castles) {
      const node = data.graph.nodes.get(castle.id);
      if (node === undefined) continue;
      const ratio = castle.maxDurability > 0 ? castle.durability / castle.maxDurability : 0;
      marks.push({
        points: [node.pos.x, node.pos.y],
        color: defenseColor(ratio),
        width: 5,
        radius: 28,
        double: castle.tier === 'main',
      });
    }
  }
  return marks;
}

/** Mode-specific signatures exclude day, selection and unrelated military changes. */
export function analysisSignature(view: MapViewState, mode: MapAnalysisMode): string {
  switch (mode) {
    case 'faction':
      return JSON.stringify([
        mode,
        Object.entries(view.districtOwner).sort(([a], [b]) => a.localeCompare(b)),
      ]);
    case 'supply':
      return JSON.stringify([
        mode,
        view.armies.map((a) => [a.id, a.fromNode, a.toNode, a.edgeT, a.foodDays]),
      ]);
    case 'terrainAdvantage':
      return JSON.stringify([mode, view.castles.map((c) => [c.id, c.terrainKind])]);
    case 'castleDefense':
      return JSON.stringify([
        mode,
        view.castles.map((c) => [c.id, c.durability, c.maxDurability, c.tier]),
      ]);
    default:
      return mode;
  }
}

/** Reuse the land-clipped Voronoi cells; draw both district edges and stronger faction edges. */
export function buildFactionPixels(
  grid: TerritoryGrid,
  data: MapStaticData,
  view: MapViewState,
): Uint8Array {
  const pixels = new Uint8Array(grid.size * grid.size * 4);
  const colors = grid.districtIds.map((id) => {
    const owner = view.districtOwner[id];
    const index = owner === null || owner === undefined ? undefined : data.clanColorIndex[owner];
    return index !== undefined && Number.isInteger(index) && index >= 0 && index < 40
      ? clanDyeNum(index)
      : ANALYSIS_COLORS.neutral;
  });
  const ownerAt = (district: number): string | null =>
    view.districtOwner[grid.districtIds[district] ?? ''] ?? null;
  for (let i = 0; i < grid.nearestDistrict.length; i += 1) {
    const district = grid.nearestDistrict[i] ?? 0xffff;
    if (district === 0xffff) continue;
    let color = colors[district] ?? ANALYSIS_COLORS.neutral;
    let districtBorder = false;
    let factionBorder = false;
    for (let direction = 0; direction < 2; direction += 1) {
      if (direction === 0 && (i % grid.size) + 1 >= grid.size) continue;
      const neighbor = direction === 0 ? i + 1 : i + grid.size;
      if (neighbor >= grid.nearestDistrict.length) continue;
      const other = grid.nearestDistrict[neighbor] ?? 0xffff;
      if (other === 0xffff || other === district) continue;
      districtBorder = true;
      factionBorder ||= ownerAt(other) !== ownerAt(district);
    }
    if (districtBorder) color = factionBorder ? TOKENS_NUM.ink900 : TOKENS_NUM.ink500;
    pixels[i * 4] = (color >> 16) & 255;
    pixels[i * 4 + 1] = (color >> 8) & 255;
    pixels[i * 4 + 2] = color & 255;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
