import { expect, it } from 'vitest';
import { mapHoverLines } from '../../src/ui/map/mapHoverContent';
import { buildTinyState, CASTLE_A1, DIST_A1X, OFF_ALPHA_LORD } from '../fixtures/tiny';
import { applyMarch } from '../../src/core/commands/march';
import { validateCommand } from '../../src/core/index';
import { militaryMovementSystem } from '../../src/core/systems/military';
import type { TraitId } from '../../src/core/state/ids';

it.each([false, true])(
  'army carried days match actual daily supply consumption with logistics trait=%s',
  (logistics) => {
    const game = buildTinyState();
    game.officers[OFF_ALPHA_LORD]!.traits = logistics ? ['trait.heitan' as TraitId] : [];
    const command = {
      type: 'march' as const,
      clanId: game.meta.playerClanId,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 101,
      food: 200,
      targetNodeId: DIST_A1X,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    applyMarch(game, command, () => {});
    const army = Object.values(game.armies)[0]!;
    const beforeFood = army.food;
    militaryMovementSystem(game);
    const actualDailyCost = beforeFood - army.food;
    expect(actualDailyCost).toBe(logistics ? 2 : 3);
    const before = structuredClone(game);
    expect(mapHoverLines(game, 'army', army.id)![1]).toContain(
      `${Math.floor(army.food / actualDailyCost)}日`,
    );
    expect(game).toEqual(before);
  },
);
