import { afterEach, expect, it } from 'vitest';
import traceData from '../replay/cases/m6-payroll-unpaid-recovery.tfulog.json';
import {
  dispatchCommand,
  exportCommandLog,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, setGame, store } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { buildMiniState, CLAN_ALPHA, OFF_ALPHA_LORD } from '../fixtures/mini';
import type { CommandLogFile } from '../../src/core/replay/commandLog';
import { validateState } from '../../src/core/state/invariants';
import { stateHash } from '../../src/core/state/serialize';

afterEach(() => {
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
});
it('matches naturally reached unpaid payroll and earned recovery through actual runOneDay', () => {
  const trace = traceData as CommandLogFile;
  const game = buildMiniState({ seed: trace.seed });
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  let refunded = false;
  for (let tick = 1; tick <= trace.finalDay; tick++) {
    for (const entry of trace.entries.filter((entry) => entry.day === tick && !entry.authority))
      expect(dispatchCommand(entry.command)).toEqual({ ok: true });
    const beforeGold = game.clans[CLAN_ALPHA]!.gold;
    const beforeWallet = Object.values(game.corps)[0]?.gold ?? 0;
    const events = runOneDay();
    expect(events.filter((event) => event.type === 'command.rejected')).toEqual([]);
    expect(store.getState().session.fatalError).toBeNull();
    expect(validateState(game), `actual bridge day ${game.time.day}`).toEqual([]);
    if (game.time.day === 120) {
      const unpaid = events.find(
        (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
      );
      expect(unpaid?.type).toBe('economy.upkeepUnpaid');
      if (unpaid?.type !== 'economy.upkeepUnpaid')
        throw new Error('Missing real unpaid settlement');
      expect(unpaid.payeeIds).toHaveLength(3);
      expect(unpaid.payeeIds).not.toContain(OFF_ALPHA_LORD);
      expect(game.clans[CLAN_ALPHA]!.gold).toBe(0);
    }
    if (game.time.day === 121) {
      expect(beforeWallet).toBeGreaterThan(0);
      expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeGold + beforeWallet);
      expect(Object.values(game.corps)).toEqual([]);
      refunded = true;
    }
    if (game.time.day === 150)
      expect(
        events.filter(
          (event) => event.type === 'economy.upkeepUnpaid' && event.clanId === CLAN_ALPHA,
        ),
      ).toEqual([]);
    expect(game.officers[OFF_ALPHA_LORD]!.loyalty).toBe(100);
  }
  expect(refunded).toBe(true);
  expect(exportCommandLog()).toEqual(trace);
  expect(stateHash(game)).toBe(trace.finalHash);
});
