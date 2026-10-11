import { afterEach, describe, expect, it, vi } from 'vitest';
import { castleMaxSoldiers } from '../../src/core/domestic';
import { validateCommand } from '../../src/core/commands/validate';
import { foodReserve, runDomesticCouncil } from '../../src/core/systems/ai/council';
import { clanAiScope, createAiCommandSink } from '../../src/core/systems/ai';
import { pickDevFocus } from '../../src/core/systems/ai/stewardAi';
import * as pathfinding from '../../src/core/systems/pathfinding';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA } from '../fixtures/tiny';

function settledCouncil() {
  const state = buildTinyState();
  state.ai.allAi = true;
  state.clans[CLAN_ALPHA]!.gold = 0;
  for (const castle of Object.values(state.castles)) {
    if (castle.ownerClanId !== CLAN_ALPHA) continue;
    castle.soldiers = castleMaxSoldiers(state, castle);
    castle.conscriptPolicy = 'low';
    castle.food = foodReserve(state, castle);
  }
  for (const district of Object.values(state.districts))
    if (district.ownerClanId === CLAN_ALPHA) district.developFocus = pickDevFocus(district);
  return state;
}

afterEach(() => vi.restoreAllMocks());

describe('domestic council zero-deficit path work', () => {
  it('does not search donor paths for satisfied destinations, retaining the evaluated decision', () => {
    const state = settledCouncil();
    const before = structuredClone(state);
    const paths = vi.spyOn(pathfinding, 'computePath');
    const { sink, orders } = createAiCommandSink(state);
    runDomesticCouncil(state, clanAiScope(state, CLAN_ALPHA), sink, {
      rewards: false,
      policies: false,
    });
    expect(orders).toEqual([]);
    expect(state.ai.intentLog.map((intent) => intent.kind)).toEqual(['domestic.evaluated']);
    const observed = structuredClone(state);
    observed.ai.intentLog = before.ai.intentLog;
    expect(observed).toEqual(before);
    expect(paths).not.toHaveBeenCalled();
  });

  it('still reserves the actual validated transport for a positive deficit without real mutations', () => {
    const state = settledCouncil();
    const destination = state.castles[CASTLE_A2]!;
    const amount = foodReserve(state, destination);
    destination.food = 0;
    state.castles[CASTLE_A1]!.food += amount;
    const before = structuredClone(state);
    const { sink, orders, shadow } = createAiCommandSink(state);
    runDomesticCouncil(state, clanAiScope(state, CLAN_ALPHA), sink, {
      rewards: false,
      policies: false,
    });
    expect(amount).toBeGreaterThan(0);
    expect(orders).toEqual([
      {
        authority: { kind: 'clan', clanId: CLAN_ALPHA },
        command: {
          type: 'transport',
          clanId: CLAN_ALPHA,
          fromCastleId: CASTLE_A1,
          toCastleId: CASTLE_A2,
          soldiers: 0,
          gold: 0,
          food: amount,
        },
      },
    ]);
    expect(validateCommand(state, orders[0]!.command, orders[0]!.authority).ok).toBe(true);
    expect(Object.values(shadow.transports)).toHaveLength(1);
    expect(state.ai.intentLog.map((intent) => intent.kind)).toEqual([
      'food.transport',
      'domestic.evaluated',
    ]);
    const observed = structuredClone(state);
    observed.ai.intentLog = before.ai.intentLog;
    expect(observed).toEqual(before);
  });
});
