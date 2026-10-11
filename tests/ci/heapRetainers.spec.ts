import { describe, expect, it } from 'vitest';
import {
  analyzeHeapRetainers,
  compareHeapRetainers,
  type HeapSnapshot,
} from '../../tools/perf/heap-retainers';

function fixture(weak = false): HeapSnapshot {
  return {
    snapshot: {
      meta: {
        node_fields: ['type', 'name', 'id', 'self_size', 'edge_count'],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        node_types: [['synthetic', 'object', 'string']],
        edge_types: [['property', 'weak']],
      },
    },
    strings: [
      'root',
      'minified',
      'false',
      'nodeParts',
      'armyParts',
      'staticData',
      'view',
      'disposed',
      'owner',
    ],
    nodes: [0, 0, 1, 0, 1, 1, 1, 3, 0, 5, 2, 2, 5, 0, 0],
    edges: [weak ? 1 : 0, 8, 5, 0, 3, 10, 0, 4, 10, 0, 5, 10, 0, 6, 10, 0, 7, 10],
  };
}
describe('heap retained-object audit', () => {
  it('detects surviving before IDs even when teardown removes the identifying shape', () => {
    const before = fixture(),
      after = fixture();
    after.strings[3] = 'removed-nodeParts';
    const result = compareHeapRetainers(before, after);
    expect(result.after.counts['MapRenderer-shape']).toBeUndefined();
    expect(result.candidates[0]?.afterNode?.id).toBe(3);
    expect(result.candidates[0]?.afterNode?.strongRootPath?.[0]?.edge).toBe('owner');
    after.nodes[7] = 7;
    expect(compareHeapRetainers(before, after).candidates[0]?.afterNode).toBeNull();
  });
  it('identifies minified renderer shape and a real strong root path without mutating the snapshot', () => {
    const input = fixture(),
      before = structuredClone(input),
      result = analyzeHeapRetainers(input);
    expect(result.counts['MapRenderer-shape']).toBe(1);
    expect(result.objects[0]?.propertyTargetNames.disposed).toBe('false');
    expect(result.objects[0]?.strongRootPath).toEqual([
      {
        fromId: 1,
        fromName: 'root',
        edgeType: 'property',
        edge: 'owner',
        toId: 3,
        toName: 'minified',
      },
    ]);
    expect(input).toEqual(before);
  });
  it('does not present weak reachability as a strong retention path', () => {
    expect(analyzeHeapRetainers(fixture(true)).objects[0]?.strongRootPath).toBeNull();
  });
  it('rejects malformed target offsets and required metadata', () => {
    const invalid = fixture();
    invalid.edges[2] = 6;
    expect(() => analyzeHeapRetainers(invalid)).toThrow('target');
    invalid.snapshot.meta.node_fields[4] = 'wrong';
    expect(() => analyzeHeapRetainers(invalid)).toThrow('edge_count');
  });
  it('retains Oddball names as raw evidence, never inferring lifecycle boolean values', () => {
    const input = fixture();
    input.strings[2] = 'system / Oddball';
    expect(analyzeHeapRetainers(input).objects[0]?.propertyTargetNames.disposed).toBe(
      'system / Oddball',
    );
  });
  it('validates enum codes and edges outside the strong root traversal', () => {
    const input = fixture(true);
    input.edges[3] = 99;
    expect(() => analyzeHeapRetainers(input)).toThrow('edge type');
    input.edges[3] = 0;
    input.edges[4] = 99;
    expect(() => analyzeHeapRetainers(input)).toThrow('edge name');
  });
  it('reports canvas names as candidates with their node type and actual root paths', () => {
    const input = fixture();
    input.strings[1] = '<canvas width="512" height="512">';
    const result = analyzeHeapRetainers(input);
    expect(result.cacheCandidates['<canvas width="512" height="512">']).toBe(1);
    expect(result.cacheObjects[0]?.nodeType).toBe('object');
    expect(result.cacheObjects[0]?.strongRootPath?.[0]?.edge).toBe('owner');
  });
});
