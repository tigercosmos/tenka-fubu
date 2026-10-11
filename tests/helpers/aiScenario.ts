import { expect } from 'vitest';
import { applyCommand } from '../../src/core/commands/apply';
import { validateCommand } from '../../src/core/commands/validate';
import type { Command } from '../../src/core/commands/types';
import type { ExecutionAuthority } from '../../src/core/commands/authority';
import type { GameState } from '../../src/core/state/gameState';
import type { CastleId, DistrictId, OfficerId, RoadEdgeId } from '../../src/core/state/ids';
import type { AiScope, AiSink } from '../../src/core/systems/ai/types';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  PERSONA_DEFAULT,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

export function aiScenario(): { state: GameState; scope: AiScope } {
  const state = buildTinyState();
  state.meta.playerClanId = CLAN_BETA;
  state.ai.personas[PERSONA_DEFAULT]!.aggression = 90;
  for (const id of [CASTLE_A1, CASTLE_A2]) {
    state.castles[id]!.soldiers = 2000;
    state.castles[id]!.food = 20_000;
    state.castles[id]!.morale = 100;
  }
  state.castles[CASTLE_B1]!.soldiers = 200;
  return {
    state,
    scope: {
      clanId: CLAN_ALPHA,
      corpsId: null,
      castleIds: [CASTLE_A1, CASTLE_A2],
      targetNodeId: null,
    },
  };
}
/** Adds a connected, numerically valid synthetic friendly source before any topology caching. */
export function addAiSource(state: GameState, suffix: string): CastleId {
  const id = `castle.${suffix}` as CastleId,
    leaderId = `off.${suffix}` as OfficerId;
  const template = state.castles[CASTLE_A1]!;
  const districtIds = template.districtIds.map((source, i) => {
    const districtId = `dist.${suffix}-${i}` as DistrictId;
    state.districts[districtId] = {
      ...structuredClone(state.districts[source]!),
      id: districtId,
      castleId: id,
      stewardId: null,
    };
    return districtId;
  });
  state.officers[leaderId] = {
    ...structuredClone(state.officers[OFF_ALPHA_BUSHO]!),
    id: leaderId,
    locationCastleId: id,
    armyId: null,
    ldr: 90,
    rank: 'busho',
  };
  state.castles[id] = {
    ...structuredClone(template),
    id,
    name: suffix,
    lordId: leaderId,
    districtIds,
  };
  for (const [i, node] of [CASTLE_A1, ...districtIds].entries()) {
    const edgeId = `road.${suffix}-${i}` as RoadEdgeId;
    state.roads[edgeId] = { id: edgeId, a: id, b: node, type: 'land', grade: 3, baseDays: 0.5 };
  }
  return id;
}
/** Faithful deferred sink: ordinary validators and appliers reserve against a shadow. */
export function validatingSink(state: GameState) {
  const shadow = structuredClone(state),
    orders: { command: Command; authority: ExecutionAuthority }[] = [];
  const sink: AiSink = {
    canEnqueue(command, authority) {
      shadow.ai = structuredClone(state.ai);
      return validateCommand(shadow, command, authority);
    },
    enqueue(command, authority) {
      shadow.ai = structuredClone(state.ai);
      const result = validateCommand(shadow, command, authority);
      if (result.ok) {
        applyCommand(shadow, command, () => {}, authority);
        orders.push({ command, authority });
      }
      return result;
    },
    record(intent) {
      state.ai.intentLog.push(intent);
    },
  };
  return {
    sink,
    orders,
    flush() {
      for (const { command, authority } of orders) {
        expect(validateCommand(state, command, authority), command.type).toEqual({ ok: true });
        applyCommand(state, command, () => {}, authority);
      }
    },
  };
}
