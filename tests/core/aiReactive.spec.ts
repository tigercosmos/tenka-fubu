import { describe, expect, it, vi } from 'vitest';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  DIST_B1X,
  OFF_ALPHA_LORD,
  OFF_ALPHA_TAISHO,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';
import type { GameState, AiIntent } from '../../src/core/state/gameState';
import { buildFullState } from '../helpers/fullState';
import { nodeOwner } from '../../src/core/systems/ai/shared';
import type { AiSignal, AiSink } from '../../src/core/systems/ai/types';
import { runReactiveAi } from '../../src/core/systems/ai/reactive';
import { createAiCommandSink } from '../../src/core/systems/ai';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { validateCommand } from '../../src/core/commands/validate';
import type { CmdMarch } from '../../src/core/commands/types';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import { applyMarch } from '../../src/core/commands/march';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { computeThreatCache } from '../../src/core/systems/ai/threat';
import type { SiegeId } from '../../src/core/state/ids';

function validatedFixtureMarch(state: GameState, command: CmdMarch) {
  expect(
    validateCommand(
      state,
      command,
      command.clanId === state.meta.playerClanId
        ? { kind: 'player' }
        : { kind: 'clan', clanId: command.clanId },
    ),
  ).toEqual({ ok: true });
  applyMarch(state, command, () => {});
}

describe('current-tick event-driven reactive AI', () => {
  it('reacts deterministically to nine independent invaded owners on the same day without a polling cap', async () => {
    const state = await buildFullState({ seed: 1, allAi: true });
    expect(validateState(state)).toEqual([]);
    const signals: AiSignal[] = [];
    for (const clan of Object.values(state.clans)
      .filter((clan) => clan.alive)
      .sort((a, b) => a.id.localeCompare(b.id))) {
      for (const edge of Object.values(state.roads).sort((a, b) => a.id.localeCompare(b.id))) {
        const target =
          nodeOwner(state, edge.a) === clan.id
            ? edge.a
            : nodeOwner(state, edge.b) === clan.id
              ? edge.b
              : null;
        if (!target) continue;
        const enemy = nodeOwner(state, target === edge.a ? edge.b : edge.a);
        if (!enemy || enemy === clan.id) continue;
        const row = ensureDiplomacyRow(state, enemy, clan.id);
        row.pacts = [];
        row.lastHostileDay = state.time.day;
        const source = Object.values(state.castles).find(
          (castle) =>
            castle.ownerClanId === enemy &&
            castle.lordId &&
            castle.soldiers >= 100 &&
            castle.food >= 100 &&
            !state.officers[castle.lordId]?.armyId,
        );
        if (!source?.lordId) continue;
        const command: CmdMarch = {
          type: 'march',
          clanId: enemy,
          originCastleId: source.id,
          leaderId: source.lordId,
          deputyIds: [],
          soldiers: 100,
          food: 100,
          targetNodeId: target,
        };
        if (!validateCommand(state, command, { kind: 'clan', clanId: enemy }).ok) continue;
        const beforeIds = new Set(Object.keys(state.armies));
        validatedFixtureMarch(state, command);
        const army = Object.values(state.armies).find((army) => !beforeIds.has(army.id))!;
        // Controlled arrival fixture; the march itself passes the ordinary command validator.
        army.posNodeId = target;
        army.path = [target];
        army.pathCursor = 0;
        army.edgeProgressDays = 0;
        signals.push({
          type: 'army.enteredTerritory',
          armyId: army.id,
          nodeId: target,
          clanId: enemy,
          ownerClanId: clan.id,
        });
        break;
      }
      if (signals.length === 9) break;
    }
    expect(signals).toHaveLength(9);
    expect(new Set(signals.map((signal) => signal.ownerClanId)).size).toBe(9);
    expect(validateState(state)).toEqual([]);
    const first = structuredClone(state),
      second = structuredClone(state);
    const execute = (game: GameState, events: AiSignal[]) => {
      const intents: AiIntent[] = [];
      const enqueue = vi.fn(() => ({ ok: true as const }));
      runReactiveAi(game, events, { enqueue, record: (intent) => intents.push(intent) });
      expect(validateState(game)).toEqual([]);
      return { intents, commands: enqueue.mock.calls };
    };
    const result = execute(first, signals);
    expect(result.intents.map((intent) => intent.clanId).sort()).toEqual(
      signals.map((signal) => signal.ownerClanId).sort(),
    );
    expect(
      result.intents.every(
        (intent) =>
          intent.day === state.time.day &&
          intent.layer === 'reactive' &&
          intent.kind.startsWith('defense.'),
      ),
    ).toBe(true);
    // Duplicate contacts retain same-tick deduplication and deterministic detached-state results.
    expect(
      execute(
        second,
        signals.flatMap((signal) => [signal, signal]),
      ),
    ).toEqual(result);
    expect(second).toEqual(first);
  });
  it('reserves the first eligible player encounter and holds a distinct second contact on the shared shadow', () => {
    const state = buildTinyState();
    const alpha = state.castles[CASTLE_A1]!.ownerClanId;
    const beta = state.castles[CASTLE_B1]!.ownerClanId;
    state.meta.playerClanId = beta;
    state.castles[CASTLE_A2]!.soldiers = 2000;
    state.castles[CASTLE_A2]!.food = 10000;
    ensureDiplomacyRow(state, alpha, beta).lastHostileDay = state.time.day;
    for (const [clanId, originCastleId, leaderId, soldiers, targetNodeId] of [
      [alpha, CASTLE_A1, OFF_ALPHA_LORD, 2000, CASTLE_B1],
      [alpha, CASTLE_A2, OFF_ALPHA_TAISHO, 2000, CASTLE_B1],
      [beta, CASTLE_B1, OFF_BETA_LORD, 1000, CASTLE_A2],
      [beta, CASTLE_B1, OFF_BETA_TAISHO, 1000, CASTLE_A2],
    ] as const)
      validatedFixtureMarch(state, {
        type: 'march',
        clanId,
        originCastleId,
        leaderId,
        deputyIds: [],
        soldiers,
        food: Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays),
        targetNodeId,
      });
    const firstAlpha = Object.values(state.armies).find((a) => a.leaderId === OFF_ALPHA_LORD)!;
    const secondAlpha = Object.values(state.armies).find((a) => a.leaderId === OFF_ALPHA_TAISHO)!;
    const firstBeta = Object.values(state.armies).find((a) => a.leaderId === OFF_BETA_LORD)!;
    const secondBeta = Object.values(state.armies).find((a) => a.leaderId === OFF_BETA_TAISHO)!;
    startFieldCombat(state, CASTLE_A1, [firstAlpha.id], [firstBeta.id]);
    startFieldCombat(state, CASTLE_A2, [secondAlpha.id], [secondBeta.id]);
    const combats = Object.values(state.fieldCombats);
    expect(combats).toHaveLength(2);
    for (const combat of combats)
      expect(
        validateCommand(
          state,
          { type: 'startKassen', clanId: alpha, fieldCombatId: combat.id },
          { kind: 'clan', clanId: alpha },
        ),
      ).toEqual({ ok: true });
    expect(validateState(state)).toEqual([]);
    const q = createAiCommandSink(state);
    runReactiveAi(
      state,
      combats.map((combat) => ({
        type: 'battle.kassenAvailable' as const,
        day: state.time.day,
        clanIds: [alpha, beta],
        battleId: combat.id,
      })),
      q.sink,
    );
    expect(q.orders).toHaveLength(1);
    expect(q.orders[0]?.command).toMatchObject({
      type: 'startKassen',
      fieldCombatId: combats[0]!.id,
    });
    expect(state.ai.intentLog.at(-1)).toMatchObject({
      kind: 'battle.hold',
      detail: { reason: 'cmd.reject.alreadyActive' },
    });
    expect(state.ai.intentLog.filter((i) => i.kind === 'error.invalidCommand')).toEqual([]);
    expect(validateState(state)).toEqual([]);
  });
  it('holds a favorable stale kassen signal when current troops fail central eligibility, without duplicate error intents', () => {
    const state = buildTinyState();
    state.ai.allAi = true;
    const alpha = state.castles[CASTLE_A1]!.ownerClanId;
    const beta = state.castles[CASTLE_B1]!.ownerClanId;
    ensureDiplomacyRow(state, alpha, beta).lastHostileDay = state.time.day;
    for (const [clanId, originCastleId, leaderId, soldiers, targetNodeId] of [
      [alpha, CASTLE_A1, OFF_ALPHA_LORD, 1000, CASTLE_B1],
      [beta, CASTLE_B1, OFF_BETA_LORD, 100, CASTLE_A2],
    ] as const)
      validatedFixtureMarch(state, {
        type: 'march',
        clanId,
        originCastleId,
        leaderId,
        deputyIds: [],
        soldiers,
        food: Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays),
        targetNodeId,
      });
    const a = Object.values(state.armies).find((army) => army.clanId === alpha)!;
    const b = Object.values(state.armies).find((army) => army.clanId === beta)!;
    startFieldCombat(state, CASTLE_A1, [a.id], [b.id]);
    const combat = Object.values(state.fieldCombats)[0]!;
    const command = { type: 'startKassen' as const, clanId: alpha, fieldCombatId: combat.id };
    expect(a.soldiers + b.soldiers).toBeLessThan(BAL.kassenMinTroops);
    expect(validateCommand(state, command, { kind: 'clan', clanId: alpha })).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.insufficientTroops',
    });
    expect(validateState(state)).toEqual([]);
    const before = structuredClone(state),
      q = createAiCommandSink(state);
    runReactiveAi(
      state,
      [
        {
          type: 'battle.kassenAvailable',
          day: state.time.day,
          clanIds: [alpha, beta],
          battleId: combat.id,
        },
      ],
      q.sink,
    );
    expect(q.orders).toEqual([]);
    expect(state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand')).toEqual(
      [],
    );
    expect(state.ai.intentLog.at(-1)).toMatchObject({
      kind: 'battle.hold',
      detail: { reason: 'cmd.reject.insufficientTroops' },
    });
    before.ai.intentLog = structuredClone(state.ai.intentLog);
    expect(state).toEqual(before);
    expect(validateState(state)).toEqual([]);
  });
  it.each([false, true])(
    'preserves eligible kassen and honors actual queued reservations (reserved=%s)',
    (reserved) => {
      const state = buildTinyState();
      state.ai.allAi = true;
      const alpha = state.castles[CASTLE_A1]!.ownerClanId;
      const beta = state.castles[CASTLE_B1]!.ownerClanId;
      ensureDiplomacyRow(state, alpha, beta).lastHostileDay = state.time.day;
      for (const [clanId, originCastleId, leaderId, soldiers, targetNodeId] of [
        [alpha, CASTLE_A1, OFF_ALPHA_LORD, 2000, CASTLE_B1],
        [beta, CASTLE_B1, OFF_BETA_LORD, 1000, CASTLE_A2],
      ] as const)
        validatedFixtureMarch(state, {
          type: 'march',
          clanId,
          originCastleId,
          leaderId,
          deputyIds: [],
          soldiers,
          food: Math.ceil(soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays),
          targetNodeId,
        });
      const a = Object.values(state.armies).find((army) => army.clanId === alpha)!;
      const b = Object.values(state.armies).find((army) => army.clanId === beta)!;
      startFieldCombat(state, CASTLE_A1, [a.id], [b.id]);
      const combat = Object.values(state.fieldCombats)[0]!;
      const command = { type: 'startKassen' as const, clanId: alpha, fieldCombatId: combat.id };
      const authority = { kind: 'clan' as const, clanId: alpha };
      expect(validateCommand(state, command, authority)).toEqual({ ok: true });
      if (reserved) state.ai.pendingOrders.push({ command, authority });
      expect(validateState(state)).toEqual([]);
      const q = createAiCommandSink(state);
      runReactiveAi(
        state,
        [
          {
            type: 'battle.kassenAvailable',
            day: state.time.day,
            clanIds: [alpha, beta],
            battleId: combat.id,
          },
        ],
        q.sink,
      );
      expect(q.orders).toEqual(reserved ? [] : [{ command, authority }]);
      expect(state.ai.intentLog.filter((intent) => intent.kind === 'error.invalidCommand')).toEqual(
        [],
      );
      expect(state.ai.intentLog.at(-1)?.kind).toBe(reserved ? 'battle.hold' : 'battle.kassen');
      expect(validateState(state)).toEqual([]);
    },
  );
  it('does zero state work on a quiet tick and ignores unrelated current events', () => {
    const state = new Proxy({} as GameState, {
      get() {
        throw new Error('quiet tick read gameplay state');
      },
    });
    const enqueue = vi.fn(() => ({ ok: true as const })),
      record = vi.fn();
    const sink: AiSink = { enqueue, record };
    runReactiveAi(state, [], sink);
    runReactiveAi(
      state,
      [{ type: 'time.monthStart', day: 30, clanIds: [], year: 1560, month: 5 }],
      sink,
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });
  it('never takes over a player-owned diplomatic reinforcement response', () => {
    const state = buildTinyState();
    const other = Object.values(state.clans).find((c) => c.id !== state.meta.playerClanId)!;
    const intents: AiIntent[] = [];
    const enqueue = vi.fn(() => ({ ok: true as const }));
    const sink: AiSink = { enqueue, record: (intent) => intents.push(intent) };
    runReactiveAi(
      state,
      [
        {
          type: 'diplo.reinforceAgreed',
          day: state.time.day,
          clanIds: [],
          fromClanId: other.id,
          toClanId: state.meta.playerClanId,
          againstClanId: other.id,
        },
      ],
      sink,
    );
    expect(enqueue).not.toHaveBeenCalled();
    expect(intents).toHaveLength(0);
  });
  it('intercepts an actual enemy arrival once using warmed nearest-distance estimates without gameplay writes', () => {
    const state = buildTinyState();
    const enemy = state.meta.playerClanId,
      defender = state.castles[CASTLE_B1]!.ownerClanId;
    ensureDiplomacyRow(state, enemy, defender).lastHostileDay = state.time.day;
    applyMarch(
      state,
      {
        type: 'march',
        clanId: enemy,
        originCastleId: CASTLE_A1,
        leaderId: OFF_ALPHA_LORD,
        deputyIds: [],
        soldiers: 100,
        food: 100,
        targetNodeId: DIST_B1X,
      },
      () => {},
    );
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = DIST_B1X;
    const castle = state.castles[CASTLE_B1]!;
    castle.soldiers = 5000;
    castle.food = 10000;
    state.officers[castle.lordId!]!.rank = 'shukuro';
    state.ai.clans[defender]!.threatCache = computeThreatCache(state, defender);
    const before = structuredClone(state);
    const enqueue = vi.fn(() => ({ ok: true as const })),
      record = vi.fn();
    const sink: AiSink = { enqueue, record };
    const event = {
      type: 'army.arrived' as const,
      day: state.time.day,
      clanIds: [enemy],
      armyId: army.id,
      clanId: enemy,
      nodeId: DIST_B1X,
      leaderId: army.leaderId,
    };
    runReactiveAi(
      state,
      [
        {
          type: 'army.enteredTerritory',
          armyId: army.id,
          nodeId: DIST_B1X,
          clanId: enemy,
          ownerClanId: defender,
        },
        event,
      ],
      sink,
    );
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]).toMatchObject([
      { type: 'march', clanId: defender, originCastleId: CASTLE_B1, targetNodeId: DIST_B1X },
      { kind: 'clan', clanId: defender },
    ]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ kind: 'defense.intercept' }));
    expect(state).toEqual(before);
  });
  it('coordinates sufficient siege relief and leaves home garrisons, but holds when outmatched', () => {
    const state = buildTinyState();
    const defender = state.castles[CASTLE_A1]!.ownerClanId;
    const enemy = state.castles[CASTLE_B1]!.ownerClanId;
    state.meta.playerClanId = enemy;
    ensureDiplomacyRow(state, enemy, defender).lastHostileDay = state.time.day;
    applyMarch(
      state,
      {
        type: 'march',
        clanId: enemy,
        originCastleId: CASTLE_B1,
        leaderId: OFF_BETA_LORD,
        deputyIds: [],
        soldiers: 100,
        food: 100,
        targetNodeId: CASTLE_A1,
      },
      () => {},
    );
    const army = Object.values(state.armies)[0]!;
    army.posNodeId = CASTLE_A1;
    army.status = 'sieging';
    const source = state.castles[CASTLE_A2]!;
    source.soldiers = 5000;
    source.food = 10000;
    state.officers[source.lordId!]!.rank = 'shukuro';
    const siegeId = 'siege.000001' as SiegeId;
    state.sieges[siegeId] = {
      id: siegeId,
      castleId: CASTLE_A1,
      attackerClanId: enemy,
      attackerArmyIds: [army.id],
      mode: 'encircle',
      startDay: state.time.day,
      interrupted: false,
      betrayalUsed: false,
    };
    const enqueue = vi.fn(() => ({ ok: true as const })),
      record = vi.fn();
    const sink: AiSink = { enqueue, record };
    const event = {
      type: 'siege.started' as const,
      day: state.time.day,
      clanIds: [defender, enemy],
      siegeId,
      castleId: CASTLE_A1,
      attackerClanId: enemy,
    };
    runReactiveAi(state, [event], sink);
    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue.mock.calls[0]).toMatchObject([
      { type: 'march', originCastleId: CASTLE_A2, soldiers: 3500, targetNodeId: CASTLE_A1 },
      { kind: 'clan', clanId: defender },
    ]);
    enqueue.mockClear();
    army.soldiers = 20000;
    runReactiveAi(state, [event], sink);
    expect(enqueue).not.toHaveBeenCalled();
    expect(record).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'defense.hold' }));
    expect(source.soldiers).toBe(5000);
  });
});
