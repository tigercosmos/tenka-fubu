import { describe, expect, it, vi } from 'vitest';
import {
  measureLiveNationalMapFrames,
  type LiveFrameSessionObservation,
} from '../../src/app/liveMapFrameMeasurement';

function fixture() {
  let clock = 1000;
  let ready = true;
  const frames = new Set<(timestamp: number) => void>();
  const changes = new Set<() => void>();
  const state: LiveFrameSessionObservation = {
    day: 120,
    speed: 'x5',
    marchingCount: 40,
    paidLegs: 40,
    cohortCount: 40,
    gameIdentityMatches: true,
    workloadActive: true,
    rendererIdentityMatches: true,
    visible: true,
    blockingReasons: [],
    failure: null,
  };
  const sample = vi.fn(() => state);
  const renderer = {
    isReady: () => ready,
    getArmyRenderObservation: vi.fn(() => ({ mounted: 40, cullVisibleArmyChips: 38 })),
    getDiagnostics: vi.fn(() => ({
      lodStage: 'far' as const,
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
        ownedSeaTextures: 0 as const,
        ownedSeaSources: 0 as const,
        seaRgbaBytes: 0,
        ownedCoastTextures: 0 as const,
        ownedCoastSources: 0 as const,
        ownedCoastGeometries: 0 as const,
        ownedElevatedMeshes: 0 as const,
        ownedElevatedGeometries: 0 as const,
        ownedElevatedBuffers: 0 as const,
        ownedElevatedShaders: 0 as const,
        ownedElevatedPrograms: 0 as const,
        elevatedBufferBytes: 0 as const,
        ownedCanopyMeshes: 0 as const,
        ownedCanopyGeometries: 0 as const,
        ownedCanopyBuffers: 0 as const,
        canopyBufferBytes: 0 as const,
        ownedFoothillMeshes: 0 as const,
        ownedFoothillGeometries: 0 as const,
        ownedFoothillBuffers: 0 as const,
        ownedFoothillShaders: 0 as const,
        ownedFoothillPrograms: 0 as const,
        foothillBufferBytes: 0 as const,
        coastRgbaBytes: 0,
        coastGeometryBytes: 0,
        ownedMountainShadeTextures: 0,
        ownedMountainShadeSources: 0,
        mountainShadeRgbaBytes: 0,
        sharedTerrainSprites: 2,
        eventListeners: 9 + frames.size,
      },
    })),
    subscribeRenderedFrames(listener: (timestamp: number) => void) {
      frames.add(listener);
      return () => {
        frames.delete(listener);
      };
    },
  };
  const options = {
    renderer,
    sample,
    durationMs: 1000,
    now: () => clock,
    subscribeSessionChanges(listener: () => void) {
      changes.add(listener);
      return () => {
        changes.delete(listener);
      };
    },
  };
  const render = (at: number) => {
    clock = at;
    for (const callback of frames) callback(at);
  };
  const change = (at: number) => {
    clock = at;
    for (const callback of changes) callback();
  };
  return {
    state,
    frames,
    changes,
    options,
    renderer,
    render,
    change,
    setClock: (at: number) => {
      clock = at;
    },
    setReady: (value: boolean) => {
      ready = value;
    },
  };
}

describe('ordinary live national postrender observation', () => {
  it.each([120, 119, 40])(
    'requires the full requested120 cohort, observing %i mounted armies',
    async (mounted) => {
      const f = fixture();
      Object.assign(f.state, { cohortCount: 120, marchingCount: 120, paidLegs: 120 });
      f.renderer.getArmyRenderObservation.mockReturnValue({
        mounted,
        cullVisibleArmyChips: mounted,
      });
      const result = await measureLiveNationalMapFrames({
        ...f.options,
        cohortCount: 120,
        wait: async () => {
          await Promise.resolve();
          f.render(1100);
          f.state.day++;
          f.render(1200);
          f.setClock(2000);
        },
      });
      expect(result.valid).toBe(mounted === 120);
      expect(result.minMarching).toBe(120);
      if (mounted !== 120)
        expect(result.observationErrors).toContain('120 cohort army parts were not mounted');
    },
  );

  it('uses completed renders over the entire wall window, not the short unstalled interval', async () => {
    const f = fixture();
    const before = structuredClone(f.state);
    const result = await measureLiveNationalMapFrames({
      ...f.options,
      wait: async () => {
        await Promise.resolve();
        f.render(1100);
        f.state.day++;
        f.state.paidLegs = 0;
        f.render(1200);
        f.setClock(2000); // Renderer stalls; the tail remains in the FPS denominator.
      },
    });
    expect(result.valid).toBe(true); // Workload validity is distinct from the FPS budget.
    expect(result.frameTimesMs).toEqual([100]);
    expect(result.completedFrames).toBe(2);
    expect(result.averageFps).toBe(2);
    expect(result.slowFrameFps).toBe(10);
    expect(result.headGapMs).toBe(100);
    expect(result.tailGapMs).toBe(800);
    expect(result.actualDayDelta).toBe(1);
    expect(result.minPaidLegs).toBe(0);
    expect(result.maxPaidLegs).toBe(40);
    expect(result.minMarching).toBe(40);
    expect(result.resourcesAfter).toEqual(result.resourcesBefore);
    expect(f.frames.size).toBe(0);
    expect(f.changes.size).toBe(0);
    expect(f.state).toEqual({ ...before, day: 121, paidLegs: 0 });
  });

  it.each([
    ['speed', 'paused'],
    ['speed', 'x1'],
    ['gameIdentityMatches', false],
    ['rendererIdentityMatches', false],
    ['workloadActive', false],
    ['visible', false],
    ['marchingCount', 39],
    ['cohortCount', 41],
    ['failure', 'driver rejected'],
    ['blockingReasons', ['modal']],
    ['blockingReasons', ['viewport']],
  ] as const)(
    'retains %s interruption between renders, even after recovery',
    async (key, value) => {
      const f = fixture();
      const before = structuredClone(f.state);
      const result = await measureLiveNationalMapFrames({
        ...f.options,
        wait: async () => {
          await Promise.resolve();
          f.render(1100);
          Object.assign(f.state, { [key]: value });
          f.change(1150);
          Object.assign(f.state, before, { day: 121 });
          f.render(1200);
          f.setClock(2000);
        },
      });
      expect(result.valid).toBe(false);
      expect(result.interruptions.some((entry) => entry.timestamp === 1150)).toBe(true);
      expect(result.sessionSamples.some((entry) => entry.trigger === 'change')).toBe(true);
      expect(f.frames.size).toBe(0);
      expect(f.changes.size).toBe(0);
    },
  );

  it('never fabricates a first interval or claims a static core as live progression', async () => {
    const f = fixture();
    const result = await measureLiveNationalMapFrames({
      ...f.options,
      wait: async () => {
        await Promise.resolve();
        f.render(1100);
        f.setClock(2000);
      },
    });
    expect(result.valid).toBe(false);
    expect(result.frameTimesMs).toEqual([]);
    expect(result.observationErrors).toContain('No actual strategy progression');
    expect(result.observationErrors).toContain('No actual postrender intervals');
  });

  it.each(['sample', 'army', 'diagnostics', 'wait', 'removed', 'nonmonotonic'] as const)(
    'preserves %s observer failure and disposes only its own listeners',
    async (stage) => {
      const f = fixture();
      const unrelatedFrame = vi.fn();
      const unrelatedChange = vi.fn();
      f.frames.add(unrelatedFrame);
      f.changes.add(unrelatedChange);
      let samples = 0;
      const result = await measureLiveNationalMapFrames({
        ...f.options,
        sample: () => {
          if (++samples === 2 && stage === 'sample') throw new Error('sample fault');
          return f.state;
        },
        wait: async () => {
          await Promise.resolve();
          if (stage === 'army')
            f.renderer.getArmyRenderObservation.mockImplementation(() => {
              throw new Error('army fault');
            });
          if (stage === 'removed') f.setReady(false);
          f.render(1100);
          f.state.day++;
          f.render(stage === 'nonmonotonic' ? 1050 : 1200);
          f.setClock(2000);
          if (stage === 'diagnostics')
            f.renderer.getDiagnostics.mockImplementation(() => {
              throw new Error('diagnostics fault');
            });
          if (stage === 'wait') throw new Error('cancelled wait');
        },
      });
      expect(result.valid).toBe(false);
      expect(result.observationErrors.length + result.interruptions.length).toBeGreaterThan(0);
      expect([...f.frames]).toEqual([unrelatedFrame]);
      expect([...f.changes]).toEqual([unrelatedChange]);
    },
  );

  it('rejects invalid durations before registering any observer', async () => {
    const f = fixture();
    for (const durationMs of [0, 999, 60001, NaN, Infinity])
      await expect(measureLiveNationalMapFrames({ ...f.options, durationMs })).rejects.toThrow(
        'duration',
      );
    expect(f.frames.size).toBe(0);
    expect(f.changes.size).toBe(0);
  });

  it('rejects fast rendering that omits the marching cohort', async () => {
    const f = fixture();
    f.renderer.getArmyRenderObservation.mockReturnValue({ mounted: 0, cullVisibleArmyChips: 0 });
    const result = await measureLiveNationalMapFrames({
      ...f.options,
      wait: async () => {
        await Promise.resolve();
        f.render(1100);
        f.state.day++;
        f.render(1200);
        f.setClock(2000);
      },
    });
    expect(result.valid).toBe(false);
    expect(result.observationErrors).toContain('Forty cohort army parts were not mounted');
  });

  it('releases owned subscriptions even when the terminal clock throws', async () => {
    const f = fixture();
    let terminal = false;
    const result = await measureLiveNationalMapFrames({
      ...f.options,
      now: () => {
        if (terminal) throw new Error('terminal clock fault');
        return 1000;
      },
      wait: async () => {
        await Promise.resolve();
        f.render(1100);
        f.state.day++;
        f.render(1200);
        terminal = true;
      },
    });
    expect(result.valid).toBe(false);
    expect(result.observationErrors).toContain('terminal clock fault');
    expect(f.frames.size).toBe(0);
    expect(f.changes.size).toBe(0);
  });
});
