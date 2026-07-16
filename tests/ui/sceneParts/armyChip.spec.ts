// ArmyChip（src/ui/map/sceneParts/armyChip.ts）冪等 update 測試。
// 規格：M6-V4 技術設計 §3.4（armyChipDrawEqual／createArmyChip 冪等）、§7 DoD③（移動只更新相關
// ArmyChip：pos 變 → 僅 reposition、`clear` 不增；繪製欄位變 → 重繪、`clear` 遞增）。
// 沿用 `castleNode.spec.ts` 的 `vi.spyOn(gfx,'clear')` 手法（真 pixi，node 環境可直接建構
// Container/Graphics/BitmapText，無需 WebGL/DOM，17 §3.2）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { type ArmyChipProps, armyChipDrawEqual, createArmyChip } from '@ui/map/sceneParts/armyChip';

function props(overrides: Partial<ArmyChipProps> = {}): ArmyChipProps {
  return {
    pos: { x: 10, y: 20 },
    colorIndex: 5,
    soldiers: 2_000,
    morale: 80,
    corps: false,
    ...overrides,
  };
}

describe('armyChipDrawEqual（M6-V4 §3.4：pos 除外的冪等比較器）', () => {
  it('全部繪製欄位相同（pos 不同）→ true', () => {
    expect(armyChipDrawEqual(props({ pos: { x: 1, y: 1 } }), props({ pos: { x: 2, y: 2 } }))).toBe(
      true,
    );
  });

  it.each([
    ['colorIndex', { colorIndex: 9 }],
    ['soldiers', { soldiers: 1_999 }],
    ['morale', { morale: 79 }],
    ['corps', { corps: true }],
    ['collapsedCount', { collapsedCount: 2 }],
  ] as const)('%s 不同 → false', (_name, override) => {
    expect(armyChipDrawEqual(props(), props(override))).toBe(false);
  });
});

describe('createArmyChip（M6-V4 §3.4）', () => {
  it('container 內建 Graphics＋label 兩個子物件', () => {
    const part = createArmyChip();
    expect(part.container.children).toHaveLength(2);
    expect(part.container.children[0]).toBeInstanceOf(Graphics);
  });

  it('首繪必重繪（回傳 true）、container.position 依 pos 設定', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const redrew = part.update(props({ pos: { x: 42, y: 84 } }));
    expect(redrew).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    expect(part.container.position.x).toBe(42);
    expect(part.container.position.y).toBe(84);
  });

  it('DoD③：只 pos 變更 → 不重繪（回傳 false、clear 不遞增），container.position 仍更新', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props({ pos: { x: 0, y: 0 } });
    expect(part.update(p)).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    const moved = part.update({ ...p, pos: { x: 100, y: 0 } });
    expect(moved).toBe(false);
    expect(clearSpy).toHaveBeenCalledTimes(1); // 未重繪
    expect(part.container.position.x).toBe(100); // 但確實 reposition
  });

  it('props（除 pos 外）不變的新物件 → 冪等不重繪', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);

    expect(part.update({ ...p })).toBe(false); // 新物件但欄位值相同
    expect(clearSpy).toHaveBeenCalledTimes(1);
  });

  it('繪製欄位真正變更 → 重繪（回傳 true、clear 遞增）', () => {
    const part = createArmyChip();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(part.update({ ...p, soldiers: p.soldiers - 1 })).toBe(true);
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('label 文字：無 collapsedCount 時＝formatArmyTroops(soldiers)；collapsedCount>0 時＝"+n"', () => {
    const part = createArmyChip();
    const label = part.container.children[1] as unknown as { text: string };
    part.update(props({ soldiers: 12_500 }));
    expect(label.text).toBe('12,500');
    part.update(props({ soldiers: 12_500, collapsedCount: 3 }));
    expect(label.text).toBe('+3');
  });
});
