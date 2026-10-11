import { describe, expect, it } from 'vitest';
import {
  applyScalarEffects,
  isScalarEffectOp,
  SCALAR_EFFECT_OPS,
  type ScalarEffectOp,
} from '../../src/core/systems/events/scalarEffects';
import { BAL } from '../../src/core/balance';
import { castleFoodCap, castleMaxSoldiers } from '../../src/core/domestic';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import type { GameEvent } from '../../src/core/state/events';
import type { EffectOp } from '../../src/core/systems/events/types';
import type { CastleId, ClanId, OfficerId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  DIST_B1X,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
} from '../fixtures/tiny';

const binding = { clanId: CLAN_ALPHA, castleId: CASTLE_A1, districtId: DIST_A1X };
const operations: ScalarEffectOp[] = [
  { op: 'addGold', clanId: '$clan', amount: 10 },
  { op: 'addFood', castleId: '$castle', amount: 10 },
  { op: 'addSoldiers', castleId: '$castle', amount: 10 },
  { op: 'loseCastleSoldiersPct', castleId: '$castle', pct: 10 },
  { op: 'reduceClanSoldiersPct', clanId: '$clan', pct: 10 },
  { op: 'addPrestige', clanId: '$clan', amount: 10 },
  { op: 'addLoyalty', officerId: OFF_ALPHA_BUSHO, amount: 10 },
  { op: 'addClanLoyalty', clanId: '$clan', amount: 10 },
  { op: 'addMerit', officerId: OFF_ALPHA_BUSHO, amount: 10 },
  { op: 'renameOfficer', officerId: OFF_ALPHA_BUSHO, name: '新家臣' },
  { op: 'addSentiment', from: '$clan', to: CLAN_BETA, amount: -10 },
  { op: 'addTrust', from: '$clan', to: CLAN_BETA, amount: 10 },
  { op: 'renameCastle', castleId: '$castle', name: '新城' },
  { op: 'renameClan', clanId: '$clan', name: '新家' },
  { op: 'addCastleMorale', castleId: '$castle', amount: 10 },
  { op: 'addClanCastlesMorale', clanId: '$clan', amount: -10 },
  { op: 'addCastleDurability', castleId: '$castle', amount: 10 },
  { op: 'scaleCastleDurability', castleId: '$castle', pct: 10 },
  { op: 'addDistrictOrder', districtId: '$district', amount: 10 },
  { op: 'addClanOrder', clanId: '$clan', amount: -10 },
  { op: 'scalePopulation', districtId: '$district', pct: 10 },
  { op: 'addCourtFavor', clanId: '$clan', amount: 10 },
  { op: 'endShogunate' },
  { op: 'setFlag', key: 'event.scalar.test', value: 1 },
];

describe('M8 explicitly partial scalar event effects', () => {
  it('prototype-like flag keys stay own mutable JSON fields without prototype mutation', () => {
    const state = buildTinyState();
    const prototype: unknown = Object.getPrototypeOf(state.events.flags);
    applyScalarEffects(
      state,
      [
        { op: 'setFlag', key: '__proto__', value: 1 },
        { op: 'setFlag', key: 'constructor', value: 2 },
        { op: 'setFlag', key: 'toString', value: 3 },
      ],
      null,
      () => {},
    );
    for (const [key, value] of [
      ['__proto__', 1],
      ['constructor', 2],
      ['toString', 3],
    ] as const) {
      expect(Object.hasOwn(state.events.flags, key)).toBe(true);
      expect(state.events.flags[key]).toBe(value);
      expect(Object.getOwnPropertyDescriptor(state.events.flags, key)).toEqual({
        value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
    expect(Object.getPrototypeOf(state.events.flags)).toBe(prototype);
    const restored = JSON.parse(JSON.stringify(state.events.flags)) as Record<string, number>;
    expect(Object.getPrototypeOf(restored)).toBe(Object.prototype);
    expect(restored).toEqual(state.events.flags);
    expect(restored.__proto__).toBe(1);
    applyScalarEffects(state, [{ op: 'setFlag', key: '__proto__', value: 4 }], null, () => {});
    expect(state.events.flags.__proto__).toBe(4);
    expect(validateState(state)).toEqual([]);
  });
  it.each(operations)('applies $op without RNG consumption and preserves invariants', (op) => {
    const state = buildTinyState();
    const rng = structuredClone(state.rng);
    const events: GameEvent[] = [];
    applyScalarEffects(state, [op], binding, (event) => events.push(event));
    expect(state.rng).toEqual(rng);
    expect(validateState(state)).toEqual([]);
    if (op.op !== 'endShogunate') expect(events).toEqual([]);
  });
  it('has precisely24 scalar operations and excludes all9 lifecycle/war/title operations', () => {
    expect(new Set(operations.map((op) => op.op))).toEqual(new Set(SCALAR_EFFECT_OPS));
    expect(SCALAR_EFFECT_OPS).toHaveLength(24);
    for (const op of operations) expect(isScalarEffectOp(op)).toBe(true);
    const lifecycle: EffectOp[] = [
      { op: 'transferOfficer', officerId: OFF_ALPHA_BUSHO, toClanId: CLAN_BETA },
      { op: 'makeRonin', officerId: OFF_ALPHA_BUSHO },
      { op: 'killOfficer', officerId: OFF_ALPHA_BUSHO, cause: 'age' },
      { op: 'transferCastle', castleId: CASTLE_A1, toClanId: CLAN_BETA },
      { op: 'declareWar', a: CLAN_ALPHA, b: CLAN_BETA },
      {
        op: 'signPact',
        a: CLAN_ALPHA,
        b: CLAN_BETA,
        pact: 'alliance',
        months: 12,
        vassalClanId: null,
      },
      { op: 'breakPact', a: CLAN_ALPHA, b: CLAN_BETA, pact: 'alliance' },
      { op: 'grantCourtRank', clanId: CLAN_ALPHA, rank: 'sho2' },
      { op: 'grantShogunateTitle', clanId: CLAN_ALPHA, title: 'shogun' },
    ];
    expect(lifecycle.every((op) => !isScalarEffectOp(op))).toBe(true);
  });
  it('honors ordered rounding/clamps and existing castle resource selectors', () => {
    const state = buildTinyState();
    const castle = state.castles[CASTLE_A1]!;
    applyScalarEffects(
      state,
      [
        { op: 'addGold', clanId: '$clan', amount: -10000 },
        { op: 'addGold', clanId: '$clan', amount: 2.6 },
        { op: 'addFood', castleId: '$castle', amount: 1e6 },
        { op: 'addSoldiers', castleId: '$castle', amount: 1e6 },
        { op: 'addPrestige', clanId: '$clan', amount: 1e6 },
        { op: 'addCastleDurability', castleId: '$castle', amount: 1e6 },
        { op: 'scaleCastleDurability', castleId: '$castle', pct: 12.5 },
        { op: 'addCastleMorale', castleId: '$castle', amount: -1000 },
        { op: 'addDistrictOrder', districtId: '$district', amount: 1000 },
        { op: 'addCourtFavor', clanId: '$clan', amount: 1000 },
        { op: 'setFlag', key: 'rounded', value: -2.6 },
      ],
      binding,
      () => {},
    );
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(3);
    expect(castle.food).toBe(castleFoodCap(castle));
    expect(castle.soldiers).toBe(castleMaxSoldiers(state, castle));
    expect(state.clans[CLAN_ALPHA]!.prestige).toBe(BAL.prestigeMax);
    expect(castle.durability).toBe(Math.floor(castle.maxDurability * 0.875));
    expect(castle.morale).toBe(0);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(100);
    expect(state.court.courtFavor[CLAN_ALPHA]).toBe(BAL.courtFavorMax);
    expect(state.events.flags.rounded).toBe(-3);
    expect(validateState(state)).toEqual([]);
  });
  it('keeps leader loyalty100, changes only serving clan members in bulk, and adds merit without trait/experience mutation', () => {
    const state = buildTinyState();
    const member = state.officers[OFF_ALPHA_BUSHO]!;
    member.loyalty = 40;
    const meritBefore = member.merit;
    const experience = structuredClone({ exp: member.statExp, growth: member.statGrowth });
    applyScalarEffects(
      state,
      [
        { op: 'addLoyalty', officerId: OFF_ALPHA_LORD, amount: -99 },
        { op: 'addClanLoyalty', clanId: '$clan', amount: 70 },
        { op: 'addMerit', officerId: member.id, amount: 10 },
      ],
      binding,
      () => {},
    );
    expect(state.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100);
    expect(member.loyalty).toBe(100);
    expect({ exp: member.statExp, growth: member.statGrowth }).toEqual(experience);
    expect(member.merit).toBe(meritBefore + 10);
  });
  it('uses signed08sentiment and directional trust without materializing boundary no-ops', () => {
    const state = buildTinyState();
    state.diplomacy.rows = {};
    applyScalarEffects(
      state,
      [
        { op: 'addTrust', from: CLAN_ALPHA, to: CLAN_ALPHA, amount: 10 },
        { op: 'addSentiment', from: CLAN_ALPHA, to: CLAN_BETA, amount: 0 },
      ],
      null,
      () => {},
    );
    expect(state.diplomacy.rows).toEqual({});
    const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
    state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
    const beforeReverse = row.trustBtoA;
    applyScalarEffects(
      state,
      [
        { op: 'addSentiment', from: CLAN_ALPHA, to: CLAN_BETA, amount: -1000 },
        { op: 'addTrust', from: CLAN_ALPHA, to: CLAN_BETA, amount: 1000 },
      ],
      null,
      () => {},
    );
    expect(row.sentimentAtoB).toBe(-100);
    expect(row.trustAtoB).toBe(BAL.trustMax);
    expect(row.trustBtoA).toBe(beforeReverse);
  });
  it('reduces exactlyowned garrisons and realcommand-created armies, not enemy garrisons or transport resources', () => {
    const state = buildTinyState();
    const cmd = {
      type: 'march' as const,
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A2,
      leaderId: OFF_ALPHA_TAISHO,
      deputyIds: [],
      soldiers: 100,
      food: Math.ceil(100 * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays),
      targetNodeId: CASTLE_B1,
    };
    expect(validateCommand(state, cmd)).toEqual({ ok: true });
    applyCommand(state, cmd, () => {});
    const army = Object.values(state.armies)[0]!;
    const previous = Object.fromEntries(
      Object.values(state.castles).map((castle) => [castle.id, castle.soldiers]),
    );
    const armyBefore = army.soldiers;
    applyScalarEffects(
      state,
      [{ op: 'reduceClanSoldiersPct', clanId: CLAN_ALPHA, pct: 12.5 }],
      null,
      () => {},
    );
    expect(army.soldiers).toBe(Math.floor(armyBefore * 0.875));
    for (const castle of Object.values(state.castles))
      expect(castle.soldiers).toBe(
        castle.ownerClanId === CLAN_ALPHA
          ? Math.floor(previous[castle.id]! * 0.875)
          : previous[castle.id],
      );
    expect(validateState(state)).toEqual([]);
  });
  it('applies bulk territoryeffects by actualowner and percentagepopulation loss isfloored', () => {
    const state = buildTinyState();
    const enemy = structuredClone({
      castle: state.castles[CASTLE_B1],
      district: state.districts[DIST_B1X],
    });
    state.districts[DIST_A1X]!.population = 1001;
    applyScalarEffects(
      state,
      [
        { op: 'addClanCastlesMorale', clanId: CLAN_ALPHA, amount: -1000 },
        { op: 'addClanOrder', clanId: CLAN_ALPHA, amount: -1000 },
        { op: 'scalePopulation', districtId: DIST_A1X, pct: 8 },
      ],
      null,
      () => {},
    );
    expect(state.castles[CASTLE_A1]!.morale).toBe(0);
    expect(state.castles[CASTLE_A2]!.morale).toBe(0);
    expect(state.districts[DIST_A1X]!.publicOrder).toBe(0);
    expect(state.districts[DIST_A1X]!.population).toBe(920);
    expect({ castle: state.castles[CASTLE_B1], district: state.districts[DIST_B1X] }).toEqual(
      enemy,
    );
  });
  it('unbound, missing or dead references are no-ops without emitting events or mutating RNG', () => {
    const state = buildTinyState();
    const before = structuredClone(state);
    const events: GameEvent[] = [];
    applyScalarEffects(
      state,
      [
        { op: 'addGold', clanId: '$clan', amount: 10 },
        { op: 'addFood', castleId: '$castle', amount: 10 },
        { op: 'scalePopulation', districtId: '$district', pct: 10 },
        { op: 'renameOfficer', officerId: 'off.missing' as OfficerId, name: '不存在' },
        { op: 'renameCastle', castleId: 'castle.missing' as CastleId, name: '不存在' },
        { op: 'addTrust', from: CLAN_ALPHA, to: 'clan.missing' as ClanId, amount: 10 },
      ],
      null,
      (event) => events.push(event),
    );
    expect(state).toEqual(before);
    expect(events).toEqual([]);
    state.clans[CLAN_BETA]!.alive = false;
    const deadBefore = structuredClone(state);
    applyScalarEffects(
      state,
      [
        { op: 'renameClan', clanId: CLAN_BETA, name: '消滅' },
        { op: 'addFood', castleId: CASTLE_B1, amount: 10 },
        { op: 'addDistrictOrder', districtId: DIST_B1X, amount: 10 },
      ],
      null,
      () => {},
    );
    expect(state).toEqual(deadBefore);
  });
  it('reuses shogunate collapse, emits once and leaves scalar Report construction to the engine', () => {
    const state = buildTinyState();
    state.court.shogunateExists = true;
    state.clans[CLAN_ALPHA]!.shogunateTitle = 'shobanshu';
    const reports = structuredClone(state.reports);
    const events: GameEvent[] = [];
    applyScalarEffects(state, [{ op: 'endShogunate' }, { op: 'endShogunate' }], null, (event) =>
      events.push(event),
    );
    expect(state.court.shogunClanId).toBe(null);
    expect(state.clans[CLAN_ALPHA]!.shogunateTitle).toBe('none');
    expect(events.filter((event) => event.type === 'shogunate.collapsed')).toHaveLength(1);
    expect(state.reports).toEqual(reports);
    expect(validateState(state)).toEqual([]);
  });
});
