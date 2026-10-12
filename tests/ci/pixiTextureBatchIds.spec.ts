import { describe, expect, it } from 'vitest';
import { BatchTextureArray, Texture, TextureSource, getTextureBatchBindGroup } from 'pixi.js';

const source = () => new TextureSource({ width: 1, height: 1 });

describe('pinned Pixi texture batch ID cache', () => {
  it('keeps simultaneous numeric texture IDs and removes them on clear and reuse', () => {
    const first = source();
    const second = source();
    expect(first.uid).toBeLessThan(0);
    expect(second.uid).toBeLessThan(0);
    expect(first.uid).not.toBe(second.uid);

    const batch = new BatchTextureArray();
    batch.ids[first.uid] = 0;
    batch.ids[second.uid] = 1;
    batch.textures[0] = first;
    batch.textures[1] = second;
    batch.count = 2;
    expect(batch.ids[first.uid]).toBe(0);
    expect(batch.ids[second.uid]).toBe(1);

    batch.clear();
    expect(batch.count).toBe(0);
    expect(Object.keys(batch.ids)).toEqual([]);
    expect(batch.textures[0]).toBeNull();
    expect(batch.textures[1]).toBeNull();

    batch.ids[second.uid] = 0;
    batch.textures[0] = second;
    batch.count = 1;
    expect(batch.ids[second.uid]).toBe(0);
    expect(batch.ids[first.uid]).toBeUndefined();
    batch.clear();
    expect(Object.keys(batch.ids)).toEqual([]);
    first.destroy();
    second.destroy();
  });

  it('leaves no stale IDs after 130 texture-source cycles on one batch', () => {
    const batch = new BatchTextureArray();
    const ids = new Set<number>();
    for (let cycle = 0; cycle < 130; cycle += 1) {
      const texture = source();
      ids.add(texture.uid);
      batch.ids[texture.uid] = 0;
      batch.textures[0] = texture;
      batch.count = 1;
      expect(batch.ids[texture.uid]).toBe(0);
      batch.clear();
      expect(Object.keys(batch.ids)).toEqual([]);
      texture.destroy();
    }
    expect(ids.size).toBe(130);
  });

  it('preserves bind-group reuse and order for live texture sources', () => {
    const first = source();
    const second = source();
    const third = source();
    const orders = [
      [first, second, third],
      [first, third, second],
      [third, second, first],
    ];
    const getGroup = (textures: TextureSource[]) => getTextureBatchBindGroup(textures, 3, 4);
    const expectResources = (group: ReturnType<typeof getGroup>, textures: TextureSource[]) => {
      for (let j = 0; j < textures.length; j += 1) {
        expect(group.resources[2 * j]).toBe(textures[j]!.source);
        expect(group.resources[2 * j + 1]).toBe(textures[j]!.style);
      }
      expect(group.resources[6]).toBe(Texture.EMPTY.source.source);
      expect(group.resources[7]).toBe(Texture.EMPTY.source.style);
    };
    const groups = orders.map(getGroup);
    expect(new Set(groups).size).toBe(3);
    for (let i = 0; i < orders.length; i += 1) {
      expect(getGroup(orders[i]!)).toBe(groups[i]);
      expectResources(groups[i]!, orders[i]!);
    }
    groups[1]!.destroy();
    expect(getGroup(orders[0]!)).toBe(groups[0]);
    expect(getGroup(orders[2]!)).toBe(groups[2]);
    const replacement = getGroup(orders[1]!);
    expect(replacement).not.toBe(groups[1]);
    expectResources(replacement, orders[1]!);
    groups[0]!.destroy();
    groups[2]!.destroy();
    replacement.destroy();
    second.destroy();

    const newSource = source();
    expect(newSource.uid).not.toBe(second.uid);
    const newOrder = [first, newSource, third];
    const newGroup = getGroup(newOrder);
    expect(newGroup).not.toBe(groups[0]);
    expect(newGroup).not.toBe(groups[1]);
    expect(newGroup).not.toBe(groups[2]);
    expectResources(newGroup, newOrder);
    expect(getGroup(newOrder)).toBe(newGroup);
    newGroup.destroy();
    first.destroy();
    third.destroy();
    newSource.destroy();
  });
});
