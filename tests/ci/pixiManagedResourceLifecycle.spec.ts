import { describe, expect, it, vi } from 'vitest';
import { AbstractRenderer, Buffer, BufferUsage, GCManagedHash } from 'pixi.js';

function renderer(uid: number) {
  return { uid, gc: { now: 1, addResourceHash: vi.fn() } };
}
function resource() {
  return new Buffer({ data: new Float32Array(4), usage: BufferUsage.VERTEX });
}
function managed(owner: ReturnType<typeof renderer>, onUnload = vi.fn()) {
  return new GCManagedHash<Buffer>({
    renderer: owner as unknown as ConstructorParameters<typeof GCManagedHash>[0]['renderer'],
    type: 'resource',
    onUnload,
    name: 'test-buffer',
  });
}
function gpu(buffer: Buffer, uid: number) {
  const data = { destroy: vi.fn() };
  buffer._gpuData[uid] = data as unknown as Buffer['_gpuData'][number];
  return data;
}

describe('pinned Pixi managed GPU resource listener lifecycle', () => {
  it('detaches only the destroyed renderer while another renderer still owns the buffer', () => {
    const buffer = resource();
    const first = renderer(101),
      second = renderer(202);
    const firstUnload = vi.fn(),
      secondUnload = vi.fn();
    const a = managed(first, firstUnload),
      b = managed(second, secondUnload);
    const ga = gpu(buffer, first.uid),
      gb = gpu(buffer, second.uid);
    const unrelated = vi.fn();
    buffer.on('unload', unrelated);
    expect(a.add(buffer)).toBe(true);
    expect(a.add(buffer)).toBe(false);
    expect(b.add(buffer)).toBe(true);
    a.destroy();
    expect(buffer.listenerCount('unload')).toBe(2);
    expect(ga.destroy).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(buffer._gpuData, first.uid)).toBe(false);
    expect(buffer._gpuData[second.uid]).toBe(gb);
    expect(gb.destroy).not.toHaveBeenCalled();
    expect(firstUnload).toHaveBeenCalledWith(buffer);
    buffer.unload();
    expect(secondUnload).toHaveBeenCalledWith(buffer);
    expect(gb.destroy).toHaveBeenCalledTimes(1);
    expect(Object.hasOwn(buffer._gpuData, second.uid)).toBe(false);
    expect(unrelated).toHaveBeenCalledTimes(1);
    expect(buffer.listenerCount('unload')).toBe(1);
    b.destroy();
    buffer.destroy();
  });

  it('keeps shared-buffer listeners bounded across 130 manager replacement cycles', () => {
    const buffer = resource();
    for (let cycle = 0; cycle < 130; cycle += 1) {
      const owner = renderer(cycle + 1);
      const hash = managed(owner);
      const data = gpu(buffer, owner.uid);
      hash.add(buffer);
      hash.removeAll();
      expect(buffer.listenerCount('unload')).toBe(0);
      expect(hash.items[buffer.uid]).toBeNull();
      expect(data.destroy).toHaveBeenCalledTimes(1);
      expect(Object.hasOwn(buffer._gpuData, owner.uid)).toBe(false);
      hash.destroy();
      hash.destroy();
    }
    buffer.destroy();
  });

  it('removes its listener and membership even when GPU data is already absent', () => {
    const buffer = resource();
    const hash = managed(renderer(303));
    hash.add(buffer);
    hash.remove(buffer);
    expect(buffer.listenerCount('unload')).toBe(0);
    expect(hash.items[buffer.uid]).toBeNull();
    expect(hash.add(buffer)).toBe(true);
    hash.destroy();
    expect(buffer.listenerCount('unload')).toBe(0);
    buffer.destroy();
  });

  it('uses unique non-index renderer keys across simultaneous owners and recreation', () => {
    const config = {
      type: 1,
      name: 'test',
      runners: [],
      systems: [],
      renderPipes: [],
      renderPipeAdaptors: [],
    };
    const makeRenderer = () => {
      const instance = new AbstractRenderer(config);
      (instance as unknown as ReturnType<typeof renderer>).gc = {
        now: 1,
        addResourceHash: vi.fn(),
      };
      return instance;
    };
    const first = makeRenderer();
    const second = makeRenderer();
    expect(first.uid).toBeLessThan(0);
    expect(second.uid).toBeLessThan(0);
    expect(second.uid).not.toBe(first.uid);

    const buffer = resource();
    const a = managed(first as unknown as ReturnType<typeof renderer>);
    const b = managed(second as unknown as ReturnType<typeof renderer>);
    const ga = gpu(buffer, first.uid);
    const gb = gpu(buffer, second.uid);
    a.add(buffer);
    b.add(buffer);
    expect(Object.keys(buffer._gpuData).sort()).toEqual(
      [String(first.uid), String(second.uid)].sort(),
    );
    a.destroy();
    expect(ga.destroy).toHaveBeenCalledTimes(1);
    expect(gb.destroy).not.toHaveBeenCalled();
    expect(buffer._gpuData[second.uid]).toBe(gb);
    expect(Object.keys(buffer._gpuData)).toEqual([String(second.uid)]);
    first.destroy();

    const recreated = makeRenderer();
    expect(new Set([first.uid, second.uid, recreated.uid]).size).toBe(3);
    const c = managed(recreated as unknown as ReturnType<typeof renderer>);
    const gc = gpu(buffer, recreated.uid);
    c.add(buffer);
    buffer.unload();
    expect(gb.destroy).toHaveBeenCalledTimes(1);
    expect(gc.destroy).toHaveBeenCalledTimes(1);
    expect(Object.keys(buffer._gpuData)).toEqual([]);
    b.destroy();
    c.destroy();
    second.destroy();
    recreated.destroy();
    buffer.destroy();
  });
});
