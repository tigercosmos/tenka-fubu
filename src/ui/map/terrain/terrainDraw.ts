// 地形／水系純繪製輔助函式（terrainBase relief／forest 烘焙紋理 Sprite 建構、waterFeatures
// 河川／湖泊向量繪製）。
//
// 規格：M6-V5 技術設計文件 §4.4（本檔逐字實作）、§3.1 VD3（三級 LOD 顯示矩陣）、
// plan/04-map-and-movement.md §3.10.1（圖層 1 terrainBase／圖層 2 前身之水系內容）。
//
// 設計要點：
// - `createTerrainSprite`：relief／forest／territory 共用的烘焙紋理 Sprite 建構（鋪滿
//   `TERRAIN_SPRITE_WORLD`＝4096 世界單位）；scaleMode（linear）由呼叫端（`MapRenderer`）於
//   texture source 設定，本函式不碰 texture 內容。
// - `createWaterFeatures`：init 一次建 4 個 `Graphics`（湖恆顯 1 個＋河依 widthClass 分派 3 個），
//   LOD 只切 `visible`，不重繪（04 §3.10.1／M6-V5 §3.3 效能考量：河湖形狀整局不變）。
// - 決定論：河依 `id` 字典序處理（雖對繪製結果無影響，仍與既有 mapDraw 慣例一致、利於快照）。
// - taper：沿線比例 `lerp(RIVER_TAPER_HEAD, 1, i/(segCount-1))`——第一段（上游）＝
//   `RIVER_TAPER_HEAD`（0.4×），最後一段（下游／河口）＝恰好 1.0×（「上游細下游寬」，
//   §4.4／§6.3）；單一段河流（僅 2 點）無比例可插，退回 1.0×（無 taper 意義）。
// - 色彩一律取自 `MAP_PALETTE_NUM`（tokens.ts），不得散落魔術色碼（硬約束）。

import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import type { LodStage } from '../lod';
import { MAP_PALETTE_NUM } from '@ui/styles/tokens';
import { RIVER_WIDTH, RIVER_TAPER_HEAD, TERRAIN_SPRITE_WORLD } from '../mapViewConfig';
import type { MapStaticData } from '../mapViewTypes';

type Rivers = NonNullable<MapStaticData['terrain']>['rivers'];
type Lakes = NonNullable<MapStaticData['terrain']>['lakes'];

/**
 * relief／forest／territory 共用的烘焙紋理 Sprite（04 §3.10.1 圖層 1「terrainBase」）：鋪滿
 * `TERRAIN_SPRITE_WORLD`（4096）世界單位，左上角原點對齊世界座標 (0,0)。
 * `scaleMode`（linear）由呼叫端於 texture source 設定，本函式為純幾何建構。
 */
export function createTerrainSprite(texture: Texture): Sprite {
  const s = new Sprite(texture);
  s.position.set(0, 0);
  s.setSize(TERRAIN_SPRITE_WORLD, TERRAIN_SPRITE_WORLD);
  return s;
}

export interface WaterFeatures {
  readonly container: Container;
  setStage(stage: LodStage): void;
  destroy(): void;
}

function flat(points: ReadonlyArray<{ x: number; y: number }>): number[] {
  const out: number[] = [];
  for (const p of points) out.push(p.x, p.y);
  return out;
}

/** 線性內插：`lerp(a, b, t) = a + (b - a) * t`。 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** 依 `widthClass` 選出對應 river `Graphics`（3/2/1）。 */
function riverGraphicsFor(
  widthClass: 1 | 2 | 3,
  g3: Graphics,
  g2: Graphics,
  g1: Graphics,
): Graphics {
  if (widthClass === 3) return g3;
  if (widthClass === 2) return g2;
  return g1;
}

/**
 * 建 `waterFeatures`：湖（多邊形 fill＋stroke，恆顯）＋三個 widthClass `Graphics`
 * （far 僅顯 3／mid 顯 3,2／near 全顯）。init 一次建立幾何，LOD 只切 `visible`
 * （河湖形狀整局不變，04 §3.10.1／M6-V5 §3.3）。
 */
export function createWaterFeatures(rivers: Rivers, lakes: Lakes): WaterFeatures {
  const container = new Container();
  const lakeGfx = new Graphics();
  const riverGfx3 = new Graphics();
  const riverGfx2 = new Graphics();
  const riverGfx1 = new Graphics();
  container.addChild(lakeGfx);
  container.addChild(riverGfx3);
  container.addChild(riverGfx2);
  container.addChild(riverGfx1);

  for (const lake of lakes) {
    const pts = flat(lake.polygon);
    lakeGfx.poly(pts).fill({ color: MAP_PALETTE_NUM.waterRiver });
    lakeGfx.poly(pts).stroke({ width: 1, color: MAP_PALETTE_NUM.reliefInk, alpha: 0.4 });
  }

  const sortedRivers = [...rivers].sort((a, b) => a.id.localeCompare(b.id));
  for (const river of sortedRivers) {
    const gfx = riverGraphicsFor(river.widthClass, riverGfx3, riverGfx2, riverGfx1);
    const baseWidth = RIVER_WIDTH[river.widthClass];
    const segCount = river.points.length - 1;
    for (let i = 0; i < segCount; i += 1) {
      const a = river.points[i]!;
      const b = river.points[i + 1]!;
      const ratio = segCount > 1 ? lerp(RIVER_TAPER_HEAD, 1, i / (segCount - 1)) : 1;
      gfx.moveTo(a.x, a.y);
      gfx.lineTo(b.x, b.y);
      gfx.stroke({
        width: baseWidth * ratio,
        color: MAP_PALETTE_NUM.waterRiver,
        cap: 'round',
        join: 'round',
      });
    }
  }

  function setStage(stage: LodStage): void {
    riverGfx3.visible = true;
    riverGfx2.visible = stage !== 'far';
    riverGfx1.visible = stage === 'near';
    lakeGfx.visible = true;
  }

  function destroy(): void {
    container.destroy({ children: true });
  }

  return { container, setStage, destroy };
}
