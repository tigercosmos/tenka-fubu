import { expect, it } from 'vitest';
import { POLICY_DEFS } from '../../src/core/policies';
import { policyPresentation } from '../../src/ui/screens/panels/policyPresentation';

it('describes all twelve catalogue policies without missing translations or catalogue writes', () => {
  const before = structuredClone(POLICY_DEFS);
  const counts = [
    [2, 0],
    [3, 0],
    [3, 0],
    [2, 0],
    [1, 1],
    [2, 0],
    [3, 0],
    [1, 2],
    [2, 1],
    [2, 1],
    [0, 2],
    [2, 1],
  ];
  expect(POLICY_DEFS).toHaveLength(12);
  for (const [index, policy] of POLICY_DEFS.entries()) {
    const result = policyPresentation(policy);
    expect([result.effects.length, result.pending.length]).toEqual(counts[index]);
    for (const text of [result.summary, ...result.effects, ...result.pending]) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(text).not.toMatch(/ui\.policy\.|\{[^}]+\}|資料尚未提供/);
    }
  }
  expect(POLICY_DEFS).toEqual(before);
});
it('keeps verified numeric effects and incomplete specification effects separate', () => {
  const byId = (id: string) => policyPresentation(POLICY_DEFS.find((policy) => policy.id === id)!);
  const tenmasei = byId('pol.tenmasei');
  expect(tenmasei.effects).toContain('輸送速度 ×1.5，以輸送邊日數倍率換算；海陸均適用');
  expect(tenmasei.effects).toContain('陸路起步行軍速度 ×1.1，於原速度上限前套用；海路起步不乘');
  const enkokinko = byId('pol.enkokinko');
  expect(enkokinko.effects).toContain(
    '已付月費的勢力信用、朝廷及幕府友好度增益 ×1.25，與原倍率合成一次',
  );
  expect(enkokinko.effects.join('')).not.toContain('＋2');
  expect(enkokinko.pending).toEqual(['非鄰接勢力信用月成長＋2 的條件及順序尚未定案']);
  expect(byId('pol.kenchi').effects).toContain('受封郡上繳率增加 5 個百分點，成為 75％');
  expect(byId('pol.nanban').effects).toEqual(['勢力每月固定金錢＋200貫，不按城數重複發放']);
  expect(byId('pol.kakishuchu').effects).toEqual([]);
  expect(byId('pol.kakishuchu').pending).toEqual([
    '鐵砲隊攻擊 ×1.15 尚未實作',
    '鐵砲購入單價 ×0.8 尚未實作',
  ]);
});
