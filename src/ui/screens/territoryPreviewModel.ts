// 新遊戲勢力預覽共用正式地圖的郡域柵格及劇本開局所有權，不建立 GameState。
import { buildMapGraph, type CastleNodeInput, type DistrictNodeInput } from '@core/state/mapGraph';
import type { CastleId, ClanId, DistrictId, RoadEdgeId } from '@core/state/ids';
import type { RoadEdge } from '@core/state/gameState';
import type { ScenarioBundleData } from '@data/schemas';
import { loadOutline } from '@ui/map/mapDraw';
import { buildTerritoryGrid, recolorTerritory, type TerritoryGrid } from '@ui/map/territoryGrid';

export interface DaimyoTerritoryData {
  grid: TerritoryGrid;
  districtOwner: Readonly<Record<string, ClanId | null>>;
}

export function buildDaimyoTerritoryData(bundle: ScenarioBundleData): DaimyoTerritoryData {
  const castles = Object.fromEntries(
    bundle.castles.map((castle) => [castle.id, { id: castle.id as CastleId, pos: castle.pos }]),
  ) as Record<CastleId, CastleNodeInput>;
  const districts = Object.fromEntries(
    bundle.districts.map((district) => [
      district.id,
      {
        id: district.id as DistrictId,
        pos: district.pos,
        isPort: district.isPort,
        castleId: district.castleId as CastleId,
      },
    ]),
  ) as Record<DistrictId, DistrictNodeInput>;
  const roads = Object.fromEntries(bundle.roads.map((road) => [road.id, road])) as Record<
    RoadEdgeId,
    RoadEdge
  >;
  const graph = buildMapGraph(castles, districts, roads);
  const grid = buildTerritoryGrid(graph, loadOutline());
  const castleOwner = new Map(bundle.castles.map((castle) => [castle.id, castle.ownerClanId]));
  const districtOwner: Record<string, ClanId | null> = {};
  for (const district of bundle.districts) {
    districtOwner[district.id] = (castleOwner.get(district.castleId) as ClanId | undefined) ?? null;
  }
  const colors = Object.fromEntries(bundle.clans.map((clan) => [clan.id, clan.colorIndex]));
  recolorTerritory(grid, districtOwner, colors);
  return { grid, districtOwner };
}

/** Pointer sampling uses the very same cell→district mapping as the colored raster. */
export function clanAtTerritoryCell(
  data: DaimyoTerritoryData,
  x: number,
  y: number,
): ClanId | null {
  const { grid, districtOwner } = data;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= grid.size ||
    y >= grid.size
  )
    return null;
  const index = grid.nearestDistrict[y * grid.size + x];
  if (index === undefined || index === 0xffff) return null;
  return districtOwner[grid.districtIds[index] ?? ''] ?? null;
}
