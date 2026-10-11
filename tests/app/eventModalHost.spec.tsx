import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventModalHost } from '../../src/app/events/EventModalHost';
import * as bridge from '../../src/app/bridge';
import { resetGameStoreForTests, store } from '../../src/app/store';
import { createRuntimeEventEngine } from '../../src/core/systems/events/runtime';
import type { EventDef } from '../../src/core/systems/events/types';
import type { EventId } from '../../src/core/state/ids';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';
import { useUIStore } from '../../src/ui/hooks/uiStore';
import { getEventPresentationSnapshot } from '../../src/app/events/eventPresentationQueue';
import { zCanonicalEventsFile } from '../../src/data/schemas/eventDefinitions';
import eventData from '../../src/data/scenarios/s1560/events.json';
import { calendarToDay, dayToCalendar } from '../../src/core/systems/time';
import { Dialog } from '../../src/ui/components';
import { settingsStore } from '../../src/app/settings/runtime';

function OtherModal() {
  const modal = useUIStore((state) => state.modal);
  return (
    <Dialog
      open={modal?.id === 'systemMenu'}
      title="既有系統選單"
      onClose={() => useUIStore.getState().actions.closeModal()}
    >
      既有系統選單
    </Dialog>
  );
}

function definition(id = 'evt.host'): EventDef {
  return {
    id: id as EventId,
    kind: 'historical',
    priority: 20,
    target: 'fixed',
    ownerCandidates: [CLAN_ALPHA],
    trigger: {
      from: { year: 1560, month: 1, day: 1 },
      to: { year: 1562, month: 12, day: 30 },
      check: 'monthStart',
      hooks: [],
      conditions: [],
      probability: 1,
      once: true,
      cooldownDays: 0,
      cooldownKey: null,
    },
    cutscene: { title: id, body: '請決定。', monClanId: CLAN_ALPHA },
    effects: [],
    choices: [
      {
        label: '決定',
        conditions: [],
        aiWeight: 1,
        effects: [{ op: 'setFlag', key: 'host.chosen', value: 1 }],
      },
    ],
  };
}
function mountSession(def = definition()) {
  const game = buildTinyState();
  game.events.pendingChoiceEventId = def.id;
  game.events.pendingChoiceBinding = { clanId: CLAN_ALPHA, castleId: null, districtId: null };
  game.events.fired[def.id] = 0;
  resetGameStoreForTests(game);
  bridge.initializeBridgeSession(game, [], { eventEngine: createRuntimeEventEngine([def]) });
  store.getState().actions.setSpeed('x2');
  store.getState().actions.requestPause('user');
  return game;
}
beforeEach(() => {
  settingsStore.getState().resetSettings();
  bridge.resetBridgeForTests();
  useUIStore.getState().actions.reset();
});
afterEach(() => {
  cleanup();
  bridge.resetBridgeForTests();
  useUIStore.getState().actions.reset();
  vi.restoreAllMocks();
  settingsStore.getState().resetSettings();
});

function startNotices(defs: EventDef[], manualPause = false) {
  // These host-only tests isolate event restoration; monthly FIFO integration has its own tests.
  // Disabled monthly summaries must not suppress either resolved or mandatory event descriptors.
  settingsStore.getState().updateSettings({ autoPause: { monthStart: false } });
  const game = buildTinyState();
  const day = calendarToDay(1560, 4, 30);
  game.time = { day, ...dayToCalendar(day) };
  resetGameStoreForTests(game);
  bridge.initializeBridgeSession(game, [], { eventEngine: createRuntimeEventEngine(defs) });
  store.getState().actions.setScreen('main');
  store.getState().actions.setSpeed('x2');
  if (manualPause) store.getState().actions.requestPause('user');
  bridge.runOneDay();
  return game;
}
function notice(id: string, priority = 20): EventDef {
  const def = definition(id);
  def.kind = 'generic';
  def.target = 'player';
  def.priority = priority;
  def.choices = [];
  def.cutscene.body = '{clanName}的消息。';
  return def;
}

describe('fired presentation EventModalHost', () => {
  it('shows the captured firing text and continues without a command or another core tick', () => {
    const game = startNotices([notice('evt.notice')]);
    expect(game.events.pendingChoiceEventId).toBeNull();
    expect(store.getState().session.speed).toBe('paused');
    // A later core name change must not reinterpret the already-fired narrative.
    game.clans[CLAN_ALPHA]!.name = '改名後';
    const before = structuredClone(game);
    const commands = bridge.captureSaveSnapshot(123).pendingCommands;
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.getByRole('dialog').textContent).toContain('甲家的消息。');
    expect(screen.queryByText('歷史的岔路——請做出抉擇')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(getEventPresentationSnapshot()).toEqual([]);
    expect(game).toEqual(before);
    expect(bridge.captureSaveSnapshot(124).pendingCommands).toEqual(commands);
    expect(store.getState().session.speed).toBe('x2');
  });

  it('dismisses a presentation with Escape without losing a pre-existing manual pause', () => {
    const game = startNotices([notice('evt.paused-notice')], true);
    const before = structuredClone(game);
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game).toEqual(before);
    expect(store.getState().session.speed).toBe('paused');
    expect(store.getState().session.lastPauseReason).toBe('user');
  });

  it('drains two notices in order and restores speed only after the complete modal queue', () => {
    const game = startNotices([notice('evt.second', 20), notice('evt.first', 21)]);
    const before = structuredClone(game);
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.getByRole('dialog').textContent).toContain('evt.first');
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(screen.getByRole('dialog').textContent).toContain('evt.second');
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(store.getState().session.speed).toBe('x2');
    expect(game).toEqual(before);
  });

  it('waits behind the active system modal and keeps its shared pause through the handoff', () => {
    const game = buildTinyState();
    const day = calendarToDay(1560, 4, 30);
    game.time = { day, ...dayToCalendar(day) };
    resetGameStoreForTests(game);
    bridge.initializeBridgeSession(game, [], {
      eventEngine: createRuntimeEventEngine([notice('evt.after-system')]),
    });
    store.getState().actions.setSpeed('x2');
    useUIStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    bridge.runOneDay();
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => useUIStore.getState().actions.closeModal());
    expect(screen.getByRole('dialog').textContent).toContain('evt.after-system');
    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(store.getState().session.speed).toBe('x2');
  });

  it('supplies the actual merchant cost and resolves its typed unlock through normal Step1', async () => {
    const def = zCanonicalEventsFile
      .parse(eventData)
      .events.find((row) => row.id === 'evt.teppo-denrai')!;
    const game = mountSession(def);
    game.clans[CLAN_ALPHA]!.gold = 500;
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.getByRole('dialog').textContent).toContain('開價500貫');
    fireEvent.click(screen.getByRole('button', { name: '重金購下' }));
    await waitFor(() => expect(game.events.pendingChoiceEventId).toBeNull());
    expect(game.events.flags[`unlock.pol.kakishuchu.${CLAN_ALPHA}`]).toBe(1);
    expect(game.clans[CLAN_ALPHA]!.gold).toBe(0);
    expect(store.getState().session.lastPauseReason).toBe('user');
  });
});

describe('live pending EventModalHost', () => {
  it('keeps actual same-tick informational A before mandatory B without overlapping dialogs', async () => {
    const first = definition('evt.first');
    first.priority = 30;
    first.cutscene.title = '先發生的敘事';
    first.choices = [];
    const second = definition('evt.second');
    second.priority = 20;
    second.cutscene.title = '後發生的抉擇';
    const game = buildTinyState();
    resetGameStoreForTests(game);
    const engine = createRuntimeEventEngine([second, first]);
    bridge.initializeBridgeSession(game, [], { eventEngine: engine });
    store.getState().actions.requestPause('user');
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    act(() => {
      engine.run(game, () => {});
    });
    expect(game.events.pendingChoiceEventId).toBe(second.id);
    expect(getEventPresentationSnapshot().map((entry) => entry.kind)).toEqual([
      'resolved',
      'pending',
    ]);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).toContain('先發生的敘事');
    fireEvent.click(screen.getByRole('button', { name: '繼續' }));
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).toContain('後發生的抉擇');
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(getEventPresentationSnapshot()).toHaveLength(0);
    expect(store.getState().session.speed).toBe('paused');
  });
  it('does not overlay an active other modal, and then presents the queued mandatory restored choice', () => {
    useUIStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
    const game = mountSession();
    render(
      <>
        <OtherModal />
        <EventModalHost enabled animateText={false} onExportCurrent={() => {}} />
      </>,
    );
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).toContain('既有系統選單');
    expect(useUIStore.getState().modal?.id).toBe('systemMenu');
    expect(game.events.pendingChoiceEventId).not.toBeNull();
    act(() => useUIStore.getState().actions.closeModal());
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('button', { name: '決定' })).toBeTruthy();
  });
  it('offers recovery export instead of an unusable Continue for a malformed informational pending event', async () => {
    const def = definition();
    def.choices = [];
    const game = mountSession(def);
    const before = structuredClone(game);
    const exported = vi.fn();
    render(<EventModalHost enabled animateText={false} onExportCurrent={exported} />);
    expect(screen.getByTestId('event-unavailable')).toBeTruthy();
    expect(screen.queryByRole('button', { name: '繼續' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: '匯出目前進度' }));
    await waitFor(() => expect(exported).toHaveBeenCalledOnce());
    expect(game).toEqual(before);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });
  it('resolves through real Step1 and closes only when pending state clears, preserving manual pause', async () => {
    const game = mountSession();
    const initialDay = game.time.day;
    const session = structuredClone(store.getState().session);
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(game.time.day).toBe(initialDay + 1);
    expect(game.meta.lastAppliedCmdSeq).toBe(1);
    expect(game.events.flags['host.chosen']).toBe(1);
    expect(game.events.pendingChoiceEventId).toBeNull();
    expect(store.getState().session.speed).toBe(session.speed);
    expect(store.getState().session.resumeSpeed).toBe(session.resumeSpeed);
    expect(store.getState().session.lastPauseReason).toBe(session.lastPauseReason);
  });

  it('keeps missing catalog mandatory and offers export without clearing or advancing saved state', async () => {
    const game = mountSession();
    bridge.initializeBridgeSession(game);
    const before = structuredClone(game);
    const onExportCurrent = vi.fn();
    render(<EventModalHost enabled animateText={false} onExportCurrent={onExportCurrent} />);
    expect(screen.getByTestId('event-unavailable')).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '匯出目前進度' }));
    await waitFor(() => expect(onExportCurrent).toHaveBeenCalledOnce());
    expect(game).toEqual(before);
  });

  it('renders real disabled-choice reasons and never queues disabled choices', () => {
    const def = definition();
    def.choices[0]!.conditions = [{ kind: 'clanGoldAtLeast', clanId: CLAN_ALPHA, value: 999999 }];
    const game = mountSession(def);
    const initialDay = game.time.day;
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    const button = screen.getByRole('button', { name: '決定' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.focus(button.parentElement!);
    expect(screen.getByRole('tooltip').textContent).toContain('999,999');
    fireEvent.click(button);
    expect(game.time.day).toBe(initialDay);
    expect(bridge.getBridgeProgressMark()?.pendingCommands).toEqual([]);
  });

  it('shows a current rejection while keeping the original pending event', async () => {
    const game = mountSession();
    vi.spyOn(bridge, 'resolvePendingEventChoice').mockResolvedValue({
      ok: false,
      reason: 'cmd.reject.invalidTarget',
    });
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(game.events.pendingChoiceEventId).toBe('evt.host');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('cannot place a late old-session rejection on a replacement event', async () => {
    mountSession();
    let finish: (value: bridge.CommandDispatchResult) => void = () => {};
    vi.spyOn(bridge, 'resolvePendingEventChoice').mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    render(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '決定' }));
    act(() => {
      mountSession(definition('evt.replacement'));
    });
    expect(screen.getByRole('dialog').textContent).toContain('evt.replacement');
    await act(async () => {
      finish({ ok: false, reason: 'cmd.reject.invalidTarget' });
      await Promise.resolve();
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '決定' })).toHaveProperty('disabled', false);
  });

  it('does not display pending interactions on battle/title/ending surfaces', () => {
    const game = mountSession();
    const { rerender } = render(
      <EventModalHost enabled={false} animateText={false} onExportCurrent={() => {}} />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    game.meta.gameOver = { kind: 'defeat', endingId: 'no-castle' };
    rerender(<EventModalHost enabled animateText={false} onExportCurrent={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(game.events.pendingChoiceEventId).toBe('evt.host');
  });
});
