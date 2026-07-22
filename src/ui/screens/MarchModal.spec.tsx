import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store } from '@app/store';
import type { Officer } from '@core/state/gameState';
import type { MapNodeId, OfficerId } from '@core/state/ids';
import { makeLoopTestState, TEST_CASTLE, TEST_CLAN } from '../../../tests/helpers/loopState';
import { uiStore } from '../hooks/uiStore';
import { MarchModal } from './MarchModal';

const LEADER = 'off.test-leader' as OfficerId;
const TARGET = 'castle.target' as MapNodeId;

function officer(): Officer {
  return {
    id: LEADER,
    name: '試將',
    clanId: TEST_CLAN,
    status: 'serving',
    ldr: 80,
    val: 70,
    int: 60,
    pol: 50,
    statExp: { ldr: 0, val: 0, int: 0, pol: 0 },
    statGrowth: { ldr: 0, val: 0, int: 0, pol: 0 },
    traits: [],
    rank: 'karo',
    merit: 0,
    loyalty: 90,
    kinship: 'fudai',
    spouseId: null,
    birthYear: 1530,
    deathYear: 1600,
    hasComeOfAge: true,
    debutYear: 1545,
    debutClanId: TEST_CLAN,
    debutCastleId: TEST_CASTLE,
    locationCastleId: TEST_CASTLE,
    armyId: null,
    capturedByClanId: null,
    scheduledDeath: { year: 1600, month: 1 },
    captiveRetryOn: null,
    recruitRetryOn: null,
    rewardGiftsThisYear: 0,
    stalledPromotionMonths: 0,
  };
}

beforeEach(() => {
  const game = makeLoopTestState({ food: 20_000 });
  game.castles[TEST_CASTLE]!.soldiers = 8_000;
  game.castles[TEST_CASTLE]!.name = '清洲城';
  game.clans[TEST_CLAN]!.leaderId = LEADER;
  game.officers[LEADER] = officer();
  resetGameStoreForTests(game);
  uiStore.getState().actions.reset();
  uiStore.getState().actions.setMarchDraft({
    originCastleId: TEST_CASTLE,
    leaderOfficerId: LEADER,
    subOfficerIds: [],
    soldiers: 1_000,
    food: 1_000,
    targetNodeId: TARGET,
    previewPath: {
      result: {
        found: true,
        nodes: [TEST_CASTLE, TARGET],
        edgeIds: [],
        travelDays: 3,
        subjugateDays: 0,
        totalDays: 3,
        steps: [
          { nodeId: TEST_CASTLE, etaDays: 0, needsSubjugate: false },
          { nodeId: TARGET, etaDays: 3, needsSubjugate: false },
        ],
      },
      originNodeId: TEST_CASTLE,
      targetNodeId: TARGET,
      unreachable: false,
      hostileNodeIds: [],
    },
    previewDays: 3,
    phase: 'compose',
    errorKey: null,
  });
});

describe('MarchModal', () => {
  it('顯示出陣摘要並送出 canonical march command', () => {
    const onCommand = vi.fn(() => ({ ok: true }) as const);
    render(<MarchModal onCommand={onCommand} />);

    expect(screen.getByText(/清洲城→castle\.target/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '出陣' }));

    expect(onCommand).toHaveBeenCalledWith({
      type: 'march',
      clanId: TEST_CLAN,
      originCastleId: TEST_CASTLE,
      leaderId: LEADER,
      deputyIds: [],
      soldiers: 1_000,
      food: 1_000,
      targetNodeId: TARGET,
    });
    expect(uiStore.getState().marchDraft).toBeNull();
  });

  it('目標選取階段暫停策略時間，取消藥丸返回編成後恢復原速度（M6-V9b §3.2b）', () => {
    store.getState().actions.setSpeed('x2');
    uiStore.getState().actions.setMarchDraft({
      ...uiStore.getState().marchDraft!,
      phase: 'pickTarget',
    });
    render(<MarchModal />);

    expect(store.getState().session.speed).toBe('paused');
    fireEvent.click(screen.getByTestId('march-target-cancel'));
    expect(store.getState().session.speed).toBe('x2');
    expect(uiStore.getState().marchDraft).toMatchObject({ phase: 'compose', targetNodeId: null });
  });

  it('確認目標藥丸：未選定時 disabled；選定可達目標後 enabled、按下保留目標回編成（M6-V9b §3.2b）', () => {
    uiStore.getState().actions.setMarchDraft({
      ...uiStore.getState().marchDraft!,
      phase: 'pickTarget',
      targetNodeId: null,
      previewPath: null,
      previewDays: null,
    });
    const { rerender } = render(<MarchModal />);
    expect(screen.getByTestId('march-target-confirm')).toHaveProperty('disabled', true);
    expect(screen.queryByTestId('march-target-card')).toBeNull(); // 未選目標不渲染目標卡

    uiStore.getState().actions.setMarchDraft({
      ...uiStore.getState().marchDraft!,
      targetNodeId: TARGET,
      previewDays: 4,
    });
    rerender(<MarchModal />);
    expect(screen.getByTestId('march-target-confirm')).toHaveProperty('disabled', false);
    expect(screen.getByTestId('march-target-card')).toBeTruthy(); // 敵我戰力比較卡
    fireEvent.click(screen.getByTestId('march-target-confirm'));
    expect(uiStore.getState().marchDraft).toMatchObject({ phase: 'compose', targetNodeId: TARGET });
  });

  it('目標選取階段聚焦提示列，Escape 返回編成並清除預覽', () => {
    uiStore.getState().actions.setMarchDraft({
      ...uiStore.getState().marchDraft!,
      phase: 'pickTarget',
    });
    render(<MarchModal />);
    expect(document.activeElement).toBe(screen.getByTestId('march-target-strip'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(uiStore.getState().marchDraft).toMatchObject({ phase: 'compose', previewPath: null });
  });

  it('未元服武將不列入大將或副將候選', () => {
    store.getState().game!.officers[LEADER]!.hasComeOfAge = false;
    render(<MarchModal />);
    expect(screen.queryByRole('button', { name: /試將/ })).toBeNull();
  });
});
