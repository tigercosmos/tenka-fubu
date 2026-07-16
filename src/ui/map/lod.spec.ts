// 三級 LOD 純函式測試（M6-V5，VD3／§8.1）。
//
// 涵蓋：`lodStageForScale`（純分類，`setCameraPose` preset 用，決定論）三段門檻，
// 含三段截圖 preset 值（0.25/0.5/1.25）；`lodStageWithHysteresis`（滾輪連續縮放防閃）
// 之 10% 死區語意——far 停留至 0.55 才進 mid、mid 退 far 需 ≤0.45、mid 進 near 需 ≥1.1、
// near 退 mid 需 ≤0.9、同段輸入回傳同段（idempotent）。

import { describe, expect, it } from 'vitest';
import { lodStageForScale, lodStageWithHysteresis, type LodStage } from './lod';
import { MAPVIEW } from './mapViewConfig';

describe('lodStageForScale — 純分類（無 hysteresis），決定論', () => {
  it('三段截圖 preset 值：0.25→far、0.5→mid、1.25→near', () => {
    expect(lodStageForScale(MAPVIEW.visualOverviewScale)).toBe('far'); // 0.25
    expect(lodStageForScale(MAPVIEW.visualOperationalScale)).toBe('mid'); // 0.5
    expect(lodStageForScale(MAPVIEW.visualCloseScale)).toBe('near'); // 1.25
  });

  it('門檻邊界：<0.5→far、[0.5,1.0)→mid、>=1.0→near', () => {
    expect(lodStageForScale(0.49)).toBe('far');
    expect(lodStageForScale(0.5)).toBe('mid');
    expect(lodStageForScale(1.0)).toBe('near');
    expect(lodStageForScale(1.25)).toBe('near');
  });
});

describe('lodStageWithHysteresis — 10% 死區（滾輪連續縮放防閃）', () => {
  it('far 停留：未超過 far 上緣（×1.1＝0.55）前，即便純分類已進 mid 仍回傳 far', () => {
    expect(lodStageWithHysteresis(0.5, 'far')).toBe('far'); // 純分類已是 mid，但未達 0.55
    expect(lodStageWithHysteresis(0.54, 'far')).toBe('far');
  });

  it('far→mid：達到（含）far 上緣 0.55 才切換', () => {
    expect(lodStageWithHysteresis(0.55, 'far')).toBe('mid');
    expect(lodStageWithHysteresis(0.6, 'far')).toBe('mid');
  });

  it('mid 退 far：需 ≤0.45 才切換，介於 0.45..1.0 之間維持 mid', () => {
    expect(lodStageWithHysteresis(0.46, 'mid')).toBe('mid');
    expect(lodStageWithHysteresis(0.45, 'mid')).toBe('far');
    expect(lodStageWithHysteresis(0.3, 'mid')).toBe('far');
  });

  it('mid 進 near：需 ≥1.1 才切換，未達前維持 mid', () => {
    expect(lodStageWithHysteresis(1.0, 'mid')).toBe('mid'); // 純分類已是 near，但未達 1.1
    expect(lodStageWithHysteresis(1.09, 'mid')).toBe('mid');
    expect(lodStageWithHysteresis(1.1, 'mid')).toBe('near');
    expect(lodStageWithHysteresis(1.2, 'mid')).toBe('near');
  });

  it('near 退 mid：需 ≤0.9 才切換，介於 0.9..1.0 之間維持 near', () => {
    expect(lodStageWithHysteresis(0.95, 'near')).toBe('near');
    expect(lodStageWithHysteresis(0.9, 'near')).toBe('mid');
    expect(lodStageWithHysteresis(0.5, 'near')).toBe('mid');
  });

  it('同段輸入為 idempotent：純分類與前段相同時，無論死區直接回傳同段', () => {
    const cases: ReadonlyArray<readonly [number, LodStage]> = [
      [0.25, 'far'],
      [0.7, 'mid'],
      [1.25, 'near'],
    ];
    for (const [scale, stage] of cases) {
      expect(lodStageWithHysteresis(scale, stage)).toBe(stage);
    }
  });

  it('連續縮放序列示例：0.25(far)→0.5(仍 far)→0.55(mid)→1.1(near)→0.95(仍 near)→0.9(mid)', () => {
    let stage: LodStage = 'far';
    stage = lodStageWithHysteresis(0.25, stage);
    expect(stage).toBe('far');
    stage = lodStageWithHysteresis(0.5, stage);
    expect(stage).toBe('far');
    stage = lodStageWithHysteresis(0.55, stage);
    expect(stage).toBe('mid');
    stage = lodStageWithHysteresis(1.1, stage);
    expect(stage).toBe('near');
    stage = lodStageWithHysteresis(0.95, stage);
    expect(stage).toBe('near');
    stage = lodStageWithHysteresis(0.9, stage);
    expect(stage).toBe('mid');
  });
});
