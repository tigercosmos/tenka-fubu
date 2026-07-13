import { CoreError } from './errors';
import { BAL } from './balance';
import { applyMarch } from './commands/march';
import type { GameState } from './state/gameState';
import type { ArmyId, BattleId, CastleId, ClanId, MapNodeId, OfficerId } from './state/ids';
import { applyStartKassen } from './systems/battle';
import { startFieldCombat } from './systems/fieldCombat';

export const DEBUG_BATTLE_LAYOUT_ID = 'debug-battle-01' as const;

interface DebugArmySpec {
  clanId: ClanId;
  originCastleId: CastleId;
  leaderId: OfficerId;
  soldiers: number;
}

const DEBUG_NODE_ID = 'castle.a2' as MapNodeId;
const DEBUG_ARMIES: readonly DebugArmySpec[] = [
  {
    clanId: 'clan.alpha' as ClanId,
    originCastleId: 'castle.a1' as CastleId,
    leaderId: 'off.alpha-lord' as OfficerId,
    soldiers: 1_100,
  },
  {
    clanId: 'clan.alpha' as ClanId,
    originCastleId: 'castle.a1' as CastleId,
    leaderId: 'off.alpha-busho' as OfficerId,
    soldiers: 500,
  },
  {
    clanId: 'clan.beta' as ClanId,
    originCastleId: 'castle.b1' as CastleId,
    leaderId: 'off.beta-lord' as OfficerId,
    soldiers: 1_100,
  },
  {
    clanId: 'clan.beta' as ClanId,
    originCastleId: 'castle.b1' as CastleId,
    leaderId: 'off.beta-busho' as OfficerId,
    soldiers: 500,
  },
];

function deployDebugArmy(state: GameState, spec: DebugArmySpec): ArmyId {
  const before = new Set(Object.keys(state.armies));
  applyMarch(
    state,
    {
      type: 'march',
      clanId: spec.clanId,
      originCastleId: spec.originCastleId,
      leaderId: spec.leaderId,
      deputyIds: [],
      soldiers: spec.soldiers,
      food: Math.ceil(spec.soldiers * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays),
      targetNodeId: DEBUG_NODE_ID,
    },
    () => undefined,
  );
  const armyId = Object.keys(state.armies).find((candidate) => !before.has(candidate)) as
    ArmyId | undefined;
  if (armyId === undefined) {
    throw new CoreError('DATA_INTEGRITY', '除錯合戰部隊建立失敗');
  }
  const army = state.armies[armyId]!;
  army.posNodeId = DEBUG_NODE_ID;
  army.targetNodeId = DEBUG_NODE_ID;
  army.path = [DEBUG_NODE_ID];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  return armyId;
}

/** 建立 P5 的固定 seed-42、雙方各兩部隊合戰；呼叫端負責提供全新的 tiny debug state。 */
export function startDebugBattle(state: GameState, layoutId: string): BattleId {
  if (!state.meta.debugMode) {
    throw new CoreError('INVALID_COMMAND_SHAPE', '僅除錯模式可載入合戰佈局');
  }
  if (layoutId !== DEBUG_BATTLE_LAYOUT_ID) {
    throw new CoreError('INVALID_COMMAND_SHAPE', `未知的除錯合戰佈局：${layoutId}`);
  }
  if (Object.keys(state.armies).length > 0 || Object.keys(state.battles).length > 0) {
    throw new CoreError('INVALID_COMMAND_SHAPE', '除錯合戰佈局只可載入至全新遊戲狀態');
  }

  const armyIds = DEBUG_ARMIES.map((spec) => deployDebugArmy(state, spec));
  const firstSide = armyIds.slice(0, 2);
  const secondSide = armyIds.slice(2);
  startFieldCombat(state, DEBUG_NODE_ID, firstSide, secondSide);
  const combat = Object.values(state.fieldCombats).find(
    (candidate) => candidate.nodeId === DEBUG_NODE_ID,
  );
  if (combat === undefined) {
    throw new CoreError('DATA_INTEGRITY', '除錯合戰野戰建立失敗');
  }
  applyStartKassen(
    state,
    {
      type: 'startKassen',
      clanId: state.meta.playerClanId,
      fieldCombatId: combat.id,
    },
    () => undefined,
  );
  const battle = Object.values(state.battles).find(
    (candidate) => candidate.fieldCombatId === combat.id,
  );
  if (battle === undefined) {
    throw new CoreError('DATA_INTEGRITY', '除錯合戰戰場建立失敗');
  }
  return battle.id;
}

/** P5 專用：僅 debugMode 可無戰後獎懲中止內建合戰，產品合戰不可走此捷徑。 */
export function abortDebugBattle(state: GameState, battleId: BattleId): void {
  if (!state.meta.debugMode) {
    throw new CoreError('INVALID_COMMAND_SHAPE', '僅除錯模式可中止合戰');
  }
  const battle = state.battles[battleId];
  if (battle === undefined) return;
  for (const unit of battle.units) {
    const army = state.armies[unit.armyId];
    if (army === undefined) continue;
    army.battleId = null;
    if (army.status === 'engaged') army.status = 'holding';
  }
  const fieldCombat = state.fieldCombats[battle.fieldCombatId];
  if (fieldCombat !== undefined) {
    delete state.fieldCombats[fieldCombat.id];
  }
  delete state.battles[battleId];
}
