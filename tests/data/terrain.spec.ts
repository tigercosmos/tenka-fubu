// 地形向量原始資料驗收（規格：M6-V5 技術設計文件 §8.1；plan/04-map-and-movement.md §3.10.1／§6）。
// 驗證 src/data/schemas/terrain.ts（zod：合法／非法）與 src/data/map/terrain.json 之地理健全性：
// 每 mountain.mass／forest／lake centroid 落陸（pointInPolygon vs japan-outline）、河 widthClass 合法、
// 河口末點距海岸 ≤ 緊容差（24 世界單位）、rv.tone 河口落江戶灣側（史地修正）、湖 Biwa/Hamana 命中本州。
import { describe, expect, it } from 'vitest';

import { zTerrainFile } from '../../src/data/schemas/terrain';
import { pointInPolygon } from '../../src/data/map/outlineGeometry';
import outlineJson from '../../src/data/map/japan-outline.json';
import terrainJson from '../../src/data/map/terrain.json';

const outline = outlineJson as {
  polygons: { id: string; points: number[] }[];
};

function centroid(flat: readonly number[]): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  const n = flat.length / 2;
  for (let i = 0; i < flat.length; i += 2) {
    sx += flat[i]!;
    sy += flat[i + 1]!;
  }
  return { x: sx / n, y: sy / n };
}

function onLand(x: number, y: number): boolean {
  return outline.polygons.some((p) => pointInPolygon(x, y, p.points));
}

/** 世界座標點到任一 outline 邊之最短距離（河口距海岸）。 */
function distanceToCoast(x: number, y: number): number {
  let best = Infinity;
  for (const poly of outline.polygons) {
    const pts = poly.points;
    const n = pts.length / 2;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const ax = pts[i * 2]!;
      const ay = pts[i * 2 + 1]!;
      const bx = pts[j * 2]!;
      const by = pts[j * 2 + 1]!;
      const dx = bx - ax;
      const dy = by - ay;
      const l2 = dx * dx + dy * dy;
      let t = l2 === 0 ? 0 : ((x - ax) * dx + (y - ay) * dy) / l2;
      t = Math.max(0, Math.min(1, t));
      const px = ax + t * dx;
      const py = ay + t * dy;
      const d = Math.hypot(x - px, y - py);
      if (d < best) best = d;
    }
  }
  return best;
}

const honshu = outline.polygons.find((p) => p.id === 'honshu')!.points;

describe('terrain zod schema — 合法／非法', () => {
  it('src/data/map/terrain.json 通過 zTerrainFile', () => {
    const parsed = zTerrainFile.parse(terrainJson);
    expect(parsed.version).toBe(1);
    expect(parsed.mountains.length).toBeGreaterThanOrEqual(14);
    expect(parsed.forests.length).toBeGreaterThanOrEqual(8);
    expect(parsed.rivers.length).toBeGreaterThanOrEqual(10);
    expect(parsed.lakes.length).toBe(2);
  });

  it('拒絕座標越界（>4096）', () => {
    const bad = {
      version: 1,
      mountains: [{ id: 'x', tier: 1, mass: [0, 0, 100, 0, 100, 5000], ridges: [] }],
      forests: [],
      rivers: [],
      lakes: [],
    };
    expect(zTerrainFile.safeParse(bad).success).toBe(false);
  });

  it('拒絕多邊形奇數長度', () => {
    const bad = {
      version: 1,
      mountains: [{ id: 'x', tier: 1, mass: [0, 0, 100, 0, 100], ridges: [] }],
      forests: [],
      rivers: [],
      lakes: [],
    };
    expect(zTerrainFile.safeParse(bad).success).toBe(false);
  });

  it('拒絕河川少於 2 點', () => {
    const bad = {
      version: 1,
      mountains: [],
      forests: [],
      rivers: [{ id: 'r', points: [10, 10], widthClass: 1 }],
      lakes: [],
    };
    expect(zTerrainFile.safeParse(bad).success).toBe(false);
  });

  it('拒絕非法 widthClass', () => {
    const bad = {
      version: 1,
      mountains: [],
      forests: [],
      rivers: [{ id: 'r', points: [10, 10, 20, 20], widthClass: 4 }],
      lakes: [],
    };
    expect(zTerrainFile.safeParse(bad).success).toBe(false);
  });
});

describe('terrain 地理健全性', () => {
  const terrain = zTerrainFile.parse(terrainJson);

  it('每 mountain.mass centroid 落於某 outline polygon 內（落陸）', () => {
    for (const m of terrain.mountains) {
      const c = centroid(m.mass);
      expect(onLand(c.x, c.y), `${m.id} centroid (${c.x.toFixed(0)},${c.y.toFixed(0)})`).toBe(true);
    }
  });

  it('每 mountain 具 6–12 點 mass 與 1–3 條 ridge', () => {
    for (const m of terrain.mountains) {
      const pts = m.mass.length / 2;
      expect(pts, `${m.id} mass points`).toBeGreaterThanOrEqual(6);
      expect(pts, `${m.id} mass points`).toBeLessThanOrEqual(12);
      expect(m.ridges.length, `${m.id} ridges`).toBeGreaterThanOrEqual(1);
      expect(m.ridges.length, `${m.id} ridges`).toBeLessThanOrEqual(3);
    }
  });

  it('每 forest centroid 落陸', () => {
    for (const f of terrain.forests) {
      const c = centroid(f.polygon);
      expect(onLand(c.x, c.y), `${f.id} centroid`).toBe(true);
    }
  });

  it('每 lake centroid 落陸；lk.biwa／lk.hamana 命中本州', () => {
    for (const l of terrain.lakes) {
      const c = centroid(l.polygon);
      expect(onLand(c.x, c.y), `${l.id} centroid`).toBe(true);
    }
    const biwa = terrain.lakes.find((l) => l.id === 'lk.biwa')!;
    const hamana = terrain.lakes.find((l) => l.id === 'lk.hamana')!;
    const bc = centroid(biwa.polygon);
    const hc = centroid(hamana.polygon);
    expect(pointInPolygon(bc.x, bc.y, honshu), 'lk.biwa on honshu').toBe(true);
    expect(pointInPolygon(hc.x, hc.y, honshu), 'lk.hamana on honshu').toBe(true);
  });

  it('lk.biwa 為南北長橢圓（y 幅 > x 幅，設計 §6.4）', () => {
    const biwa = terrain.lakes.find((l) => l.id === 'lk.biwa')!;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < biwa.polygon.length; i += 2) {
      const x = biwa.polygon[i]!;
      const y = biwa.polygon[i + 1]!;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    const xExtent = maxX - minX;
    const yExtent = maxY - minY;
    // 真實琵琶湖南北長；設計 §6.4 明訂「南北長橢圓」，故 y 幅須顯著大於 x 幅。
    expect(yExtent, `lk.biwa y-extent(${yExtent}) > x-extent(${xExtent})`).toBeGreaterThan(xExtent);
  });

  it('每河 widthClass ∈ {1,2,3}；河口末點距海岸 ≤ 24 世界單位（緊容差）', () => {
    for (const r of terrain.rivers) {
      expect([1, 2, 3]).toContain(r.widthClass);
      const n = r.points.length;
      const mx = r.points[n - 2]!;
      const my = r.points[n - 1]!;
      expect(distanceToCoast(mx, my), `${r.id} mouth dist`).toBeLessThanOrEqual(24);
    }
  });

  it('rv.tone 河口落江戶灣側（x≈2500、y≈2820），非太平洋（史地修正 m2）', () => {
    const tone = terrain.rivers.find((r) => r.id === 'rv.tone')!;
    const n = tone.points.length;
    const mx = tone.points[n - 2]!;
    const my = tone.points[n - 1]!;
    expect(mx).toBeGreaterThan(2400);
    expect(mx).toBeLessThan(2620);
    expect(my).toBeGreaterThan(2740);
    expect(my).toBeLessThan(2860);
  });
});
