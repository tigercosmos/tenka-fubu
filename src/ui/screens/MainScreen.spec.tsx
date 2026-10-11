// MainScreen 元件測試（M1-20；18-roadmap.md M1-20 驗收：「HUD 日期隨 tick 前進」；M2-19 起額外
// 掛載 MapCanvasHost，故整包 mock pixi.js，見 tests/helpers/pixiMock.ts 檔頭）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const hoisted = vi.hoisted(() => ({
  apps: [] as { destroyed: boolean }[],
  dismissReport: null as ((id: string) => void) | null,
  rewardClosers: [] as (() => void)[],
  targetCallbacks: [] as { onClose: () => void; onSubmit: (id: string) => unknown }[],
  armyCallbacks: [] as NonNullable<
    import('./panels/CastlePanel').CastlePanelProps['onSelectArmy']
  >[],
}));
vi.mock('./RewardRoster', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./RewardRoster')>();
  return {
    ...actual,
    RewardRoster(props: { onClose: () => void }) {
      hoisted.rewardClosers.push(props.onClose);
      return <actual.RewardRoster {...props} />;
    },
  };
});
vi.mock('./panels/CastlePanel', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./panels/CastlePanel')>();
  return {
    ...actual,
    CastlePanel(props: import('./panels/CastlePanel').CastlePanelProps) {
      if (props.onSelectArmy) hoisted.armyCallbacks.push(props.onSelectArmy);
      return <actual.CastlePanel {...props} />;
    },
  };
});
vi.mock('../army/ArmyTargetModal', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../army/ArmyTargetModal')>();
  return {
    ...actual,
    ArmyTargetModal(props: import('../army/ArmyTargetModal').ArmyTargetModalProps) {
      hoisted.targetCallbacks.push({
        onClose: props.onClose,
        onSubmit: (id) => props.onSubmit(id as import('@core/state/ids').MapNodeId),
      });
      return <actual.ArmyTargetModal {...props} />;
    },
  };
});
vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../../../tests/helpers/pixiMock');
  return createPixiMockClasses(hoisted.apps);
});
vi.mock('../components', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../components')>();
  return {
    ...actual,
    ReportStack(props: import('../components/ReportStack/ReportStack').ReportStackProps) {
      hoisted.dismissReport = props.onDismiss;
      return <actual.ReportStack {...props} />;
    },
  };
});

import { MainScreen } from './MainScreen';
import { SystemMenuHost } from './SystemMenuHost';
import type { SystemPanel } from './SystemMenu';
import { resetGameStoreForTests, setGame, store } from '../../app/store';
import { resetBridgeForTests, runOneDay } from '../../app/bridge';
import { makeLoopTestState } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { t } from '@i18n/zh-TW';
import { UI } from '../uiConstants';
import { MapRenderer } from '../map/MapRenderer';
import type { ArmyId, ClanId, OfficerId, PolicyId } from '@core/state/ids';
import type { Army } from '@core/state/gameState';
import { dispatchCommand, initializeBridgeSession, getQueuedPlayerCommands } from '@app/bridge';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  CLAN_ALPHA,
  CLAN_BETA,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
  OFF_BETA_BUSHO,
  OFF_BETA_TAISHO,
} from '../../../tests/fixtures/tiny';
import { applyMarch } from '@core/commands/march';
import {
  calendarToDay,
  dayToCalendar,
  getTrust,
  isOfficerBusy,
  officerAbilityScore,
  validateCommand,
} from '@core/index';
import { BAL } from '@core/balance';
import { settingsStore } from '@app/settings/runtime';
import { selectBudgetForecast } from '@core/state/selectors';
import { validateState } from '@core/state/invariants';
import { prepareAllianceAdmission, tinyAllianceRow } from '../../../tests/helpers/diplomacyJourney';
import { COURT_PLAYER, prepareCourtAdmission } from '../../../tests/helpers/courtJourney';
import { preparePoachAdmission } from '../../../tests/helpers/plotJourney';

function prepareOrderArmy() {
  const game = buildTinyState();
  applyMarch(
    game,
    {
      type: 'march',
      clanId: CLAN_ALPHA,
      originCastleId: CASTLE_A1,
      leaderId: OFF_ALPHA_LORD,
      deputyIds: [],
      soldiers: 100,
      food: 200,
      targetNodeId: CASTLE_B1,
    },
    () => {},
  );
  const army = Object.values(game.armies)[0]!;
  setGame(game);
  initializeBridgeSession(game);
  uiStore.getState().actions.setSelection({ kind: 'army', id: army.id });
  return { game, army };
}

const LOCAL_RONIN = 'off.local-ronin' as OfficerId;
function prepareCastleRonin() {
  const game = buildTinyState();
  const base = game.officers[OFF_ALPHA_LORD]!;
  for (const [id, name, castleId, hasComeOfAge] of [
    [LOCAL_RONIN, '本城浪人', CASTLE_A1, true],
    ['off.other-ronin', '另一城浪人', CASTLE_A2, true],
    ['off.foreign-ronin', '敵城浪人', CASTLE_B1, true],
    ['off.young-ronin', '未成年浪人', CASTLE_A1, false],
  ] as const) {
    const officerId = id as OfficerId;
    game.officers[officerId] = {
      ...structuredClone(base),
      id: officerId,
      name,
      status: 'ronin',
      clanId: null,
      locationCastleId: castleId,
      hasComeOfAge,
      armyId: null,
      spouseId: null,
    };
  }
  setGame(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  return game;
}

beforeEach(() => {
  settingsStore.getState().resetSettings();
  hoisted.rewardClosers.length = 0;
  hoisted.armyCallbacks.length = 0;
  hoisted.targetCallbacks.length = 0;
  resetBridgeForTests();
  resetGameStoreForTests(makeLoopTestState({ day: 0, gold: 1000 }));
  uiStore.getState().actions.reset();
  // M6-V9 起 MainScreen 掛載 MiniMap（兩層 canvas）；jsdom 無 canvas 2D 實作（17 §3.2），
  // mock 掉避免 not-implemented 噪音——MiniMap 對 null ctx 已有防禦（比照 MiniMap.spec.tsx）。
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  settingsStore.getState().resetSettings();
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('MainScreen（11 §3.3 縮減版 HUD）', () => {
  it('cancels captive execution without side effects and settles confirmed execution through the real modal host', () => {
    const game = buildTinyState();
    const captive = game.officers[OFF_BETA_BUSHO]!;
    captive.status = 'captive';
    captive.capturedByClanId = game.meta.playerClanId;
    captive.locationCastleId = CASTLE_A1;
    expect(validateState(game)).toEqual([]);
    setGame(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.enqueueModal({
      id: 'captive',
      params: { officerId: captive.id },
      pausesTime: true,
    });
    render(<MainScreen />);
    const owner = uiStore.getState().modal;
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
    const confirmation = screen.getByRole('dialog', { name: t('cmd.captive.execute') });
    expect(confirmation.textContent).toContain(
      t('ui.captive.executeConfirm', { name: captive.name }),
    );
    fireEvent.click(within(confirmation).getByRole('button', { name: t('ui.common.cancel') }));
    expect(screen.queryByRole('dialog', { name: t('cmd.captive.execute') })).toBeNull();
    expect(game).toEqual(before);
    expect(uiStore.getState().modal).toBe(owner);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: t('cmd.captive.execute') }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: t('cmd.captive.execute') })).getByRole('button', {
        name: t('ui.common.confirm'),
      }),
    );
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'handleCaptive',
        clanId: game.meta.playerClanId,
        officerId: captive.id,
        action: 'execute',
        executorId: null,
      },
    ]);
    expect(game).toEqual(before);
    expect(screen.queryByTestId('captive-modal')).toBeNull();
    expect(screen.queryByRole('dialog', { name: t('cmd.captive.execute') })).toBeNull();
    act(() => {
      runOneDay();
    });
    expect(captive.status).toBe('dead');
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  });

  it('shows actual captive facts through the mounted modal and releases only on the next normal day', () => {
    const game = buildTinyState();
    const captive = game.officers[OFF_BETA_BUSHO]!;
    const oldClan = captive.clanId!;
    captive.status = 'captive';
    captive.capturedByClanId = game.meta.playerClanId;
    captive.locationCastleId = CASTLE_A1;
    captive.armyId = null;
    captive.loyalty = 88;
    captive.ldr = 82;
    captive.statGrowth.ldr = 3;
    expect(validateState(game)).toEqual([]);
    setGame(game);
    initializeBridgeSession(game);
    store.getState().actions.setScreen('main');
    uiStore.getState().actions.enqueueModal({
      id: 'captive',
      params: { officerId: captive.id },
      pausesTime: true,
    });
    render(<MainScreen />);
    const modal = screen.getByTestId('captive-modal');
    const before = structuredClone(game);
    expect(within(modal).getByText(t('ui.captive.originalClan'))).toBeTruthy();
    expect(within(modal).getByText(game.clans[oldClan]!.name)).toBeTruthy();
    expect(within(modal).getByRole('img', { name: `${t('ui.officer.ldr')} 85` })).toBeTruthy();
    expect(within(modal).getByText(t('ui.captive.oldLoyalty'))).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(within(modal).getByRole('button', { name: t('cmd.captive.release') }));
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'handleCaptive',
        clanId: game.meta.playerClanId,
        officerId: captive.id,
        action: 'release',
        executorId: null,
      },
    ]);
    expect(game).toEqual(before);
    expect(screen.queryByTestId('captive-modal')).toBeNull();
    expect(uiStore.getState().queuedDecisionIds).toEqual([captive.id]);
    act(() => {
      runOneDay();
    });
    expect(captive.status).toBe('serving');
    expect(captive.clanId).toBe(oldClan);
    expect(captive.capturedByClanId).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  });

  it('keeps the castle-local ronin scope through the actual mounted panel route', () => {
    const game = prepareCastleRonin();
    const before = structuredClone(game);
    uiStore.getState().actions.openPanel('ronin', { castleId: CASTLE_A1 });
    render(<MainScreen />);
    const list = screen.getByTestId('recruit-panel');
    expect(within(list).getByRole('button', { name: /本城浪人/ })).toBeTruthy();
    expect(
      within(list).queryByRole('button', { name: /另一城浪人|敵城浪人|未成年浪人/ }),
    ).toBeNull();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('navigates castle city recruitment to actual executor preview and settles only on a normal day', () => {
    const game = prepareCastleRonin();
    uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1, tab: 'domestic' });
    render(<MainScreen />);
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.castle.openRonin') }));
    expect(uiStore.getState().panelStack.at(-1)).toEqual({
      id: 'ronin',
      params: { castleId: CASTLE_A1 },
    });
    fireEvent.click(
      within(screen.getByTestId('recruit-panel')).getByRole('button', { name: /本城浪人/ }),
    );
    expect(uiStore.getState().panelStack.at(-1)?.params.officerId).toBe(LOCAL_RONIN);
    fireEvent.change(screen.getByRole('combobox', { name: t('ui.recruit.executor') }), {
      target: { value: OFF_ALPHA_LORD },
    });
    const signing =
      officerAbilityScore(game.officers[LOCAL_RONIN]!) * BAL.recruitSigningBonusPerAbility;
    expect(
      screen.getByText(t('ui.recruit.attemptCost', { value: BAL.recruitAttemptCost })),
    ).toBeTruthy();
    expect(screen.getByText(t('ui.recruit.signingCost', { value: signing }))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('cmd.officer.recruit') }));
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'recruitRonin',
        clanId: game.meta.playerClanId,
        officerId: LOCAL_RONIN,
        executorId: OFF_ALPHA_LORD,
      },
    ]);
    expect(game).toEqual(before);
    act(() => {
      runOneDay();
    });
    const success = game.officers[LOCAL_RONIN]!.status === 'serving';
    expect(game.clans[game.meta.playerClanId]!.gold).toBe(
      before.clans[game.meta.playerClanId]!.gold - BAL.recruitAttemptCost - (success ? signing : 0),
    );
  });

  it('opens rewards from the actual monthly toast when month-start auto-pause is off', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    const settings = settingsStore.getState().settings;
    settingsStore.setState({
      settings: { ...settings, autoPause: { ...settings.autoPause, monthStart: false } },
    });
    setGame(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    initializeBridgeSession(game);
    render(<MainScreen />);
    act(() => {
      runOneDay();
    });
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('x2');
    const before = structuredClone(game);
    const notification = screen.getByText(/1560年5月.*月初摘要/).closest('[role="status"]')!;
    expect(notification.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(notification, { key: 'Enter' });
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(store.getState().session.speed).toBe('paused');
    expect(game).toEqual(before);
    act(hoisted.rewardClosers.at(-1)!);
    expect(store.getState().session.speed).toBe('x2');
  });
  it('routes a real month-opening notification through rewards and fiefs without an early resume', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    setGame(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    initializeBridgeSession(game);
    render(<MainScreen />);
    act(() => {
      runOneDay();
    });
    expect(uiStore.getState().modal?.id).toBe('monthSummary');
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.title') }));
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(store.getState().session.speed).toBe('paused');
    const firstOfficer = within(screen.getByRole('table')).getAllByRole('row')[1]!;
    fireEvent.click(within(firstOfficer).getByRole('button', { name: t('ui.reward.fief') }));
    expect(screen.getByTestId('reward-fief-pane')).toBeTruthy();
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    expect(screen.queryByTestId('reward-fief-pane')).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
    act(hoisted.rewardClosers.at(-1)!);
    expect(store.getState().session.speed).toBe('x2');
  });
  it('opens the actual reward dialog from the ordinary officer list without changing its rank sort', () => {
    const game = buildTinyState();
    setGame(game);
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    initializeBridgeSession(game);
    uiStore.getState().actions.openPanel('officers');
    render(<MainScreen />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.reward.title') }));
    expect(uiStore.getState().modal?.id).toBe('rewards');
    expect(store.getState().session.speed).toBe('paused');
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByTestId('officer-list')).toBeTruthy();
    const oldClose = hoisted.rewardClosers.at(-1)!;
    act(() => {
      uiStore.getState().actions.closeModal();
      uiStore
        .getState()
        .actions.enqueueModal({ id: 'confirm', params: { owner: 'later' }, pausesTime: true });
    });
    act(oldClose);
    expect(uiStore.getState().modal).toMatchObject({ id: 'confirm', params: { owner: 'later' } });
  });
  it('selects an army through the native source list and pans to its physical point without commands', async () => {
    const { game, army } = prepareOrderArmy();
    store.getState().actions.setScreen('main');
    const pan = vi.spyOn(MapRenderer.prototype, 'panToWorld');
    uiStore.getState().actions.setSelection({ kind: 'castle', id: CASTLE_A1 });
    uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
    render(<MainScreen />);
    await waitFor(() => expect(hoisted.apps.at(-1)).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: '軍事' }));
    const before = structuredClone(game);
    const button = screen.getByTestId(`castle-army-${army.id}`);
    button.focus();
    await userEvent.setup().keyboard('{Enter}');
    expect(document.activeElement).toBe(screen.getByTestId('army-retarget'));
    expect(uiStore.getState().selection).toEqual({ kind: 'army', id: army.id });
    expect(store.getState().session.selection).toEqual({ kind: 'army', id: army.id });
    expect(uiStore.getState().panelStack).toEqual([]);
    expect(screen.getByTestId('army-retarget')).toBeTruthy();
    await waitFor(() =>
      expect(pan).toHaveBeenCalledWith(
        game.castles[CASTLE_A1]!.pos.x,
        game.castles[CASTLE_A1]!.pos.y,
        null,
      ),
    );
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('hands Space selection focus to the army context when retarget is unavailable', async () => {
    const { army } = prepareOrderArmy();
    army.status = 'routed';
    uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
    render(<MainScreen />);
    fireEvent.click(screen.getByRole('tab', { name: '軍事' }));
    screen.getByTestId(`castle-army-${army.id}`).focus();
    await userEvent.setup().keyboard(' ');
    expect(document.activeElement).toBe(screen.getByTestId('army-context-controls'));
    expect(store.getState().session.speed).toBe('paused');
  });

  it('rejects retained army-list callbacks after same-ID army or game replacement', () => {
    const { game, army } = prepareOrderArmy();
    uiStore.getState().actions.setSelection({ kind: 'castle', id: CASTLE_A1 });
    uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
    render(<MainScreen />);
    const old = hoisted.armyCallbacks.at(-1)!;
    game.armies[army.id] = structuredClone(army);
    act(() => old(army.id, army));
    expect(uiStore.getState().selection).toEqual({ kind: 'castle', id: CASTLE_A1 });
    const replacement = structuredClone(game);
    act(() => setGame(replacement));
    act(() => old(army.id, army));
    expect(uiStore.getState().selection).toEqual({ kind: 'castle', id: CASTLE_A1 });
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('castle');
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });

  it('selects a surviving player army from a captured source and uses the reversing physical point', async () => {
    const { game, army } = prepareOrderArmy();
    store.getState().actions.setScreen('main');
    game.castles[CASTLE_A1]!.ownerClanId = game.castles[CASTLE_B1]!.ownerClanId;
    army.path = [CASTLE_A1, CASTLE_A2];
    army.pathCursor = 0;
    army.posNodeId = CASTLE_A1;
    army.edgeCostDays = 4;
    army.edgeProgressDays = 1;
    army.reversingEdgeEndNodeId = CASTLE_A2;
    const pan = vi.spyOn(MapRenderer.prototype, 'panToWorld');
    uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
    render(<MainScreen />);
    await waitFor(() => expect(hoisted.apps.at(-1)).toBeTruthy());
    fireEvent.click(screen.getByRole('tab', { name: '軍事' }));
    const before = structuredClone(game);
    fireEvent.click(screen.getByTestId(`castle-army-${army.id}`));
    const a = game.castles[CASTLE_A1]!.pos;
    const b = game.castles[CASTLE_A2]!.pos;
    await waitFor(() =>
      expect(pan).toHaveBeenCalledWith(a.x + (b.x - a.x) * 0.25, a.y + (b.y - a.y) * 0.25, null),
    );
    expect(store.getState().session.selection).toEqual({ kind: 'army', id: army.id });
    expect(uiStore.getState().selection).toEqual({ kind: 'army', id: army.id });
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('native crest click selects the owned home without commands or core changes', () => {
    const game = store.getState().game!;
    const before = structuredClone(game);
    render(<MainScreen />);
    const button = screen.getByTestId('rail-home');
    expect(button.tagName).toBe('BUTTON');
    fireEvent.click(button);
    expect(uiStore.getState().selection).toEqual({
      kind: 'castle',
      id: game.clans[game.meta.playerClanId]!.homeCastleId,
    });
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('native crest Enter and Space activate home without toggling strategy speed', async () => {
    const user = userEvent.setup();
    const game = store.getState().game!;
    render(<MainScreen />);
    const button = screen.getByTestId('rail-home');
    button.focus();
    await user.keyboard('{Enter}');
    expect(uiStore.getState().selection?.id).toBe(game.clans[game.meta.playerClanId]!.homeCastleId);
    act(() => uiStore.getState().actions.setSelection(null));
    await user.keyboard(' ');
    expect(uiStore.getState().selection?.id).toBe(game.clans[game.meta.playerClanId]!.homeCastleId);
    expect(store.getState().session.speed).toBe('paused');
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('does not select a home captured before the native click or the Home shortcut', () => {
    const game = store.getState().game!;
    const home = game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!;
    render(<MainScreen />);
    home.ownerClanId = 'clan.enemy' as ClanId;
    fireEvent.click(screen.getByTestId('rail-home'));
    fireEvent.keyDown(window, { key: 'Home' });
    expect(uiStore.getState().selection).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('disables the native crest when the recorded home is no longer player owned', () => {
    const game = store.getState().game!;
    game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!.ownerClanId =
      'clan.enemy' as ClanId;
    render(<MainScreen />);
    const button = screen.getByTestId<HTMLButtonElement>('rail-home');
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(uiStore.getState().selection).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });

  it('connects native army retarget preview to a single normal next-tick command', () => {
    const { game, army } = prepareOrderArmy();
    render(<MainScreen />);
    const before = structuredClone(game);
    fireEvent.click(screen.getByTestId('army-retarget'));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: CASTLE_A2 } });
    expect(screen.getByTestId('army-target-preview')).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(screen.getByTestId('army-target-submit'));
    expect(screen.queryByTestId('army-target-modal')).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'setArmyTarget', clanId: CLAN_ALPHA, armyId: army.id, targetNodeId: CASTLE_A2 },
    ]);
    expect(game).toEqual(before);
    expect(screen.getByTestId('army-retarget')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('army-recall')).toHaveProperty('disabled', true);
    act(() => {
      runOneDay();
    });
    expect(game.armies[army.id]?.targetNodeId).toBe(CASTLE_A2);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('queues recall without changing the army and executes only through the normal tick', () => {
    const { game, army } = prepareOrderArmy();
    render(<MainScreen />);
    const before = structuredClone(game);
    fireEvent.click(screen.getByTestId('army-recall'));
    fireEvent.click(screen.getByTestId('army-recall'));
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'recallArmy', clanId: CLAN_ALPHA, armyId: army.id },
    ]);
    expect(game).toEqual(before);
    act(() => {
      runOneDay();
    });
    expect(game.armies[army.id]).toBeUndefined();
  });
  it('closes stale target ownership after an in-place foreign transfer without submitting', () => {
    const { game, army } = prepareOrderArmy();
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('army-retarget'));
    act(() => {
      army.clanId = game.castles[CASTLE_B1]!.ownerClanId;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    expect(screen.queryByTestId('army-target-modal')).toBeNull();
    expect(screen.queryByTestId('army-orders-control')).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('revalidates a selected route after an in-place road change without silently replacing the target', () => {
    const { game } = prepareOrderArmy();
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('army-retarget'));
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: CASTLE_A2 } });
    const previousPreview = screen.getByTestId('army-target-preview').textContent;
    act(() => {
      game.roads['road.a1-a2' as keyof typeof game.roads]!.baseDays = 9;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    const changed = structuredClone(game);
    expect(screen.getByTestId('army-target-select')).toHaveProperty('value', CASTLE_A2);
    expect(screen.getByTestId('army-target-submit')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('army-target-preview').textContent).not.toBe(previousPreview);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(changed);
  });
  it('rejects retained callbacks after a second request for the same army', () => {
    const { game } = prepareOrderArmy();
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('army-retarget'));
    const old = hoisted.targetCallbacks.at(-1)!;
    const firstToken = uiStore.getState().modal!.params.requestToken;
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    fireEvent.click(screen.getByTestId('army-retarget'));
    const currentToken = uiStore.getState().modal!.params.requestToken;
    expect(currentToken).not.toBe(firstToken);
    const before = structuredClone(game);
    act(() => old.onClose());
    expect(old.onSubmit(CASTLE_A2)).toEqual({ status: 'stale' });
    expect(uiStore.getState().modal!.params.requestToken).toBe(currentToken);
    expect(screen.getByTestId('army-target-modal')).toBeTruthy();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(before);
  });
  it('does not restore old speed or close a replacement session request through old callbacks', () => {
    const { game } = prepareOrderArmy();
    store.getState().actions.setSpeed('x5');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('army-retarget'));
    const old = hoisted.targetCallbacks.at(-1)!;
    const replacement = structuredClone(game);
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    expect(uiStore.getState().modal).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByTestId('army-retarget'));
    const token = uiStore.getState().modal!.params.requestToken;
    act(() => old.onClose());
    expect(old.onSubmit(CASTLE_A2)).toEqual({ status: 'stale' });
    expect(uiStore.getState().modal!.params.requestToken).toBe(token);
    expect(store.getState().session.speed).toBe('paused');
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
  it('cancels a same-ID target draft on replacement GameState identity before another submission', () => {
    const { game } = prepareOrderArmy();
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('army-retarget'));
    fireEvent.change(screen.getByTestId('army-target-select'), { target: { value: CASTLE_A2 } });
    const replacement = structuredClone(game);
    act(() => setGame(replacement));
    expect(screen.queryByTestId('army-target-modal')).toBeNull();
    expect(uiStore.getState().modal).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });
  it('keeps target modal focus and FIFO ownership until cancel hands control to a queued system menu', async () => {
    const { game } = prepareOrderArmy();
    render(
      <>
        <MainScreen />
        <SystemMenuHost />
      </>,
    );
    fireEvent.click(screen.getByTestId('army-retarget'));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: '取消' })),
    );
    act(() =>
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(uiStore.getState().modal?.params.owner).toBe('armyTarget');
    fireEvent.click(screen.getByRole('button', { name: '取消' }));
    expect(screen.queryByTestId('army-target-modal')).toBeNull();
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    await waitFor(() =>
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true),
    );
    expect(store.getState().session.speed).toBe('paused');
    expect(getQueuedPlayerCommands(game)).toEqual([]);
  });
  it('exposes native owned-army auto-return control and queues exactly one intent without immediate core changes', () => {
    const game = store.getState().game!;
    const castle = Object.values(game.castles)[0]!;
    const id = 'army.000001' as ArmyId;
    const army: Army = {
      id,
      clanId: game.meta.playerClanId,
      leaderId: game.clans[game.meta.playerClanId]!.leaderId,
      deputyIds: [],
      soldiers: 100,
      initialTroops: 100,
      food: 1000,
      morale: 100,
      status: 'holding',
      mission: 'march',
      originCastleId: castle.id,
      targetNodeId: null,
      path: [castle.id],
      pathCursor: 0,
      posNodeId: castle.id,
      edgeProgressDays: 0,
      edgeCostDays: 0,
      battleId: null,
      siegeId: null,
      autoReturn: true,
      corpsId: null,
      pursuitEligibleArmyIds: [],
    };
    game.armies[id] = army;
    initializeBridgeSession(game);
    uiStore.getState().actions.setSelection({ kind: 'army', id });
    render(<MainScreen />);
    const original = structuredClone(game);
    const toggle = screen.getByRole('switch', { name: '自動歸還' });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'setAutoReturn', clanId: game.meta.playerClanId, armyId: id, enabled: false },
    ]);
    expect(toggle).toHaveProperty('disabled', true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/切換為「關」.*待下一日執行/)).toBeTruthy();
    fireEvent.click(toggle);
    expect(getQueuedPlayerCommands(game)).toHaveLength(1);
    expect(game).toEqual(original);
    act(() => {
      army.status = 'routed';
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    expect(toggle).toHaveProperty('disabled', true);
    act(() => {
      army.clanId = 'clan.foreign' as ClanId;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    expect(screen.queryByRole('switch', { name: '自動歸還' })).toBeNull();
  });
  it('conceals only the persistent reports entry under officers, keeping urgent toast identity/dismissal and R navigation', () => {
    // Routing owns the real 300ms exit contract, not wall-clock scheduling under
    // parallel renderer work. ReportStack separately covers exit cancellation.
    vi.useFakeTimers();
    uiStore.getState().actions.setScreen('main');
    const game = structuredClone(store.getState().game);
    const dismiss = vi.fn();
    render(
      <MainScreen
        appToasts={[
          { id: 'save-action:urgent', severity: 'critical', title: '緊急存檔通知', date: 0 },
        ]}
        onDismissAppToast={dismiss}
      />,
    );
    const alert = screen.getByText('緊急存檔通知').closest('[role="alert"]')!;
    expect(screen.getByTestId('reports-open')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rail-officers'));
    expect(screen.queryByTestId('reports-open')).toBeNull();
    expect(screen.getByText('緊急存檔通知').closest('[role="alert"]')).toBe(alert);
    expect(alert.closest('section')?.hidden).toBe(false);
    fireEvent.click(
      within(alert as HTMLElement).getByRole('button', { name: t('ui.toast.dismiss') }),
    );
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(dismiss).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(dismiss).toHaveBeenCalledWith('save-action:urgent');
    expect(dismiss).toHaveBeenCalledTimes(1);
    act(() => uiStore.getState().actions.closePanel());
    expect(screen.getByTestId('reports-open')).toBeTruthy();
    fireEvent.click(screen.getByTestId('rail-officers'));
    fireEvent.keyDown(document.body, { key: 'r' });
    expect(screen.getByTestId('reports-panel')).toBeTruthy();
    expect(alert.closest('section')?.hidden).toBe(true);
    expect(store.getState().game).toEqual(game);
  });
  it('routes explicit report goto through the real map handle and closes only the report panel', async () => {
    store.getState().actions.setScreen('main');
    const game = store.getState().game!;
    const castle = Object.values(game.castles)[0]!;
    game.reports = [
      {
        id: 'rep.000001' as import('@core/state/ids').ReportId,
        day: game.time.day,
        read: false,
        event: {
          type: 'economy.foodShortage',
          day: game.time.day,
          clanIds: [castle.ownerClanId],
          clanId: castle.ownerClanId,
          castleId: castle.id,
        },
      },
    ];
    const before = structuredClone(game);
    const pan = vi.spyOn(MapRenderer.prototype, 'panToWorld').mockImplementation(() => undefined);
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(pan).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('reports-panel').querySelector('li button')!);
    await waitFor(() => expect(pan).toHaveBeenCalledTimes(1));
    expect(pan).toHaveBeenCalledWith(castle.pos.x, castle.pos.y, null);
    expect(screen.queryByTestId('reports-panel')).toBeNull();
    expect(game).toEqual(before);
  });
  it('opens retained reports from the real notification entry without changing the game or dismissing a modal', () => {
    const game = structuredClone(store.getState().game);
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(screen.getByTestId('reports-panel')).toBeTruthy();
    expect(store.getState().game).toEqual(game);
    act(() => {
      uiStore.getState().actions.closePanel();
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    });
    fireEvent.click(screen.getByTestId('reports-open'));
    expect(uiStore.getState().panelStack).toHaveLength(0);
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    expect(store.getState().game).toEqual(game);
  });
  it('opens the full eight-kind taimei panel from the real rail and keeps inactive HUD neutral', () => {
    render(<MainScreen />);
    expect(screen.queryByTestId('hud-taimei-active')).toBeNull();
    fireEvent.click(screen.getByTestId('rail-taimei'));
    expect(screen.getByTestId('taimei-panel')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^即時徵兵/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^天下普請/ })).toBeTruthy();
  });
  it('shows a localized live active-taimei HUD tooltip without changing core state', () => {
    const game = store.getState().game!;
    game.clans[game.meta.playerClanId]!.taimei = {
      activeTaimeiId: 'taimei.teppeki' as import('@core/state/ids').TaimeiId,
      activeUntilDay: game.time.day + 12,
      cooldownUntilDay: game.time.day + 192,
    };
    const before = structuredClone(game);
    render(<MainScreen />);
    fireEvent.focus(screen.getByTestId('hud-taimei-active'));
    expect(screen.getByRole('tooltip').textContent).toBe(
      t('ui.hud.taimeiActive', { name: '鐵壁', days: 12 }),
    );
    expect(game).toEqual(before);
  });
  it('merges app save feedback with existing warnings without adding core reports and routes dismissals', () => {
    // Advance the unchanged animated exit; do not bypass it with reduced motion.
    vi.useFakeTimers();
    const reports = structuredClone(store.getState().game!.reports);
    const onDismissAppToast = vi.fn();
    uiStore.setState({ notificationFilter: 'major' });
    render(
      <MainScreen
        autosaveSuspended
        appToasts={[
          { id: 'save-action:test', severity: 'info', title: t('ui.save.quickSaved'), date: 0 },
        ]}
        onDismissAppToast={onDismissAppToast}
      />,
    );
    expect(screen.getByText(t('ui.save.quickSaved'))).toBeTruthy();
    expect(screen.getByText(t('ui.save.autosaveFailed'))).toBeTruthy();
    const notice = screen.getByText(t('ui.save.quickSaved')).closest('[role="status"]')!;
    fireEvent.click(notice.querySelector('button')!);
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(onDismissAppToast).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onDismissAppToast).toHaveBeenCalledWith('save-action:test');
    expect(onDismissAppToast).toHaveBeenCalledTimes(1);
    expect(store.getState().game!.reports).toEqual(reports);
  });
  it('routes late app-notice dismissal to the app ID guard rather than core-report dismissal', () => {
    const onDismissAppToast = vi.fn();
    const { rerender } = render(
      <MainScreen
        appToasts={[{ id: 'save-action:old', severity: 'info', title: '舊存檔通知', date: 0 }]}
        onDismissAppToast={onDismissAppToast}
      />,
    );
    rerender(
      <MainScreen
        appToasts={[{ id: 'save-action:new', severity: 'info', title: '新存檔通知', date: 0 }]}
        onDismissAppToast={onDismissAppToast}
      />,
    );
    act(() => hoisted.dismissReport?.('save-action:old'));
    expect(onDismissAppToast).toHaveBeenCalledWith('save-action:old');
    expect(screen.getByText('新存檔通知')).toBeTruthy();
    expect(store.getState().game!.reports).toEqual([]);
  });
  it('autosave suspension is app-only, shows one critical toast and a keyboard tooltip HUD icon', () => {
    const reports = structuredClone(store.getState().game!.reports);
    uiStore.setState({ notificationFilter: 'major' });
    const { rerender } = render(<MainScreen />);
    expect(screen.queryByTestId('hud-autosave-suspended')).toBeNull();
    rerender(<MainScreen autosaveSuspended />);
    expect(screen.getAllByText(t('ui.save.autosaveFailed'))).toHaveLength(1);
    expect(
      screen.getByText(t('ui.save.autosaveFailed')).closest('[role="alert"]')?.getAttribute('role'),
    ).toBe('alert');
    fireEvent.focus(screen.getByTestId('hud-autosave-suspended'));
    expect(screen.getByRole('tooltip').textContent).toBe(t('ui.hud.autosaveSuspendedTip'));
    rerender(<MainScreen autosaveSuspended />);
    expect(screen.getAllByText(t('ui.save.autosaveFailed'))).toHaveLength(1);
    expect(store.getState().game!.reports).toEqual(reports);
  });

  it('dismissing suspension toast leaves permanent HUD warning; clearing suspension resets dismissal', async () => {
    const { rerender } = render(<MainScreen autosaveSuspended />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.toast.dismiss') }));
    await waitFor(() => expect(screen.queryByText(t('ui.save.autosaveFailed'))).toBeNull());
    expect(screen.getByTestId('hud-autosave-suspended')).toBeTruthy();
    act(() => {
      runOneDay();
    });
    expect(screen.queryByText(t('ui.save.autosaveFailed'))).toBeNull();
    rerender(<MainScreen autosaveSuspended={false} />);
    expect(screen.queryByTestId('hud-autosave-suspended')).toBeNull();
    rerender(<MainScreen autosaveSuspended />);
    expect(screen.getByText(t('ui.save.autosaveFailed'))).toBeTruthy();
  });

  it('new game identity resets a dismissed autosave toast without core mutations', async () => {
    render(<MainScreen autosaveSuspended />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.toast.dismiss') }));
    await waitFor(() => expect(screen.queryByText(t('ui.save.autosaveFailed'))).toBeNull());
    const next = makeLoopTestState({ day: 0, gold: 2000 });
    act(() => {
      resetGameStoreForTests(next);
    });
    expect(screen.getByText(t('ui.save.autosaveFailed'))).toBeTruthy();
    expect(screen.getByTestId('hud-autosave-suspended')).toBeTruthy();
    expect(next.reports).toEqual([]);
  });
  it('an in-flight dismissal from the old session cannot close the new warning', async () => {
    render(<MainScreen autosaveSuspended />);
    fireEvent.click(screen.getByRole('button', { name: t('ui.toast.dismiss') }));
    act(() => {
      resetGameStoreForTests(makeLoopTestState({ gold: 2000 }));
    });
    await act(async () => {
      await new Promise<void>((resolve) => setTimeout(resolve, 400));
    });
    expect(screen.getByText(t('ui.save.autosaveFailed'))).toBeTruthy();
    expect(screen.getByTestId('hud-autosave-suspended')).toBeTruthy();
  });

  it('forwards save/load subpanels within the same dialog without draining its pause', () => {
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    const onOpenSaveLoad = vi.fn();
    const onBack = vi.fn();
    const view = (systemPanel: SystemPanel | null = null) => (
      <>
        <MainScreen />
        <SystemMenuHost onOpenSaveLoad={onOpenSaveLoad} systemPanel={systemPanel} />
      </>
    );
    const { rerender } = render(view());
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.menu') }));
    expect(screen.queryByText(t('cmd.reject.notImplemented'))).toBeNull();
    screen.getByRole('button', { name: t('ui.system.save') }).focus();
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.save') }));
    expect(onOpenSaveLoad).toHaveBeenLastCalledWith('save');
    rerender(
      view({
        title: t('ui.save.title'),
        content: <div data-testid="controlled-save-panel" />,
        onBack,
      }),
    );
    expect(screen.getByTestId('controlled-save-panel')).toBeTruthy();
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    expect(onBack).toHaveBeenCalledOnce();
    expect(store.getState().session.speed).toBe('paused');
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    rerender(view());
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.load') }));
    expect(onOpenSaveLoad).toHaveBeenLastCalledWith('load');
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    expect(store.getState().session.speed).toBe('x2');
  });
  it('畫面根節點 data-testid="screen-strategy"（17 §6.2 testid 契約：非 "screen-main"）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('screen-strategy')).toBeTruthy();
  });

  it('data-testid="hud-date" 顯示 formatDate 格式（00 §9：1560年1月1日）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月1日');
  });

  it('推進一日（runOneDay）後 HUD 日期隨之更新（M1-20 驗收核心）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月1日');
    act(() => {
      runOneDay();
    });
    expect(screen.getByTestId('hud-date').textContent).toBe('1560年1月2日');
  });

  it('ResourceBar 顯示目前玩家勢力 gold（千分位；M6-V9 §4.2 接線）', () => {
    render(<MainScreen />);
    const goldLabel = screen.getByText(t('ui.hud.gold'));
    expect(goldLabel.closest('[tabindex="0"]')?.textContent).toContain('1,000');
  });

  it('shows actual food coverage, follows normal ticks and session replacement without changing state', () => {
    const { game } = prepareOrderArmy();
    const before = structuredClone(game);
    const forecast = selectBudgetForecast(game, game.meta.playerClanId);
    const army = Object.values(game.armies)[0]!;
    const withoutArmy = structuredClone(game);
    delete withoutArmy.armies[army.id];
    expect(forecast.foodUpkeepMonthly).toBeGreaterThan(
      selectBudgetForecast(withoutArmy, game.meta.playerClanId).foodUpkeepMonthly,
    );
    render(<MainScreen />);
    const expectCoverage = () => {
      const live = store.getState().game!;
      const months = selectBudgetForecast(live, live.meta.playerClanId).foodMonthsLeft;
      expect(screen.getByLabelText(t('ui.budget.foodMonthsLeft', { months }))).toBeTruthy();
    };
    expectCoverage();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    act(() => {
      runOneDay();
    });
    const afterTick = structuredClone(game);
    expectCoverage();
    expect(game).toEqual(afterTick);
    const replacement = buildTinyState();
    replacement.castles[CASTLE_A1]!.food = 1;
    replacement.castles[CASTLE_A2]!.food = 0;
    replacement.castles[CASTLE_B1]!.food = 999_999;
    const replacementBefore = structuredClone(replacement);
    act(() => {
      setGame(replacement);
      initializeBridgeSession(replacement);
    });
    expectCoverage();
    expect(screen.getByLabelText(t('ui.budget.foodMonthsLeft', { months: 0 }))).toBeTruthy();
    expect(replacement).toEqual(replacementBefore);
    expect(getQueuedPlayerCommands(replacement)).toEqual([]);
  });

  it('四檔速度按鈕存在（speed-pause／speed-1／speed-2／speed-5）；點擊後 aria-pressed 切換', () => {
    render(<MainScreen />);
    const pauseBtn = screen.getByTestId('speed-pause');
    const x1Btn = screen.getByTestId('speed-1');
    expect(screen.getByTestId('speed-2')).toBeTruthy();
    expect(screen.getByTestId('speed-5')).toBeTruthy();
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('true'); // 初始 session.speed='paused'

    fireEvent.click(x1Btn);
    expect(store.getState().session.speed).toBe('x1');
    expect(x1Btn.getAttribute('aria-pressed')).toBe('true');
    expect(pauseBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('點擊 speed-pause 呼叫 gameLoop.requestPause（session.lastPauseReason=user）', () => {
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('speed-1'));
    fireEvent.click(screen.getByTestId('speed-pause'));
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('M3 左側快捷列可開啟武將與政策面板', () => {
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-officers'));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('officers');
    fireEvent.click(screen.getByTestId('rail-policy'));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('policy');
    expect(screen.getByTestId('policy-panel')).toBeTruthy();
  });
  it('shows actual court-bonus policy capacity through the Main rail and enacts the remaining slot on the next day', () => {
    const game = buildTinyState();
    game.clans[CLAN_ALPHA]!.prestige = 300;
    game.clans[CLAN_ALPHA]!.courtRank = 'ju4jo';
    game.clans[CLAN_ALPHA]!.gold = 10_000;
    game.policies[CLAN_ALPHA]!.active = ['pol.rakuichi', 'pol.kenchi'] as PolicyId[];
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    const before = structuredClone(game);
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-policy'));
    const panel = screen.getByTestId('policy-panel');
    expect(within(panel).getByText(t('ui.policy.active', { n: 2, max: 3 }))).toBeTruthy();
    expect(game).toEqual(before);
    const command = {
      type: 'enactPolicy' as const,
      clanId: CLAN_ALPHA,
      policyId: 'pol.tenmasei' as PolicyId,
    };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    const card = within(panel)
      .getByRole('heading', { name: t('pol.tenmasei.name') })
      .closest('article')!;
    fireEvent.click(within(card).getByRole('button', { name: t('ui.policy.adopt') }));
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    expect(game).toEqual(before);
    act(() => {
      runOneDay();
    });
    expect(game.policies[CLAN_ALPHA]!.active).toContain(command.policyId);
    expect(within(panel).getByText(t('ui.policy.active', { n: 3, max: 3 }))).toBeTruthy();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
  });
  it('opens the full corps screen from the management rail', () => {
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-corps'));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('corps');
    expect(screen.getByTestId('corps-panel')).toBeTruthy();
    expect(screen.getByRole('button', { name: t('ui.corps.create') })).toBeTruthy();
  });

  it('creates and dissolves a Corps through the real rail and normal days without releasing manual pause', () => {
    const game = buildTinyState();
    game.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-corps'));
    const panel = screen.getByTestId('corps-panel');
    fireEvent.click(within(panel).getByRole('button', { name: t('ui.corps.create') }));
    fireEvent.change(within(panel).getByRole('combobox', { name: t('ui.corps.leader') }), {
      target: { value: OFF_ALPHA_BUSHO },
    });
    fireEvent.click(within(panel).getByRole('checkbox', { name: game.castles[CASTLE_A1]!.name }));
    const create = {
      type: 'createCorps' as const,
      clanId: CLAN_ALPHA,
      corpsLeaderId: OFF_ALPHA_BUSHO,
      castleIds: [CASTLE_A1],
      directive: 'hold' as const,
      targetNodeId: null,
    };
    expect(validateCommand(game, create)).toEqual({ ok: true });
    const beforeCreate = structuredClone(game);
    fireEvent.click(within(panel).getAllByRole('button', { name: t('ui.corps.create') })[1]!);
    expect(getQueuedPlayerCommands(game)).toEqual([create]);
    expect(game).toEqual(beforeCreate);
    act(() => {
      runOneDay();
    });
    const corps = Object.values(game.corps)[0]!;
    expect(corps.corpsLeaderId).toBe(OFF_ALPHA_BUSHO);
    expect(game.castles[CASTLE_A1]!.corpsId).toBe(corps.id);
    expect(game.castles[CASTLE_A1]!.directControl).toBe(false);
    expect(validateState(game)).toEqual([]);
    const blockedCreate = within(panel).getAllByRole('button', { name: t('ui.corps.create') })[1]!;
    expect(blockedCreate).toHaveProperty('disabled', true);
    expect(blockedCreate.title).toBe(
      t('cmd.reject.officerBusy', { name: game.officers[OFF_ALPHA_BUSHO]!.name }),
    );
    expect(blockedCreate.title).not.toContain('{name}');
    act(() => {
      corps.gold = 123;
      store.setState((state) => ({ tickSeq: state.tickSeq + 1 }));
    });
    fireEvent.click(
      within(panel).getByRole('button', {
        name: new RegExp(t('ui.corps.name', { name: game.officers[OFF_ALPHA_BUSHO]!.name })),
      }),
    );
    const beforeDissolve = structuredClone(game);
    fireEvent.click(within(panel).getByRole('button', { name: t('ui.corps.dissolve') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(game).toEqual(beforeDissolve);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: t('ui.corps.dissolve') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(game).toEqual(beforeDissolve);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'dissolveCorps', clanId: CLAN_ALPHA, corpsId: corps.id },
    ]);
    act(() => {
      runOneDay();
    });
    expect(game.corps[corps.id]).toBeUndefined();
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeDissolve.clans[CLAN_ALPHA]!.gold + 123);
    expect(game.castles[CASTLE_A1]!.corpsId).toBeNull();
    expect(game.castles[CASTLE_A1]!.directControl).toBe(true);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('keeps a real month-opening summary behind Corps consent and renders only one dialog', () => {
    const game = buildTinyState();
    game.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
    const day = calendarToDay(1560, 4, 29);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    expect(
      dispatchCommand({
        type: 'createCorps',
        clanId: CLAN_ALPHA,
        corpsLeaderId: OFF_ALPHA_BUSHO,
        castleIds: [CASTLE_A1],
        directive: 'hold',
        targetNodeId: null,
      }),
    ).toEqual({ ok: true });
    act(() => {
      runOneDay();
    });
    expect(validateState(game)).toEqual([]);
    const corps = Object.values(game.corps)[0]!;
    store.getState().actions.setSpeed('x2');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-corps'));
    const panel = screen.getByTestId('corps-panel');
    fireEvent.click(
      within(panel).getByRole('button', {
        name: new RegExp(t('ui.corps.name', { name: game.officers[OFF_ALPHA_BUSHO]!.name })),
      }),
    );
    fireEvent.click(within(panel).getByRole('button', { name: t('ui.corps.dissolve') }));
    const consent = uiStore.getState().modal;
    expect(consent).toMatchObject({ id: 'confirm', params: { owner: 'corps' }, pausesTime: false });
    expect(store.getState().session.speed).toBe('x2');
    act(() => {
      runOneDay();
    });
    expect(game.time.month).toBe(5);
    expect(validateState(game)).toEqual([]);
    expect(uiStore.getState().modal).toBe(consent);
    const arrival = uiStore.getState().modalQueue.find((entry) => entry.id === 'monthSummary');
    expect(arrival).toBeDefined();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const beforeCancel = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(uiStore.getState().modal).toBe(arrival);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('ui.reward.title') })).toBeTruthy();
    expect(game).toEqual(beforeCancel);
    expect(game.corps[corps.id]).toBe(corps);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('negotiates and breaks a real alliance from the diplomacy rail on normal days', () => {
    const game = buildTinyState();
    prepareAllianceAdmission(game);
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-diplomacy'));
    const panel = screen.getByTestId('diplomacy-panel');
    const beforeProposal = structuredClone(game);
    fireEvent.click(
      within(panel).getByRole('button', { name: t('cmd.diplomacy.proposeAlliance') }),
    );
    expect(game).toEqual(beforeProposal);
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'proposePact',
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'proposeAlliance',
        reinforceAgainstClanId: null,
      },
    ]);
    act(() => {
      runOneDay();
    });
    const pact = tinyAllianceRow(game).pacts[0]!;
    expect(pact.kind).toBe('alliance');
    expect(game.diplomacy.pendingProposals).toEqual([]);
    expect(validateState(game)).toEqual([]);
    const beforeBreak = structuredClone(game);
    fireEvent.click(within(panel).getByRole('button', { name: t('cmd.diplomacy.breakPact') }));
    const owned = uiStore.getState().modal;
    expect(owned).toMatchObject({ id: 'confirm', pausesTime: false });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(uiStore.getState().modal).toBeNull();
    expect(game).toEqual(beforeBreak);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: t('cmd.diplomacy.breakPact') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(game).toEqual(beforeBreak);
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'breakPact',
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'alliance',
      },
    ]);
    act(() => {
      runOneDay();
    });
    expect(tinyAllianceRow(game).pacts).toEqual([]);
    expect(getTrust(game, CLAN_ALPHA, CLAN_BETA)).toBe(0);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('queues a real month-opening summary behind alliance-break consent on Main', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 29);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    prepareAllianceAdmission(game);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    expect(
      dispatchCommand({
        type: 'proposePact',
        clanId: CLAN_ALPHA,
        targetClanId: CLAN_BETA,
        kind: 'proposeAlliance',
        reinforceAgainstClanId: null,
      }),
    ).toEqual({ ok: true });
    act(() => {
      runOneDay();
    });
    expect(tinyAllianceRow(game).pacts[0]?.kind).toBe('alliance');
    expect(validateState(game)).toEqual([]);
    store.getState().actions.setSpeed('x2');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-diplomacy'));
    fireEvent.click(
      within(screen.getByTestId('diplomacy-panel')).getByRole('button', {
        name: t('cmd.diplomacy.breakPact'),
      }),
    );
    const consent = uiStore.getState().modal;
    expect(consent).toMatchObject({ id: 'confirm', pausesTime: false });
    expect(store.getState().session.speed).toBe('x2');
    act(() => {
      runOneDay();
    });
    expect(game.time.month).toBe(5);
    expect(uiStore.getState().modal).toBe(consent);
    const arrival = uiStore.getState().modalQueue.find((entry) => entry.id === 'monthSummary');
    expect(arrival).toBeDefined();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const beforeCancel = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(uiStore.getState().modal).toBe(arrival);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('ui.reward.title') })).toBeTruthy();
    expect(game).toEqual(beforeCancel);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('starts and stops real Court work from Main without letting a retained action stop its replacement', async () => {
    const game = await prepareCourtAdmission();
    const day = calendarToDay(1560, 4, 10);
    game.time = { day, ...dayToCalendar(day) };
    const executor = Object.values(game.officers).find(
      (officer) =>
        validateCommand(game, {
          type: 'startDiploWork',
          clanId: COURT_PLAYER,
          target: 'court',
          executorId: officer.id,
        }).ok,
    );
    expect(executor).toBeDefined();
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-diplomacy'));
    fireEvent.click(screen.getByRole('tab', { name: t('ui.court.title') }));
    fireEvent.change(screen.getByRole('combobox', { name: t('ui.diplomacy.workOfficer') }), {
      target: { value: executor!.id },
    });
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.startWork') }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'startDiploWork', clanId: COURT_PLAYER, target: 'court', executorId: executor!.id },
    ]);
    act(() => {
      runOneDay();
    });
    const missionA = game.diplomacy.missions.find(
      (mission) => mission.fromClanId === COURT_PLAYER && mission.target === 'court',
    )!;
    // Commands settle before the calendar advances during a normal day.
    expect(missionA).toMatchObject({ officerId: executor!.id, startDay: day });
    const stopButton = screen.getByRole('button', { name: t('ui.diplomacy.stopWork') });
    const reactPropsKey = Object.keys(stopButton).find((key) => key.startsWith('__reactProps$'));
    expect(reactPropsKey).toBeDefined();
    const retained = (stopButton as unknown as Record<string, { onClick: () => void }>)[
      reactPropsKey!
    ]!.onClick;
    expect(retained).toBeTypeOf('function');
    fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
    expect(game.diplomacy.missions).toContain(missionA);
    // A single React publication preserves the same-target shape across two real command days.
    act(() => {
      runOneDay();
      expect(validateState(game)).toEqual([]);
      expect(
        dispatchCommand({
          type: 'startDiploWork',
          clanId: COURT_PLAYER,
          target: 'court',
          executorId: executor!.id,
        }),
      ).toEqual({ ok: true });
      runOneDay();
    });
    const missionB = game.diplomacy.missions.find(
      (mission) => mission.fromClanId === COURT_PLAYER && mission.target === 'court',
    )!;
    expect(missionB).not.toBe(missionA);
    expect(missionB.startDay).toBe(day + 2);
    const replacement = structuredClone(game);
    // Retain the actual React callback; this is not a physical-browser detached-button test.
    act(() => {
      retained();
    });
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(game).toEqual(replacement);
    fireEvent.click(screen.getByRole('button', { name: t('ui.diplomacy.stopWork') }));
    expect(game.diplomacy.missions).toContain(missionB);
    expect(getQueuedPlayerCommands(game)).toEqual([
      { type: 'stopDiploWork', clanId: COURT_PLAYER, target: 'court' },
    ]);
    act(() => {
      runOneDay();
    });
    expect(
      game.diplomacy.missions.some(
        (mission) => mission.fromClanId === COURT_PLAYER && mission.target === 'court',
      ),
    ).toBe(false);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
    expect(uiStore.getState().modal).toBeNull();
  });

  it('queues nomination from the real s1560 Court tab and settles only on a normal day', async () => {
    const game = await prepareCourtAdmission();
    expect(game.castles['castle.nijo' as import('@core/state/ids').CastleId]!.ownerClanId).toBe(
      COURT_PLAYER,
    );
    expect(validateState(game)).toEqual([]);
    const command = { type: 'nominateShogun' as const, clanId: COURT_PLAYER };
    expect(validateCommand(game, command)).toEqual({ ok: true });
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-diplomacy'));
    fireEvent.click(screen.getByRole('tab', { name: t('ui.shogunate.title') }));
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('cmd.shogunate.nominate') }));
    expect(uiStore.getState().modal).toMatchObject({ id: 'confirm', pausesTime: false });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: t('cmd.shogunate.nominate') }));
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.confirm') }));
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([command]);
    let events: ReturnType<typeof runOneDay> = [];
    act(() => {
      events = runOneDay();
    });
    expect(events.filter((event) => event.type === 'shogunate.nominated')).toEqual([
      expect.objectContaining({ clanId: COURT_PLAYER }),
    ]);
    expect(game.court.patronClanId).toBe(COURT_PLAYER);
    expect(game.clans[COURT_PLAYER]!.prestige).toBe(
      Math.min(
        BAL.prestigeMax,
        before.clans[COURT_PLAYER]!.prestige + BAL.shogunNominatePrestigeGain,
      ),
    );
    expect(validateState(game)).toEqual([]);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('keeps a real month-opening summary behind nomination consent in Main', async () => {
    const game = await prepareCourtAdmission();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-diplomacy'));
    fireEvent.click(screen.getByRole('tab', { name: t('ui.shogunate.title') }));
    fireEvent.click(screen.getByRole('button', { name: t('cmd.shogunate.nominate') }));
    const consent = uiStore.getState().modal;
    expect(consent).toMatchObject({ id: 'confirm', pausesTime: false });
    expect(store.getState().session.speed).toBe('x2');
    act(() => {
      runOneDay();
    });
    expect(game.time.month).toBe(5);
    expect(uiStore.getState().modal).toBe(consent);
    const arrival = uiStore.getState().modalQueue.find((entry) => entry.id === 'monthSummary');
    expect(arrival).toBeDefined();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const beforeCancel = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(uiStore.getState().modal).toBe(arrival);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('ui.reward.title') })).toBeTruthy();
    expect(game).toEqual(beforeCancel);
    expect(game.court.patronClanId).toBeNull();
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('keeps a real month-opening summary behind parent-owned title consent and hands it over on Resume', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    const title = vi.fn();
    render(
      <>
        <MainScreen />
        <SystemMenuHost dirty onReturnToTitle={title} />
      </>,
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    const owner = uiStore.getState().modal;
    expect(owner?.id).toBe('systemMenu');
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.toTitle') }));
    expect(uiStore.getState().modal).toBe(owner);
    expect(uiStore.getState().modalQueue).toEqual([]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    act(() => {
      runOneDay();
    });
    expect(game.time.month).toBe(5);
    const arrival = uiStore.getState().modalQueue.find((entry) => entry.id === 'monthSummary');
    expect(arrival).toBeDefined();
    expect(uiStore.getState().modal).toBe(owner);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.cancel') }));
    expect(uiStore.getState().modal).toBe(owner);
    expect(uiStore.getState().modalQueue).toContain(arrival);
    expect(title).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    expect(uiStore.getState().modal).toBe(arrival);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('ui.reward.title') })).toBeTruthy();
    expect(game).toEqual(before);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('starts and cancels a paid plot through Main without refund or early state mutation', () => {
    const game = preparePoachAdmission();
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    store.getState().actions.setSpeed('x2');
    store.getState().actions.requestPause('user');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-plot'));
    const panel = screen.getByTestId('plot-panel');
    fireEvent.change(within(panel).getByRole('combobox', { name: t('ui.plot.targetClan') }), {
      target: { value: CLAN_BETA },
    });
    fireEvent.change(within(panel).getByRole('combobox', { name: t('ui.plot.target') }), {
      target: { value: OFF_BETA_TAISHO },
    });
    fireEvent.change(within(panel).getByRole('combobox', { name: t('ui.plot.executor') }), {
      target: { value: OFF_ALPHA_BUSHO },
    });
    fireEvent.change(within(panel).getByRole('combobox', { name: t('ui.plot.investGold') }), {
      target: { value: '200' },
    });
    const start = {
      type: 'startPlot' as const,
      clanId: CLAN_ALPHA,
      kind: 'poach' as const,
      executorId: OFF_ALPHA_BUSHO,
      targetClanId: CLAN_BETA,
      targetOfficerId: OFF_BETA_TAISHO,
      targetCastleId: null,
      investGold: 200,
    };
    expect(validateCommand(game, start)).toEqual({ ok: true });
    const beforeStart = structuredClone(game);
    fireEvent.click(within(panel).getByRole('button', { name: t('cmd.plot.start') }));
    expect(game).toEqual(beforeStart);
    expect(getQueuedPlayerCommands(game)).toEqual([start]);
    act(() => {
      runOneDay();
    });
    const plot = game.diplomacy.plots[0]!;
    expect(plot.investGold).toBe(200);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeStart.clans[CLAN_ALPHA]!.gold - 200);
    expect(isOfficerBusy(game, OFF_ALPHA_BUSHO)).toBe(true);
    expect(validateState(game)).toEqual([]);
    const beforeCancel = structuredClone(game);
    fireEvent.click(within(panel).getByRole('button', { name: t('cmd.plot.cancel') }));
    expect(uiStore.getState().modal).toMatchObject({ id: 'confirm', pausesTime: false });
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.cancel') }),
    );
    expect(game).toEqual(beforeCancel);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    fireEvent.click(within(panel).getByRole('button', { name: t('cmd.plot.cancel') }));
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.confirm') }),
    );
    expect(game).toEqual(beforeCancel);
    expect(getQueuedPlayerCommands(game)).toEqual([
      {
        type: 'cancelPlot',
        clanId: CLAN_ALPHA,
        plotId: plot.id,
      },
    ]);
    let events: ReturnType<typeof runOneDay> = [];
    act(() => {
      events = runOneDay();
    });
    expect(game.diplomacy.plots).toEqual([]);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(beforeCancel.clans[CLAN_ALPHA]!.gold);
    expect(isOfficerBusy(game, OFF_ALPHA_BUSHO)).toBe(false);
    expect(events.filter((event) => event.type.startsWith('plot.'))).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('queues a real monthly summary behind cancellation while actual plot progress changes', () => {
    const game = preparePoachAdmission();
    const day = calendarToDay(1560, 4, 29);
    game.time = { day, ...dayToCalendar(day) };
    for (const officer of Object.values(game.officers))
      game.events.cooldownUntil[`proposal.officer:${officer.id}`] = day + 60;
    expect(validateState(game)).toEqual([]);
    setGame(game);
    store.getState().actions.setScreen('main');
    initializeBridgeSession(game);
    expect(
      dispatchCommand({
        type: 'startPlot',
        clanId: CLAN_ALPHA,
        kind: 'poach',
        executorId: OFF_ALPHA_BUSHO,
        targetClanId: CLAN_BETA,
        targetOfficerId: OFF_BETA_TAISHO,
        targetCastleId: null,
        investGold: 200,
      }),
    ).toEqual({ ok: true });
    act(() => {
      runOneDay();
    });
    const plot = game.diplomacy.plots[0]!;
    expect(plot.progress).toBe(0);
    store.getState().actions.setSpeed('x2');
    render(<MainScreen />);
    fireEvent.click(screen.getByTestId('rail-plot'));
    fireEvent.click(screen.getByRole('button', { name: t('cmd.plot.cancel') }));
    const consent = uiStore.getState().modal;
    expect(consent).toMatchObject({ id: 'confirm', pausesTime: false });
    expect(store.getState().session.speed).toBe('x2');
    act(() => {
      runOneDay();
    });
    expect(game.time.month).toBe(5);
    expect(game.diplomacy.plots[0]).toBe(plot);
    expect(plot.progress).toBeGreaterThan(0);
    expect(plot.progress).toBeLessThan(BAL.plotProgressMax);
    expect(uiStore.getState().modal).toBe(consent);
    const arrival = uiStore.getState().modalQueue.find((entry) => entry.id === 'monthSummary');
    expect(arrival).toBeDefined();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const beforeCancel = structuredClone(game);
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: t('ui.common.cancel') }),
    );
    expect(uiStore.getState().modal).toBe(arrival);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: t('ui.reward.title') })).toBeTruthy();
    expect(game).toEqual(beforeCancel);
    expect(getQueuedPlayerCommands(game)).toEqual([]);
    expect(validateState(game)).toEqual([]);
    expect(store.getState().session.speed).toBe('paused');
  });

  it('軍事快捷列以玩家居城建立出陣草稿並開啟編成 modal', () => {
    store.getState().actions.setScreen('main');
    const game = store.getState().game!;
    game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!.soldiers = 3_000;
    render(<MainScreen />);

    fireEvent.click(screen.getByTestId('rail-military'));

    expect(uiStore.getState().marchDraft).toMatchObject({
      originCastleId: game.clans[game.meta.playerClanId]!.homeCastleId,
      phase: 'compose',
    });
    expect(uiStore.getState().modal?.id).toBe('march');
    expect(screen.getByTestId('march-modal')).toBeTruthy();
  });

  it('軍團委任城不可由軍事快捷列出陣', () => {
    const game = store.getState().game!;
    const home = game.castles[game.clans[game.meta.playerClanId]!.homeCastleId]!;
    home.directControl = false;
    render(<MainScreen />);
    expect(screen.getByTestId('rail-military').hasAttribute('disabled')).toBe(true);
  });

  // ── M6-V9 HUD 組裝（§4）新元件接線 ──

  it('MiniMap 掛載於 HUD（minimap/minimap-base/minimap-frame testid 契約）', () => {
    render(<MainScreen />);
    expect(screen.getByTestId('minimap')).toBeTruthy();
    expect(screen.getByTestId('minimap-base')).toBeTruthy();
    expect(screen.getByTestId('minimap-frame')).toBeTruthy();
  });

  it('system settings are reachable while holding one interaction-owned pause', () => {
    store.getState().actions.setScreen('main');
    store.getState().actions.setSpeed('x2');
    render(
      <>
        <MainScreen />
        <SystemMenuHost />
      </>,
    );
    const menuBtn = screen.getByRole('button', { name: t('ui.system.menu') });
    fireEvent.click(menuBtn);
    expect(store.getState().session.speed).toBe('paused');
    expect(screen.getByTestId('speed-5').hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.settings') }));
    expect(screen.getByRole('slider', { name: t('ui.settings.uiScale') })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: t('ui.common.back') }));
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: t('ui.system.resume') }));
    expect(store.getState().session.speed).toBe('x2');
  });

  it('選取城池 → 底部 ContextPanel 顯示快覽（不自動開完整城面板，§4.6 點擊語意）', () => {
    const game = store.getState().game!;
    const homeId = game.clans[game.meta.playerClanId]!.homeCastleId;
    render(<MainScreen />);
    act(() => {
      uiStore.getState().actions.setSelection({ kind: 'castle', id: homeId });
    });
    // 快覽條動作鈕在場（城面板／出陣／輸送鎖定占位）……
    expect(screen.getByRole('button', { name: t('ui.context.castle.panel') })).toBeTruthy();
    // ……但完整 CastlePanel 不因選取而自動開啟（panelStack 空、無 castle-panel）。
    expect(uiStore.getState().panelStack).toHaveLength(0);
    expect(screen.queryByTestId('castle-panel')).toBeNull();

    // 快覽鈕才是完整面板入口。
    fireEvent.click(screen.getByRole('button', { name: t('ui.context.castle.panel') }));
    expect(uiStore.getState().panelStack.at(-1)?.id).toBe('castle');
    expect(screen.getByTestId('castle-panel')).toBeTruthy();
  });

  it('opens the actual transport tab from an owned castle shortcut without imposing march control', () => {
    const game = store.getState().game!;
    const homeId = game.clans[game.meta.playerClanId]!.homeCastleId;
    game.castles[homeId]!.directControl = false;
    render(<MainScreen />);
    act(() => uiStore.getState().actions.setSelection({ kind: 'castle', id: homeId }));
    const shortcut = screen.getByTestId('context-transport');
    expect(shortcut.hasAttribute('disabled')).toBe(false);
    fireEvent.click(shortcut);
    expect(uiStore.getState().panelStack.at(-1)?.params.tab).toBe('transport');
    expect(screen.getByRole('tab', { name: '輸送' }).getAttribute('aria-selected')).toBe('true');
  });

  it('keeps enemy castle transport shortcut disabled without opening a form', () => {
    const game = store.getState().game!;
    const homeId = game.clans[game.meta.playerClanId]!.homeCastleId;
    game.castles[homeId]!.ownerClanId = 'clan.enemy' as typeof game.meta.playerClanId;
    render(<MainScreen />);
    act(() => uiStore.getState().actions.setSelection({ kind: 'castle', id: homeId }));
    const shortcut = screen.getByTestId('context-transport');
    expect(shortcut.hasAttribute('disabled')).toBe(true);
    fireEvent.click(shortcut);
    expect(uiStore.getState().panelStack).toHaveLength(0);
  });

  it('視窗跨越 1440 斷點 resize 時 MiniMap 尺寸即時更新（M6-V9 review 補跑：暫停中無 tick 亦然）', () => {
    const setWidth = (px: number): void => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
    };
    const original = window.innerWidth;
    try {
      setWidth(1600);
      render(<MainScreen />);
      expect(screen.getByTestId('minimap').style.width).toContain(`${UI.minimapSizePx / 16}rem`);
      expect(screen.getByTestId('minimap').style.width).toContain('min(192px');

      // 不推進任何 tick（模擬暫停），僅發 resize——尺寸須立即切到 <1440 檔。
      setWidth(1200);
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });
      expect(screen.getByTestId('minimap').style.width).toContain('11rem');
      expect(screen.getByTestId('minimap').style.width).toContain('min(192px');
    } finally {
      setWidth(original);
    }
  });
});
