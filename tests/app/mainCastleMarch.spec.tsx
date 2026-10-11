import { act, cleanup, fireEvent, render, screen, within, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const captured = vi.hoisted(() => ({
  callbacks: [] as NonNullable<
    import('../../src/ui/screens/panels/CastlePanel').CastlePanelProps['onOpenMarch']
  >[],
  map: null as import('../../src/ui/map/MapCanvasHost').MapCanvasHostProps['onMapEvent'] | null,
}));
vi.mock('../../src/ui/map/MapCanvasHost', async (original) => {
  const actual = await original<typeof import('../../src/ui/map/MapCanvasHost')>();
  const { forwardRef } = await import('react');
  return {
    ...actual,
    MapCanvasHost: forwardRef<
      import('../../src/ui/map/MapCanvasHost').MapHandle,
      import('../../src/ui/map/MapCanvasHost').MapCanvasHostProps
    >(function CapturedMap(props, ref) {
      captured.map = props.onMapEvent;
      return <actual.MapCanvasHost {...props} ref={ref} />;
    }),
  };
});
// Component renderer fixtures use the actual committed WASM with an independent owner.
vi.mock('@ui/map/wasmGeographicScorer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ui/map/wasmGeographicScorer')>();
  const { realRenderWasmExports } = await import('../helpers/realRenderWasm');
  return {
    ...actual,
    createWasmGeographicScorer: (exports?: Record<string, unknown>) =>
      actual.createWasmGeographicScorer(exports ?? realRenderWasmExports()),
  };
});

vi.mock('pixi.js', async () => {
  const { createPixiMockClasses } = await import('../helpers/pixiMock');
  return createPixiMockClasses([]);
});
vi.mock('../../src/ui/screens/panels/CastlePanel', async (original) => {
  const actual = await original<typeof import('../../src/ui/screens/panels/CastlePanel')>();
  return {
    ...actual,
    CastlePanel(props: import('../../src/ui/screens/panels/CastlePanel').CastlePanelProps) {
      if (props.onOpenMarch) captured.callbacks.push(props.onOpenMarch);
      return <actual.CastlePanel {...props} />;
    },
  };
});

import { MainScreen } from '../../src/ui/screens/MainScreen';
import {
  initializeBridgeSession,
  resetBridgeForTests,
  getQueuedPlayerCommands,
  runOneDay,
} from '../../src/app/bridge';
import { resetGameStoreForTests, store, setGame } from '../../src/app/store';
import { uiStore } from '../../src/ui/hooks/uiStore';
import { validateState } from '../../src/core/state/invariants';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  OFF_ALPHA_LORD,
  OFF_ALPHA_BUSHO,
} from '../fixtures/tiny';
import { t } from '../../src/i18n/zh-TW';
import { BAL } from '../../src/core/balance';
import { RANK_VALUES } from '../../src/core/state/enums';

beforeEach(() => {
  resetBridgeForTests();
  uiStore.getState().actions.reset();
  captured.callbacks.length = 0;
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});
afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests(null);
  uiStore.getState().actions.reset();
  vi.restoreAllMocks();
});

function fixture() {
  const game = buildTinyState();
  expect(validateState(game)).toEqual([]);
  resetGameStoreForTests(game);
  initializeBridgeSession(game);
  store.getState().actions.setScreen('main');
  uiStore.getState().actions.openPanel('castle', { castleId: CASTLE_A1 });
  const view = render(<MainScreen />);
  fireEvent.click(screen.getByRole('tab', { name: t('ui.castle.tab.military') }));
  return { game, view };
}

it('the actual Main castle entry prefills formation and settles a legal queued march', async () => {
  const { game } = fixture();
  const before = structuredClone(game);
  fireEvent.click(
    screen.getByRole('checkbox', { name: new RegExp(game.officers[OFF_ALPHA_LORD]!.name) }),
  );
  fireEvent.click(
    screen.getByRole('checkbox', { name: new RegExp(game.officers[OFF_ALPHA_BUSHO]!.name) }),
  );
  fireEvent.click(
    within(screen.getByTestId('castle-panel')).getByRole('button', { name: t('ui.castle.deploy') }),
  );
  expect(uiStore.getState().marchDraft).toMatchObject({
    leaderOfficerId: OFF_ALPHA_LORD,
    subOfficerIds: [OFF_ALPHA_BUSHO],
  });
  const soldiers = Math.min(
    game.castles[CASTLE_A1]!.soldiers,
    BAL.rankTroopCap[RANK_VALUES.length - 1]!,
  );
  expect(uiStore.getState().marchDraft?.soldiers).toBe(soldiers);
  expect(uiStore.getState().marchDraft?.food).toBe(
    Math.min(
      game.castles[CASTLE_A1]!.food,
      Math.round((soldiers * BAL.fieldFoodPerSoldierDaily * BAL.defaultCarryDays) / 100) * 100,
    ),
  );
  expect(screen.getByTestId('march-modal')).toBeTruthy();
  expect(screen.getByTestId('march-formation-tactics')).toBeTruthy();
  expect(game).toEqual(before);
  expect(getQueuedPlayerCommands(game)).toEqual([]);
  fireEvent.click(screen.getByRole('button', { name: t('ui.march.pickTargetAction') }));
  await waitFor(() => expect(captured.map).not.toBeNull());
  // Actual Main map-event port; jsdom/Pixi mock is not native pointer/geometry proof.
  act(() => captured.map!({ type: 'nodeClick', id: CASTLE_A2, nodeKind: 'castle' }));
  fireEvent.click(screen.getByTestId('march-target-confirm'));
  fireEvent.click(
    within(screen.getByRole('dialog')).getByRole('button', { name: t('cmd.march.confirm') }),
  );
  expect(getQueuedPlayerCommands(game)).toMatchObject([
    { type: 'march', leaderId: OFF_ALPHA_LORD, deputyIds: [OFF_ALPHA_BUSHO], soldiers },
  ]);
  expect(game).toEqual(before);
  let events: ReturnType<typeof runOneDay> = [];
  act(() => {
    events = runOneDay();
  });
  expect(events.some((event) => event.type === 'command.rejected')).toBe(false);
  expect(Object.values(game.armies)).toMatchObject([
    { leaderId: OFF_ALPHA_LORD, deputyIds: [OFF_ALPHA_BUSHO], soldiers },
  ]);
  expect(validateState(game)).toEqual([]);
});

it.each(['unmount', 'load', 'close'] as const)(
  'retained Main castle callback cannot open a draft after %s',
  (change) => {
    const { game, view } = fixture();
    const callback = captured.callbacks.at(-1)!;
    if (change === 'unmount') view.unmount();
    else if (change === 'load')
      act(() => {
        const replacement = structuredClone(game);
        setGame(replacement);
        initializeBridgeSession(replacement);
      });
    else act(() => uiStore.getState().actions.closePanelById('castle'));
    act(() => callback(CASTLE_A1, [OFF_ALPHA_LORD]));
    expect(uiStore.getState().marchDraft).toBeNull();
    expect(uiStore.getState().modal).toBeNull();
    expect(getQueuedPlayerCommands(store.getState().game!)).toEqual([]);
  },
);

it.each(['modal', 'session'] as const)(
  'synchronous draft publication cannot enqueue a march modal into a replaced %s owner',
  (change) => {
    const { game } = fixture();
    const callback = captured.callbacks.at(-1)!;
    const replacement = structuredClone(game);
    const foreign = { id: 'monthSummary' as const, params: {}, pausesTime: true };
    let ran = false;
    const unsubscribe = uiStore.subscribe((next) => {
      if (!next.marchDraft || ran) return;
      ran = true;
      if (change === 'modal') next.actions.enqueueModal(foreign);
      else {
        setGame(replacement);
        initializeBridgeSession(replacement);
      }
    });
    act(() => callback(CASTLE_A1, [OFF_ALPHA_LORD]));
    unsubscribe();
    expect(ran).toBe(true);
    expect(uiStore.getState().marchDraft).toBeNull();
    expect(uiStore.getState().modal).toBe(change === 'modal' ? foreign : null);
    expect(uiStore.getState().modalQueue).toEqual([]);
    expect(getQueuedPlayerCommands(store.getState().game!)).toEqual([]);
  },
);
