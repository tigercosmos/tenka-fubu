// 投影公式與 outline schema 測試（M2-4／04-T1 驗收）。
// 規格：plan/04-map-and-movement.md §3.2（投影公式＋錨點表）、§3.3.1（JapanOutlineFile schema）、
// T1（驗收：§3.2 錨點表 6 點誤差 ≤ 1 world unit；非法 outline JSON 被 zod 拒絕）；
// plan/14-scenario-data.md §3.4（20 錨點對照表）。
import { describe, expect, it } from 'vitest';
import {
  ANCHOR_POINTS_6,
  ANCHOR_POINTS_20,
  PROJECTION,
  lonLatToWorld,
} from '../../src/data/map/projection';
import { zJapanOutlineFile, zOutlinePolygon } from '../../src/data/schemas/outline';

describe('PROJECTION 常數（00 §8／04 §3.2 canonical，不得更改）', () => {
  it('經緯度範圍與世界空間邊長與規格一致', () => {
    expect(PROJECTION).toEqual({
      lonMin: 128.5,
      lonMax: 146.0,
      latMin: 30.5,
      latMax: 45.8,
      worldSize: 4096,
    });
  });
});

describe('lonLatToWorld — 座標邊界與線性關係', () => {
  it('左上角經緯度 (lonMin, latMax) 投影至世界原點 (0,0)', () => {
    expect(lonLatToWorld(PROJECTION.lonMin, PROJECTION.latMax)).toEqual({ x: 0, y: 0 });
  });

  it('右下角經緯度 (lonMax, latMin) 投影至世界空間邊界 (4096,4096)', () => {
    expect(lonLatToWorld(PROJECTION.lonMax, PROJECTION.latMin)).toEqual({
      x: PROJECTION.worldSize,
      y: PROJECTION.worldSize,
    });
  });

  it('經度增加 → x 增加；緯度增加（往北） → y 減少（北在畫面上方）', () => {
    const base = lonLatToWorld(135, 35);
    const east = lonLatToWorld(136, 35);
    const north = lonLatToWorld(135, 36);
    expect(east.x).toBeGreaterThan(base.x);
    expect(north.y).toBeLessThan(base.y);
  });

  it('回傳座標一律為整數（Math.round）', () => {
    const p = lonLatToWorld(136.123456, 35.654321);
    expect(Number.isInteger(p.x)).toBe(true);
    expect(Number.isInteger(p.y)).toBe(true);
  });
});

describe('ANCHOR_POINTS_6 — 04 §3.2 六點錨點表（04-T1 驗收：誤差 ≤ 1 world unit）', () => {
  it('剛好 6 筆', () => {
    expect(ANCHOR_POINTS_6.length).toBe(6);
  });

  it.each(ANCHOR_POINTS_6.map((a) => [a.name, a] as const))(
    '%s：lonLatToWorld(lon,lat) 與表列世界座標誤差 ≤ 1 world unit',
    (_name, anchor) => {
      const computed = lonLatToWorld(anchor.lon, anchor.lat);
      expect(Math.abs(computed.x - anchor.world.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(computed.y - anchor.world.y)).toBeLessThanOrEqual(1);
    },
  );
});

describe('ANCHOR_POINTS_20 — 14 §3.4 座標製作規範 20 錨點對照表', () => {
  it('剛好 20 筆，且與 04 §3.2 六點表重疊之 #1/#2/#7/#20 座標一致（14 §3.4 表末註）', () => {
    expect(ANCHOR_POINTS_20.length).toBe(20);
    const kyoto = ANCHOR_POINTS_20.find((a) => a.name === '京都・二條御所');
    const kiyosu = ANCHOR_POINTS_20.find((a) => a.name === '清洲城');
    const edo = ANCHOR_POINTS_20.find((a) => a.name === '江戶城');
    const kagoshima = ANCHOR_POINTS_20.find((a) => a.name === '內城（鹿兒島）');
    expect(kyoto?.world).toEqual({ x: 1701, y: 2889 });
    expect(kiyosu?.world).toEqual({ x: 1966, y: 2838 });
    expect(edo?.world).toEqual({ x: 2621, y: 2709 });
    expect(kagoshima?.world).toEqual({ x: 480, y: 3801 });
  });

  it.each(ANCHOR_POINTS_20.map((a) => [a.name, a] as const))(
    '%s：lonLatToWorld(lon,lat) 與表列世界座標誤差 ≤ 1 world unit（公式正確性；生產資料容差另見 BAL.dataAnchorTolerance=16，14 §3.4／15 §5.1）',
    (_name, anchor) => {
      const computed = lonLatToWorld(anchor.lon, anchor.lat);
      expect(Math.abs(computed.x - anchor.world.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(computed.y - anchor.world.y)).toBeLessThanOrEqual(1);
    },
  );

  it('全部名稱唯一、世界座標皆為整數', () => {
    const names = ANCHOR_POINTS_20.map((a) => a.name);
    expect(new Set(names).size).toBe(names.length);
    for (const a of ANCHOR_POINTS_20) {
      expect(Number.isInteger(a.world.x)).toBe(true);
      expect(Number.isInteger(a.world.y)).toBe(true);
    }
  });
});

describe('zOutlinePolygon（04 §3.3.1）', () => {
  function points(n: number, start = 0): number[] {
    // 產生 n 個 (x,y) 點（世界座標整數，落在 0..4096 內）之扁平陣列。
    const arr: number[] = [];
    for (let i = 0; i < n; i += 1) {
      arr.push((start + i * 7) % 4096, (start + i * 11) % 4096);
    }
    return arr;
  }

  it('合法多邊形（60 點）通過', () => {
    const result = zOutlinePolygon.safeParse({ id: 'honshu', points: points(60) });
    expect(result.success).toBe(true);
  });

  it('id 為空字串 → 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: '', points: points(60) });
    expect(result.success).toBe(false);
  });

  it('points 長度為奇數（座標未成對）→ 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: 'shikoku', points: points(60).slice(0, -1) });
    expect(result.success).toBe(false);
  });

  it('points 含非整數座標 → 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: 'kyushu', points: [1.5, 2, 3, 4] });
    expect(result.success).toBe(false);
  });

  it('points 座標超出世界空間範圍（0..4096）→ 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: 'kyushu', points: [0, 0, 4200, 100, 200, 300] });
    expect(result.success).toBe(false);
  });

  it('points 點數低於下限（< 60 點）→ 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: 'sado', points: points(10) });
    expect(result.success).toBe(false);
  });

  it('points 點數高於上限（> 300 點）→ 拒絕', () => {
    const result = zOutlinePolygon.safeParse({ id: 'honshu', points: points(301) });
    expect(result.success).toBe(false);
  });
});

describe('zJapanOutlineFile（04 §3.3.1；04-T1 驗收：非法 outline JSON 被 zod 拒絕）', () => {
  function validPolygon(id: string): { id: string; points: number[] } {
    const arr: number[] = [];
    for (let i = 0; i < 60; i += 1) arr.push((i * 7) % 4096, (i * 11) % 4096);
    return { id, points: arr };
  }

  const validFile = {
    version: 1 as const,
    source: 'handcrafted' as const,
    polygons: [validPolygon('honshu'), validPolygon('shikoku'), validPolygon('kyushu')],
  };

  it('合法檔案通過', () => {
    const result = zJapanOutlineFile.safeParse(validFile);
    expect(result.success).toBe(true);
  });

  it('version 非 1 → 拒絕', () => {
    const result = zJapanOutlineFile.safeParse({ ...validFile, version: 2 });
    expect(result.success).toBe(false);
  });

  it('source 不在列舉範圍 → 拒絕', () => {
    const result = zJapanOutlineFile.safeParse({ ...validFile, source: 'satellite' });
    expect(result.success).toBe(false);
  });

  it('polygons 為空陣列 → 拒絕', () => {
    const result = zJapanOutlineFile.safeParse({ ...validFile, polygons: [] });
    expect(result.success).toBe(false);
  });

  it('缺少必要欄位（無 polygons）→ 拒絕', () => {
    const result = zJapanOutlineFile.safeParse({ version: 1, source: 'handcrafted' });
    expect(result.success).toBe(false);
  });

  it('非物件（陣列/null/字串）→ 拒絕', () => {
    expect(zJapanOutlineFile.safeParse(null).success).toBe(false);
    expect(zJapanOutlineFile.safeParse([]).success).toBe(false);
    expect(zJapanOutlineFile.safeParse('not json').success).toBe(false);
  });
});
