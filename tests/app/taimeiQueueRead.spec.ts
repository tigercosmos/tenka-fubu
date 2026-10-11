import { beforeEach, describe, expect, it } from 'vitest';
import {
  hasQueuedTaimeiInvocation,
  initializeBridgeSession,
  dispatchCommand,
  resetBridgeForTests,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { buildTinyState, CLAN_ALPHA, CLAN_BETA } from '../fixtures/tiny';
import type { TaimeiId } from '../../src/core/state/ids';

beforeEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
});
describe('strict read-only taimei queue guard', () => {
  it('does not initialize a fresh game/queue, publish store state or consume RNG', () => {
    const game = buildTinyState();
    setGame(game);
    const snapshot = store.getState();
    const before = structuredClone(game);
    expect(hasQueuedTaimeiInvocation(CLAN_ALPHA)).toBe(false);
    expect(store.getState()).toBe(snapshot);
    expect(game).toEqual(before);
  });
  it('matches only the active session clan and is inert after game replacement', () => {
    const game = buildTinyState();
    game.clans[CLAN_ALPHA]!.prestige = 1000;
    setGame(game);
    initializeBridgeSession(game);
    expect(
      dispatchCommand({
        type: 'invokeTaimei',
        clanId: CLAN_ALPHA,
        taimeiId: 'taimei.gaiko-kosei' as TaimeiId,
      }).ok,
    ).toBe(true);
    const snapshot = store.getState();
    expect(hasQueuedTaimeiInvocation(CLAN_ALPHA)).toBe(true);
    expect(hasQueuedTaimeiInvocation(CLAN_BETA)).toBe(false);
    expect(store.getState()).toBe(snapshot);
    setGame(buildTinyState());
    const replacement = store.getState();
    expect(hasQueuedTaimeiInvocation(CLAN_ALPHA)).toBe(false);
    expect(store.getState()).toBe(replacement);
  });
});
