import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasQueuedTransportRecall,
  initializeBridgeSession,
  dispatchCommand,
  resetBridgeForTests,
  getBridgeProgressMark,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { buildTinyState, CASTLE_A1, CASTLE_A2, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';
import type { TransportId } from '../../src/core/state/ids';

const transportId = 'trans.read-only' as TransportId;

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});

describe('strict read-only transport recall queue guard', () => {
  it('does not initialize a fresh game/queue, publish state or consume RNG', () => {
    expect(hasQueuedTransportRecall(CLAN_ALPHA, transportId)).toBe(false);
    const game = buildTinyState();
    setGame(game);
    const snapshot = store.getState();
    const before = structuredClone(game);
    expect(hasQueuedTransportRecall(CLAN_ALPHA, transportId)).toBe(false);
    expect(store.getState()).toBe(snapshot);
    expect(game).toEqual(before);
  });

  it('matches the active session, clan and order without changing pending commands or seq', () => {
    const game = buildTinyState();
    game.transports[transportId] = {
      id: transportId,
      clanId: CLAN_ALPHA,
      fromCastleId: CASTLE_A1,
      toCastleId: CASTLE_A2,
      food: 100,
      soldiers: 0,
      gold: 0,
      path: [CASTLE_A1, CASTLE_A2],
      pathCursor: 0,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      returning: false,
    };
    setGame(game);
    initializeBridgeSession(game);
    expect(dispatchCommand({ type: 'recallTransport', clanId: CLAN_ALPHA, transportId }).ok).toBe(
      true,
    );
    const snapshot = store.getState();
    const before = structuredClone(game);
    const pending = getBridgeProgressMark();
    expect(hasQueuedTransportRecall(CLAN_ALPHA, transportId)).toBe(true);
    expect(hasQueuedTransportRecall(CLAN_BETA, transportId)).toBe(false);
    expect(hasQueuedTransportRecall(CLAN_ALPHA, 'trans.other' as TransportId)).toBe(false);
    expect(store.getState()).toBe(snapshot);
    expect(getBridgeProgressMark()).toEqual(pending);
    expect(game).toEqual(before);

    setGame(buildTinyState());
    const replacement = store.getState();
    expect(hasQueuedTransportRecall(CLAN_ALPHA, transportId)).toBe(false);
    expect(store.getState()).toBe(replacement);
  });
});
