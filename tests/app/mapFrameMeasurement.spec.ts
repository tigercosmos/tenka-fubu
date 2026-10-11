import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildFullState } from '../helpers/fullState';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import {
  prepareNationalMapFrameState,
  measureNationalMapFrames,
  type MapFrameMeasurementRenderer,
} from '../../src/app/mapFrameMeasurement';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('canonical national map performance prerequisites', () => {
  it('creates forty real validated queued marches without fabricating resources or changing input', async () => {
    const input = await buildFullState({ seed: 15600519 });
    const before = structuredClone(input);
    const { game, commands, events, armyRegions } = prepareNationalMapFrameState(input);
    expect(input).toEqual(before);
    expect(validateState(game)).toEqual([]);
    expect(Object.keys(game.armies)).toHaveLength(40);
    expect(commands).toHaveLength(40);
    expect(events.some((event) => event.type === 'command.rejected')).toBe(false);
    expect(
      new Set(
        commands.map(({ command }) => (command.type === 'march' ? command.originCastleId : null)),
      ).size,
    ).toBe(40);
    const expectedOfficers = structuredClone(before.officers);
    for (const army of Object.values(game.armies)) {
      expectedOfficers[army.leaderId]!.armyId = army.id;
      expectedOfficers[army.leaderId]!.locationCastleId = null;
    }
    expect(game.officers).toEqual(expectedOfficers);
    expect(new Set(armyRegions.map((army) => army.region)).size).toBe(9);
    expect(game.clans).toEqual(before.clans);
    expect(game.roads).toEqual(before.roads);
    expect(game.provinces).toEqual(before.provinces);
    expect(game.rng).toEqual(before.rng);
    const sum = (state: typeof game, field: 'soldiers' | 'food') =>
      Object.values(state.castles).reduce((total, castle) => total + castle[field], 0) +
      Object.values(state.armies).reduce((total, army) => total + army[field], 0);
    expect(sum(game, 'soldiers')).toBe(sum(before, 'soldiers'));
    expect(sum(game, 'food')).toBe(sum(before, 'food'));
    for (const army of Object.values(game.armies)) {
      expect(army.status).toBe('marching');
      expect(army.soldiers).toBe(BAL.minMarchTroops);
      expect(before.officers[army.leaderId]).toBeDefined();
      expect(army.path[0]).toBe(army.originCastleId);
      expect(army.path.length).toBeGreaterThan(1);
    }
  });

  it.each([false, true])(
    'records actual renders across the full window (early stall=%s), without core mutation',
    async (stall) => {
      const { game } = prepareNationalMapFrameState(await buildFullState({ seed: 15600519 }));
      const before = structuredClone(game);
      let now = 0;
      let nextId = 0;
      const callbacks = new Map<number, FrameRequestCallback>();
      vi.spyOn(performance, 'now').mockImplementation(() => now);
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        callbacks.set(++nextId, callback);
        return nextId;
      });
      vi.stubGlobal('cancelAnimationFrame', (id: number) => callbacks.delete(id));
      let observe: ((timestamp: number) => void) | null = null;
      let subscriptions = 0;
      let removals = 0;
      const observeArmies = vi.fn(() => ({ mounted: 40, cullVisibleArmyChips: 40 }));
      const renderer: MapFrameMeasurementRenderer = {
        isReady: () => true,
        getArmyRenderObservation: observeArmies,
        updateView: vi.fn(),
        setCameraPose: vi.fn(),
        subscribeRenderedFrames(listener) {
          observe = listener;
          subscriptions++;
          return () => {
            if (observe) {
              observe = null;
              subscriptions--;
              removals++;
            }
          };
        },
        getDiagnostics: () => ({
          ready: true,
          elevationRendering: {
            active: false,
            error: null,
            field: null,
            surface: null,
            territory: null,
            territoryAlpha: null,
            analysis: null,
            canopy: null,
            foothillCanopy: null,
            roads: [],
            nodes: [],
            armies: [],
          },
          lodStage: 'far',
          riverRendering: {
            visible: false,
            classes: [],
            boundsTrace: [],
            materials: {
              ownedTextures: 0,
              ownedSources: 0,
              ownedStyleListeners: 0,
              ownedMaskGraphics: 0,
              ownedDisplayGraphics: 0,
              rgbaBytes: 0,
              rivers: [],
            },
          },
          seaRendering: null,
          coastRendering: { displayPolygons: [], groundClipPolygons: [], surface: null },
          armyPlateLayout: {
            runs: 0,
            plates: [],
            castles: [],
            castleBodies: [],
            foregroundBodies: [],
          },
          geographicLabelLayout: {
            runs: 0,
            placementCache: { computed: 0, reused: 0, entries: 0 },
            labels: [],
            obstacles: [],
          },
          castleRibbonLayout: { runs: 0, limited: false, ribbons: [], obstacles: [] },
          castleRendering: { groundOrder: 0, nodes: [] },
          waterRendering: {
            visible: false,
            lakes: [],
            materials: {
              ownedTextures: 0,
              ownedSources: 0,
              ownedStyleListeners: 0,
              rgbaBytes: 0,
              lakes: [],
            },
          },
          actorDepth: {
            bodies: [],
            modelLayerOrder: 0,
            semanticLayerOrders: { castle: 0, army: 0 },
          },
          analysisMode: 'none',
          analysisOpacity: 0,
          armyRendering: {
            signalLayoutRuns: 0,
            signals: [],
            annotations: [],
            viewCount: 40,
            mounted: 40,
            visibleDrawableArmies: 40,
            collapsed: 0,
          },
          effects: {
            fieldContacts: 0,
            assaultEmitters: 0,
            activeParticles: 0,
            particleCapacity: 128,
            motionBlocked: false,
          },
          layers: {},
          resources: {
            ownedTextures: 2,
            ownedWaterTextures: 0,
            ownedWaterSources: 0,
            waterRgbaBytes: 0,
            waterStyleListeners: 0,
            ownedRiverTextures: 0,
            ownedRiverSources: 0,
            ownedRiverMaskGraphics: 0,
            ownedRiverDisplayGraphics: 0,
            riverRgbaBytes: 0,
            riverStyleListeners: 0,
            ownedSeaTextures: 0,
            ownedSeaSources: 0,
            seaRgbaBytes: 0,
            ownedCoastTextures: 0,
            ownedCoastSources: 0,
            ownedCoastGeometries: 0,
            ownedElevatedMeshes: 0,
            ownedElevatedGeometries: 0,
            ownedElevatedBuffers: 0,
            ownedElevatedShaders: 0,
            ownedElevatedPrograms: 0,
            elevatedBufferBytes: 0,
            ownedCanopyMeshes: 0,
            ownedCanopyGeometries: 0,
            ownedCanopyBuffers: 0,
            canopyBufferBytes: 0,
            ownedFoothillMeshes: 0,
            ownedFoothillGeometries: 0,
            ownedFoothillBuffers: 0,
            ownedFoothillShaders: 0,
            ownedFoothillPrograms: 0,
            foothillBufferBytes: 0,
            coastRgbaBytes: 0,
            coastGeometryBytes: 0,
            ownedMountainShadeTextures: 0,
            ownedMountainShadeSources: 0,
            mountainShadeRgbaBytes: 0,
            sharedTerrainSprites: 2,
            eventListeners: 9 + subscriptions,
          },
          ticker: { fps: 0, deltaMS: 0 },
        }),
      };
      const result = measureNationalMapFrames(
        game,
        renderer,
        { center: { x: 2048, y: 2048 }, scale: 0.25 },
        1000,
      );
      for (let frame = 0; frame <= 10; frame++) {
        now = frame * 100;
        // Deliberately fewer renderer callbacks than rAF callbacks.
        if (frame % 2 === 0 && (!stall || frame <= 2))
          (observe as ((timestamp: number) => void) | null)?.(now);
        const scheduled = [...callbacks.values()];
        callbacks.clear();
        for (const callback of scheduled) callback(now);
      }
      const actual = await result;
      expect(actual.frames).toBe(stall ? 1 : 5);
      expect(actual.frameTimesMs).toEqual(stall ? [200] : [200, 200, 200, 200, 200]);
      expect(actual.averageFps).toBe(stall ? 2 : 6);
      expect(actual.headGapMs).toBe(0);
      expect(actual.tailGapMs).toBe(stall ? 800 : 0);
      expect(actual.minMountedArmies).toBe(40);
      expect(actual.resourcesAfter).toEqual(actual.resourcesBefore);
      expect(subscriptions).toBe(0);
      expect(removals).toBe(1);
      expect(observeArmies).toHaveBeenCalledTimes(stall ? 1 : 3);
      expect(callbacks.size).toBe(0);
      expect(game).toEqual(before);
    },
  );

  it('rejects invalid counts or existing armies without mutating the input', async () => {
    const input = await buildFullState({ seed: 15600519 });
    expect(() => prepareNationalMapFrameState(input, 41)).toThrow('count');
    const advanced = structuredClone(input);
    advanced.time.day = 1;
    expect(() => prepareNationalMapFrameState(advanced)).toThrow('fresh');
    const commanded = structuredClone(input);
    commanded.meta.lastAppliedCmdSeq = 1;
    expect(() => prepareNationalMapFrameState(commanded)).toThrow('fresh');
    const prepared = prepareNationalMapFrameState(input);
    const before = structuredClone(prepared.game);
    expect(() => prepareNationalMapFrameState(prepared.game)).toThrow('fresh');
    expect(prepared.game).toEqual(before);
  });
});
