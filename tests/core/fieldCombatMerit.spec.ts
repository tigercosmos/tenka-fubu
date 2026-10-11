import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import { validateCommand } from '../../src/core/commands/validate';
import { encodeSave, decodeSave } from '../../src/core/save/serialize';
import type { FieldCombatSide, GameState } from '../../src/core/state/gameState';
import type { RoadEdgeId, TraitId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { defaultDiplomacyRow, pairKey } from '../../src/core/state/serialize';
import { fieldCombatSystem } from '../../src/core/systems/fieldCombat';
import { advanceDay } from '../../src/core/systems';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { dieOfficer, releaseOfficerAssignments } from '../../src/core/systems/officers';
import { applyStartKassen, advanceBattleTick } from '../../src/core/systems/battle';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

type History = {
  complete: boolean;
  participants: {
    armyId: string;
    clanId: string;
    leaderId: string;
    deputyIds: string[];
  }[];
};
const history = (side: FieldCombatSide) =>
  (side as FieldCombatSide & { participation?: History }).participation;

function march(state: GameState, reinforcement = false) {
  const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
  const commands = reinforcement
    ? [
        {
          type: 'march' as const,
          clanId: CLAN_ALPHA,
          originCastleId: CASTLE_A2,
          leaderId: OFF_ALPHA_TAISHO,
          deputyIds: [],
          soldiers: 500,
          food: 500,
          targetNodeId: CASTLE_B1,
        },
      ]
    : [
        {
          type: 'march' as const,
          clanId: CLAN_ALPHA,
          originCastleId: CASTLE_A1,
          leaderId: OFF_ALPHA_LORD,
          deputyIds: [OFF_ALPHA_BUSHO],
          soldiers: 1500,
          food: 1000,
          targetNodeId: CASTLE_B1,
        },
        {
          type: 'march' as const,
          clanId: CLAN_BETA,
          originCastleId: CASTLE_B1,
          leaderId: OFF_BETA_TAISHO,
          deputyIds: [OFF_BETA_BUSHO],
          soldiers: 1500,
          food: 1000,
          targetNodeId: CASTLE_A1,
        },
      ];
  for (const command of commands) {
    const authority =
      command.clanId === state.meta.playerClanId
        ? { kind: 'player' as const }
        : { kind: 'clan' as const, clanId: command.clanId };
    expect(validateCommand(state, command, authority)).toEqual({ ok: true });
    queue.enqueue(command, state.time.day, authority);
  }
  expect(applyCommands(state, queue.drain(), () => undefined)).toHaveLength(commands.length);
}

function prepare(normalDays = false) {
  const state = buildTinyState();
  const roadId = 'road.field-merit-frontier' as RoadEdgeId;
  state.roads[roadId] = {
    id: roadId,
    a: CASTLE_A1,
    b: CASTLE_B1,
    type: 'land',
    grade: 1,
    baseDays: 4,
  };
  // Initial synthetic topology makes the real reinforcement march use this
  // frontier encounter rather than the independent A2–B1 corridor.
  for (const road of Object.values(state.roads)) {
    if (
      (road.a === CASTLE_A2 && road.b === CASTLE_B1) ||
      (road.b === CASTLE_A2 && road.a === CASTLE_B1)
    )
      road.baseDays = 30;
  }
  const row = defaultDiplomacyRow(CLAN_ALPHA, CLAN_BETA);
  row.lastHostileDay = state.time.day;
  state.diplomacy.rows[pairKey(CLAN_ALPHA, CLAN_BETA)] = row;
  if (normalDays) {
    state.castles[CASTLE_A1]!.morale = 100;
    state.castles[CASTLE_B1]!.morale = 40;
  }
  march(state);
  for (let day = 0; day < 30 && !Object.keys(state.fieldCombats).length; day++) {
    if (normalDays) advanceDay(state, []);
    else militaryMovementSystem(state);
    expect(validateState(state)).toEqual([]);
  }
  const combat = Object.values(state.fieldCombats)[0]!;
  expect(combat).toBeDefined();
  const alphaSide = combat.sideA.clanIds.includes(CLAN_ALPHA) ? combat.sideA : combat.sideB;
  const betaSide = alphaSide === combat.sideA ? combat.sideB : combat.sideA;
  const alpha = state.armies[alphaSide.armyIds[0]!]!;
  const beta = state.armies[betaSide.armyIds[0]!]!;
  return { state, combat, alphaSide, betaSide, alpha, beta };
}

describe('complete new field encounter participant history and merit', () => {
  it('normal daily progression produces a decisive ordinary award and exact native continuation', () => {
    const { state, combat } = prepare(true);
    const before = state.officers[OFF_ALPHA_LORD]!.merit;
    const day = state.time.day;
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    let winner: string | null = null;
    for (let tick = 0; tick < 100 && state.fieldCombats[combat.id]; tick++) {
      const events = advanceDay(state, []).events;
      expect(advanceDay(loaded, []).events).toEqual(events);
      expect(loaded).toEqual(state);
      expect(validateState(state)).toEqual([]);
      const end = events.find((e) => e.type === 'battle.ended' && e.battleId === combat.id);
      if (end?.type === 'battle.ended') winner = end.winnerClanId;
    }
    expect(winner).toBe(CLAN_ALPHA);
    expect(state.time.day).toBeGreaterThan(day);
    expect(state.officers[OFF_ALPHA_LORD]!.merit - before).toBe(
      Math.round(BAL.meritFieldWin * BAL.meritCommanderMult),
    );
  });

  it.each([
    { complete: 'true', participants: [] },
    { complete: true, participants: null },
    {
      complete: true,
      participants: [
        { armyId: 'army.bad', clanId: CLAN_ALPHA, leaderId: OFF_ALPHA_LORD, deputyIds: [] },
      ],
    },
    {
      complete: true,
      participants: [
        { armyId: 'army.000001', clanId: CLAN_ALPHA, leaderId: 'off.missing', deputyIds: [] },
      ],
    },
    {
      complete: true,
      participants: [
        { armyId: 'army.000001', clanId: 'clan.missing', leaderId: OFF_ALPHA_LORD, deputyIds: [] },
      ],
    },
    {
      complete: true,
      participants: [
        { armyId: 'army.000001', clanId: CLAN_BETA, leaderId: OFF_ALPHA_LORD, deputyIds: [] },
      ],
    },
    {
      complete: true,
      participants: [
        {
          armyId: 'army.000001',
          clanId: CLAN_ALPHA,
          leaderId: OFF_ALPHA_LORD,
          deputyIds: [OFF_ALPHA_LORD],
        },
      ],
    },
  ])(
    'rejects malformed optional saved history %# without requiring historical live armies',
    (bad) => {
      const { state, alphaSide } = prepare();
      Object.assign(alphaSide, { participation: bad });
      expect(validateState(state).some((v) => v.inv === 'INV-13')).toBe(true);
      expect(decodeSave(encodeSave(state, 123))).toEqual({ ok: false, code: 'corrupt' });
    },
  );
  it('records detached initial rosters and gives unique win/lose commander and deputy awards', () => {
    const { state, combat, alphaSide, betaSide, alpha, beta } = prepare();
    const before = structuredClone(state.officers);
    const rng = { ...state.rng };
    beta.morale = 0;
    const ended = fieldCombatSystem(state).find((e) => e.type === 'battle.ended');
    expect(ended).toMatchObject({ winnerClanId: CLAN_ALPHA });
    for (const [id, base] of [
      [OFF_ALPHA_LORD, Math.round(BAL.meritFieldWin * BAL.meritCommanderMult)],
      [OFF_ALPHA_BUSHO, BAL.meritFieldWin],
      [OFF_BETA_TAISHO, Math.round(BAL.meritFieldLose * BAL.meritCommanderMult)],
      [OFF_BETA_BUSHO, BAL.meritFieldLose],
    ] as const) {
      expect(state.officers[id]!.merit - before[id]!.merit).toBe(base);
      expect(state.officers[id]!.statExp.ldr - before[id]!.statExp.ldr).toBe(base);
      expect(state.officers[id]!.statExp.val - before[id]!.statExp.val).toBe(base);
    }
    expect(history(alphaSide)).toEqual({
      complete: true,
      participants: [
        {
          armyId: alpha.id,
          clanId: CLAN_ALPHA,
          leaderId: OFF_ALPHA_LORD,
          deputyIds: [OFF_ALPHA_BUSHO],
        },
      ],
    });
    expect(history(betaSide)?.complete).toBe(true);
    expect(state.fieldCombats[combat.id]).toBeUndefined();
    const after = structuredClone(state.officers);
    fieldCombatSystem(state);
    expect(state.officers).toEqual(after);
    // Existing pursuit owns RNG; merit itself must not add further draws.
    expect(state.rng.event).toBe(rng.event);
    expect(validateState(state)).toEqual([]);
  });

  it('captures reinforcement and preserves an early routed participant after active IDs are pruned', () => {
    const { state, combat, alphaSide, alpha, beta } = prepare();
    march(state, true);
    for (let day = 0; day < 30 && alphaSide.armyIds.length < 2; day++)
      militaryMovementSystem(state);
    expect(alphaSide.armyIds).toHaveLength(2);
    expect(history(alphaSide)?.participants.map((p) => p.leaderId)).toContain(OFF_ALPHA_TAISHO);
    alpha.morale = 0;
    fieldCombatSystem(state);
    expect(state.fieldCombats[combat.id]).toBeDefined();
    expect(alphaSide.armyIds).not.toContain(alpha.id);
    const before = state.officers[OFF_ALPHA_LORD]!.merit;
    beta.morale = 0;
    fieldCombatSystem(state);
    expect(state.officers[OFF_ALPHA_LORD]!.merit - before).toBe(
      Math.round(BAL.meritFieldWin * BAL.meritCommanderMult),
    );
    expect(validateState(state)).toEqual([]);
  });

  it('cleans an exhausted reinforcement while the encounter continues and retains its history', () => {
    const { state, combat, alphaSide } = prepare();
    march(state, true);
    for (let day = 0; day < 30 && alphaSide.armyIds.length < 2; day++)
      militaryMovementSystem(state);
    expect(alphaSide.armyIds).toHaveLength(2);
    const reinforcement = Object.values(state.armies).find(
      (army) => army.leaderId === OFF_ALPHA_TAISHO,
    )!;
    const historyBefore = structuredClone(history(alphaSide));
    reinforcement.soldiers = 0;
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state.officers);
    const events = fieldCombatSystem(state);
    expect(events.some((event) => event.type === 'battle.ended')).toBe(false);
    expect(state.fieldCombats[combat.id]).toBe(combat);
    expect(state.armies[reinforcement.id]).toBeUndefined();
    expect(alphaSide.armyIds).not.toContain(reinforcement.id);
    expect(alphaSide.armyIds).toHaveLength(1);
    expect(history(alphaSide)).toEqual(historyBefore);
    const officer = state.officers[OFF_ALPHA_TAISHO]!;
    expect(officer.armyId).toBeNull();
    expect(officer.locationCastleId).not.toBeNull();
    expect(state.castles[officer.locationCastleId!]!.ownerClanId).toBe(CLAN_ALPHA);
    for (const current of Object.values(state.officers)) {
      expect(current.merit).toBe(before[current.id]!.merit);
      expect(current.statExp).toEqual(before[current.id]!.statExp);
      expect(current.statGrowth).toEqual(before[current.id]!.statGrowth);
    }
    expect(validateState(state)).toEqual([]);
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(decoded.saveFile.state).toEqual(state);
  });

  it('records real commander promotion, skips dead officers, and applies Yashin after role rounding', () => {
    const { state, beta, betaSide } = prepare();
    dieOfficer(state, OFF_BETA_TAISHO, beta.posNodeId);
    expect(beta.leaderId).toBe(OFF_BETA_BUSHO);
    state.officers[OFF_BETA_BUSHO]!.traits = ['trait.yashin' as TraitId];
    const before = state.officers[OFF_BETA_BUSHO]!.merit;
    const dead = structuredClone(state.officers[OFF_BETA_TAISHO]);
    beta.morale = 0;
    fieldCombatSystem(state);
    expect(history(betaSide)?.participants.map((p) => p.leaderId)).toContain(OFF_BETA_BUSHO);
    expect(state.officers[OFF_BETA_BUSHO]!.merit - before).toBe(
      Math.round(
        Math.round(BAL.meritFieldLose * BAL.meritCommanderMult) * (1 + BAL.traitYashinMerit),
      ),
    );
    expect(state.officers[OFF_BETA_TAISHO]).toEqual(dead);
    expect(validateState(state)).toEqual([]);
  });

  it.each(['ronin', 'transferred'] as const)(
    'retains destroyed-army history but excludes a former %s participant',
    (departure) => {
      const { state, combat, alphaSide, beta } = prepare();
      march(state, true);
      for (let day = 0; day < 30 && alphaSide.armyIds.length < 2; day++)
        militaryMovementSystem(state);
      expect(alphaSide.armyIds).toHaveLength(2);
      const reinforcement = Object.values(state.armies).find(
        (a) => a.leaderId === OFF_ALPHA_TAISHO,
      )!;
      dieOfficer(state, OFF_ALPHA_TAISHO, reinforcement.posNodeId);
      expect(state.armies[reinforcement.id]).toBeUndefined();
      expect(state.fieldCombats[combat.id]).toBeDefined();
      expect(history(alphaSide)?.participants.some((p) => p.armyId === reinforcement.id)).toBe(
        true,
      );
      expect(validateState(state)).toEqual([]);
      // Controlled legal former-participant departure; no new eligibility for ronin.
      const deputy = state.officers[OFF_ALPHA_BUSHO]!;
      releaseOfficerAssignments(state, deputy.id);
      deputy.status = departure === 'ronin' ? 'ronin' : 'serving';
      deputy.clanId = departure === 'ronin' ? null : CLAN_BETA;
      deputy.locationCastleId = departure === 'ronin' ? CASTLE_A1 : CASTLE_B1;
      const excluded = structuredClone(deputy);
      const before = state.officers[OFF_ALPHA_LORD]!.merit;
      beta.morale = 0;
      fieldCombatSystem(state);
      expect(state.officers[OFF_ALPHA_LORD]!.merit - before).toBe(
        Math.round(BAL.meritFieldWin * BAL.meritCommanderMult),
      );
      expect(deputy).toEqual(excluded);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('does not infer merit for a draw or external commander-death closure', () => {
    const draw = prepare();
    draw.alpha.morale = draw.beta.morale = 0;
    const beforeDraw = structuredClone(draw.state.officers);
    expect(fieldCombatSystem(draw.state).find((e) => e.type === 'battle.ended')).toMatchObject({
      winnerClanId: null,
    });
    expect(draw.state.officers).toEqual(beforeDraw);
    expect(validateState(draw.state)).toEqual([]);

    const external = prepare();
    const winnerBefore = structuredClone(external.state.officers[OFF_ALPHA_LORD]);
    dieOfficer(external.state, OFF_BETA_TAISHO, external.beta.posNodeId);
    dieOfficer(external.state, OFF_BETA_BUSHO, external.beta.posNodeId);
    expect(external.state.fieldCombats[external.combat.id]).toBeUndefined();
    fieldCombatSystem(external.state);
    expect(external.state.officers[OFF_ALPHA_LORD]).toEqual(winnerBefore);
    expect(validateState(external.state)).toEqual([]);
  });

  it.each([false, true])(
    'cleans zero-start armies without inferred merit (both sides=%s)',
    (both) => {
      const { state, combat, alpha, beta } = prepare();
      beta.soldiers = 0;
      if (both) alpha.soldiers = 0;
      expect(validateState(state)).toEqual([]);
      const before = structuredClone(state.officers);
      const ended = fieldCombatSystem(state).find((event) => event.type === 'battle.ended');
      expect(ended).toMatchObject({ winnerClanId: both ? null : CLAN_ALPHA });
      expect(state.fieldCombats[combat.id]).toBeUndefined();
      expect(validateState(state)).toEqual([]);
      for (const officer of Object.values(state.officers)) {
        const original = before[officer.id]!;
        expect(officer.merit).toBe(original.merit);
        expect(officer.statExp).toEqual(original.statExp);
        expect(officer.statGrowth).toEqual(original.statGrowth);
      }
      for (const army of both ? [alpha, beta] : [beta]) {
        expect(state.armies[army.id]).toBeUndefined();
        for (const id of [army.leaderId, ...army.deputyIds]) {
          const officer = state.officers[id]!;
          expect(officer.armyId).toBeNull();
          expect(officer.locationCastleId).not.toBeNull();
          expect(state.castles[officer.locationCastleId!]!.ownerClanId).toBe(army.clanId);
        }
      }
    },
  );

  it('keeps legacy unknown history unawarded, including verified new joins', () => {
    const { state, alphaSide, betaSide, beta } = prepare();
    delete (alphaSide as FieldCombatSide & { participation?: History }).participation;
    delete (betaSide as FieldCombatSide & { participation?: History }).participation;
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    expect(history(Object.values(decoded.saveFile.state.fieldCombats)[0]!.sideA)).toBeUndefined();
    march(state, true);
    for (let day = 0; day < 30 && alphaSide.armyIds.length < 2; day++)
      militaryMovementSystem(state);
    expect(history(alphaSide)?.complete).toBe(false);
    const before = structuredClone(state.officers);
    beta.morale = 0;
    fieldCombatSystem(state);
    expect(state.officers).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });

  it('persists complete rosters and native ordinary-result continuation exactly', () => {
    const { state, combat, beta } = prepare();
    fieldCombatSystem(state);
    beta.morale = 0;
    const decoded = decodeSave(encodeSave(state, 123));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.code);
    const loaded = decoded.saveFile.state;
    expect(history(loaded.fieldCombats[combat.id]!.sideA)?.complete).toBe(true);
    expect(fieldCombatSystem(loaded)).toEqual(fieldCombatSystem(state));
    expect(loaded).toEqual(state);
    expect(validateState(state)).toEqual([]);
  });

  it('does not add field merit while tactical takeover is active', () => {
    const { state, combat } = prepare();
    applyStartKassen(
      state,
      { type: 'startKassen', clanId: CLAN_ALPHA, fieldCombatId: combat.id },
      () => undefined,
    );
    const before = structuredClone(state.officers);
    expect(fieldCombatSystem(state)).toEqual([]);
    expect(state.officers).toEqual(before);
    const battle = Object.values(state.battles)[0]!;
    for (let tick = 0; tick < BAL.kassenMaxTicks && battle.result === null; tick++) {
      advanceBattleTick(state, battle.id, [
        { kind: 'toggleDelegate', unitId: 'all', enabled: true },
      ]);
    }
    expect(battle.result).not.toBeNull();
    expect(state.fieldCombats[combat.id]).toBeUndefined();
    const afterBattle = structuredClone(state.officers);
    expect(fieldCombatSystem(state)).toEqual([]);
    expect(state.officers).toEqual(afterBattle);
    expect(validateState(state)).toEqual([]);
  });
});
