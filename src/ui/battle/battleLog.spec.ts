import { describe, expect, it } from 'vitest';
import type { BattleTickEvent } from '@app/battleBridge';
import type { TacticId } from '@core/state/ids';
import { buildTinyState } from '../../../tests/fixtures/tiny';
import { createBattleLayoutFixture } from '../dev/battleLayoutFixture';
import {
  appendBattleLogRows,
  battleUnitLabel,
  isBattleLogNearBottom,
  projectBattleLog,
} from './battleLog';

function fixture() {
  const game = buildTinyState();
  const battle = createBattleLayoutFixture('dense8');
  battle.attackerClanId = game.meta.playerClanId;
  const officer = Object.values(game.officers)[0]!;
  battle.units[0]!.generalId = officer.id;
  battle.units[1]!.generalId = officer.id;
  game.battles[battle.id] = battle;
  return { game, battle, officer };
}
describe('transient battle event projection', () => {
  it('localizes every actual event stage with stable keys, without exposing enemy officer names or inferring an attacker', () => {
    const { game, battle, officer } = fixture();
    const unitId = battle.units[0]!.id,
      enemy = battle.units[1]!.id;
    const events: BattleTickEvent[] = [
      { type: 'move.accepted', unitId, targetJinId: 'jin.2-1', sequence: 1 },
      { type: 'attack.accepted', unitId, targetUnitId: enemy, sequence: 2 },
      { type: 'delegation.changed', unitId, enabled: true, sequence: 3 },
      {
        type: 'tactic.accepted',
        unitId,
        tacticId: 'tac.charge' as TacticId,
        targetUnitId: null,
        damageDealt: 0,
        troopsHealed: 0,
        moraleGained: 0,
        sequence: 4,
      },
      {
        type: 'unit.changed',
        unitId: enemy,
        source: 'combat',
        troopsBefore: 1000,
        troopsAfter: 800,
        moraleBefore: 80,
        moraleAfter: 72,
        sequence: 5,
      },
      {
        type: 'unit.arrived',
        unitId,
        fromJinId: 'jin.1-1',
        toJinId: 'jin.2-1',
        reason: 'move',
        sequence: 6,
      },
      { type: 'unit.routed', unitId: enemy, sequence: 7 },
      { type: 'unit.exited', unitId: enemy, sequence: 8 },
      {
        type: 'flag.damaged',
        jinId: 'jin.2-1',
        source: 'occupation',
        amount: 10,
        flagPowerBefore: 400,
        flagPowerAfter: 390,
        sequence: 9,
      },
      {
        type: 'jin.captured',
        jinId: 'jin.2-1',
        ownerBefore: 'neutral',
        ownerAfter: 'attacker',
        flagPower: 200,
        sequence: 10,
      },
      {
        type: 'battle.resolved',
        winnerSide: 'attacker',
        attackerLosses: 200,
        defenderLosses: 900,
        aweLevel: 'large',
        sequence: 11,
      },
    ];
    const before = structuredClone(game);
    const rows = projectBattleLog(game, battle.id, 4, events);
    expect(rows).toHaveLength(11);
    expect(rows.map((row) => row.sequence)).toEqual(events.map((event) => event.sequence));
    expect(new Set(rows.map((row) => row.id)).size).toBe(11);
    expect(rows[0]!.text).toContain(officer.name);
    expect(rows[1]!.text).toContain('指定');
    expect(rows[3]!.text).toContain('發動「突擊」');
    expect(rows[4]!.text).toContain('1,000→800');
    expect(rows[4]!.text).toContain('守方');
    expect(rows[4]!.text).not.toContain(officer.name);
    expect(rows[4]!.text).not.toContain('擊破');
    expect(rows[5]!.text).toContain('抵達');
    expect(rows[6]!.text).toContain('潰走');
    expect(rows[7]!.text).toContain('離開戰場');
    expect(rows[8]!.text).toContain('400→390');
    expect(rows[9]!.text).toContain('中立轉為攻方');
    expect(rows[10]!.text).toContain('威風：大');
    expect(game).toEqual(before);
    expect(battleUnitLabel(game, battle.id, enemy)).toBe(`守方 ${enemy}`);
    expect(battleUnitLabel(game, battle.id, 'bu.missing')).toBe('bu.missing');
  });
  it('does not manufacture idle/zero-effect rows and retains bounded unique append-only identities', () => {
    const { game, battle } = fixture();
    expect(projectBattleLog(game, battle.id, 1, [])).toEqual([]);
    expect(
      projectBattleLog(game, battle.id, 1, [
        {
          type: 'unit.changed',
          unitId: 'bu.missing',
          source: 'tactic',
          troopsBefore: 100,
          troopsAfter: 100,
          moraleBefore: 80,
          moraleAfter: 80,
          sequence: 1,
        },
        {
          type: 'flag.damaged',
          jinId: 'jin.missing',
          source: 'fireArrow',
          amount: 0,
          flagPowerBefore: 400,
          flagPowerAfter: 400,
          sequence: 2,
        },
      ]),
    ).toEqual([]);
    let rows = projectBattleLog(game, battle.id, 1, [
      { type: 'unit.routed', unitId: 'bu.missing', sequence: 1 },
    ]);
    expect(rows[0]!.text).toContain('bu.missing');
    expect(appendBattleLogRows(rows, rows)).toBe(rows);
    expect(appendBattleLogRows(rows, [])).toBe(rows);
    for (let tick = 2; tick <= 80; tick++)
      rows = appendBattleLogRows(
        rows,
        projectBattleLog(game, battle.id, tick, [
          { type: 'unit.routed', unitId: 'bu.missing', sequence: 1 },
        ]),
      );
    expect(rows).toHaveLength(50);
    expect(rows[0]!.tick).toBe(31);
    expect(rows.at(-1)!.tick).toBe(80);
    const batch = projectBattleLog(game, battle.id, 81, [
      { type: 'unit.routed', unitId: 'bu.missing', sequence: 1 },
    ]);
    expect(appendBattleLogRows(rows, batch, 0)).toEqual([]);
    expect(appendBattleLogRows(rows, batch, 0.5)).toEqual([]);
  });
  it('uses an inclusive 32px near-bottom threshold without a clock or DOM dependency', () => {
    expect(isBattleLogNearBottom(1000, 200, 768)).toBe(true);
    expect(isBattleLogNearBottom(1000, 200, 767)).toBe(false);
    expect(isBattleLogNearBottom(100, 200, 0)).toBe(true);
  });
});
