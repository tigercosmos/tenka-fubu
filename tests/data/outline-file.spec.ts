// japan-outline.json 自動檢查（04 §3.3.4；04-T2／18-roadmap.md M2-5 驗收：
// 「§3.3.4 全部自動檢查通過」）。
//
// 範圍：本檔驗證 04 §3.3.4 中不依賴劇本城/郡座標資料即可獨立驗證的子集——結構/座標範圍
// （zod）、全部島嶼合計總點數 300~600、單一 polygon 逆時針無自交、honshu/shikoku/kyushu
// 三 polygon 存在且互不重疊。「全部城/郡節點座標落在某 polygon 內部」一項需要 14 批次
// B1/B2 城/郡座標資料（M2-9/M2-10 才產出），留待 `tools/validate.ts` 完整版（M2-2 之後）
// 串接 `src/data/map/outlineGeometry.ts` 的 `pointInPolygon` 一併檢查。
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isCounterClockwise,
  isSimplePolygon,
  polygonsOverlap,
  totalPointCount,
} from '../../src/data/map/outlineGeometry';
import { zJapanOutlineFile, type JapanOutlineFile } from '../../src/data/schemas/outline';

const OUTLINE_PATH = path.resolve(import.meta.dirname, '../../src/data/map/japan-outline.json');

function loadOutline(): JapanOutlineFile {
  const raw: unknown = JSON.parse(readFileSync(OUTLINE_PATH, 'utf8'));
  return zJapanOutlineFile.parse(raw); // 非法即拋錯使測試失敗（04-T1／04-T2 共同前提）。
}

describe('src/data/map/japan-outline.json（04 §3.3.4 自動檢查；M2-5／04-T2 驗收）', () => {
  const file = loadOutline();

  it('通過 zJapanOutlineFile schema（結構／座標範圍 0..4096／單島點數 60~300）', () => {
    expect(zJapanOutlineFile.safeParse(file).success).toBe(true);
  });

  it('source 標記為 natural-earth（04 §3.3.2 方案 A）', () => {
    expect(file.source).toBe('natural-earth');
  });

  it('honshu／shikoku／kyushu 三 polygon 必須存在', () => {
    const ids = file.polygons.map((p) => p.id);
    expect(ids).toContain('honshu');
    expect(ids).toContain('shikoku');
    expect(ids).toContain('kyushu');
  });

  it('全部島嶼合計總點數落在 300~600（04 §3.3.1）', () => {
    const total = totalPointCount(file.polygons);
    expect(total).toBeGreaterThanOrEqual(300);
    expect(total).toBeLessThanOrEqual(600);
  });

  it.each(file.polygons.map((p) => [p.id, p] as const))(
    '%s：逆時針纏繞、無自交（線段兩兩相交檢查；04 §3.3.4）',
    (_id, polygon) => {
      expect(isCounterClockwise(polygon.points)).toBe(true);
      expect(isSimplePolygon(polygon.points)).toBe(true);
    },
  );

  it('honshu／shikoku／kyushu 兩兩互不重疊（04 §3.3.4）', () => {
    const requiredIds = ['honshu', 'shikoku', 'kyushu'] as const;
    const polys = requiredIds.map((id) => {
      const found = file.polygons.find((p) => p.id === id);
      if (found === undefined) throw new Error(`測試前提不成立：找不到 polygon id=${id}`);
      return found;
    });
    for (let i = 0; i < polys.length; i += 1) {
      for (let j = i + 1; j < polys.length; j += 1) {
        const a = polys[i];
        const b = polys[j];
        if (a === undefined || b === undefined) continue; // 不可能發生：i,j 恆在陣列範圍內
        expect(polygonsOverlap(a.points, b.points)).toBe(false);
      }
    }
  });
});
