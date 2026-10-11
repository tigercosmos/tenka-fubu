import { describe, expect, it } from 'vitest';
import { MapRenderer } from '@ui/map/MapRenderer';

describe('explicit diagnostic water paint visibility', () => {
  it('returns exact prior visibility without replacing water ownership or children', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    const container = { visible: true, children: ['original-river', 'original-lake'] };
    const layer = { container };
    Reflect.set(renderer, 'waterFeatures', layer);
    expect(renderer.setWaterPaintVisibilityForDiagnostics(false)).toBe(true);
    expect(container.visible).toBe(false);
    expect(renderer.setWaterPaintVisibilityForDiagnostics(true)).toBe(false);
    expect(container.visible).toBe(true);
    expect(Reflect.get(renderer, 'waterFeatures')).toBe(layer);
    expect(container.children).toEqual(['original-river', 'original-lake']);
  });

  it('rejects missing layers and non-boolean visibility before any write', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    Reflect.set(renderer, 'waterFeatures', null);
    expect(() => renderer.setWaterPaintVisibilityForDiagnostics(false)).toThrow('not mounted');
    const container = { visible: true };
    Reflect.set(renderer, 'waterFeatures', { container });
    expect(() => renderer.setWaterPaintVisibilityForDiagnostics(1 as unknown as boolean)).toThrow(
      'boolean',
    );
    expect(container.visible).toBe(true);
  });
});
