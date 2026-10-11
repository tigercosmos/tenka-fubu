import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { castleFoodCap, castleMaxSoldiers } from '../../src/core/domestic';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommand } from '../../src/core/commands/apply';
import { validateInvokeTaimei } from '../../src/core/commands/taimeiCommands';
import type { CmdInvokeTaimei } from '../../src/core/commands/types';
import type { TaimeiId } from '../../src/core/state/ids';
import type { GameEvent } from '../../src/core/state/events';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';
import { advanceDay } from '../../src/core/systems';
import { dayToCalendar } from '../../src/core/systems/time';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import { TAIMEI_CATALOG } from '../../src/core/systems/events/taimeiCatalog';
import {
  availableTaimei,
  effectiveTaimeiPrestige,
  expireTaimei,
  previewTaimeiFoodGain,
  taimeiEffects,
  TAIMEI_NEUTRAL,
} from '../../src/core/systems/events/taimei';
import { CommandLogRecorder, replayCommandLog } from '../../src/core/replay/commandLog';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  DIST_A1X,
  DIST_A1Y,
  DIST_A2X,
  DIST_A2Y,
} from '../fixtures/tiny';

function fixture() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.prestige = BAL.prestigeMax;
  state.clans[CLAN_ALPHA]!.gold = BAL.taimeiKenkinGold;
  return state;
}
function command(id = 'taimei.sodoin'): CmdInvokeTaimei {
  return { type: 'invokeTaimei', clanId: CLAN_ALPHA, taimeiId: id as TaimeiId };
}
function invoke(state: ReturnType<typeof fixture>, id: string) {
  const cmd = command(id),
    events: GameEvent[] = [];
  expect(validateCommand(state, cmd)).toEqual({ ok: true });
  applyCommand(state, cmd, (event) => events.push(event));
  return events;
}
describe('complete canonical taimei catalog and lifecycle', () => {
  it('defines all eight exact ordered IDs and immutable canonical costs/unlocks', () => {
    expect(TAIMEI_CATALOG.map((def) => def.id)).toEqual([
      'taimei.gaiko-kosei',
      'taimei.kenkin-meneki',
      'taimei.rakuichi-shinko',
      'taimei.shippu-jinrai',
      'taimei.sodoin',
      'taimei.sokuji-chohei',
      'taimei.tenka-bushin',
      'taimei.teppeki',
    ]);
    expect(Object.isFrozen(TAIMEI_CATALOG)).toBe(true);
    for (const def of TAIMEI_CATALOG) {
      expect(Object.isFrozen(def)).toBe(true);
      expect(def.unlockPrestige).toBe(
        BAL.taimeiUnlockPrestige[def.id as keyof typeof BAL.taimeiUnlockPrestige],
      );
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.description.length).toBeGreaterThan(0);
      expect(def.kind).toBe(def.durationDays === 0 ? 'instant' : 'sustained');
    }
  });
  it('unlocks solely by prestige plus canonical rank steps and top-three title discounts', () => {
    const clan = fixture().clans[CLAN_ALPHA]!;
    clan.prestige = 0;
    expect(availableTaimei(clan)).toHaveLength(0);
    clan.courtRank = 'ju5ge';
    expect(effectiveTaimeiPrestige(clan)).toBe(BAL.taimeiRankDiscountPerStep);
    clan.shogunateTitle = 'kanrei';
    expect(effectiveTaimeiPrestige(clan)).toBe(
      BAL.taimeiRankDiscountPerStep + BAL.taimeiShogunateDiscount,
    );
    expect(availableTaimei(clan).map((def) => def.id)).toContain('taimei.kenkin-meneki');
    for (const title of ['fukushogun', 'shogun'] as const) {
      clan.shogunateTitle = title;
      expect(effectiveTaimeiPrestige(clan)).toBe(
        BAL.taimeiRankDiscountPerStep + BAL.taimeiShogunateDiscount,
      );
    }
    clan.shogunateTitle = 'shobanshu';
    expect(effectiveTaimeiPrestige(clan)).toBe(BAL.taimeiRankDiscountPerStep);
    clan.courtRank = 'sho2';
    expect(effectiveTaimeiPrestige(clan)).toBe(8 * BAL.taimeiRankDiscountPerStep);
    clan.alive = false;
    expect(availableTaimei(clan)).toEqual([]);
  });
  it.each(TAIMEI_CATALOG)(
    '$id invokes once with exact costs/lifecycle, no RNG, and invariant-safe effects',
    (def) => {
      const state = fixture(),
        clan = state.clans[CLAN_ALPHA]!,
        before = structuredClone(state);
      const events = invoke(state, def.id);
      expect(clan.prestige).toBe(before.clans[CLAN_ALPHA]!.prestige - def.prestigeCost);
      expect(clan.gold).toBe(before.clans[CLAN_ALPHA]!.gold - def.goldCost);
      expect(clan.taimei).toEqual({
        activeTaimeiId: def.id,
        activeUntilDay: state.time.day + def.durationDays,
        cooldownUntilDay: state.time.day + def.durationDays + BAL.taimeiCooldownDays,
      });
      expect(events).toEqual([
        {
          type: 'taimei.invoked',
          day: state.time.day,
          clanIds: [CLAN_ALPHA],
          clanId: CLAN_ALPHA,
          taimeiId: def.id,
        },
      ]);
      expect(state.rng).toEqual(before.rng);
      expect(validateState(state)).toEqual([]);
      expect(validateInvokeTaimei(state, command(def.id))).toMatchObject({
        ok: false,
        reasonKey: 'cmd.reject.taimeiBusy',
      });
    },
  );
  it('exposes every sustained multiplier with inclusive expiry, unaffected neighbors, and stable neutral identity', () => {
    const cases = [
      [
        'taimei.sodoin',
        {
          conscriptMaxMult: 1 + BAL.taimeiSodoinMaxBonus,
          conscriptCostMult: BAL.taimeiSodoinCostMult,
        },
      ],
      ['taimei.gaiko-kosei', { trustGainMult: BAL.taimeiGaikoTrustMult }],
      ['taimei.rakuichi-shinko', { commerceGrowthMult: BAL.taimeiRakuichiCommerceMult }],
      [
        'taimei.teppeki',
        {
          siegeDamageTakenMult: 1 - BAL.taimeiTeppekiReduce,
          castleDefenseMult: BAL.taimeiTeppekiDefMult,
        },
      ],
      ['taimei.shippu-jinrai', { marchSpeedMult: 1 + BAL.taimeiShippuSpeedBonus }],
      ['taimei.tenka-bushin', { buildStepPerDay: BAL.taimeiBushinStep }],
    ] as const;
    for (const [id, extra] of cases) {
      const state = fixture();
      invoke(state, id);
      expect(taimeiEffects(state, CLAN_ALPHA)).toEqual({ ...TAIMEI_NEUTRAL, ...extra });
      state.clans[CLAN_ALPHA]!.prestige = 0;
      state.time.day = state.clans[CLAN_ALPHA]!.taimei.activeUntilDay;
      expect(taimeiEffects(state, CLAN_ALPHA)).toEqual({ ...TAIMEI_NEUTRAL, ...extra });
      expect(taimeiEffects(state, CLAN_BETA)).toBe(TAIMEI_NEUTRAL);
      state.time.day += 1;
      expect(taimeiEffects(state, CLAN_ALPHA)).toBe(TAIMEI_NEUTRAL);
    }
    const invalid = fixture();
    invalid.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = '__proto__' as TaimeiId;
    invalid.clans[CLAN_ALPHA]!.taimei.activeUntilDay = invalid.time.day + 1;
    expect(taimeiEffects(invalid, CLAN_ALPHA)).toBe(TAIMEI_NEUTRAL);
    invalid.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = 'taimei.teppeki' as TaimeiId;
    invalid.clans[CLAN_ALPHA]!.alive = false;
    expect(taimeiEffects(invalid, CLAN_ALPHA)).toBe(TAIMEI_NEUTRAL);
  });
  it('rejects locked/busy/cooldown/unaffordable/unknown/dead/foreign and delegated requests without mutation or RNG', () => {
    const check = (
      mutate: (state: ReturnType<typeof fixture>) => void,
      id: string,
      reason: string,
    ) => {
      const state = fixture();
      mutate(state);
      const before = structuredClone(state);
      expect(validateCommand(state, command(id))).toMatchObject({ ok: false, reasonKey: reason });
      expect(state).toEqual(before);
    };
    check(
      (s) => {
        s.clans[CLAN_ALPHA]!.prestige = 0;
      },
      'taimei.sodoin',
      'cmd.reject.taimeiLocked',
    );
    check(
      (s) => {
        s.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = 'taimei.teppeki' as TaimeiId;
      },
      'taimei.sodoin',
      'cmd.reject.taimeiBusy',
    );
    check(
      (s) => {
        s.clans[CLAN_ALPHA]!.taimei.cooldownUntilDay = s.time.day + 1;
      },
      'taimei.sodoin',
      'cmd.reject.taimeiCooldown',
    );
    check(
      (s) => {
        const c = s.clans[CLAN_ALPHA]!;
        c.prestige = 0;
        c.courtRank = 'sho2';
      },
      'taimei.sodoin',
      'cmd.reject.prestigeShort',
    );
    check(
      (s) => {
        s.clans[CLAN_ALPHA]!.gold = BAL.taimeiKenkinGold - 1;
      },
      'taimei.kenkin-meneki',
      'cmd.reject.insufficientGold',
    );
    const poor = fixture();
    poor.clans[CLAN_ALPHA]!.gold = 0;
    expect(validateInvokeTaimei(poor, command('taimei.kenkin-meneki'))).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.insufficientGold',
      params: { cost: BAL.taimeiKenkinGold },
    });
    check(() => undefined, 'taimei.unknown', 'cmd.reject.invalidTarget');
    check(
      (s) => {
        s.clans[CLAN_ALPHA]!.alive = false;
      },
      'taimei.sodoin',
      'cmd.reject.invalidTarget',
    );
    const state = fixture();
    expect(validateCommand(state, { ...command(), clanId: CLAN_BETA })).toMatchObject({
      ok: false,
      reasonKey: 'cmd.reject.notOwner',
    });
    expect(
      validateCommand(state, command(), { kind: 'castle', clanId: CLAN_ALPHA, castleId: CASTLE_A1 })
        .ok,
    ).toBe(false);
  });
  it('instant conscription allocates exact floor quotas plus district-ID remainder and excludes occupied districts', () => {
    const state = fixture();
    state.districts[DIST_A1X]!.population = 101;
    state.districts[DIST_A1Y]!.population = 100;
    state.castles[CASTLE_A1]!.districtIds.reverse();
    state.castles[CASTLE_A1]!.soldiers = 0;
    state.districts[DIST_A2Y]!.ownerClanId = CLAN_BETA;
    const before = structuredClone(state);
    invoke(state, 'taimei.sokuji-chohei');
    const gain = Math.floor(201 * BAL.taimeiSokujiPopRatio);
    const x = Math.floor((gain * 101) / 201) + 1,
      y = Math.floor((gain * 100) / 201);
    expect(state.castles[CASTLE_A1]!.soldiers).toBe(gain);
    expect(state.districts[DIST_A1X]!.population).toBe(101 - x);
    expect(state.districts[DIST_A1Y]!.population).toBe(100 - y);
    expect(x + y).toBe(gain);
    expect(state.districts[DIST_A2Y]!.population).toBe(before.districts[DIST_A2Y]!.population);
    expect(state.castles[CASTLE_B1]).toEqual(before.castles[CASTLE_B1]);
    const a2gain = state.castles[CASTLE_A2]!.soldiers - before.castles[CASTLE_A2]!.soldiers;
    expect(before.districts[DIST_A2X]!.population - state.districts[DIST_A2X]!.population).toBe(
      a2gain,
    );
    expect(validateState(state)).toEqual([]);
  });
  it('instant conscription respects pre-invocation capacity and skips over-cap/empty population castles', () => {
    const state = fixture();
    state.castles[CASTLE_A1]!.soldiers = castleMaxSoldiers(state, state.castles[CASTLE_A1]!) - 1;
    state.districts[DIST_A2X]!.population = 0;
    state.districts[DIST_A2Y]!.population = 0;
    const before = structuredClone(state);
    invoke(state, 'taimei.sokuji-chohei');
    expect(state.castles[CASTLE_A1]!.soldiers - before.castles[CASTLE_A1]!.soldiers).toBe(1);
    expect(state.castles[CASTLE_A2]!.soldiers).toBe(before.castles[CASTLE_A2]!.soldiers);
    expect(validateState(state)).toEqual([]);
  });
  it('food exchange allocates by remaining capacity with ID remainder and caps overflow without refund', () => {
    const state = fixture(),
      a1 = state.castles[CASTLE_A1]!,
      a2 = state.castles[CASTLE_A2]!;
    a1.food = castleFoodCap(a1) - 1;
    a2.food = castleFoodCap(a2) - 2;
    expect(previewTaimeiFoodGain(state, CLAN_ALPHA)).toBe(3);
    const enemy = structuredClone(state.castles[CASTLE_B1]);
    invoke(state, 'taimei.kenkin-meneki');
    expect(a1.food).toBe(castleFoodCap(a1));
    expect(a2.food).toBe(castleFoodCap(a2));
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(0);
    expect(state.castles[CASTLE_B1]).toEqual(enemy);
    const full = fixture();
    for (const c of Object.values(full.castles)) c.food = castleFoodCap(c);
    const pre = structuredClone(full);
    invoke(full, 'taimei.kenkin-meneki');
    expect(full.castles).toEqual(pre.castles);
    expect(full.clans[CLAN_ALPHA]!.gold).toBe(0);
    const proportional = fixture(),
      first = proportional.castles[CASTLE_A1]!,
      second = proportional.castles[CASTLE_A2]!;
    first.food = castleFoodCap(first) - 5001;
    second.food = castleFoodCap(second) - 5000;
    const f1 = first.food,
      f2 = second.food,
      total = BAL.taimeiKenkinGold * BAL.taimeiKenkinFoodPerGold;
    invoke(proportional, 'taimei.kenkin-meneki');
    expect(first.food - f1).toBe(Math.floor((total * 5001) / 10001) + 1);
    expect(second.food - f2).toBe(Math.floor((total * 5000) / 10001));
    expect(first.food + second.food - f1 - f2).toBe(total);
    expect(validateState(proportional)).toEqual([]);
  });
  it.each([false, true])(
    'expires instantaneous commands at actual Step3 with runtime=%s and preserves cooldown',
    (runtime) => {
      const state = fixture(),
        until = state.time.day + BAL.taimeiCooldownDays;
      const tick = advanceDay(
        state,
        [{ seq: 1, issuedDay: state.time.day, command: command('taimei.kenkin-meneki') }],
        runtime ? { eventEngine: createRuntimeEventEngine([]) } : {},
      );
      expect(tick.appliedCommands).toHaveLength(1);
      expect(
        tick.events.filter((event) => event.type.startsWith('taimei.')).map((event) => event.type),
      ).toEqual(['taimei.invoked', 'taimei.expired']);
      expect(state.clans[CLAN_ALPHA]!.taimei).toEqual({
        activeTaimeiId: null,
        activeUntilDay: 0,
        cooldownUntilDay: until,
      });
      expect(validateState(state)).toEqual([]);
    },
  );
  it('expires only after the inclusive final day; cooldown ends exactly at the persisted deadline', () => {
    const state = fixture();
    invoke(state, 'taimei.teppeki');
    const clan = state.clans[CLAN_ALPHA]!,
      events: GameEvent[] = [];
    state.time = { day: clan.taimei.activeUntilDay, ...dayToCalendar(clan.taimei.activeUntilDay) };
    expireTaimei(state, (event) => events.push(event));
    expect(events).toEqual([]);
    state.time = { day: state.time.day + 1, ...dayToCalendar(state.time.day + 1) };
    expireTaimei(state, (event) => events.push(event));
    expireTaimei(state, (event) => events.push(event));
    expect(events).toHaveLength(1);
    expect(clan.taimei.activeUntilDay).toBe(0);
    state.time.day = clan.taimei.cooldownUntilDay - 1;
    expect(validateInvokeTaimei(state, command()).ok).toBe(false);
    state.time.day += 1;
    expect(validateInvokeTaimei(state, command())).toEqual({ ok: true });
  });
  it('replays actual command envelopes to the same complete state/hash/RNG without requiring an event catalog', () => {
    const state = fixture(),
      recorder = new CommandLogRecorder();
    const first = advanceDay(state, [
      { seq: 1, issuedDay: state.time.day, command: command('taimei.shippu-jinrai') },
    ]);
    recorder.recordTick(first.appliedCommands);
    for (let i = 0; i < 4; i++) recorder.recordTick(advanceDay(state, []).appliedCommands);
    const log = recorder.export(state),
      rebuilt = fixture(),
      result = replayCommandLog(log, () => rebuilt);
    expect(result.match).toBe(true);
    expect(result.actualHash).toBe(stateHash(state));
    expect(rebuilt).toEqual(state);
    expect(rebuilt.rng).toEqual(state.rng);
    expect(validateState(state)).toEqual([]);
  });
});
