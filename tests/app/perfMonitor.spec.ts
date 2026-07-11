// src/app/perfMonitor.ts 測試（規格：plan/01-architecture.md §3.9.4／§4.6；M1-23／01-A12）。
// 放在 tests/ 下的理由同 tests/app/errors.spec.ts 檔頭說明（vitest.workspace.ts 兩個 project
// 皆未涵蓋 src/app/**，app 層測試慣例收在 tests/ 下）。
import { beforeEach, describe, expect, it } from 'vitest';
import { perfMonitor } from '../../src/app/perfMonitor';

describe('perfMonitor', () => {
  beforeEach(() => {
    perfMonitor.reset();
  });

  it('初始（尚無 recordTick）快照全為預設值', () => {
    expect(perfMonitor.getSnapshot()).toEqual({
      fps: 0,
      lastTickMs: 0,
      avgTickMs: 0,
      maxTickMs: 0,
      systemBreakdownMs: {},
      entityCounts: { castles: 0, districts: 0, officers: 0, armies: 0 },
    });
  });

  it('單次 recordTick 後 last／avg／max 皆等於該樣本', () => {
    perfMonitor.recordTick(4.5);
    const snap = perfMonitor.getSnapshot();
    expect(snap.lastTickMs).toBe(4.5);
    expect(snap.avgTickMs).toBe(4.5);
    expect(snap.maxTickMs).toBe(4.5);
  });

  it('未滿 60 筆時 avg／max 反映全部既有樣本', () => {
    [2, 4, 6].forEach((ms) => perfMonitor.recordTick(ms));
    const snap = perfMonitor.getSnapshot();
    expect(snap.lastTickMs).toBe(6);
    expect(snap.avgTickMs).toBeCloseTo(4, 10); // (2+4+6)/3
    expect(snap.maxTickMs).toBe(6);
  });

  it('超過 60 筆後環形緩衝僅保留最近 60 筆（先進先出）', () => {
    // 記錄 1..65：最近 60 筆為 6..65。
    for (let i = 1; i <= 65; i += 1) {
      perfMonitor.recordTick(i);
    }
    const snap = perfMonitor.getSnapshot();
    expect(snap.lastTickMs).toBe(65);
    expect(snap.maxTickMs).toBe(65);
    const expectedSum = ((6 + 65) * 60) / 2; // 6..65 等差數列和
    expect(snap.avgTickMs).toBeCloseTo(expectedSum / 60, 10);
  });

  it('連續超過 60 筆仍維持正確的滑動視窗（環形緩衝多輪覆寫）', () => {
    for (let i = 1; i <= 150; i += 1) {
      perfMonitor.recordTick(i);
    }
    const snap = perfMonitor.getSnapshot();
    // 最近 60 筆為 91..150
    expect(snap.lastTickMs).toBe(150);
    expect(snap.maxTickMs).toBe(150);
    const expectedSum = ((91 + 150) * 60) / 2;
    expect(snap.avgTickMs).toBeCloseTo(expectedSum / 60, 10);
  });

  it('非有限或負值樣本防禦性歸零（NaN／Infinity／負數）', () => {
    perfMonitor.recordTick(Number.NaN);
    expect(perfMonitor.getSnapshot().lastTickMs).toBe(0);
    perfMonitor.recordTick(Number.POSITIVE_INFINITY);
    expect(perfMonitor.getSnapshot().lastTickMs).toBe(0);
    perfMonitor.recordTick(-5);
    expect(perfMonitor.getSnapshot().lastTickMs).toBe(0);
  });

  it('reset() 後回到初始快照', () => {
    perfMonitor.recordTick(10);
    perfMonitor.recordTick(20);
    perfMonitor.reset();
    expect(perfMonitor.getSnapshot()).toEqual({
      fps: 0,
      lastTickMs: 0,
      avgTickMs: 0,
      maxTickMs: 0,
      systemBreakdownMs: {},
      entityCounts: { castles: 0, districts: 0, officers: 0, armies: 0 },
    });
  });

  it('getSnapshot() 每次回傳獨立物件（呼叫端不慎修改不污染內部狀態）', () => {
    perfMonitor.recordTick(1);
    const snap = perfMonitor.getSnapshot();
    snap.systemBreakdownMs['economy'] = 999;
    snap.entityCounts.castles = 999;
    const snap2 = perfMonitor.getSnapshot();
    expect(snap2.systemBreakdownMs).toEqual({});
    expect(snap2.entityCounts.castles).toBe(0);
  });
});
