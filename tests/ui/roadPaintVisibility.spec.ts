import { describe, expect, it } from 'vitest';
import { MapRenderer } from '@ui/map/MapRenderer';

describe('explicit diagnostic road paint visibility', () => {
  it('returns exact prior visibility and changes only the retained container', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    const container = { visible: true, children: ['original-road-paint'] };
    const layer = { container };
    Reflect.set(renderer, 'roadsLayer', layer);
    expect(renderer.setRoadPaintVisibilityForDiagnostics(false)).toBe(true);
    expect(container.visible).toBe(false);
    expect(renderer.setRoadPaintVisibilityForDiagnostics(true)).toBe(false);
    expect(container.visible).toBe(true);
    expect(Reflect.get(renderer, 'roadsLayer')).toBe(layer);
    expect(container.children).toEqual(['original-road-paint']);
  });

  it('rejects missing layers and invalid visibility before any write', () => {
    const renderer = Object.create(MapRenderer.prototype) as MapRenderer;
    Reflect.set(renderer, 'roadsLayer', null);
    expect(() => renderer.setRoadPaintVisibilityForDiagnostics(false)).toThrow('not mounted');
    const container = { visible: true };
    Reflect.set(renderer, 'roadsLayer', { container });
    expect(() => renderer.setRoadPaintVisibilityForDiagnostics(1 as unknown as boolean)).toThrow(
      'boolean',
    );
    expect(container.visible).toBe(true);
  });
});
