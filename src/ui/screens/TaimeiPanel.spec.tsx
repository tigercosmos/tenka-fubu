import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TaimeiPanel } from './TaimeiPanel';
import { TAIMEI_CATALOG } from '@core/index';
import { BAL } from '@core/balance';
import { castleFoodCap } from '@core/domestic';
import { resetGameStoreForTests, store } from '@app/store';
import {
  getBridgeProgressMark,
  initializeBridgeSession,
  resetBridgeForTests,
  runOneDay,
} from '@app/bridge';
import { useUIStore } from '../hooks/uiStore';
import { t } from '@i18n/zh-TW';
import { buildTinyState, CLAN_ALPHA } from '../../../tests/fixtures/tiny';

function mount(prestige = 1000, gold = 1000) {
  const game = buildTinyState();
  game.clans[CLAN_ALPHA]!.prestige = prestige;
  game.clans[CLAN_ALPHA]!.gold = gold;
  resetGameStoreForTests(game);
  store.getState().actions.setScreen('main');
  initializeBridgeSession(game);
  store.getState().actions.setSpeed('x2');
  store.getState().actions.requestPause('user');
  render(<TaimeiPanel />);
  return game;
}
beforeEach(() => {
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  useUIStore.getState().actions.reset();
});
function select(name: string) {
  fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${name}`) }));
}
function detail() {
  return screen.getByRole('region', { name: t('ui.taimei.detail') });
}

describe('full eight-kind TaimeiPanel', () => {
  it('renders every catalog row and actual validator reason for locked invocation', () => {
    mount(0);
    expect(TAIMEI_CATALOG).toHaveLength(8);
    for (const def of TAIMEI_CATALOG) {
      expect(screen.getByRole('button', { name: new RegExp(`^${def.name}`) })).toBeTruthy();
      select(def.name);
      expect(within(detail()).getByRole('button', { name: t('ui.taimei.invoke') })).toHaveProperty(
        'disabled',
        true,
      );
      expect(detail().textContent).toContain(t('cmd.reject.taimeiLocked'));
      expect(detail().textContent).toContain(def.description);
    }
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });
  it('uses native cancel-first owned FIFO confirmation and leaves state/queue/pause unchanged on cancel', async () => {
    const game = mount();
    const before = structuredClone(game);
    fireEvent.click(within(detail()).getByRole('button', { name: t('ui.taimei.invoke') }));
    expect(useUIStore.getState().modal).toMatchObject({
      id: 'confirm',
      params: { owner: 'taimei' },
    });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole('button', { name: t('ui.common.cancel') }),
      ),
    );
    expect(screen.getByRole('dialog').textContent).toContain(
      t('ui.taimei.confirm', {
        cost: TAIMEI_CATALOG[0]!.prestigeCost,
        name: TAIMEI_CATALOG[0]!.name,
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([]);
    expect(store.getState().session.lastPauseReason).toBe('user');
  });
  it('queues one canonical command and applies only at the next normal tick, preserving manual pause', () => {
    const game = mount();
    const before = structuredClone(game);
    const def = TAIMEI_CATALOG.find((row) => row.id === 'taimei.gaiko-kosei')!;
    select(def.name);
    fireEvent.click(within(detail()).getByRole('button', { name: t('ui.taimei.invoke') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(game).toEqual(before);
    expect(getBridgeProgressMark()?.pendingCommands).toEqual([
      { type: 'invokeTaimei', clanId: CLAN_ALPHA, taimeiId: def.id },
    ]);
    expect(within(detail()).getByRole('button', { name: t('ui.taimei.invoke') })).toHaveProperty(
      'disabled',
      true,
    );
    expect(detail().textContent).toContain(t('ui.taimei.queued'));
    act(() => {
      runOneDay();
    });
    expect(game.clans[CLAN_ALPHA]!.taimei.activeTaimeiId).toBe(def.id);
    expect(game.clans[CLAN_ALPHA]!.prestige).toBe(
      before.clans[CLAN_ALPHA]!.prestige - def.prestigeCost,
    );
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });
  it('keeps the active row visible after prestige drops, shows common cooldown and actual gold restriction', () => {
    const game = mount(1000, 0);
    select('獻金免役');
    expect(detail().textContent).toContain(
      t('cmd.reject.insufficientGold', { cost: BAL.taimeiKenkinGold }),
    );
    expect(detail().textContent).toContain(t('ui.taimei.goldCost', { cost: BAL.taimeiKenkinGold }));
    const active = TAIMEI_CATALOG.find((row) => row.id === 'taimei.teppeki')!;
    act(() => {
      game.clans[CLAN_ALPHA]!.prestige = 0;
      game.clans[CLAN_ALPHA]!.taimei = {
        activeTaimeiId: active.id,
        activeUntilDay: game.time.day + active.durationDays,
        cooldownUntilDay: game.time.day + active.durationDays + BAL.taimeiCooldownDays,
      };
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    select(active.name);
    expect(detail().textContent).toContain(
      t('ui.taimei.stateActive', { days: active.durationDays }),
    );
    act(() => {
      game.clans[CLAN_ALPHA]!.prestige = 1000;
      game.clans[CLAN_ALPHA]!.taimei.activeTaimeiId = null;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    expect(detail().textContent).toContain(
      t('ui.taimei.stateCooldown', { days: active.durationDays + BAL.taimeiCooldownDays }),
    );
    expect(within(detail()).getByRole('button', { name: t('ui.taimei.invoke') })).toHaveProperty(
      'disabled',
      true,
    );
  });
  it('shows the authoritative food overflow preview for the gold offering', () => {
    const game = buildTinyState();
    game.clans[CLAN_ALPHA]!.prestige = 1000;
    for (const castle of Object.values(game.castles)) castle.food = castleFoodCap(castle);
    resetGameStoreForTests(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    render(<TaimeiPanel />);
    select('獻金免役');
    expect(detail().textContent).toContain(t('ui.taimei.kenkinOverflow', { food: 0 }));
  });
});
