import { describe, expect, it } from 'vitest';
import { MapRenderer } from '@ui/map/MapRenderer';

describe('explicit diagnostic mountain hero visibility', () => {
  it('returns exact prior visibility while retaining hero and ground material ownership', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    const container = { visible: true, children: ['original-hero', 'original-mask'] };
    const materialLayer = { visible: true, parent: 'coast-clipped-ground' };
    const raster = { container, materialLayer };
    Reflect.set(renderer, 'mountainRaster', raster);
    expect(renderer.setMountainHeroVisibilityForDiagnostics(false)).toBe(true);
    expect(container.visible).toBe(false);
    expect(renderer.setMountainHeroVisibilityForDiagnostics(true)).toBe(false);
    expect(container.visible).toBe(true);
    expect(Reflect.get(renderer, 'mountainRaster')).toBe(raster);
    expect(container.children).toEqual(['original-hero', 'original-mask']);
    expect(materialLayer).toEqual({ visible: true, parent: 'coast-clipped-ground' });
  });

  it('rejects missing layers and invalid visibility before any write', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    Reflect.set(renderer, 'mountainRaster', null);
    expect(() => renderer.setMountainHeroVisibilityForDiagnostics(false)).toThrow('not mounted');
    const container = { visible: true };
    Reflect.set(renderer, 'mountainRaster', { container });
    expect(() => renderer.setMountainHeroVisibilityForDiagnostics(1 as unknown as boolean)).toThrow(
      'boolean',
    );
    expect(container.visible).toBe(true);
  });
});
