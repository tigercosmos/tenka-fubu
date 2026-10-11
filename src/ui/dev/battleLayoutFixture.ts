import type { BattleState, BattleUnit } from '@core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '@core/state/ids';

export type BattleLayoutFixtureKind = 'dense8' | 'full12' | 'crossing8';

/** Presentation data only: this is not a complete, playable or saveable GameState. */
export function createBattleLayoutFixture(kind: BattleLayoutFixtureKind): BattleState {
  const jins: BattleState['jins'] = [];
  for (let col = 1; col <= 3; col++)
    for (let row = 0; row <= 2; row++) {
      jins.push({
        id: `jin.${col}-${row}`,
        col,
        row,
        owner: 'neutral',
        isHonjin: false,
        flagPower: 400,
        flagPowerMax: 400,
        defenseBonus: 0.15,
      });
    }
  const units: BattleUnit[] = [];
  const edges: BattleState['edges'] = [];
  const add = (jinId: string, count: number, target: string | null = null) => {
    for (let index = 0; index < count; index++) {
      const id = `bu.layout-${String(units.length + 1).padStart(2, '0')}`;
      units.push({
        id,
        armyId: `army.layout-${units.length + 1}` as ArmyId,
        generalId: `off.layout-${units.length + 1}` as OfficerId,
        side: index % 2 === 0 ? 'attacker' : 'defender',
        troops: 1200 + units.length * 100,
        battleInitialTroops: 3000,
        morale: 80,
        jinId,
        moveTargetJinId: target,
        moveProgress: target === null ? 0 : 1,
        attackTargetUnitId: null,
        activeTactics: [],
        tacticCooldowns: {},
        delegated: false,
        routed: false,
        exited: false,
        strategyStatus: 'engaged',
      });
    }
  };
  if (kind === 'crossing8') {
    for (const source of ['jin.1-0', 'jin.3-0', 'jin.1-2', 'jin.3-2']) {
      edges.push({ a: source, b: 'jin.2-1', moveCost: 2 });
      add(source, 2, 'jin.2-1');
    }
  } else {
    add('jin.1-1', 4);
    add('jin.2-1', 4);
    if (kind === 'full12') add('jin.3-1', 4);
  }
  return {
    id: 'battle.layout' as BattleId,
    fieldCombatId: 'fc.layout',
    nodeId: 'castle.layout' as MapNodeId,
    terrain: 'plain',
    attackerClanId: 'clan.layout-a' as ClanId,
    defenderClanId: 'clan.layout-b' as ClanId,
    jins,
    edges,
    units,
    tick: 1,
    saihai: { attacker: 30, defender: 30 },
    honjinFallenTick: null,
    result: null,
  };
}
