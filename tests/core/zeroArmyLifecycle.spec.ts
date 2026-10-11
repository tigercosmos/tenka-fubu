import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import type { Army, GameState } from '../../src/core/state/gameState';
import type { CastleId, ClanId, MapNodeId, OfficerId } from '../../src/core/state/ids';
import { validateState } from '../../src/core/state/invariants';
import { nearestOwnedCastleByTravelTime } from '../../src/core/systems/castleSelection';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { advanceDay } from '../../src/core/systems/index';
import { militaryMovementSystem } from '../../src/core/systems/military';
import { beginSiege } from '../../src/core/systems/siege';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_B1X,
  OFF_ALPHA_TAISHO,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function deploy(
  state: GameState,
  clanId: ClanId,
  originCastleId: CastleId,
  leaderId: OfficerId,
  targetNodeId: MapNodeId,
): Army {
  const command = {
    type: 'march' as const,
    clanId,
    originCastleId,
    leaderId,
    deputyIds: [],
    soldiers: 100,
    food: Math.ceil(100 * BAL.fieldFoodPerSoldierDaily * BAL.minCarryDays),
    targetNodeId,
  };
  expect(validateCommand(state, command)).toEqual({ ok: true });
  const previous = new Set(Object.keys(state.armies));
  applyCommand(state, command, () => {});
  return Object.values(state.armies).find((army) => !previous.has(army.id))!;
}
function place(army: Army, nodeId: MapNodeId): void {
  army.posNodeId = nodeId;
  army.path = [nodeId];
  army.pathCursor = 0;
  army.edgeProgressDays = 0;
  army.edgeCostDays = 0;
  army.status = 'holding';
  army.autoReturn = false;
}

describe('existing zero-soldier military reconciliation controls', () => {
  it.each(['holding', 'sieging', 'subjugating'] as const)(
    'real march %s zero army already reconciles through supply/rout with full-tick invariants',
    (status) => {
      const state = buildTinyState();
      const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
      place(army, status === 'subjugating' ? DIST_B1X : CASTLE_B1);
      if (status === 'sieging') beginSiege(state, CASTLE_B1, army.id);
      if (status === 'subjugating') {
        army.status = 'subjugating';
        state.districts[DIST_B1X]!.subjugation = {
          clanId: CLAN_ALPHA,
          progress: 50,
          daysRequired: 10,
        };
      }
      army.soldiers = 0; // Canonical percentage-loss result, retaining actual positive initialTroops.
      expect(validateState(state)).toEqual([]);
      const destination =
        nearestOwnedCastleByTravelTime(state, CLAN_ALPHA, army.posNodeId)?.castle.id ?? CASTLE_A1;
      const originalOwners = Object.values(state.districts).map((district) => [
        district.id,
        district.ownerClanId,
      ]);
      const movementOnly = structuredClone(state);
      const rng = structuredClone(movementOnly.rng);
      const events = militaryMovementSystem(movementOnly);
      expect(movementOnly.armies[army.id]).toBeUndefined();
      expect(movementOnly.officers[army.leaderId]!.armyId).toBeNull();
      expect(movementOnly.officers[army.leaderId]!.locationCastleId).toBe(destination);
      expect(movementOnly.rng).toEqual(rng);
      expect(validateState(movementOnly)).toEqual([]);
      expect(events.some((event) => event.type === 'army.routed')).toBe(true);
      if (status === 'sieging')
        expect(events.some((event) => event.type === 'siege.ended')).toBe(true);
      const result = advanceDay(state, []);
      expect(state.armies[army.id]).toBeUndefined();
      expect(state.officers[army.leaderId]!.locationCastleId).toBe(destination);
      expect(
        Object.values(state.districts).map((district) => [district.id, district.ownerClanId]),
      ).toEqual(originalOwners);
      expect(result.events.some((event) => event.type === 'district.subjugated')).toBe(false);
      expect(validateState(state)).toEqual([]);
    },
  );

  it('realpositive holding army is not removed by stationary cleanup', () => {
    const state = buildTinyState();
    const army = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    place(army, CASTLE_A1);
    army.targetNodeId = CASTLE_A1;
    const troops = army.soldiers;
    expect(validateState(state)).toEqual([]);
    advanceDay(state, []);
    expect(state.armies[army.id]?.soldiers).toBe(troops);
    expect(state.officers[army.leaderId]!.armyId).toBe(army.id);
    expect(validateState(state)).toEqual([]);
  });

  it('records reachable pre-existing combat-zero full-tick behavior without adding an early combat cleanup', () => {
    const state = buildTinyState();
    const first = deploy(state, CLAN_ALPHA, CASTLE_A2, OFF_ALPHA_TAISHO, CASTLE_B1);
    const second = deploy(state, CLAN_BETA, CASTLE_B1, OFF_BETA_TAISHO, DIST_B1X);
    place(first, DIST_B1X);
    place(second, DIST_B1X);
    startFieldCombat(state, DIST_B1X, [first.id], [second.id]);
    first.soldiers = 0;
    expect(validateState(state)).toEqual([]);
    const result = advanceDay(state, []);
    // Current supply routes/deletes reachable zero participants BEFORE Step8; this is a control,
    // not proof that fieldCombatSystem can reconcile all pre-existing zero participants itself.
    expect(state.armies[first.id]).toBeUndefined();
    expect(Object.keys(state.fieldCombats)).toHaveLength(0);
    expect(result.events.some((event) => event.type === 'battle.ended')).toBe(true);
    expect(validateState(state)).toEqual([]);
  });
});
