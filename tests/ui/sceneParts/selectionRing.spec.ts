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

describe('drawSelectionRing（M6-V7 CD5 金色雙環）', () => {
  it('先 clear；雙同心環：外環=命中半徑+6、內環=命中半徑+2，皆 gold', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ targetHitRadius: 20 }));
    expect(rec.calls[0]?.[0]).toBe('clear');

    const circles = rec.argsOf('circle') as number[][]; // circle(x,y,radius)
    expect(circles).toHaveLength(2);
    const radii = circles.map((c) => c[2]);
    expect(radii).toContain(20 + SELECTION_RING_GEOMETRY.paddingRadius); // 外環 26
    expect(radii).toContain(
      20 + SELECTION_RING_GEOMETRY.paddingRadius - SELECTION_RING_GEOMETRY.innerGap,
    ); // 內環 22
    expect(radii[0]).toBeGreaterThan(radii[1]!); // 外環先繪、半徑較大

    const strokes = rec.argsOf('stroke').map((a) => a[0] as { color: number });
    expect(strokes).toHaveLength(2);
    for (const s of strokes) expect(s.color).toBe(TOKENS_NUM.accentGold);
  });

  it('primary=true（主選對象，含單選情境）雙環線寬皆加粗至 3px', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ primary: true }));
    const strokes = rec.argsOf('stroke').map((a) => a[0] as { width: number });
    for (const s of strokes) expect(s.width).toBe(SELECTION_RING_GEOMETRY.strokeWidthPrimary);
    expect(SELECTION_RING_GEOMETRY.strokeWidthPrimary).toBe(3);
  });

  it('primary=false（多選時非主選對象）雙環線寬為 2px', () => {
    const { rec, g } = makeRec();
    drawSelectionRing(g, props({ primary: false }));
    const strokes = rec.argsOf('stroke').map((a) => a[0] as { width: number });
    for (const s of strokes) expect(s.width).toBe(SELECTION_RING_GEOMETRY.strokeWidthNormal);
    expect(SELECTION_RING_GEOMETRY.strokeWidthNormal).toBe(2);
  });

  it('雙環半徑隨不同節點種類的命中半徑而異（城/郡/部隊）', () => {
    for (const r of [
      MAPVIEW.hitRadius.castleMain,
      MAPVIEW.hitRadius.castleBranch,
      MAPVIEW.hitRadius.district,
    ]) {
      const { rec, g } = makeRec();
      drawSelectionRing(g, props({ targetHitRadius: r }));
      const radii = (rec.argsOf('circle') as number[][]).map((c) => c[2]);
      expect(radii).toContain(r + SELECTION_RING_GEOMETRY.paddingRadius);
      expect(radii).toContain(
        r + SELECTION_RING_GEOMETRY.paddingRadius - SELECTION_RING_GEOMETRY.innerGap,
      );
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
