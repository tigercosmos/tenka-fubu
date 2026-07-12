// DaimyoSelect 元件測試（M2-19；17 §6.2 testid 契約：`clan-pick-{clanId}`／`newgame-start`）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DaimyoSelect } from './DaimyoSelect';
import type { ScenarioBundleData } from '@data/schemas';
import type { GameState } from '@core/state/gameState';
import type { NewGameOptions } from '@app/boot';

afterEach(() => {
  cleanup();
});

/** 最小測試用 bundle：兩勢力（含織田），欄位只填 summarizeClans 實際讀取者。 */
function fakeBundle(): ScenarioBundleData {
  const castle = (id: string, ownerClanId: string) =>
    ({ id, ownerClanId }) as unknown as ScenarioBundleData['castles'][number];
  const district = (id: string, castleId: string, kokudaka: number) =>
    ({ id, castleId, kokudaka }) as unknown as ScenarioBundleData['districts'][number];
  const officer = (id: string, name: string, clanId: string) =>
    ({ id, name, clanId }) as unknown as ScenarioBundleData['officers'][number][number];
  const clan = (id: string, name: string, leaderId: string, homeCastleId: string) =>
    ({ id, name, leaderId, homeCastleId }) as unknown as ScenarioBundleData['clans'][number];

  return {
    id: 's1560',
    provinces: [],
    castles: [castle('castle.kiyosu', 'clan.oda'), castle('castle.sunpu', 'clan.imagawa')],
    districts: [
      district('dist.a', 'castle.kiyosu', 100000),
      district('dist.b', 'castle.kiyosu', 210000),
      district('dist.c', 'castle.sunpu', 500000),
    ],
    roads: [],
    clans: [
      clan('clan.oda', '織田家', 'off.oda-nobunaga', 'castle.kiyosu'),
      clan('clan.imagawa', '今川家', 'off.imagawa-yoshimoto', 'castle.sunpu'),
    ],
    diplomacy: { pacts: [], wars: [], sentiments: [] },
    events: [],
    officers: [
      [
        officer('off.oda-nobunaga', '織田信長', 'clan.oda'),
        officer('off.imagawa-yoshimoto', '今川義元', 'clan.imagawa'),
      ],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
      [],
    ],
    catalogs: { traits: [], policies: [], tactics: [], personas: [] },
  };
}

describe('DaimyoSelect（11 §3.2.3 縮減版）', () => {
  it('畫面根節點 data-testid="screen-daimyo-select"；每個勢力各一張 clan-pick-{clanId} 卡片（含織田）', () => {
    render(<DaimyoSelect bundle={fakeBundle()} onBack={vi.fn()} onStart={vi.fn()} />);
    expect(screen.getByTestId('screen-daimyo-select')).toBeTruthy();
    expect(screen.getByTestId('clan-pick-clan.oda')).toBeTruthy();
    expect(screen.getByTestId('clan-pick-clan.imagawa')).toBeTruthy();
  });

  it('卡片顯示當主／石高／城數／武將數（13 §6.2 ui.daimyo.*）', () => {
    render(<DaimyoSelect bundle={fakeBundle()} onBack={vi.fn()} onStart={vi.fn()} />);
    const odaCard = screen.getByTestId('clan-pick-clan.oda');
    expect(odaCard.textContent).toContain('織田家');
    expect(odaCard.textContent).toContain('織田信長'); // 當主
    expect(odaCard.textContent).toContain('310,000'); // 石高＝100,000+210,000
    expect(odaCard.textContent).toContain('城：1');
    expect(odaCard.textContent).toContain('武將：1');
  });

  it('newgame-start 選定前 disabled；點 clan-pick-clan.oda 後啟用（aria-pressed 切換）', () => {
    render(<DaimyoSelect bundle={fakeBundle()} onBack={vi.fn()} onStart={vi.fn()} />);
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', true);

    fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
    expect(screen.getByTestId('clan-pick-clan.oda').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('newgame-start')).toHaveProperty('disabled', false);
  });

  it('選織田→點 newgame-start：以選定 clanId 呼叫 buildNewGameState，並把回傳 GameState 交給 onStart（M2-19 驗收核心）', () => {
    const fakeGame = { meta: { playerClanId: 'clan.oda' } } as unknown as GameState;
    const buildNewGameState = vi.fn((): GameState => fakeGame) as unknown as (
      bundle: ScenarioBundleData,
      opts: NewGameOptions,
    ) => GameState;
    const onStart = vi.fn();
    const bundle = fakeBundle();
    render(
      <DaimyoSelect
        bundle={bundle}
        onBack={vi.fn()}
        onStart={onStart}
        buildNewGameState={buildNewGameState}
      />,
    );

    fireEvent.click(screen.getByTestId('clan-pick-clan.oda'));
    act(() => {
      fireEvent.click(screen.getByTestId('newgame-start'));
    });

    expect(buildNewGameState).toHaveBeenCalledWith(
      bundle,
      expect.objectContaining({ playerClanId: 'clan.oda', difficulty: 'normal' }),
    );
    expect(onStart).toHaveBeenCalledWith(fakeGame);
  });

  it('點擊 daimyo-back 呼叫 onBack', () => {
    const onBack = vi.fn();
    render(<DaimyoSelect bundle={fakeBundle()} onBack={onBack} onStart={vi.fn()} />);
    fireEvent.click(screen.getByTestId('daimyo-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
