import { afterEach, describe, expect, it, vi } from 'vitest';
import { selectArmyAutoReturn, requestArmyAutoReturn } from '../../src/ui/army/autoReturn';
import { applyMarch, validateMarch } from '../../src/core/commands/march';
import { canonicalStringify } from '../../src/core/state/serialize';
import type { Command } from '../../src/core/commands/types';
import type { ArmyId } from '../../src/core/state/ids';
import {
  dispatchCommand,
  getQueuedPlayerCommands,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { BAL } from '../../src/core/balance';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';

function fixture() {
  const game = buildTinyState();
  const command = {
    type: 'march' as const,
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [],
    soldiers: 200,
    food: Math.ceil(200 * BAL.fieldFoodPerSoldierDaily * 30),
    targetNodeId: CASTLE_B1,
  };
  expect(validateMarch(game, command).ok).toBe(true);
  applyMarch(game, command, () => {});
  const army = Object.values(game.armies)[0]!;
  return { game, army };
}
afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests();
});

describe('read-only army auto-return control seam', () => {
  it('projects detached authoritative value and validates routed/foreign/missing armies freshly', () => {
    const { game, army } = fixture(),
      before = canonicalStringify(game);
    const view = selectArmyAutoReturn(game, army.id)!;
    expect(view).toMatchObject({ enabled: true, pendingEnabled: null, canToggle: true });
    expect(Object.isFrozen(view)).toBe(true);
    expect(canonicalStringify(game)).toBe(before);
    army.autoReturn = false;
    expect(view.enabled).toBe(true);
    expect(selectArmyAutoReturn(game, army.id)!.enabled).toBe(false);
    army.status = 'routed';
    expect(selectArmyAutoReturn(game, army.id)).toMatchObject({
      canToggle: false,
      validation: { ok: false, reasonKey: 'cmd.reject.officerBusy' },
    });
    army.clanId = CLAN_BETA;
    expect(selectArmyAutoReturn(game, army.id)).toBeNull();
    expect(selectArmyAutoReturn(game, 'army.missing' as ArmyId)).toBeNull();
    expect(selectArmyAutoReturn(null, army.id)).toBeNull();
  });

  it('shows false pending values without rewriting actual state and uses the last actual matching intent', () => {
    const { game, army } = fixture();
    const commands: Command[] = [
      { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: true },
      { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: false },
      { type: 'setAutoReturn', clanId: CLAN_BETA, armyId: army.id, enabled: true },
    ];
    const before = canonicalStringify(game),
      pendingBefore = structuredClone(commands);
    expect(selectArmyAutoReturn(game, army.id, commands)).toMatchObject({
      enabled: true,
      pendingEnabled: false,
      canToggle: false,
    });
    expect(canonicalStringify(game)).toBe(before);
    expect(commands).toEqual(pendingBefore);
  });

  it('suppresses stale, unavailable, queued and unchanged submissions without dispatch', () => {
    const { game, army } = fixture(),
      dispatch = vi.fn(() => ({ ok: true as const }));
    const ports = {
      getGame: () => game,
      getPendingCommands: (): readonly Command[] => [],
      dispatch,
    };
    expect(requestArmyAutoReturn(game, army.id, true, ports).status).toBe('unchanged');
    expect(
      requestArmyAutoReturn(game, army.id, false, { ...ports, getGame: () => buildTinyState() })
        .status,
    ).toBe('stale');
    expect(
      requestArmyAutoReturn(game, army.id, false, {
        ...ports,
        getPendingCommands: () => [
          { type: 'setAutoReturn', clanId: CLAN_ALPHA, armyId: army.id, enabled: false },
        ],
      }).status,
    ).toBe('queued');
    army.clanId = CLAN_BETA;
    expect(requestArmyAutoReturn(game, army.id, false, ports).status).toBe('unavailable');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('detects a session replacement during an injected snapshot read', () => {
    const { game, army } = fixture(),
      dispatch = vi.fn(() => ({ ok: true as const }));
    let current = game;
    expect(
      requestArmyAutoReturn(game, army.id, false, {
        getGame: () => current,
        getPendingCommands: () => {
          current = buildTinyState();
          return [];
        },
        dispatch,
      }).status,
    ).toBe('stale');
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('preserves canonical current validation and ordinary dispatch rejection details', () => {
    const { game, army } = fixture(),
      dispatch = vi.fn(() => ({
        ok: false as const,
        reason: 'cmd.reject.notOwner',
        params: { owner: 'changed' },
      }));
    const ports = { getGame: () => game, getPendingCommands: () => [], dispatch };
    army.status = 'routed';
    expect(requestArmyAutoReturn(game, army.id, false, ports)).toEqual({
      status: 'rejected',
      reason: 'cmd.reject.officerBusy',
    });
    expect(dispatch).not.toHaveBeenCalled();
    army.status = 'marching';
    expect(requestArmyAutoReturn(game, army.id, false, ports)).toEqual({
      status: 'rejected',
      reason: 'cmd.reject.notOwner',
      params: { owner: 'changed' },
    });
  });

  it('reads the real queue without initializing it, and captures false intent until real next-tick application', () => {
    const { game, army } = fixture();
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    const uninitialized = store.getState(),
      before = canonicalStringify(game);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState()).toBe(uninitialized);
    initializeBridgeSession(game);
    const ports = {
      getGame: () => store.getState().game,
      getPendingCommands: () => getQueuedPlayerCommands(game),
      dispatch: dispatchCommand,
    };
    expect(requestArmyAutoReturn(game, army.id, false, ports).status).toBe('submitted');
    expect(canonicalStringify(game)).toBe(before);
    expect(selectArmyAutoReturn(game, army.id, getQueuedPlayerCommands(game))).toMatchObject({
      enabled: true,
      pendingEnabled: false,
      canToggle: false,
    });
    const detached = getQueuedPlayerCommands(game);
    const copied = detached[0]!;
    if (copied.type !== 'setAutoReturn') throw new Error('expected real queued command');
    copied.enabled = true;
    expect(getQueuedPlayerCommands(game)[0]).toMatchObject({ enabled: false });
    expect(requestArmyAutoReturn(game, army.id, false, ports).status).toBe('queued');
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    runOneDay();
    expect(game.armies[army.id]?.autoReturn).toBe(false);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(requestArmyAutoReturn(game, army.id, true, ports).status).toBe('submitted');
    runOneDay();
    expect(game.armies[army.id]?.autoReturn).toBe(true);
  });

  it('never exposes or submits a previous game queue after replacement with reused army IDs', () => {
    const { game, army } = fixture();
    resetGameStoreForTests(game);
    initializeBridgeSession(game);
    expect(
      dispatchCommand({
        type: 'setAutoReturn',
        clanId: CLAN_ALPHA,
        armyId: army.id,
        enabled: false,
      }).ok,
    ).toBe(true);
    const next = fixture().game;
    resetGameStoreForTests(next);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(getQueuedPlayerCommands(next)).toEqual([]);
    initializeBridgeSession(next);
    expect(getQueuedPlayerCommands(next)).toEqual([]);
    expect(
      requestArmyAutoReturn(game, army.id, false, {
        getGame: () => next,
        getPendingCommands: () => getQueuedPlayerCommands(next),
        dispatch: dispatchCommand,
      }).status,
    ).toBe('stale');
  });
});
