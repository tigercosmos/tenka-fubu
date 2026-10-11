import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  selectArmyOrders,
  getArmyTargetPreviews,
  requestArmyTarget,
  requestArmyRecall,
  requestArmyKassen,
} from '../../src/ui/army/orders';
import { applyMarch } from '../../src/core/commands/march';
import { validateCommand } from '../../src/core/commands/validate';
import { computePath } from '../../src/core/systems/pathfinding';
import { buildMapGraph } from '../../src/core/state/mapGraph';
import { startFieldCombat } from '../../src/core/systems/fieldCombat';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { canonicalStringify } from '../../src/core/state/serialize';
import { validateState } from '../../src/core/state/invariants';
import { BAL } from '../../src/core/balance';
import type { Command } from '../../src/core/commands/types';
import type { ArmyId, CorpsId, MapNodeId } from '../../src/core/state/ids';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_LORD,
  OFF_BETA_TAISHO,
} from '../fixtures/tiny';

function fixture() {
  const game = buildTinyState();
  const command: Command = {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [],
    soldiers: 200,
    food: 200,
    targetNodeId: CASTLE_B1,
  };
  expect(validateCommand(game, command).ok).toBe(true);
  applyMarch(game, command, () => undefined);
  const army = Object.values(game.armies)[0]!;
  return { game, army };
}
function recordingPorts(game: ReturnType<typeof buildTinyState>, pending: Command[] = []) {
  const dispatch = vi.fn((command: Command) => {
    const verdict = validateCommand(game, command);
    if (!verdict.ok) return { ok: false as const, reason: verdict.reasonKey };
    pending.push(structuredClone(command));
    return { ok: true as const };
  });
  return { getGame: () => game, getPendingCommands: () => pending, dispatch };
}
afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests();
});

describe('authoritative army strategy order presentation seam', () => {
  it('previews actual mid-edge remaining and reverse distance with detached frozen leg metadata', () => {
    const { game, army } = fixture();
    // Controlled entered-leg fixture: the current road subsequently changes, while
    // the already entered leg retains its authoritative four-day cost.
    army.path = [CASTLE_A1, CASTLE_A2, CASTLE_B1];
    army.pathCursor = 0;
    army.posNodeId = CASTLE_A1;
    army.edgeCostDays = 4;
    army.edgeProgressDays = 1.5;
    game.roads['road.a1-a2' as keyof typeof game.roads]!.baseDays = 8;
    const before = canonicalStringify(game);
    const pending: Command[] = [];
    const pendingBefore = structuredClone(pending);
    const previews = getArmyTargetPreviews(game, army.id, pending);
    const forward = previews.find((row) => row.targetNodeId === CASTLE_B1)!;
    const reverse = previews.find((row) => row.targetNodeId === CASTLE_A1)!;
    expect(forward.pathEstimateDays).toBe(4 - 1.5 + 3);
    expect(forward.nodeIds).toEqual([CASTLE_A1, CASTLE_A2, CASTLE_B1]);
    expect(forward.physicalLeg).toEqual({
      fromName: game.castles[CASTLE_A1]!.name,
      endName: game.castles[CASTLE_A2]!.name,
      reversing: false,
    });
    expect(reverse.pathEstimateDays).toBe(1.5);
    expect(reverse.nodeIds).toEqual([CASTLE_A1]);
    expect(reverse.physicalLeg).toEqual({ ...forward.physicalLeg, reversing: true });
    expect(Object.isFrozen(forward.physicalLeg)).toBe(true);
    expect(Object.isFrozen(reverse.physicalLeg)).toBe(true);
    expect(Object.isFrozen(previews)).toBe(true);
    expect(canonicalStringify(game)).toBe(before);
    expect(pending).toEqual(pendingBefore);
    game.castles[CASTLE_A1]!.name = 'changed after projection';
    expect(forward.physicalLeg!.fromName).not.toBe(game.castles[CASTLE_A1]!.name);
    army.edgeProgressDays = 1;
    const fresh = getArmyTargetPreviews(game, army.id);
    expect(fresh.find((row) => row.targetNodeId === CASTLE_A1)!.pathEstimateDays).toBe(1);
    expect(reverse.pathEstimateDays).toBe(1.5);
  });

  it('projects detached owned status/targets and canonical legal paths without writes', () => {
    const { game, army } = fixture(),
      before = canonicalStringify(game);
    const view = selectArmyOrders(game, army.id)!;
    const previews = getArmyTargetPreviews(game, army.id);
    expect(view).toMatchObject({
      armyId: army.id,
      status: 'marching',
      fromNodeId: CASTLE_A1,
      targetNodeId: CASTLE_B1,
      canRecall: true,
      canRetarget: true,
    });
    expect(previews.map((row) => row.targetNodeId)).toEqual(
      [...previews.map((row) => row.targetNodeId)].sort(),
    );
    expect(previews.some((row) => row.targetNodeId === CASTLE_A1)).toBe(false);
    const graph = buildMapGraph(game.castles, game.districts, game.roads);
    for (const row of previews) {
      expect(
        validateCommand(game, {
          type: 'setArmyTarget',
          clanId: CLAN_ALPHA,
          armyId: army.id,
          targetNodeId: row.targetNodeId,
        }).ok,
      ).toBe(true);
      const path = computePath(game, graph, {
        clanId: CLAN_ALPHA,
        from: army.posNodeId,
        to: row.targetNodeId,
        speedFactor: 1,
      });
      expect(row.nodeIds).toEqual(path.nodes);
      expect(row.pathEstimateDays).toBe(path.totalDays);
      expect(Object.isFrozen(row.nodeIds)).toBe(true);
    }
    expect(canonicalStringify(game)).toBe(before);
    army.targetNodeId = CASTLE_A2;
    game.castles[CASTLE_B1]!.name = 'New name';
    expect(view.targetNodeId).toBe(CASTLE_B1);
    expect(previews.find((row) => row.targetNodeId === CASTLE_B1)!.name).not.toBe('New name');
    expect(selectArmyOrders(game, army.id)!.targetNodeId).toBe(CASTLE_A2);
  });

  it('honors central routed/engaged, delegated corps, foreign and game-over guards', () => {
    const { game, army } = fixture(),
      ports = recordingPorts(game);
    for (const status of ['routed', 'engaged'] as const) {
      army.status = status;
      expect(selectArmyOrders(game, army.id)).toMatchObject({
        canRecall: false,
        canRetarget: false,
        retargetValidation: { ok: false, reasonKey: 'cmd.reject.officerBusy' },
      });
      expect(getArmyTargetPreviews(game, army.id)).toEqual([]);
      expect(requestArmyTarget(game, army.id, CASTLE_A2, ports)).toMatchObject({
        status: 'rejected',
        reason: 'cmd.reject.officerBusy',
      });
    }
    army.status = 'holding';
    const corpsId = 'corps.orders' as CorpsId;
    game.corps[corpsId] = {
      id: corpsId,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_LORD,
      directive: 'hold',
      targetNodeId: null,
      gold: 0,
      createdDay: game.time.day,
    };
    army.corpsId = corpsId;
    expect(selectArmyOrders(game, army.id)).toMatchObject({
      canRecall: false,
      canRetarget: false,
      recallValidation: { ok: false, reasonKey: 'cmd.reject.delegatedToCorps' },
    });
    expect(requestArmyRecall(game, army.id, ports)).toMatchObject({
      status: 'rejected',
      reason: 'cmd.reject.delegatedToCorps',
    });
    army.corpsId = null;
    army.clanId = CLAN_BETA;
    expect(selectArmyOrders(game, army.id)).toBeNull();
    expect(requestArmyRecall(game, army.id, ports).status).toBe('unavailable');
    army.clanId = CLAN_ALPHA;
    game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    expect(requestArmyTarget(game, army.id, CASTLE_A2, ports)).toMatchObject({
      status: 'rejected',
      reason: 'cmd.reject.gameOver',
    });
    expect(ports.dispatch).not.toHaveBeenCalled();
  });

  it('keeps actual target separate from queued target and blocks conflicting queued recalls', () => {
    const { game, army } = fixture();
    const pending: Command[] = [
      { type: 'setArmyTarget', clanId: CLAN_ALPHA, armyId: army.id, targetNodeId: CASTLE_A2 },
    ];
    const before = canonicalStringify(game),
      ports = recordingPorts(game, pending),
      pendingBefore = structuredClone(pending);
    expect(selectArmyOrders(game, army.id, pending)).toMatchObject({
      targetNodeId: CASTLE_B1,
      pendingTargetNodeId: CASTLE_A2,
      canRecall: false,
      canRetarget: false,
    });
    expect(getArmyTargetPreviews(game, army.id, pending)).toEqual([]);
    expect(requestArmyRecall(game, army.id, ports).status).toBe('queued');
    expect(requestArmyTarget(game, army.id, CASTLE_B1, ports).status).toBe('queued');
    expect(canonicalStringify(game)).toBe(before);
    expect(pending).toEqual(pendingBefore);
    pending.splice(0, pending.length, { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: army.id });
    expect(selectArmyOrders(game, army.id, pending)).toMatchObject({
      pendingRecall: true,
      pendingTargetNodeId: null,
    });
    expect(requestArmyTarget(game, army.id, CASTLE_A2, ports).status).toBe('queued');
    expect(ports.dispatch).not.toHaveBeenCalled();
  });

  it('rechecks identity after a pending snapshot and ignores commands owned by other clans/armies', () => {
    const { game, army } = fixture(),
      ports = recordingPorts(game);
    const replacement = buildTinyState();
    expect(requestArmyRecall(game, army.id, { ...ports, getGame: () => replacement }).status).toBe(
      'stale',
    );
    let current = game;
    expect(
      requestArmyTarget(game, army.id, CASTLE_A2, {
        ...ports,
        getGame: () => current,
        getPendingCommands: () => {
          current = replacement;
          return [];
        },
      }).status,
    ).toBe('stale');
    expect(ports.dispatch).not.toHaveBeenCalled();
    const pending: Command[] = [
      { type: 'recallArmy', clanId: CLAN_BETA, armyId: army.id },
      { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: 'army.other' as ArmyId },
    ];
    expect(selectArmyOrders(game, army.id, pending)!.canRetarget).toBe(true);
  });

  it('re-reads in-place roads and diplomacy, rejecting stale selected or missing targets', () => {
    const { game, army } = fixture(),
      ports = recordingPorts(game);
    const before = getArmyTargetPreviews(game, army.id).find(
      (row) => row.targetNodeId === CASTLE_B1,
    )!;
    for (const edge of Object.values(game.roads)) edge.baseDays *= 2;
    expect(
      getArmyTargetPreviews(game, army.id).find((row) => row.targetNodeId === CASTLE_B1)!
        .pathEstimateDays,
    ).toBeGreaterThan(before.pathEstimateDays);
    const row = ensureDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA);
    row.pacts = [
      {
        kind: 'ceasefire',
        startDay: game.time.day,
        endDay: game.time.day + 30,
        vassalClanId: null,
      },
    ];
    expect(getArmyTargetPreviews(game, army.id).some((row) => row.targetNodeId === CASTLE_B1)).toBe(
      false,
    );
    expect(requestArmyTarget(game, army.id, CASTLE_B1, ports)).toMatchObject({
      status: 'rejected',
      reason: 'cmd.reject.pathBlocked',
    });
    expect(requestArmyTarget(game, army.id, 'castle.missing' as MapNodeId, ports)).toMatchObject({
      status: 'rejected',
      reason: 'cmd.reject.pathBlocked',
    });
    expect(ports.dispatch).not.toHaveBeenCalled();
  });

  it('suppresses unchanged marching targets but permits retry of a held retained target', () => {
    const { game, army } = fixture(),
      ports = recordingPorts(game);
    expect(requestArmyTarget(game, army.id, CASTLE_B1, ports).status).toBe('unchanged');
    army.status = 'holding';
    expect(requestArmyTarget(game, army.id, CASTLE_B1, ports).status).toBe('submitted');
    expect(army.status).toBe('holding');
    expect(ports.dispatch).toHaveBeenCalledTimes(1);
    army.status = 'returning';
    expect(requestArmyRecall(game, army.id, recordingPorts(game)).status).toBe('unchanged');
  });

  it('queues retarget through the real bridge and blocks conflicting recall before execution', () => {
    const { game, army } = fixture();
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    const ports = {
      getGame: () => store.getState().game,
      getPendingCommands: () => getQueuedPlayerCommands(game),
      dispatch: dispatchCommand,
    };
    const before = canonicalStringify(game);
    expect(requestArmyTarget(game, army.id, CASTLE_A2, ports).status).toBe('submitted');
    expect(canonicalStringify(game)).toBe(before);
    expect(requestArmyRecall(game, army.id, ports).status).toBe('queued');
    runOneDay();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    const survivor = game.armies[army.id];
    if (survivor) expect(survivor.targetNodeId).toBe(CASTLE_A2);
    else expect(game.officers[OFF_ALPHA_BUSHO]!.locationCastleId).toBe(CASTLE_A2);
  });

  it('queues a real recall at a reached node and returns officers only after strategy execution', () => {
    const { game, army } = fixture();
    // Controlled actual-node placement, not a claim about reversing a partially travelled edge.
    army.posNodeId = CASTLE_A2;
    army.path = [CASTLE_A2];
    army.pathCursor = 0;
    army.edgeCostDays = 0;
    army.edgeProgressDays = 0;
    army.status = 'holding';
    expect(validateState(game)).toEqual([]);
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    const ports = {
      getGame: () => store.getState().game,
      getPendingCommands: () => getQueuedPlayerCommands(game),
      dispatch: dispatchCommand,
    };
    const before = canonicalStringify(game);
    expect(requestArmyRecall(game, army.id, ports).status).toBe('submitted');
    expect(selectArmyOrders(game, army.id, getQueuedPlayerCommands(game))).toMatchObject({
      pendingRecall: true,
      status: 'holding',
    });
    expect(canonicalStringify(game)).toBe(before);
    for (let day = 0; day < 3 && game.armies[army.id]; day += 1) runOneDay();
    expect(game.armies[army.id]).toBeUndefined();
    expect(game.officers[OFF_ALPHA_BUSHO]!.locationCastleId).toBe(CASTLE_A1);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  });

  it('only offers actual selected-army encounters, central troop/authority eligibility and queued kassen', () => {
    const { game, army } = fixture();
    const soldiers = BAL.kassenMinTroops;
    army.soldiers = soldiers;
    game.castles[CASTLE_B1]!.soldiers = soldiers;
    applyMarch(
      game,
      {
        type: 'march',
        clanId: CLAN_BETA,
        originCastleId: CASTLE_B1,
        leaderId: OFF_BETA_TAISHO,
        deputyIds: [],
        soldiers,
        food: soldiers,
        targetNodeId: CASTLE_A1,
      },
      () => undefined,
    );
    const enemy = Object.values(game.armies).find((entry) => entry.clanId === CLAN_BETA)!;
    for (const entry of [army, enemy]) {
      entry.posNodeId = CASTLE_A2;
      entry.path = [CASTLE_A2];
      entry.pathCursor = 0;
      entry.edgeCostDays = 0;
      entry.edgeProgressDays = 0;
      entry.status = 'holding';
    }
    startFieldCombat(game, CASTLE_A2, [army.id], [enemy.id]);
    const combat = Object.values(game.fieldCombats)[0]!,
      pending: Command[] = [],
      ports = recordingPorts(game, pending);
    expect(selectArmyOrders(game, army.id)!.kassen).toMatchObject([
      { fieldCombatId: combat.id, canRequest: true, pending: false, validation: { ok: true } },
    ]);
    const before = canonicalStringify(game);
    expect(requestArmyKassen(game, army.id, combat.id, ports).status).toBe('submitted');
    expect(canonicalStringify(game)).toBe(before);
    expect(selectArmyOrders(game, army.id, pending)!.kassen[0]).toMatchObject({
      pending: true,
      canRequest: false,
    });
    expect(requestArmyKassen(game, army.id, combat.id, ports).status).toBe('queued');
    expect(requestArmyKassen(game, army.id, 'fc.missing', recordingPorts(game)).status).toBe(
      'unavailable',
    );
    army.corpsId = 'corps.delegated' as CorpsId;
    expect(selectArmyOrders(game, army.id)!.kassen[0]).toMatchObject({
      canRequest: false,
      validation: { ok: false, reasonKey: 'cmd.reject.delegatedToCorps' },
    });
    army.corpsId = null;
    army.soldiers = 1;
    enemy.soldiers = 1;
    expect(requestArmyKassen(game, army.id, combat.id, recordingPorts(game))).toMatchObject({
      status: 'rejected',
      reason: 'cmd.reject.insufficientTroops',
    });
  });
});
