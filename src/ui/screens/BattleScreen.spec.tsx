import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import { getPendingBattleOrdersForTests, resetBattleBridgeForTests } from '@app/battleBridge';
import * as battleBridge from '@app/battleBridge';
import type { BattleState, BattleUnit, GameState } from '@core/state/gameState';
import type {
  ArmyId,
  BattleId,
  ClanId,
  MapNodeId,
  OfficerId,
  TacticId,
  TraitId,
} from '@core/state/ids';
import { makeLoopTestState, TEST_CLAN } from '../../../tests/helpers/loopState';
import { BattleScreen } from './BattleScreen';
import { SystemMenuHost } from './SystemMenuHost';
import { UI } from '../uiConstants';
import { uiStore } from '../hooks/uiStore';

// Real Host projection/DOM controls remain mounted; only the WebGL boundary is mocked.
vi.mock('../battle/BattleRenderer', () => ({
  BattleRenderer: class {
    async init(): Promise<void> {}
    update(): void {}
    destroy(): void {}
  },
}));
vi.mock('../map/mapFontReady', () => ({ waitForMapFont: async () => {} }));

const viewport = vi.hoisted(() => ({ blocked: false }));
vi.mock('@ui/viewport', () => ({ useViewportBlocked: () => viewport.blocked }));
function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

const BATTLE = 'battle.000001' as BattleId;
const ENEMY_CLAN = 'clan.enemy' as ClanId;

function unit(
  id: string,
  side: 'attacker' | 'defender',
  jinId: string,
  overrides: Partial<BattleUnit> = {},
): BattleUnit {
  return {
    id,
    armyId: `army.${id}` as ArmyId,
    side,
    generalId: `officer.${id}` as OfficerId,
    troops: 1_000,
    battleInitialTroops: 1_000,
    morale: 70,
    jinId,
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited: false,
    strategyStatus: 'engaged',
    ...overrides,
  };
}

function makeBattleGame(overrides: Partial<BattleState> = {}): GameState {
  const game = makeLoopTestState({ debugMode: false });
  game.battles[BATTLE] = {
    id: BATTLE,
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: TEST_CLAN,
    defenderClanId: ENEMY_CLAN,
    jins: [
      {
        id: 'jin.a',
        col: 0,
        row: 1,
        owner: 'attacker',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.2,
      },
      {
        id: 'jin.center',
        col: 1,
        row: 1,
        owner: 'neutral',
        isHonjin: false,
        flagPower: 50,
        flagPowerMax: 100,
        defenseBonus: 0,
      },
      {
        id: 'jin.b',
        col: 2,
        row: 1,
        owner: 'defender',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.2,
      },
    ],
    edges: [],
    units: [
      unit('bu.alpha-1', 'attacker', 'jin.a'),
      unit('bu.alpha-2', 'attacker', 'jin.a', { delegated: true }),
      unit('bu.beta-1', 'defender', 'jin.b', { troops: 900 }),
    ],
    tick: 3,
    saihai: { attacker: 4, defender: 8 },
    honjinFallenTick: null,
    result: null,
    ...overrides,
  };
  return game;
}

beforeEach(() => {
  viewport.blocked = false;
  uiStore.getState().actions.reset();
  resetBattleBridgeForTests();
  resetGameStoreForTests(makeBattleGame());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('BattleScreen', () => {
  it.each(['routed', 'exited', 'depleted'] as const)(
    'discards the target draft when its actor becomes %s, without reviving on recovery',
    (state) => {
      const game = makeBattleGame();
      const actor = game.battles[BATTLE]!.units[0]!;
      resetGameStoreForTests(game);
      const content = <BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />;
      const view = render(content);
      fireEvent.click(screen.getByRole('button', { name: '齊射 4' }));
      expect(screen.getByText('請選擇敵方部隊')).toBeTruthy();
      // Controlled lifecycle boundary: presentation must follow current tactical facts.
      if (state === 'depleted') actor.troops = 0;
      else actor[state] = true;
      view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
      expect(screen.queryByText('請選擇敵方部隊')).toBeNull();
      actor.troops = 1000;
      actor.routed = false;
      actor.exited = false;
      view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
      expect(screen.queryByText('請選擇敵方部隊')).toBeNull();
      expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    },
  );

  it('does not transfer a trait-gated targeted tactic when selecting another unit', () => {
    // Isolated tactical presentation fixture; the order queue and battle tick are real.
    const game = makeBattleGame();
    const battle = game.battles[BATTLE]!;
    const originalOfficer = Object.values(game.officers)[0]!;
    for (const combatant of battle.units) {
      game.officers[combatant.generalId] = {
        ...structuredClone(originalOfficer),
        id: combatant.generalId,
        traits: combatant.id === 'bu.alpha-1' ? ['trait.benzetsu' as TraitId] : [],
      };
    }
    battle.edges = [{ a: 'jin.a', b: 'jin.b', moveCost: 2 }];
    battle.units[1]!.delegated = false;
    battle.saihai.attacker = 10;
    resetGameStoreForTests(game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const before = structuredClone(game);
    fireEvent.click(screen.getByRole('button', { name: '挑撥 3' }));
    fireEvent.click(screen.getByTestId('battle-unit-card-bu.alpha-2'));
    expect(screen.queryByRole('button', { name: '挑撥 3' })).toBeNull();
    fireEvent.click(screen.getByTestId('battle-unit-bu.beta-1'));
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'attack', unitId: 'bu.alpha-2', targetUnitId: 'bu.beta-1' },
    ]);
    expect(game).toEqual(before);
    let attack!: ReturnType<typeof battleBridge.runBattleTick>;
    act(() => {
      attack = battleBridge.runBattleTick(BATTLE);
    });
    expect(
      attack.events.some(
        (event) => event.type === 'attack.accepted' && event.unitId === 'bu.alpha-2',
      ),
    ).toBe(true);
    fireEvent.click(screen.getByTestId('battle-unit-card-bu.alpha-1'));
    fireEvent.click(screen.getByRole('button', { name: '挑撥 3' }));
    fireEvent.click(screen.getByTestId('battle-unit-bu.beta-1'));
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'tactic', unitId: 'bu.alpha-1', tacticId: 'tac.taunt', targetUnitId: 'bu.beta-1' },
    ]);
    let tactic!: ReturnType<typeof battleBridge.runBattleTick>;
    act(() => {
      tactic = battleBridge.runBattleTick(BATTLE);
    });
    expect(
      tactic.events.some(
        (event) => event.type === 'tactic.accepted' && event.unitId === 'bu.alpha-1',
      ),
    ).toBe(true);
  });

  it('refreshes factual status badges from an in-place battle update and separates terminal lifecycle', () => {
    const game = makeBattleGame();
    const battle = game.battles[BATTLE]!;
    battle.edges = [{ a: 'jin.a', b: 'jin.b', moveCost: 2 }];
    resetGameStoreForTests(game);
    const view = render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const card = screen.getByTestId('battle-unit-card-bu.alpha-1');
    expect(card.querySelector('[data-battle-status="contact"]')).not.toBeNull();
    expect(card.querySelector('[data-battle-status="idle"]')).toBeNull();
    battle.units[0]!.moveTargetJinId = 'jin.b';
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(card.querySelector('[data-battle-status="moving"]')).not.toBeNull();
    const description = screen
      .getByTestId('battle-unit-bu.alpha-1')
      .getAttribute('aria-describedby')!;
    expect(
      document.getElementById(description)?.querySelector('[data-battle-status="contact"]'),
    ).not.toBeNull();
    battle.units[0]!.activeTactics = [
      { tacticId: 'tac.hold' as TacticId, remainingTicks: 2, targetUnitId: null },
    ];
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(card.querySelector('[data-battle-status="immobile"]')).not.toBeNull();
    expect(card.querySelector('[data-battle-status="moving"]')).toBeNull();
    expect(
      document.getElementById(description)?.querySelector('[data-battle-status="immobile"]'),
    ).not.toBeNull();
    battle.units[0]!.activeTactics = [];
    battle.units[0]!.moveTargetJinId = null;
    battle.units[0]!.attackTargetUnitId = 'bu.beta-1';
    battle.edges = [];
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(card.querySelector('[data-battle-status="idle"]')).not.toBeNull();
    expect(card.querySelector('[data-battle-status="contact"]')).toBeNull();
    battle.units[0]!.routed = true;
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(card.querySelector('[data-battle-status="routed"]')).not.toBeNull();
    expect(
      document.getElementById(description)?.querySelector('[data-battle-status="routed"]'),
    ).not.toBeNull();
    battle.units[0]!.troops = 0;
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(card.querySelector('[data-battle-status="depleted"]')).not.toBeNull();
    expect(
      document.getElementById(description)?.querySelector('[data-battle-status="depleted"]'),
    ).not.toBeNull();
    battle.units[0]!.exited = true;
    view.rerender(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    expect(
      Array.from(card.querySelectorAll('[data-battle-status]')).map((x) =>
        x.getAttribute('data-battle-status'),
      ),
    ).toEqual(['exited']);
    expect((card as HTMLButtonElement).disabled).toBe(true);
  });
  it('logs only executed tactics, not paused queued/duplicate/rejected orders or idle ticks', () => {
    vi.useFakeTimers();
    const game = makeBattleGame({
      units: [unit('bu.alpha-1', 'attacker', 'jin.a'), unit('bu.beta-1', 'defender', 'jin.b')],
      saihai: { attacker: 10, defender: 10 },
    });
    resetGameStoreForTests(game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const list = screen.getByTestId('battle-log-list');
    fireEvent.click(screen.getByRole('button', { name: '突擊 5' }));
    fireEvent.click(screen.getByRole('button', { name: '突擊 5' }));
    expect(list.children).toHaveLength(0);
    fireEvent.keyDown(document.body, { key: '1' });
    advance(UI.kassenTickMs);
    expect(list.querySelectorAll('[data-log-kind="tactic.accepted"]')).toHaveLength(1);
    expect(list.textContent).toContain('發動「突擊」');
    const count = list.children.length;
    act(() => {
      battleBridge.dispatchBattleOrder(BATTLE, {
        kind: 'move',
        unitId: 'bu.alpha-1',
        targetJinId: 'jin.missing',
      });
    });
    advance(UI.kassenTickMs);
    expect(list.children).toHaveLength(count);
    expect(list.textContent).not.toContain('戰況推進');
  });
  it('retains bounded event rows, follows near-bottom readers and leaves older-reading scroll/keyboard native', () => {
    vi.useFakeTimers();
    let tick = 0;
    vi.spyOn(battleBridge, 'runBattleTick').mockImplementation((id) => ({
      battleId: id,
      tick: ++tick,
      resolved: false,
      events: [
        {
          type: 'unit.changed',
          unitId: 'bu.alpha-1',
          source: 'combat',
          troopsBefore: 1000,
          troopsAfter: 990,
          moraleBefore: 80,
          moraleAfter: 79,
          sequence: 1,
        },
      ],
    }));
    const before = structuredClone(store.getState().game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const log = screen.getByTestId('battle-log');
    let top = 800;
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 200 },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = Math.max(0, Math.min(800, value));
        },
      },
    });
    fireEvent.keyDown(document.body, { key: '1' });
    advance(UI.kassenTickMs);
    expect(top).toBe(800);
    top = 200;
    fireEvent.scroll(log);
    advance(UI.kassenTickMs * 2);
    expect(top).toBe(200);
    expect(screen.getByTestId('battle-log-latest')).toBeTruthy();
    log.focus();
    fireEvent.keyDown(log, { key: ' ' });
    expect(screen.getByRole('button', { name: '一倍速 ×1' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByTestId('battle-log-latest'));
    expect(top).toBe(800);
    expect(document.activeElement).toBe(log);
    expect(screen.queryByTestId('battle-log-latest')).toBeNull();
    advance(UI.kassenTickMs * 70);
    expect(screen.getByTestId('battle-log-list').children).toHaveLength(50);
    expect(log.getAttribute('aria-relevant')).toBe('additions');
    expect(log.getAttribute('aria-atomic')).toBe('false');
    expect(store.getState().game).toEqual(before);
  });
  it('preserves a retained reading-row offset when the cap prunes older rows, without inventing an evicted anchor', () => {
    vi.useFakeTimers();
    let tick = 0;
    vi.spyOn(battleBridge, 'runBattleTick').mockImplementation((id) => ({
      battleId: id,
      tick: ++tick,
      resolved: false,
      events: [{ type: 'unit.routed', unitId: 'bu.beta-1', sequence: 1 }],
    }));
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const log = screen.getByTestId('battle-log');
    let top = 900;
    Object.defineProperties(log, {
      scrollHeight: { configurable: true, value: 1000 },
      clientHeight: { configurable: true, value: 100 },
      scrollTop: {
        configurable: true,
        get: () => top,
        set: (value: number) => {
          top = value;
        },
      },
    });
    // Synthetic DOM geometry tests scrolling only, not tactical rendering or core outcomes.
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const index =
        this.dataset.logId && this.parentElement
          ? Array.from(this.parentElement.children).indexOf(this)
          : -1;
      const y = index >= 0 ? index * 20 - top : 0;
      return {
        x: 0,
        y,
        top: y,
        bottom: y + (index >= 0 ? 20 : 100),
        left: 0,
        right: 100,
        width: 100,
        height: index >= 0 ? 20 : 100,
        toJSON: () => ({}),
      };
    });
    fireEvent.keyDown(document.body, { key: '1' });
    advance(UI.kassenTickMs * 50);
    top = 205;
    fireEvent.scroll(log);
    const anchor = screen.getByTestId('battle-log-list').children[10] as HTMLElement;
    const anchorId = anchor.dataset.logId;
    const offset = anchor.getBoundingClientRect().top;
    advance(UI.kassenTickMs);
    const retained = log.querySelector<HTMLElement>(`[data-log-id="${anchorId}"]`)!;
    expect(retained.getBoundingClientRect().top).toBe(offset);
    expect(top).toBe(185);
    top = 0;
    fireEvent.scroll(log);
    const evictedId = screen
      .getByTestId('battle-log-list')
      .children[0]!.getAttribute('data-log-id');
    advance(UI.kassenTickMs);
    expect(log.querySelector(`[data-log-id="${evictedId}"]`)).toBeNull();
    expect(top).toBe(0);
    expect(screen.getByTestId('battle-log-latest')).toBeTruthy();
    expect(screen.getByTestId('battle-log-list').children).toHaveLength(50);
  });
  it('clears transient history and local running/selection/target state on same-ID session replacement and battle changes', () => {
    vi.useFakeTimers();
    let tick = 0;
    const runner = vi.spyOn(battleBridge, 'runBattleTick').mockImplementation((id) => ({
      battleId: id,
      tick: ++tick,
      resolved: false,
      events: [{ type: 'unit.routed', unitId: 'bu.beta-1', sequence: 1 }],
    }));
    const props = { battleId: BATTLE, onExit: vi.fn(), onRetreat: vi.fn() };
    const view = render(<BattleScreen {...props} />);
    fireEvent.click(screen.getByTestId('battle-unit-bu.alpha-2'));
    fireEvent.click(screen.getByRole('button', { name: '齊射 4' }));
    fireEvent.keyDown(document.body, { key: '3' });
    advance(UI.kassenTickMs);
    expect(screen.getByTestId('battle-log-list').children.length).toBeGreaterThan(0);
    const replacement = makeBattleGame();
    act(() => resetGameStoreForTests(replacement));
    expect(screen.getByTestId('battle-log-list').children).toHaveLength(0);
    expect(screen.queryByText('請選擇敵方部隊')).toBeNull();
    expect(screen.getByTestId('battle-unit-bu.alpha-1').getAttribute('aria-pressed')).toBe('true');
    const calls = runner.mock.calls.length;
    advance(UI.kassenTickMs * 2);
    expect(runner.mock.calls).toHaveLength(calls);
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(screen.getByRole('button', { name: '一倍速 ×1' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    advance(UI.kassenTickMs);
    expect(screen.getByTestId('battle-log-list').children.length).toBeGreaterThan(0);
    const second = 'battle.000002' as BattleId;
    replacement.battles[second] = { ...replacement.battles[BATTLE]!, id: second };
    view.rerender(<BattleScreen {...props} battleId={second} />);
    expect(screen.getByTestId('battle-log-list').children).toHaveLength(0);
    expect(screen.getByRole('button', { name: '暫停' }).getAttribute('aria-pressed')).toBe('true');
  });
  it('retains the existing SystemMenu owner before presenting a mandatory result', () => {
    vi.useFakeTimers();
    const game = makeBattleGame({
      result: {
        winnerSide: 'attacker',
        endTick: 12,
        attackerLosses: 200,
        defenderLosses: 900,
        aweLevel: 'large',
      },
    });
    resetGameStoreForTests(game);
    act(() =>
      uiStore.getState().actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true }),
    );
    render(
      <>
        <BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />
        <SystemMenuHost onReturnToTitle={vi.fn()} dirty={false} />
      </>,
    );
    advance(32);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).not.toContain('合戰勝利');
    expect(screen.getByTestId('screen-battle').hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '設定' }));
    advance(32);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog').textContent).not.toContain('合戰勝利');
    fireEvent.click(screen.getByRole('button', { name: '返回' }));
    fireEvent.click(screen.getByRole('button', { name: '回到遊戲' }));
    advance(32);
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(screen.getByRole('dialog', { name: '合戰勝利' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '返回策略畫面' }));
  });
  it('owns mandatory result focus and blocks all background actions, timers and dismissal shortcuts', () => {
    vi.useFakeTimers();
    const game = makeBattleGame({
      result: {
        winnerSide: 'defender',
        endTick: 12,
        attackerLosses: 200,
        defenderLosses: 900,
        aweLevel: 'large',
      },
    });
    resetGameStoreForTests(game);
    const before = structuredClone(game);
    const onExit = vi.fn();
    render(<BattleScreen battleId={BATTLE} onExit={onExit} onRetreat={vi.fn()} />);
    advance(32);
    const dialog = screen.getByRole('dialog', { name: '合戰敗北' });
    const ack = screen.getByRole('button', { name: '返回策略畫面' });
    expect(document.activeElement).toBe(ack);
    fireEvent.keyDown(ack, { key: 'Tab' });
    expect(document.activeElement).toBe(ack);
    fireEvent.keyDown(ack, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(ack);
    fireEvent.keyDown(ack, { key: 'Escape' });
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onExit).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: '合戰敗北' })).toBe(dialog);
    const background = screen.getByTestId('screen-battle');
    expect(background.hasAttribute('inert')).toBe(true);
    expect(background.getAttribute('aria-hidden')).toBe('true');
    for (const button of background.querySelectorAll<HTMLButtonElement>('button')) {
      expect(button.disabled).toBe(true);
      fireEvent.click(button);
    }
    fireEvent.keyDown(document.body, { key: '2' });
    fireEvent.keyDown(document.body, { key: ' ' });
    fireEvent.keyDown(document.body, { key: 'Escape' });
    advance(UI.kassenTickMs * 3);
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    expect(uiStore.getState().modal).toBeNull();
    expect(game).toEqual(before);
    fireEvent.click(ack);
    expect(onExit).toHaveBeenCalledOnce();
  });
  it('native map markers select a friendly unit and submit normal movement without advancing time', () => {
    const before = structuredClone(store.getState().game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    fireEvent.click(screen.getByTestId('battle-unit-bu.alpha-2'));
    fireEvent.click(screen.getByTestId('battle-jin-jin.center'));
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'move', unitId: 'bu.alpha-2', targetJinId: 'jin.center' },
    ]);
    expect(store.getState().game).toEqual(before);
  });
  it('authoritative store block shields clock and direct orders before the React viewport context updates', () => {
    vi.useFakeTimers();
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    fireEvent.keyDown(document.body, { key: '2' });
    act(() => store.getState().actions.setViewportBlocked(true));
    const tick = store.getState().game!.battles[BATTLE]!.tick;
    fireEvent.click(screen.getByRole('button', { name: '全軍委任：關' }));
    fireEvent.keyDown(document.body, { key: '3' });
    advance(UI.kassenTickMs * 2);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(tick);
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    expect(screen.getByRole('button', { name: '二倍速 ×2' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
  it('manual save/load subpanel suspends ticks/orders without changing local running/manual pause state', () => {
    vi.useFakeTimers();
    const props = { battleId: BATTLE, onExit: vi.fn(), onRetreat: vi.fn() };
    const view = render(<BattleScreen {...props} />);
    fireEvent.keyDown(document.body, { key: '2' });
    view.rerender(<BattleScreen {...props} suspendForSystemPanel />);
    const tick = store.getState().game!.battles[BATTLE]!.tick;
    fireEvent.click(screen.getByRole('button', { name: '全軍委任：關' }));
    fireEvent.keyDown(document.body, { key: '3' });
    advance(1000);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(tick);
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    expect(screen.getByRole('button', { name: '二倍速 ×2' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    view.rerender(<BattleScreen {...props} />);
    advance(UI.kassenTickMs / 2);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBeGreaterThan(tick);
    fireEvent.keyDown(document.body, { key: ' ' });
    const pausedTick = store.getState().game!.battles[BATTLE]!.tick;
    view.rerender(<BattleScreen {...props} suspendForSystemPanel />);
    view.rerender(<BattleScreen {...props} />);
    advance(1000);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(pausedTick);
  });
  it('Escape follows modal/panel/selection/menu priority without retreat or exit, and ordinary menu does not stop tactical ticks', () => {
    vi.useFakeTimers();
    const exit = vi.fn();
    const retreat = vi.fn();
    render(
      <>
        <BattleScreen battleId={BATTLE} onExit={exit} onRetreat={retreat} />
        <SystemMenuHost />
      </>,
    );
    fireEvent.keyDown(document.body, { key: '1' });
    act(() => uiStore.getState().actions.openPanel('reports'));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().panelStack).toHaveLength(0);
    act(() => uiStore.getState().actions.setSelection({ kind: 'army', id: 'army.test' }));
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().selection).toBeNull();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().modal?.id).toBe('systemMenu');
    const tick = store.getState().game!.battles[BATTLE]!.tick;
    advance(UI.kassenTickMs);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBeGreaterThan(tick);
    expect(screen.getByRole('button', { name: '一倍速 ×1' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(uiStore.getState().modal).toBeNull();
    act(() =>
      uiStore.getState().actions.enqueueModal({ id: 'event', params: {}, pausesTime: true }),
    );
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(uiStore.getState().modal?.id).toBe('event');
    const mandatoryTick = store.getState().game!.battles[BATTLE]!.tick;
    advance(1000);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(mandatoryTick);
    expect(exit).not.toHaveBeenCalled();
    expect(retreat).not.toHaveBeenCalled();
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
  });
  it('blocked viewport cancels tactical ticks and click/keyboard restart, then recovery stays paused', () => {
    vi.useFakeTimers();
    const props = { battleId: BATTLE, onExit: vi.fn(), onRetreat: vi.fn() };
    const view = render(<BattleScreen {...props} />);
    fireEvent.keyDown(document.body, { key: '2' });
    advance(UI.kassenTickMs / 2);
    const tick = store.getState().game!.battles[BATTLE]!.tick;
    viewport.blocked = true;
    view.rerender(<BattleScreen {...props} />);
    expect(screen.getByRole('button', { name: '暫停' }).getAttribute('aria-pressed')).toBe('true');
    const x2 = screen.getByRole<HTMLButtonElement>('button', { name: '二倍速 ×2' });
    expect(x2.disabled).toBe(true);
    fireEvent.click(x2);
    fireEvent.click(screen.getByRole('button', { name: '全軍委任：關' }));
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    for (const key of [' ', '1', '2', '3', 'Escape']) fireEvent.keyDown(document.body, { key });
    advance(2000);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(tick);
    expect(uiStore.getState().modal).toBeNull();
    viewport.blocked = false;
    view.rerender(<BattleScreen {...props} />);
    expect(x2.disabled).toBe(false);
    advance(2000);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBe(tick);
    expect(screen.getByRole('button', { name: '暫停' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(x2);
    advance(UI.kassenTickMs / 2);
    expect(store.getState().game!.battles[BATTLE]!.tick).toBeGreaterThan(tick);
  });
  it('uses local 1/2/3 and Space speed, preserves strategic pause and native focus/dialog keys', () => {
    const view = render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const strategy = { ...store.getState().session };
    const paused = screen.getByRole('button', { name: '暫停' });
    const x2 = screen.getByRole('button', { name: '二倍速 ×2' });
    fireEvent.keyDown(document.body, { key: '2' });
    expect(x2.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(paused.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document.body, { key: ' ' });
    expect(x2.getAttribute('aria-pressed')).toBe('true');
    fireEvent.keyDown(document.body, { key: '3' });
    expect(screen.getByRole('button', { name: '五倍速 ×5' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.keyDown(document.body, { key: '1' });
    expect(screen.getByRole('button', { name: '一倍速 ×1' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    const nativeSpace = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    paused.dispatchEvent(nativeSpace);
    expect(nativeSpace.defaultPrevented).toBe(false);
    const dialog = render(
      <div data-ui-dialog="">
        <input aria-label="dialog input" />
      </div>,
    );
    for (const key of [' ', '2', '3']) fireEvent.keyDown(document.body, { key });
    expect(screen.getByRole('button', { name: '一倍速 ×1' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(store.getState().session).toEqual(strategy);
    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([]);
    dialog.unmount();
    view.unmount();
  });
  it('使用 canonical 采配上限 20，依采配不足與冷卻停用戰法', () => {
    const game = makeBattleGame();
    game.battles[BATTLE]!.units[0]!.tacticCooldowns['tac.volley'] = 2;
    resetGameStoreForTests(game);
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);

    const saihai = screen.getByRole('progressbar', { name: '采配 4／20' });
    expect(saihai.getAttribute('aria-valuemax')).toBe('20');
    expect(screen.queryByTestId('battle-retreat')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '突擊 5' }).disabled).toBe(true);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '齊射 4（冷卻 2）' }).disabled,
    ).toBe(true);
  });

  it('全軍委任為每支我方部隊排入獨立委任 order', () => {
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '全軍委任：關' }));

    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      { kind: 'toggleDelegate', unitId: 'bu.alpha-1', enabled: true },
      { kind: 'toggleDelegate', unitId: 'bu.alpha-2', enabled: true },
    ]);
  });

  it('可對空陣移動、直接攻擊敵軍，需目標戰法會等待敵軍選取', () => {
    render(<BattleScreen battleId={BATTLE} onExit={vi.fn()} onRetreat={vi.fn()} />);
    const volley = screen.getByRole<HTMLButtonElement>('button', { name: '齊射 4' });
    expect(volley.disabled).toBe(false);

    fireEvent.click(volley);
    expect(screen.getByText('請選擇敵方部隊')).toBeTruthy();
    const enemy = screen.getByRole('button', { name: '敵軍 900人' });
    fireEvent.click(enemy);
    fireEvent.click(enemy);
    fireEvent.click(screen.getByTestId('battle-jin-jin.center'));

    expect(getPendingBattleOrdersForTests(BATTLE)).toEqual([
      {
        kind: 'tactic',
        unitId: 'bu.alpha-1',
        tacticId: 'tac.volley',
        targetUnitId: 'bu.beta-1',
      },
      { kind: 'attack', unitId: 'bu.alpha-1', targetUnitId: 'bu.beta-1' },
      { kind: 'move', unitId: 'bu.alpha-1', targetJinId: 'jin.center' },
    ]);
  });

  it('保留結果 dialog，確認後才呼叫離場 callback', () => {
    resetGameStoreForTests(
      makeBattleGame({
        result: {
          winnerSide: 'attacker',
          endTick: 12,
          attackerLosses: 200,
          defenderLosses: 900,
          aweLevel: 'large',
        },
      }),
    );
    const onExit = vi.fn();
    render(<BattleScreen battleId={BATTLE} onExit={onExit} onRetreat={vi.fn()} />);

    expect(screen.getByRole('dialog').textContent).toContain('合戰勝利');
    expect(screen.getByRole('dialog').textContent).toContain('我方損兵 200人');
    expect(screen.getByRole('dialog').textContent).toContain('敵方損兵 900人');
    expect(screen.getByRole('dialog').textContent).toContain('威風：大');
    expect(onExit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '返回策略畫面' }));
    expect(onExit).toHaveBeenCalledOnce();
  });
});
