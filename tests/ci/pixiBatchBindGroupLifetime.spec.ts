import { describe, expect, it, vi } from 'vitest';
import { TextureSource, getTextureBatchBindGroup } from 'pixi.js';

const source = () => new TextureSource({ width: 1, height: 1 });

describe('pinned Pixi texture batch bind-group lifetime', () => {
  it('reuses a live group, then evicts an explicitly destroyed group without destroying the source', () => {
    const texture = source();
    const group = getTextureBatchBindGroup([texture], 1, 1);
    expect(getTextureBatchBindGroup([texture], 1, 1)).toBe(group);
    group.destroy();
    expect(texture.destroyed).toBe(false);
    const replacement = getTextureBatchBindGroup([texture], 1, 1);
    expect(replacement).not.toBe(group);
    expect(replacement.getResource(0)).toBe(texture);
    replacement.destroy();
    texture.destroy();
  });

  it('preserves another live group and unrelated resource listeners during eviction', () => {
    const a = source(),
      b = source();
    const unrelated = vi.fn();
    a.on('change', unrelated);
    const first = getTextureBatchBindGroup([a], 1, 1);
    const other = getTextureBatchBindGroup([b], 1, 1);
    first.destroy();
    first.destroy();
    expect(a.listenerCount('change')).toBe(1);
    expect(getTextureBatchBindGroup([b], 1, 1)).toBe(other);
    a.destroy();
    expect(unrelated).toHaveBeenCalledTimes(1);
    other.destroy();
    b.destroy();
  });

  it('evicts groups destroyed by their resource change handler across 130 cycles', () => {
    const texture = source();
    for (let cycle = 0; cycle < 130; cycle += 1) {
      const group = getTextureBatchBindGroup([texture], 1, 1);
      expect(group.getResource(0)).toBe(texture);
      // Controlled change signal through the real emitter invokes its bound handler.
      texture.emit('change', { destroyed: true });
      const next = getTextureBatchBindGroup([texture], 1, 1);
      expect(next).not.toBe(group);
      expect(next.getResource(0)).toBe(texture);
      next.destroy();
      expect(texture.listenerCount('change')).toBe(0);
    }
    texture.destroy();
  });
});
