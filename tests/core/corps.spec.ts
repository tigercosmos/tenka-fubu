import { beforeEach, describe, expect, it } from 'vitest';
import { buildFullState } from '../helpers/fullState';
import type { GameState } from '../../src/core/state/gameState';
import type { CommandByType } from '../../src/core/commands/registry';
import {
  applyCreateCorps,
  validateCreateCorps,
  validateSetCorpsDirective,
  validateAssignCastleToCorps,
  applyAssignCastleToCorps,
} from '../../src/core/commands/corpsCommands';
import { dissolveCorps, splitCorpsIncome } from '../../src/core/systems/corps';
import { applyMarch } from '../../src/core/commands/march';

describe('corps ownership and integer wallet accounting', () => {
  let state: GameState;
  let command: CommandByType['createCorps'];
  beforeEach(async () => {
    state = await buildFullState();
    const clanId = state.meta.playerClanId;
    const leader = Object.values(state.officers).find(
      (o) => o.clanId === clanId && o.status === 'serving' && o.hasComeOfAge,
    )!;
    leader.rank = 'karo';
    const castles = Object.values(state.castles).filter((c) => c.ownerClanId === clanId);
    for (const castle of castles) {
      castle.directControl = true;
      castle.corpsId = null;
    }
    command = {
      type: 'createCorps',
      clanId,
      corpsLeaderId: leader.id,
      castleIds: castles.slice(0, 2).map((c) => c.id),
      directive: 'hold',
      targetNodeId: null,
    };
  });
  it('rejects duplicate castles, insufficient rank, foreign castles and malformed directives without mutation', () => {
    const before = structuredClone(state);
    expect(
      validateCreateCorps(state, {
        ...command,
        castleIds: [command.castleIds[0]!, command.castleIds[0]!],
      }).ok,
    ).toBe(false);
    const foreign = Object.values(state.castles).find((c) => c.ownerClanId !== command.clanId)!;
    expect(validateCreateCorps(state, { ...command, castleIds: [foreign.id] }).ok).toBe(false);
    expect(validateCreateCorps(state, { ...command, directive: 'advance' }).ok).toBe(false);
    expect(state).toEqual(before);
    const ordinary = Object.values(state.officers).find(
      (officer) =>
        officer.clanId === command.clanId &&
        officer.status === 'serving' &&
        officer.id !== state.clans[command.clanId]!.leaderId,
    );
    expect(ordinary).toBeDefined();
    if (!ordinary) throw new Error('Expected an ordinary nonruler officer');
    ordinary.rank = 'busho';
    expect(validateCreateCorps(state, { ...command, corpsLeaderId: ordinary.id })).toMatchObject({
      ok: false,
      reasonKey: 'cmd.reject.rankTooLow',
    });
  });
  it('delegates castles, prevents duplicate leader/assignment and validates real enemy targets', () => {
    expect(validateCreateCorps(state, command).ok).toBe(true);
    applyCreateCorps(state, command, () => {});
    const corps = Object.values(state.corps)[0]!;
    expect(
      command.castleIds.every(
        (id) => state.castles[id]!.corpsId === corps.id && !state.castles[id]!.directControl,
      ),
    ).toBe(true);
    expect(validateCreateCorps(state, command).ok).toBe(false);
    expect(
      validateAssignCastleToCorps(state, {
        type: 'assignCastleToCorps',
        clanId: command.clanId,
        castleId: command.castleIds[0]!,
        corpsId: corps.id,
      }).ok,
    ).toBe(false);
    expect(
      validateSetCorpsDirective(state, {
        type: 'setCorpsDirective',
        clanId: command.clanId,
        corpsId: corps.id,
        directive: 'advance',
        targetNodeId: command.castleIds[0]!,
      }).ok,
    ).toBe(false);
  });
  it('refunds exactly once on dissolution, restores control and dissolves an empty corps', () => {
    applyCreateCorps(state, command, () => {});
    const corps = Object.values(state.corps)[0]!;
    corps.gold = 123;
    const initial = state.clans[command.clanId]!.gold;
    for (const castleId of command.castleIds)
      applyAssignCastleToCorps(
        state,
        { type: 'assignCastleToCorps', clanId: command.clanId, castleId, corpsId: null },
        () => {},
      );
    expect(state.corps[corps.id]).toBeUndefined();
    expect(state.clans[command.clanId]!.gold).toBe(initial + 123);
    expect(
      command.castleIds.every(
        (id) => state.castles[id]!.directControl && state.castles[id]!.corpsId === null,
      ),
    ).toBe(true);
    dissolveCorps(state, corps.id);
    expect(state.clans[command.clanId]!.gold).toBe(initial + 123);
  });
  it('preserves all integer income including rounding residuals', () => {
    for (const gross of [0, 1, 4, 5, 101, 1000]) {
      const split = splitCorpsIncome(gross);
      expect(split.clanGold + split.corpsGold).toBe(gross);
      expect(split.clanGold).toBe(Math.floor(gross * 0.2));
    }
  });
  it('releases only departing-castle army snapshots when one of several castles is recalled', () => {
    expect(command.castleIds.length).toBe(2);
    applyCreateCorps(state, command, () => {});
    const corps = Object.values(state.corps)[0]!;
    const [first, second] = command.castleIds;
    const target = Object.values(state.castles).find((c) => c.ownerClanId !== command.clanId)!;
    const officers = Object.values(state.officers).filter(
      (o) => o.clanId === command.clanId && o.status === 'serving' && o.hasComeOfAge,
    );
    for (const [index, originCastleId] of [first!, second!].entries()) {
      applyMarch(
        state,
        {
          type: 'march',
          clanId: command.clanId,
          originCastleId,
          leaderId: officers[index]!.id,
          deputyIds: [],
          soldiers: 100,
          food: 100,
          targetNodeId: target.id,
        },
        () => {},
      );
    }
    applyAssignCastleToCorps(
      state,
      { type: 'assignCastleToCorps', clanId: command.clanId, castleId: first!, corpsId: null },
      () => {},
    );
    const armies = Object.values(state.armies);
    expect(armies.find((a) => a.originCastleId === first)!.corpsId).toBeNull();
    expect(armies.find((a) => a.originCastleId === second)!.corpsId).toBe(corps.id);
    expect(state.corps[corps.id]).toBeDefined();
    dissolveCorps(state, corps.id);
    expect(armies.every((a) => a.corpsId === null)).toBe(true);
  });
});
