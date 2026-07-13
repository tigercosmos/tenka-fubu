import { advanceDay } from '../../src/core/systems';
import type { CommandEnvelope } from '../../src/core/commands/types';
import { balanceHash, stateHash } from '../../src/core/state/serialize';
import { TESTCFG } from '../config';
import {
  buildMiniState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CASTLE_B2,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_BETA_LORD,
} from '../fixtures/mini';

export interface GoldenSnapshotFile {
  formatVersion: 1;
  scenarioId: string;
  seed: number;
  ticks: number;
  checkpoints: Array<{ day: number; hash: string }>;
  balanceHash: string;
}

/**
 * M4 階段 AI 尚未落地（M7），故以固定指令取代無效的 `allAi:true`：
 * 強勢 alpha 與弱勢 beta 對向出陣，確保 golden 走過行軍／遭遇／野戰與後續任務。
 */
function m4GoldenCommands(tick: number, issuedDay: number): CommandEnvelope[] {
  if (tick !== 1) return [];
  return [
    {
      seq: 1,
      issuedDay,
      command: {
        type: 'march',
        clanId: CLAN_ALPHA,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_LORD,
        deputyIds: [],
        soldiers: 1_000,
        food: 1_200,
        targetNodeId: CASTLE_B2,
      },
    },
    {
      seq: 2,
      issuedDay,
      command: {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_B1,
        leaderId: OFF_BETA_LORD,
        deputyIds: [],
        soldiers: 500,
        food: 600,
        targetNodeId: CASTLE_A2,
      },
    },
  ];
}

export function runGoldenMini(): GoldenSnapshotFile {
  const seed = TESTCFG.goldenSeedMini;
  const ticks = TESTCFG.goldenYearsMini * 360;
  const state = buildMiniState({ seed });
  const checkpoints: GoldenSnapshotFile['checkpoints'] = [];

  for (let tick = 1; tick <= ticks; tick += 1) {
    const queue = m4GoldenCommands(tick, state.time.day);
    const result = advanceDay(state, queue);
    if (result.appliedCommands.length !== queue.length) {
      throw new Error(
        `golden-mini 第 ${String(tick)} tick 的固定 M4 指令遭拒絕：期望 ${String(queue.length)} 實得 ${String(result.appliedCommands.length)}`,
      );
    }
    if (tick % 360 === 0) {
      checkpoints.push({ day: tick, hash: stateHash(state) });
    }
  }

  return {
    formatVersion: 1,
    scenarioId: 'mini',
    seed,
    ticks,
    checkpoints,
    balanceHash: balanceHash(),
  };
}
