import { describe, expect, it } from 'vitest';
import { BitmapFontManager, BitmapText, DOMAdapter } from 'pixi.js';
import {
  LABEL_STYLE,
  labelTextStyle,
  sharedLabelTextStyle,
  bindSharedLabelStyleLifecycle,
} from '@ui/map/labelStyle';

describe('map label shared installed-Pixi font identity', () => {
  it('reuses the five font identities across ten label remounts without changing visual options', () => {
    const presets = Object.values(LABEL_STYLE);
    const originalAdapter = DOMAdapter.get();
    // Font-cache identity probe: empty text needs no glyph raster/GPU work.
    DOMAdapter.set({
      ...originalAdapter,
      createCanvas: () =>
        ({
          getContext: (kind: string) =>
            kind === '2d'
              ? {
                  font: '',
                  measureText: () => ({
                    width: 10,
                    actualBoundingBoxAscent: 8,
                    actualBoundingBoxDescent: 2,
                  }),
                }
              : null,
        }) as unknown as HTMLCanvasElement,
    });
    try {
      const fonts = presets.map((spec) =>
        BitmapFontManager.getFont('', sharedLabelTextStyle(spec)),
      );
      for (let cycle = 0; cycle < 10; cycle++) {
        presets.forEach((spec, index) => {
          const style = sharedLabelTextStyle({ ...spec });
          expect(style.fontSize).toBe(labelTextStyle(spec).fontSize);
          expect(BitmapFontManager.getFont('', style)).toBe(fonts[index]);
          const label = new BitmapText({ text: '', style });
          const count = style.listenerCount('update');
          bindSharedLabelStyleLifecycle(label);
          label.destroy({ children: true, texture: true });
          expect(style.listenerCount('update')).toBe(count - 1);
        });
      }
    } finally {
      DOMAdapter.set(originalAdapter);
    }
  });

  it('shares equivalent content, separates every baked field and preserves a separate live owner', () => {
    const spec = LABEL_STYLE.province,
      style = sharedLabelTextStyle(spec);
    const first = new BitmapText({ text: '甲', style });
    const second = new BitmapText({ text: '乙', style });
    const count = style.listenerCount('update');
    bindSharedLabelStyleLifecycle(first);
    bindSharedLabelStyleLifecycle(second);
    first.destroy({ children: true, texture: true });
    expect(style.listenerCount('update')).toBe(count - 1);
    expect(second.style).toBe(style);
    expect(sharedLabelTextStyle({ ...spec, alpha: 0.1, gap: 99, offset: 99 })).toBe(style);
    for (const changed of [
      { size: 19 },
      { fill: 0 },
      { halo: 0 },
      { haloW: spec.haloW + 1 },
      { letterSpacing: 3 },
    ]) {
      expect(sharedLabelTextStyle({ ...spec, ...changed })).not.toBe(style);
    }
    expect(style.fontSize).toBe(spec.size);
    second.destroy({ children: true, texture: true });
    expect(style.listenerCount('update')).toBe(count - 2);
  });
});
