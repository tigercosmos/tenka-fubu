import { StrictMode } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BattleState, BattleUnit } from '@core/state/gameState';
import type { ArmyId, BattleId, ClanId, MapNodeId, OfficerId } from '@core/state/ids';
import { uiStore } from '../hooks/uiStore';
import type { BattleView } from './battleViewModel';
import { BattleCanvasHost } from './BattleCanvasHost';
import { createBattleLayoutFixture } from '../dev/battleLayoutFixture';

const mocks = vi.hoisted(() => ({
  instances: [] as { update: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }[],
  resolveInit: null as null | (() => void),
  delayed: false,
  resize: null as null | (() => void),
  disconnect: vi.fn(),
  rejected: false,
}));
vi.mock('./BattleRenderer', () => ({
  BattleRenderer: class {
    update = vi.fn();
    destroy = vi.fn();
    constructor() {
      mocks.instances.push(this);
    }
    async init(): Promise<void> {
      if (mocks.rejected) throw new Error('WebGL unavailable');
      if (mocks.delayed)
        await new Promise<void>((resolve) => {
          mocks.resolveInit = resolve;
        });
    }
  },
}));
vi.mock('../map/mapFontReady', () => ({ waitForMapFont: async () => {} }));

function unit(id: string, side: 'attacker' | 'defender', exited = false): BattleUnit {
  return {
    id,
    side,
    armyId: 'army.test' as ArmyId,
    generalId: 'off.test' as OfficerId,
    troops: 100,
    battleInitialTroops: 100,
    morale: 80,
    jinId: 'jin.a',
    moveTargetJinId: null,
    moveProgress: 0,
    attackTargetUnitId: null,
    activeTactics: [],
    tacticCooldowns: {},
    delegated: false,
    routed: false,
    exited,
    strategyStatus: 'engaged',
  };
}
function battle(): BattleState {
  return {
    id: 'battle.test' as BattleId,
    fieldCombatId: 'fc.test',
    nodeId: 'castle.test' as MapNodeId,
    terrain: 'plain',
    attackerClanId: 'clan.a' as ClanId,
    defenderClanId: 'clan.b' as ClanId,
    jins: [
      {
        id: 'jin.a',
        col: 0,
        row: 1,
        owner: 'attacker',
        isHonjin: true,
        flagPower: 100,
        flagPowerMax: 100,
        defenseBonus: 0.4,
      },
    ],
    edges: [],
    units: [unit('bu.a', 'attacker')],
    tick: 0,
    saihai: { attacker: 0, defender: 0 },
    honjinFallenTick: null,
    result: null,
  };
}
function props(state = battle()) {
  return {
    battle: state,
    playerSide: 'attacker' as const,
    selectedUnitId: 'bu.a',
    unitName: (id: string) => id,
    onMoveJin: vi.fn(),
    onSelectUnit: vi.fn(),
    onSelectEnemy: vi.fn(),
  };
}
async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
beforeEach(() => {
  mocks.instances.length = 0;
  mocks.delayed = false;
  mocks.rejected = false;
  mocks.disconnect.mockClear();
  mocks.resolveInit = null;
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setUiScale(1);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: 380,
    height: 444,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    bottom: 444,
    right: 380,
    toJSON: () => ({}),
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: () => void) {
        mocks.resize = callback;
      }
      observe() {}
      disconnect = mocks.disconnect;
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('BattleCanvasHost', () => {
  for (const kind of ['dense8', 'full12', 'crossing8'] as const) {
    for (const scale of [0.8, 1, 1.5]) {
      it(`globally aligns non-overlapping native controls for ${kind} at scale ${scale}`, async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
          width: 678,
          height: 444,
          x: 0,
          y: 0,
          top: 0,
          left: 0,
          bottom: 444,
          right: 678,
          toJSON: () => ({}),
        });
        const fixture = createBattleLayoutFixture(kind);
        const before = structuredClone(fixture);
        render(
          <BattleCanvasHost
            {...props(fixture)}
            uiScale={scale}
            selectedUnitId={fixture.units[0]!.id}
          />,
        );
        await flush();
        const view = mocks.instances[0]!.update.mock.lastCall![0] as BattleView;
        const boxes = [
          ...view.nodes.map((marker) => ({
            marker,
            control: screen.getByTestId(`battle-jin-${marker.id}`),
          })),
          ...view.units.map((marker) => ({
            marker,
            control: screen.getByTestId(`battle-unit-${marker.id}`),
          })),
        ].map(({ marker, control }) => {
          const rectangle = {
            id: marker.id,
            x: Number.parseFloat(control.style.left),
            y: Number.parseFloat(control.style.top),
            width: Number.parseFloat(control.style.width),
            height: Number.parseFloat(control.style.height),
          };
          expect(rectangle.x).toBeCloseTo(marker.hitBox.x);
          expect(rectangle.y).toBeCloseTo(marker.hitBox.y);
          expect(rectangle.width).toBeCloseTo(marker.hitBox.width);
          expect(rectangle.height).toBeCloseTo(marker.hitBox.height);
          expect(rectangle.x).toBeGreaterThanOrEqual(0);
          expect(rectangle.y).toBeGreaterThanOrEqual(0);
          expect(rectangle.x + rectangle.width).toBeLessThanOrEqual(678 + 1e-8);
          expect(rectangle.y + rectangle.height).toBeLessThanOrEqual(444 + 1e-8);
          return rectangle;
        });
        const overlaps: string[] = [];
        for (let a = 0; a < boxes.length; a++)
          for (let b = a + 1; b < boxes.length; b++) {
            const first = boxes[a]!,
              second = boxes[b]!;
            if (
              Math.min(first.x + first.width, second.x + second.width) -
                Math.max(first.x, second.x) >
                1e-8 &&
              Math.min(first.y + first.height, second.y + second.height) -
                Math.max(first.y, second.y) >
                1e-8
            )
              overlaps.push(`${first.id} / ${second.id}`);
          }
        expect(overlaps).toEqual([]);
        expect(fixture).toEqual(before);
      });
    }
  }
  it('does not place another army action over a same-node marker', async () => {
    const input = props();
    input.battle.units.push(unit('bu.second', 'attacker'));
    render(<BattleCanvasHost {...input} />);
    await flush();
    const first = screen.getByTestId('battle-unit-bu.a');
    const second = screen.getByTestId('battle-unit-bu.second');
    const overlapX =
      Math.min(
        Number.parseFloat(first.style.left) + Number.parseFloat(first.style.width),
        Number.parseFloat(second.style.left) + Number.parseFloat(second.style.width),
      ) - Math.max(Number.parseFloat(first.style.left), Number.parseFloat(second.style.left));
    const overlapY =
      Math.min(
        Number.parseFloat(first.style.top) + Number.parseFloat(first.style.height),
        Number.parseFloat(second.style.top) + Number.parseFloat(second.style.height),
      ) - Math.max(Number.parseFloat(first.style.top), Number.parseFloat(second.style.top));
    expect(overlapX <= 0 || overlapY <= 0).toBe(true);
  });
  it('refreshes a paused DPR-only change, re-arms resolution observation and cleans listeners', async () => {
    const queries: {
      listener: (() => void) | null;
      removeEventListener: ReturnType<typeof vi.fn>;
    }[] = [];
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => {
        const query = {
          listener: null as null | (() => void),
          addEventListener: (_: string, listener: () => void) => {
            query.listener = listener;
          },
          removeEventListener: vi.fn(),
        };
        queries.push(query);
        return query;
      }),
    );
    const input = props();
    const before = structuredClone(input.battle);
    const result = render(<BattleCanvasHost {...input} />);
    await flush();
    const instance = mocks.instances[0]!;
    const count = instance.update.mock.calls.length;
    vi.stubGlobal('devicePixelRatio', 2);
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(instance.update.mock.calls.length).toBeGreaterThan(count);
    act(() => queries[0]!.listener?.());
    expect(queries).toHaveLength(2);
    expect(queries[0]!.removeEventListener).toHaveBeenCalled();
    expect(mocks.instances).toHaveLength(1);
    expect(input.battle).toEqual(before);
    result.unmount();
    const after = instance.update.mock.calls.length;
    expect(queries[1]!.removeEventListener).toHaveBeenCalled();
    act(() => {
      window.dispatchEvent(new Event('resize'));
      queries[1]!.listener?.();
    });
    expect(instance.update.mock.calls.length).toBe(after);
  });
  it('shares projected positions with native controls and keeps callbacks read-only', async () => {
    const input = props();
    const before = structuredClone(input.battle);
    render(<BattleCanvasHost {...input} />);
    await flush();
    const view = mocks.instances[0]!.update.mock.lastCall![0] as BattleView;
    const node = screen.getByTestId('battle-jin-jin.a');
    expect(node.style.left).toBe(`${view.nodes[0]!.hitBox.x}px`);
    expect(node.style.top).toBe(`${view.nodes[0]!.hitBox.y}px`);
    expect(node.dataset.projectionX).toBe(String(view.nodes[0]!.x));
    expect(node.dataset.projectionY).toBe(String(view.nodes[0]!.y));
    for (const marker of [...view.nodes, ...view.units]) {
      const control = screen.getByTestId(
        `battle-${'owner' in marker ? 'jin' : 'unit'}-${marker.id}`,
      );
      expect(Number.parseFloat(control.style.width)).toBeGreaterThanOrEqual(32);
      expect(Number.parseFloat(control.style.height)).toBeGreaterThanOrEqual(32);
      expect(Number.parseFloat(control.style.left)).toBeLessThanOrEqual(marker.glyphBox.x);
      expect(Number.parseFloat(control.style.top)).toBeLessThanOrEqual(marker.glyphBox.y);
      expect(
        Number.parseFloat(control.style.left) + Number.parseFloat(control.style.width),
      ).toBeGreaterThanOrEqual(marker.glyphBox.x + marker.glyphBox.width);
      expect(
        Number.parseFloat(control.style.top) + Number.parseFloat(control.style.height),
      ).toBeGreaterThanOrEqual(marker.glyphBox.y + marker.glyphBox.height);
    }
    expect(screen.getByTestId('battle-canvas').getAttribute('aria-hidden')).toBe('true');
    fireEvent.click(node);
    fireEvent.click(screen.getByTestId('battle-unit-bu.a'));
    expect(input.onMoveJin).toHaveBeenCalledWith('jin.a');
    expect(input.onSelectUnit).toHaveBeenCalledWith('bu.a');
    expect(input.battle).toEqual(before);
  });
  it('reprojects mutable tick snapshots, size and scale without rebuilding renderer', async () => {
    const input = props();
    const result = render(<BattleCanvasHost {...input} />);
    await flush();
    input.battle.units[0]!.troops = 42;
    input.battle.tick++;
    result.rerender(<BattleCanvasHost {...input} />);
    act(() => uiStore.getState().actions.setUiScale(1.5));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 500,
      height: 444,
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 444,
      right: 500,
      toJSON: () => ({}),
    });
    act(() => mocks.resize?.());
    expect(mocks.instances).toHaveLength(1);
    const latest = mocks.instances[0]!.update.mock.lastCall![0] as BattleView;
    expect(latest.units[0]!.troops).toBe(42);
    expect(latest.width).toBe(500);
    expect(latest.uiScale).toBe(1.5);
  });
  it('applies latest selection after delayed init and safely destroys an unmounted pending renderer', async () => {
    mocks.delayed = true;
    const input = props();
    const result = render(<BattleCanvasHost {...input} />);
    await flush();
    result.rerender(<BattleCanvasHost {...input} selectedUnitId={null} />);
    await act(async () => {
      mocks.resolveInit?.();
      await Promise.resolve();
    });
    const latest = mocks.instances[0]!.update.mock.lastCall![0] as BattleView;
    expect(latest.units[0]!.selected).toBe(false);
    result.unmount();
    expect(mocks.disconnect).toHaveBeenCalled();
    expect(mocks.instances[0]!.destroy).toHaveBeenCalled();
    const pending = render(<BattleCanvasHost {...input} />);
    await flush();
    pending.unmount();
    await act(async () => {
      mocks.resolveInit?.();
      await Promise.resolve();
    });
    expect(mocks.instances[1]!.update).not.toHaveBeenCalled();
    expect(mocks.instances[1]!.destroy).toHaveBeenCalled();
  });
  it('StrictMode destroys every instance and exited enemies do not block movement', async () => {
    const input = props();
    input.battle.units.push(unit('bu.enemy', 'defender', true));
    const result = render(
      <StrictMode>
        <BattleCanvasHost {...input} />
      </StrictMode>,
    );
    await flush();
    expect(screen.queryByTestId('battle-unit-bu.enemy')).toBeNull();
    expect(screen.getByTestId<HTMLButtonElement>('battle-jin-jin.a').disabled).toBe(false);
    result.unmount();
    expect(mocks.instances.every((instance) => instance.destroy.mock.calls.length > 0)).toBe(true);
  });
  it('keeps meaningful native controls available when WebGL initialization fails', async () => {
    mocks.rejected = true;
    const input = props();
    render(<BattleCanvasHost {...input} />);
    await flush();
    expect(screen.getByRole('status').textContent).toContain('無法繪製');
    fireEvent.click(screen.getByTestId('battle-unit-bu.a'));
    expect(input.onSelectUnit).toHaveBeenCalledWith('bu.a');
  });
});
