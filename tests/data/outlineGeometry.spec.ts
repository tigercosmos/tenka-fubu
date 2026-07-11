// outline 幾何檢查純函式單元測試（04 §3.3.4；支撐 tests/data/outline-file.spec.ts 對真實
// japan-outline.json 的驗收）。以合成小圖形逐項覆蓋：纏繞方向、自交、多邊形重疊、總點數。
import { describe, expect, it } from 'vitest';
import {
  isCounterClockwise,
  isSimplePolygon,
  pointInPolygon,
  polygonsOverlap,
  signedArea,
  totalPointCount,
} from '../../src/data/map/outlineGeometry';

// 世界座標 y 軸向下（04 §3.2：北在畫面上方、y 隨緯度降低而增大）。
// 下列「CW 方形」依螢幕直覺（左上→右上→右下→左下）順時針纏繞；
// 「CCW 方形」為其逆序（左上→左下→右下→右上），04 §3.3.1「land 在左側」的逆時針纏繞。
const SQUARE_CW = [0, 0, 10, 0, 10, 10, 0, 10]; // 左上→右上→右下→左下（視覺順時針）
const SQUARE_CCW = [0, 0, 0, 10, 10, 10, 10, 0]; // 左上→左下→右下→右上（視覺逆時針）
const BOWTIE_SELF_INTERSECTING = [0, 0, 10, 10, 10, 0, 0, 10]; // 對角交叉的自交四邊形

describe('signedArea／isCounterClockwise（04 §3.3.1 纏繞方向）', () => {
  it('視覺順時針方形之 signedArea 為正、isCounterClockwise 為 false', () => {
    expect(signedArea(SQUARE_CW)).toBeGreaterThan(0);
    expect(isCounterClockwise(SQUARE_CW)).toBe(false);
  });

  it('視覺逆時針方形之 signedArea 為負、isCounterClockwise 為 true', () => {
    expect(signedArea(SQUARE_CCW)).toBeLessThan(0);
    expect(isCounterClockwise(SQUARE_CCW)).toBe(true);
  });
});

describe('isSimplePolygon（04 §3.3.4「線段兩兩相交檢查」）', () => {
  it('簡單方形（CW／CCW 皆同）通過', () => {
    expect(isSimplePolygon(SQUARE_CW)).toBe(true);
    expect(isSimplePolygon(SQUARE_CCW)).toBe(true);
  });

  it('自交（蝴蝶結）四邊形被判定為非簡單多邊形', () => {
    expect(isSimplePolygon(BOWTIE_SELF_INTERSECTING)).toBe(false);
  });

  it('點數 < 3（含空陣列）視為非簡單多邊形', () => {
    expect(isSimplePolygon([])).toBe(false);
    expect(isSimplePolygon([0, 0, 10, 10])).toBe(false);
  });
});

describe('pointInPolygon（ray casting）', () => {
  it('方形中心點落在內部', () => {
    expect(pointInPolygon(5, 5, SQUARE_CCW)).toBe(true);
  });

  it('方形外部點不落在內部', () => {
    expect(pointInPolygon(50, 50, SQUARE_CCW)).toBe(false);
  });
});

describe('polygonsOverlap（04 §3.3.4「互不重疊」）', () => {
  it('相距甚遠的兩方形不重疊', () => {
    const far = [100, 100, 100, 110, 110, 110, 110, 100];
    expect(polygonsOverlap(SQUARE_CCW, far)).toBe(false);
  });

  it('邊緣相交的兩方形判定為重疊', () => {
    const overlapping = [5, 5, 5, 15, 15, 15, 15, 5];
    expect(polygonsOverlap(SQUARE_CCW, overlapping)).toBe(true);
  });

  it('完全包含（無邊相交）亦判定為重疊', () => {
    const inner = [2, 2, 2, 8, 8, 8, 8, 2];
    expect(polygonsOverlap(SQUARE_CCW, inner)).toBe(true);
  });
});

describe('totalPointCount', () => {
  it('加總各 polygon 之點數（points.length/2）', () => {
    const polygons = [{ points: SQUARE_CCW }, { points: SQUARE_CW }];
    expect(totalPointCount(polygons)).toBe(8); // 4 點 + 4 點
  });

  it('空陣列回傳 0', () => {
    expect(totalPointCount([])).toBe(0);
  });
});
