import { afterEach, expect, it, vi } from 'vitest';
import { BitmapText, BufferImageSource, Graphics, Mesh } from 'pixi.js';
import { createAnalysisOverlay, drawAnalysisMarks } from '@ui/map/analysisOverlay/analysisDraw';
import { buildFactionPixels, type AnalysisMark } from '@ui/map/analysisOverlay/analysisModel';
import type { MapStaticData, MapViewState } from '@ui/map/mapViewTypes';
import type { TerritoryGrid } from '@ui/map/territoryGrid';
import { makeRec } from './sceneParts/recordingGraphics';

afterEach(() => vi.restoreAllMocks());
const project = (p: { x: number; y: number }) => ({ x: p.x, y: p.y - 0.5 * p.x });
const dashed: AnalysisMark = { points: [0, 0, 40, 0], dashed: true, width: 5, color: 0x123456 };

it('actual projected dashed producer preserves canonical twelve-on/eight-off gaps before sampling', () => {
  const { rec, g } = makeRec();
  drawAnalysisMarks(g, [dashed], project);
  expect(rec.argsOf('moveTo')).toEqual([
    [0, 0],
    [20, -10],
  ]);
  expect(rec.argsOf('lineTo')).toEqual([
    [6, -3],
    [12, -6],
    [26, -13],
    [32, -16],
  ]);
  expect(rec.argsOf('stroke')).toEqual([[{ color: 0x123456, width: 5 }]]);
});

it('retains exact old flat dash instructions and projects solid stations and circle centers separately', () => {
  const flat = makeRec(),
    warped = makeRec();
  drawAnalysisMarks(flat.g, [dashed]);
  expect(flat.rec.calls).toEqual([
    ['clear'],
    ['moveTo', 0, 0],
    ['lineTo', 12, 0],
    ['moveTo', 20, 0],
    ['lineTo', 32, 0],
    ['stroke', { color: 0x123456, width: 5 }],
  ]);
  const callback = vi.fn(project);
  drawAnalysisMarks(
    warped.g,
    [
      { points: [0, 0, 24, 0], width: 3, color: 1 },
      { points: [10, 20], radius: 24, double: true, width: 5, color: 2 },
    ],
    callback,
  );
  expect(warped.rec.argsOf('lineTo')).toEqual([
    [8, -4],
    [16, -8],
    [24, -12],
  ]);
  expect(warped.rec.argsOf('circle')).toEqual([
    [10, 15, 24],
    [10, 15, 31],
  ]);
  expect(callback.mock.calls.map(([p]) => p)).toEqual([
    { x: 0, y: 0 },
    { x: 8, y: 0 },
    { x: 16, y: 0 },
    { x: 24, y: 0 },
    { x: 10, y: 20 },
  ]);
});

const data = {
  graph: {
    nodes: new Map([
      ['a', { id: 'a', kind: 'castle', pos: { x: 100, y: 100 } }],
      ['b', { id: 'b', kind: 'castle', pos: { x: 140, y: 100 } }],
    ]),
    edges: new Map([['road', { id: 'road', a: 'a', b: 'b', grade: 1, type: 'land', baseDays: 1 }]]),
    adjacency: new Map([
      ['a', ['road']],
      ['b', ['road']],
    ]),
  },
  clanColorIndex: { oda: 0 },
  names: { oda: '織田' },
} as unknown as MapStaticData;
const view = {
  day: 1,
  districtOwner: { d: 'oda' },
  castles: [
    { id: 'a', ownerClanId: 'oda' },
    { id: 'b', ownerClanId: 'oda' },
  ],
  armies: [
    {
      id: 'moving',
      clanId: 'oda',
      fromNode: 'a',
      toNode: 'b',
      edgeT: 0.5,
      foodDays: 10,
      relation: 'friendly',
      status: 'marching',
      selected: false,
    },
    {
      id: 'selected',
      clanId: 'oda',
      fromNode: 'a',
      toNode: null,
      edgeT: 0,
      foodDays: 10,
      relation: 'friendly',
      status: 'marching',
      selected: true,
    },
    {
      id: 'critical',
      clanId: 'oda',
      fromNode: 'a',
      toNode: null,
      edgeT: 0,
      foodDays: 2,
      relation: 'enemy',
      status: 'sieging',
      selected: false,
    },
  ],
  battles: [],
  selection: null,
  analysisMode: 'faction',
} as unknown as MapViewState;
const grid = {
  size: 2,
  nearestDistrict: new Uint16Array([0, 0, 0, 0]),
  districtIds: ['d'],
  imageData: { data: new Uint8ClampedArray(16), width: 2, height: 2 },
} as TerritoryGrid;
const field = {
  bounds: { worldSize: 4096, cells: 2, displacementLipschitz: 0.01 },
  vertexHeights: Object.freeze(
    Array.from({ length: 9 }, (_, i) => ((i % 3) + Math.floor(i / 3)) * 2.048),
  ),
  project: (p: { x: number; y: number }) => {
    const h = (p.x + p.y) * 0.001;
    return { x: p.x - 0.18 * h, y: p.y - h };
  },
};

it('projects canonical clan centroid and moving dots once, retaining selected/urgent chips and pixel lock', () => {
  const before = structuredClone({ data, view });
  const actual = createAnalysisOverlay(data, grid, field);
  actual.update(view, 'faction', 0.55);
  const labels = actual.annotations.children.filter((child) => child instanceof BitmapText);
  const dots = actual.annotations.children.filter((child) => child instanceof Graphics);
  expect(labels).toHaveLength(1);
  expect(dots).toHaveLength(1);
  expect(labels[0]!.position.x).toBe(field.project({ x: 120, y: 100 }).x);
  expect(labels[0]!.position.y).toBe(field.project({ x: 120, y: 100 }).y);
  expect(dots[0]!.position.x).toBe(field.project({ x: 120, y: 100 }).x);
  expect(dots[0]!.position.y).toBe(field.project({ x: 120, y: 100 }).y);
  actual.setScale(0.5);
  for (const child of actual.annotations.children) expect(child.scale.x).toBe(2);
  const redraws = actual.redraws;
  actual.update({ ...view, day: 2 }, 'faction', 0.55);
  expect(actual.redraws).toBe(redraws);
  expect(actual.annotations.children[0]).toBe(labels[0]);
  expect({ data, view }).toEqual(before);
  actual.destroy();
  actual.destroy();
});

it('uses the actual projected faction raster with identical source pixels and cleans owned geometry/source once', () => {
  const actual = createAnalysisOverlay(data, grid, field);
  actual.update(view, 'faction', 0.55);
  const mesh = actual.container.children.find((child) => child instanceof Mesh) as Mesh;
  expect(mesh).toBeInstanceOf(Mesh);
  expect(mesh.eventMode).toBe('none');
  expect(actual.getProjectionDiagnostics()).toMatchObject({
    ownedMeshes: 1,
    ownedBuffers: 3,
    ownedTextures: 0,
  });
  expect(actual.ownedTextures).toBe(1);
  const source = mesh.texture.source,
    geometry = mesh.geometry;
  expect(source).toBeInstanceOf(BufferImageSource);
  if (!(source instanceof BufferImageSource))
    throw new Error('actual faction raster source is not RGBA');
  expect(source.resource).toEqual(buildFactionPixels(grid, data, view));
  const bytes = source.resource,
    update = vi.spyOn(source, 'update');
  actual.update({ ...view, districtOwner: { d: null } }, 'faction', 0.55);
  expect(mesh.texture.source).toBe(source);
  expect(source.resource).toBe(bytes);
  expect(update).toHaveBeenCalledTimes(1);
  const destroyGeometry = vi.spyOn(geometry, 'destroy'),
    destroyTexture = vi.spyOn(mesh.texture, 'destroy'),
    destroySource = vi.spyOn(source, 'destroy');
  actual.destroy();
  actual.destroy();
  expect(destroyGeometry).toHaveBeenCalledTimes(1);
  expect(destroyTexture).toHaveBeenCalledTimes(1);
  expect(destroySource).toHaveBeenCalledTimes(1);
  expect(actual.ownedTextures).toBe(0);
  expect(actual.getProjectionDiagnostics()).toMatchObject({
    ownedMeshes: 0,
    ownedGeometries: 0,
    ownedBuffers: 0,
    bufferBytes: 0,
  });
});
