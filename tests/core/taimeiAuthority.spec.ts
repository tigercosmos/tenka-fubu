import { describe, expect, it } from 'vitest';
import { validateCommand } from '../../src/core/commands/validate';
import { applyCommands, CommandQueue } from '../../src/core/commands/queue';
import type { ExecutionAuthority } from '../../src/core/commands/authority';
import type { CmdInvokeTaimei } from '../../src/core/commands/types';
import type { CorpsId, TaimeiId } from '../../src/core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';
import { getTaimeiDef } from '../../src/core/systems/events/taimeiCatalog';

const taimeiId = 'taimei.shippu-jinrai' as TaimeiId;
const delegated: ExecutionAuthority[] = [
  { kind: 'castle', clanId: CLAN_ALPHA, castleId: CASTLE_A1 },
  { kind: 'steward', clanId: CLAN_ALPHA, officerId: OFF_ALPHA_BUSHO, districtId: DIST_A1X },
  { kind: 'corps', clanId: CLAN_ALPHA, corpsId: 'corps.taimei-test' as CorpsId },
];
const command: CmdInvokeTaimei = { type: 'invokeTaimei', clanId: CLAN_ALPHA, taimeiId };

describe('Taimei follows the normal execution authority boundary', () => {
  it.each(delegated)('never grants %s delegated access to clan-wide prestige', (authority) => {
    const state = buildTinyState();
    state.clans[CLAN_ALPHA]!.prestige = getTaimeiDef(taimeiId)!.unlockPrestige;
    const before = structuredClone(state);
    expect(validateCommand(state, command, authority).ok).toBe(false);
    const events: unknown[] = [];
    const queue = new CommandQueue(state.meta.lastAppliedCmdSeq + 1);
    queue.enqueue(command, state.time.day, authority);
    applyCommands(state, queue.drain(), (event) => events.push(event));
    before.meta.lastAppliedCmdSeq += 1;
    expect(state).toEqual(before);
    expect(events).toMatchObject([{ type: 'command.rejected' }]);
  });

  it('allows the player and a trusted NPC clan without conferring player-clan AI control', () => {
    const state = buildTinyState();
    const def = getTaimeiDef(taimeiId)!;
    state.clans[CLAN_ALPHA]!.prestige = def.unlockPrestige;
    state.clans[CLAN_BETA]!.prestige = def.unlockPrestige;
    expect(validateCommand(state, command, { kind: 'player' }).ok).toBe(true);
    expect(validateCommand(state, { ...command, clanId: CLAN_BETA }, { kind: 'player' })).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.notOwner',
    });
    expect(validateCommand(state, command, { kind: 'clan', clanId: CLAN_ALPHA }).ok).toBe(false);
    expect(
      validateCommand(state, { ...command, clanId: CLAN_BETA }, { kind: 'clan', clanId: CLAN_BETA })
        .ok,
    ).toBe(true);
    state.ai.allAi = true;
    expect(validateCommand(state, command, { kind: 'clan', clanId: CLAN_ALPHA }).ok).toBe(true);
  });
});
