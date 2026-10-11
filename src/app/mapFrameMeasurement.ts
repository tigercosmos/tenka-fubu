import { BAL } from '@core/balance';
import { CommandQueue, applyCommands } from '@core/commands/queue';
import { validateCommand } from '@core/commands/validate';
import type { CommandEnvelope, CmdMarch } from '@core/commands/types';
import type { ExecutionAuthority } from '@core/commands/authority';
import { REGION_VALUES } from '@core/state/enums';
import type { GameState } from '@core/state/gameState';
import { validateState } from '@core/state/invariants';
import type { GameEvent } from '@core/state/events';
import { selectMapViewModel } from '@core/state/selectors';
import { composeMapViewState } from '@ui/map/composeMapView';
import type { MapRenderer } from '@ui/map/MapRenderer';

/** Debug prerequisite only: no strategy days, resource grants or fabricated armies. */
export function prepareNationalMapFrameState(input: Readonly<GameState>, count = 40) {
  if (!Number.isInteger(count) || count < 1 || count > 40)
    throw new Error('National map fixture army count must be1..40');
  if (
    input.meta.scenarioId !== 's1560' ||
    input.time.day !== 0 ||
    input.meta.lastAppliedCmdSeq !== 0 ||
    input.ai.pendingOrders.length !== 0 ||
    Object.keys(input.armies).length !== 0
  )
    throw new Error('National map fixture requires a fresh s1560 state without armies');
  const regions = new Set(Object.values(input.provinces).map((province) => province.region));
  if (REGION_VALUES.some((region) => !regions.has(region)))
    throw new Error('National map fixture requires all nine production regions');
  if (validateState(input).length) throw new Error('Invalid national map input');
  const game = structuredClone(input) as GameState;
  const queue = new CommandQueue(game.meta.lastAppliedCmdSeq + 1);
  const commands: CommandEnvelope[] = [];
  const events: GameEvent[] = [];
  const buckets = [...REGION_VALUES].sort().map((region) =>
    Object.values(game.castles)
      .filter((castle) => game.provinces[castle.provinceId]?.region === region)
      .map((castle) => castle.id)
      .sort(),
  );
  const sourceIds = Array.from({
    length: Math.max(...buckets.map((bucket) => bucket.length)),
  }).flatMap((_, index) => buckets.flatMap((bucket) => (bucket[index] ? [bucket[index]] : [])));
  // One army per source ensures distinct first-leg stacks, without changing any roads.
  for (const sourceId of sourceIds) {
    const source = game.castles[sourceId]!;
    const authority: ExecutionAuthority =
      source.ownerClanId === game.meta.playerClanId
        ? { kind: 'player' }
        : { kind: 'clan', clanId: source.ownerClanId };
    const soldiers = BAL.minMarchTroops;
    const food = Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.maxCarryDays);
    const officers = Object.values(game.officers)
      .filter((officer) => officer.locationCastleId === sourceId)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    let accepted = false;
    for (const targetNodeId of [...source.districtIds].sort()) {
      if (game.districts[targetNodeId]?.ownerClanId !== source.ownerClanId) continue;
      for (const officer of officers) {
        const command: CmdMarch = {
          type: 'march',
          clanId: source.ownerClanId,
          originCastleId: source.id,
          leaderId: officer.id,
          deputyIds: [],
          soldiers,
          food,
          targetNodeId,
        };
        if (!validateCommand(game, command, authority).ok) continue;
        queue.enqueue(command, game.time.day, authority);
        const submitted = queue.drain();
        const applied = applyCommands(game, submitted, (event) => events.push(event));
        if (applied.length !== 1) throw new Error('Validated national fixture march was rejected');
        commands.push(...submitted);
        accepted = true;
        break;
      }
      if (accepted) break;
    }
    if (commands.length === count) break;
  }
  if (commands.length !== count)
    throw new Error(`National fixture could only create${commands.length}/${count} armies`);
  const violations = validateState(game);
  if (violations.length)
    throw new Error(`National fixture invariants: ${JSON.stringify(violations)}`);
  const armyRegions = Object.values(game.armies).map((army) => ({
    armyId: army.id,
    region: game.provinces[game.castles[army.originCastleId]!.provinceId]!.region,
  }));
  if (count >= REGION_VALUES.length && new Set(armyRegions.map((army) => army.region)).size !== 9)
    throw new Error('National fixture could not place armies in all nine regions');
  return { game, commands, events, armyRegions };
}

type FrameDiagnostics = ReturnType<MapRenderer['getDiagnostics']>;
export interface MapFrameMeasurementRenderer {
  updateView: MapRenderer['updateView'];
  setCameraPose: MapRenderer['setCameraPose'];
  getDiagnostics(): FrameDiagnostics;
  isReady(): boolean;
  getArmyRenderObservation(): ReturnType<MapRenderer['getArmyRenderObservation']>;
  subscribeRenderedFrames(listener: (timestamp: number) => void): () => void;
}

/** Actual postrender cadence, not scheduler rAF cadence or GPU presentation latency. */
export async function measureNationalMapFrames(
  game: Readonly<GameState>,
  renderer: MapFrameMeasurementRenderer,
  pose: { center: { x: number; y: number }; scale: number },
  durationMs = 30_000,
) {
  if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 60_000)
    throw new Error('Frame measurement duration must be between1000 and60000 ms');
  const base = composeMapViewState(selectMapViewModel(game), null, game.meta.playerClanId);
  if (
    (base.armies.length !== 40 && base.armies.length !== 120) ||
    base.armies.some(
      (army) => army.status !== 'marching' || army.toNode === null || army.fromNode === army.toNode,
    )
  )
    throw new Error('National frame measurement requires40 or120 canonical moving armies');
  const before = renderer.getDiagnostics();
  const frameTimesMs: number[] = [];
  let previous: number | null = null;
  let firstPostrenderTimestamp: number | null = null;
  let completedFrames = 0;
  const observationErrors: Error[] = [];
  let minVisibleArmies = Number.POSITIVE_INFINITY;
  let maxVisibleArmies = 0;
  let minMountedArmies = Number.POSITIVE_INFINITY;
  let requestId: number | null = null;
  let lastArmySample = Number.NEGATIVE_INFINITY;
  const started = performance.now();
  const dispose = renderer.subscribeRenderedFrames((timestamp) => {
    if (!Number.isFinite(timestamp) || (previous !== null && timestamp <= previous)) return;
    firstPostrenderTimestamp ??= timestamp;
    completedFrames++;
    if (previous !== null) frameTimesMs.push(timestamp - previous);
    previous = timestamp;
    if (timestamp - lastArmySample < 250) return;
    lastArmySample = timestamp;
    let armies: ReturnType<MapRenderer['getArmyRenderObservation']>;
    try {
      armies = renderer.getArmyRenderObservation();
    } catch (error) {
      observationErrors.push(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    minVisibleArmies = Math.min(minVisibleArmies, armies.cullVisibleArmyChips);
    maxVisibleArmies = Math.max(maxVisibleArmies, armies.cullVisibleArmyChips);
    minMountedArmies = Math.min(minMountedArmies, armies.mounted);
  });
  try {
    await new Promise<void>((resolve, reject) => {
      const frame = (now: number) => {
        try {
          if (!renderer.isReady()) throw new Error('Map disposed during measurement');
          const elapsed = now - started;
          // Only view fractions change: IDs, units, endpoints and all core/RNG state stay real and unchanged.
          renderer.updateView({
            ...base,
            armies: base.armies.map((army, index) => ({
              ...army,
              edgeT: 0.05 + ((elapsed / 10_000 + index / base.armies.length) % 1) * 0.9,
            })),
          });
          renderer.setCameraPose(
            {
              x: pose.center.x + Math.sin(elapsed / 2000) * 60,
              y: pose.center.y + Math.cos(elapsed / 2000) * 40,
            },
            pose.scale,
          );
          if (elapsed >= durationMs) resolve();
          else requestId = requestAnimationFrame(frame);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      };
      requestId = requestAnimationFrame(frame);
    });
    if (observationErrors.length) throw observationErrors[0]!;
    if (!frameTimesMs.length) throw new Error('No actual rendered frame intervals observed');
    dispose();
    const ordered = [...frameTimesMs].sort((a, b) => a - b);
    const frameTimeP95 = ordered[Math.ceil(ordered.length * 0.95) - 1]!;
    const ended = performance.now();
    return {
      scope: 'canonical-armies/render-only-paused-prerequisite' as const,
      durationMs: ended - started,
      armyCount: base.armies.length,
      frames: frameTimesMs.length,
      completedFrames,
      averageFps: (1000 * completedFrames) / (ended - started),
      firstPostrenderTimestamp,
      lastPostrenderTimestamp: previous,
      headGapMs: firstPostrenderTimestamp! - started,
      tailGapMs: ended - previous!,
      slowFrameFps: 1000 / frameTimeP95,
      frameTimeP95,
      frameTimesMs,
      minVisibleArmies,
      maxVisibleArmies,
      minMountedArmies,
      visibilityMetric: 'renderer-cull-visible-chips/not-GPU-presented-pixels' as const,
      armyRegions: Object.values(game.armies).map((army) => ({
        armyId: army.id,
        region: game.provinces[game.castles[army.originCastleId]!.provinceId]!.region,
      })),
      resourcesBefore: before.resources,
      resourcesAfter: renderer.getDiagnostics().resources,
      geography: {
        regions: [
          ...new Set(Object.values(game.provinces).map((province) => province.region)),
        ].sort(),
        castles: Object.keys(game.castles).length,
        districts: Object.keys(game.districts).length,
        roads: Object.keys(game.roads).length,
      },
      lodStage: renderer.getDiagnostics().lodStage,
    };
  } finally {
    if (requestId !== null) cancelAnimationFrame(requestId);
    dispose();
    renderer.updateView(base);
    renderer.setCameraPose(pose.center, pose.scale);
  }
}
