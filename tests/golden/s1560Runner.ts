import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import { balanceHash, stateHash } from '../../src/core/state/serialize';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { loadS1560EventCatalog, S1560_LOADED_REGIONS } from '../../src/data/scenarios/s1560';
import { REGION_VALUES } from '../../src/core/state/enums';
import { buildFullState } from '../helpers/fullState';
import { TESTCFG } from '../config';
import type { GoldenSnapshotFile } from './goldenRunner';

/** The production national world, actual autonomous orders and canonical event catalog. */
export async function runS1560Golden(
  reloadMidpoint = false,
  years: 5 | 10 = TESTCFG.goldenYearsFull,
): Promise<GoldenSnapshotFile> {
  if (JSON.stringify(S1560_LOADED_REGIONS) !== JSON.stringify(REGION_VALUES))
    throw new Error('s1560 national golden requires all nine production regions');
  const seed = TESTCFG.goldenSeedFull;
  const ticks = years * 360;
  let state = await buildFullState({ seed, allAi: true });
  let engine = createRuntimeEventEngine(loadS1560EventCatalog());
  let queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const startDay = state.time.day;
  const checkpoints: GoldenSnapshotFile['checkpoints'] = [];
  let appliedCommands = 0;
  for (let tick = 1; tick <= ticks; tick++) {
    enqueuePendingAiOrders(state, queue);
    const result = advanceDay(state, queue.drain(), { eventEngine: engine });
    const rejects = result.events.filter((event) => event.type === 'command.rejected');
    const invalid = state.ai.intentLog.filter(
      (intent) => intent.day === state.time.day && intent.kind === 'error.invalidCommand',
    );
    const violations = validateState(state);
    if (rejects.length || invalid.length || violations.length)
      throw new Error(
        `s1560 golden seed=${seed} tick=${tick} day=${state.time.day}: ${JSON.stringify({
          rejects,
          invalid,
          violations,
        })}`,
      );
    if (state.time.day !== startDay + tick)
      throw new Error(`s1560 golden did not advance exactly one day at tick${tick}`);
    appliedCommands += result.appliedCommands.length;
    if (tick % 360 === 0) checkpoints.push({ day: tick, hash: stateHash(state) });
    if (reloadMidpoint && tick === ticks / 2) {
      const hash = stateHash(state);
      const decoded = decodeSave(encodeSave(state, 0));
      if (!decoded.ok) throw new Error(`s1560 midpoint save rejected: ${decoded.code}`);
      state = decoded.saveFile.state;
      if (stateHash(state) !== hash)
        throw new Error('s1560 midpoint codec changed canonical state');
      queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
      engine = createRuntimeEventEngine(loadS1560EventCatalog());
    }
  }
  if (!appliedCommands) throw new Error('s1560 golden applied no autonomous commands');
  return {
    formatVersion: 1,
    scenarioId: 's1560',
    seed,
    ticks,
    checkpoints,
    balanceHash: balanceHash(),
  };
}
