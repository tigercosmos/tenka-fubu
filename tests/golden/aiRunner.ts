import { advanceDay } from '../../src/core/systems';
import { CommandQueue, enqueuePendingAiOrders } from '../../src/core/commands/queue';
import { validateState } from '../../src/core/state/invariants';
import { balanceHash, stateHash } from '../../src/core/state/serialize';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import { buildMiniState } from '../fixtures/mini';
import { TESTCFG } from '../config';

export interface AiGoldenSnapshot {
  formatVersion: 1;
  scenarioId: string;
  seed: number;
  ticks: number;
  balanceHash: string;
  checkpoints: Array<{ day: number; hash: string }>;
  appliedCommands: Record<string, number>;
  eventCounts: Record<string, number>;
  intentCounts: Record<string, number>;
}

/** Real autonomous AI, ordinary next-tick trusted orders, no scripted player commands. */
export function runAiGolden(reloadMidpoint = false): AiGoldenSnapshot {
  const seed = TESTCFG.goldenSeedMini,
    ticks = 360;
  let state = buildMiniState({ seed, allAi: true });
  const startDay = state.time.day,
    queue = new CommandQueue();
  const checkpoints: AiGoldenSnapshot['checkpoints'] = [],
    appliedCommands: Record<string, number> = {},
    eventCounts: Record<string, number> = {},
    intentCounts: Record<string, number> = {};
  for (let tick = 1; tick <= ticks; tick++) {
    enqueuePendingAiOrders(state, queue);
    const result = advanceDay(state, queue.drain());
    for (const envelope of result.appliedCommands)
      appliedCommands[envelope.command.type] = (appliedCommands[envelope.command.type] ?? 0) + 1;
    for (const event of result.events) eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    for (const intent of state.ai.intentLog.filter((i) => i.day === state.time.day)) {
      intentCounts[intent.kind] = (intentCounts[intent.kind] ?? 0) + 1;
      if (intent.kind === 'error.invalidCommand')
        throw new Error(`AI golden tick ${tick}: ${JSON.stringify(intent)}`);
    }
    const violations = validateState(state);
    if (violations.length) throw new Error(`AI golden tick ${tick}: ${JSON.stringify(violations)}`);
    if (state.time.day !== startDay + tick || state.meta.gameOver !== null)
      throw new Error(`AI golden stopped autonomous simulation at tick ${tick}`);
    if (Object.keys(state.battles).length)
      throw new Error(`AI-only golden opened a tactical battle at tick ${tick}`);
    if (tick % 30 === 0) checkpoints.push({ day: tick, hash: stateHash(state) });
    if (reloadMidpoint && tick === 180) {
      const hash = stateHash(state),
        decoded = decodeSave(encodeSave(state, 0));
      if (!decoded.ok) throw new Error('AI golden midpoint save rejected');
      state = decoded.saveFile.state;
      if (stateHash(state) !== hash)
        throw new Error('AI golden midpoint save changed canonical state');
    }
  }
  if (!Object.keys(appliedCommands).length)
    throw new Error('AI golden never applied autonomous commands');
  return {
    formatVersion: 1,
    scenarioId: 'mini-ai',
    seed,
    ticks,
    balanceHash: balanceHash(),
    checkpoints,
    appliedCommands,
    eventCounts,
    intentCounts,
  };
}
