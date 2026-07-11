// SelectionRing（src/ui/map/sceneParts/selectionRing.ts）繪製參數測試。
// 規格：plan/12-ui-components.md §3.3.4；18-roadmap.md M2-16（12-T10 部分）。

import { describe, expect, it, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import { TOKENS_NUM } from '@ui/styles/tokens';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import {
  createSelectionRing,
  drawSelectionRing,
  SELECTION_RING_GEOMETRY,
  type SelectionRingProps,
} from '@ui/map/sceneParts/selectionRing';
import { makeRec } from './recordingGraphics';

function props(overrides: Partial<SelectionRingProps> = {}): SelectionRingProps {
  return {
    pos: { x: 1, y: 2 },
    targetHitRadius: MAPVIEW.hitRadius.castleMain,
    primary: true,
    ...overrides,
  };
}

describe('drawSelectionRing（12 §3.3.4）', () => {
  it('先 clear；半徑=目標命中半徑+6、色 gold', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ targetHitRadius: 20 }));
    expect(rec.calls[0]?.[0]).toBe('clear');

    const circle = rec.argsOf('circle')[0] as number[]; // circle(x,y,radius) 三個純量引數
    expect(circle).toEqual([0, 0, 20 + SELECTION_RING_GEOMETRY.paddingRadius]);

    const stroke = rec.argsOf('stroke')[0]?.[0] as { color: number };
    expect(stroke.color).toBe(TOKENS_NUM.accentGold);
  });

  it('primary=true（主選對象，含單選情境）線寬加粗至 3px', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ primary: true }));
    const stroke = rec.argsOf('stroke')[0]?.[0] as { width: number };
    expect(stroke.width).toBe(SELECTION_RING_GEOMETRY.strokeWidthPrimary);
    expect(SELECTION_RING_GEOMETRY.strokeWidthPrimary).toBe(3);
  });

  it('primary=false（多選時非主選對象）線寬為 2px', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ primary: false }));
    const stroke = rec.argsOf('stroke')[0]?.[0] as { width: number };
    expect(stroke.width).toBe(SELECTION_RING_GEOMETRY.strokeWidthNormal);
    expect(SELECTION_RING_GEOMETRY.strokeWidthNormal).toBe(2);
  });

  it('半徑隨不同節點種類的命中半徑而異（城/郡/部隊）', () => {
    for (const r of [
      MAPVIEW.hitRadius.castleMain,
      MAPVIEW.hitRadius.castleBranch,
      MAPVIEW.hitRadius.district,
    ]) {
      const { rec, g } = makeRec();
      drawSelectionRing(g, props({ targetHitRadius: r }));
      const circle = rec.argsOf('circle')[0] as number[]; // circle(x,y,radius) 三個純量引數
      expect(circle[2]).toBe(r + SELECTION_RING_GEOMETRY.paddingRadius);
    }
  });
});

describe('createSelectionRing（12 §4 ScenePart 工廠）', () => {
  it('container 內建一個 Graphics 子物件；update() 設定 position', () => {
    const part = createSelectionRing();
    expect(part.container.children).toHaveLength(1);
    part.update(props({ pos: { x: 33, y: 44 } }));
    expect(part.container.position.x).toBe(33);
    expect(part.container.position.y).toBe(44);
  });

  it('update() 冪等：props 不變不重繪', () => {
    const part = createSelectionRing();
    const gfx = part.container.children[0] as Graphics;
    const clearSpy = vi.spyOn(gfx, 'clear');

    const p = props();
    part.update(p);
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p });
    expect(clearSpy).toHaveBeenCalledTimes(1);
    part.update({ ...p, primary: false });
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });

  it('destroy() 冪等且銷毀 container', () => {
    const part = createSelectionRing();
    part.destroy();
    expect(part.container.destroyed).toBe(true);
    expect(() => part.destroy()).not.toThrow();
  });
});
