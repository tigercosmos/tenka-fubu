// DaimyoSelect 元件測試（M8-17；選擇留在 App 精靈狀態）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DaimyoSelect } from './DaimyoSelect';
import type { ScenarioBundleData } from '@data/schemas';
import type { ClanId } from '@core/state/ids';

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

describe('DaimyoSelect wizard step', () => {
  function mount(selectedClanId: 'clan.oda' | 'clan.imagawa' | null = null) {
    const onSelectClan = vi.fn();
    const onNext = vi.fn();
    const onBack = vi.fn();
    const view = render(
      <DaimyoSelect
        bundle={fakeBundle()}
        selectedClanId={selectedClanId as ClanId | null}
        onSelectClan={onSelectClan}
        onNext={onNext}
        onBack={onBack}
      />,
    );
    return { ...view, onSelectClan, onNext, onBack };
  }

  it('shows clan metadata and keeps Next disabled until the parent owns a selection', () => {
    const view = mount();
    expect(screen.getByTestId('screen-daimyo-select')).toBeTruthy();
    expect(screen.getByTestId('daimyo-next')).toHaveProperty('disabled', true);
    const oda = screen.getByTestId('clan-pick-clan.oda');
    expect(oda.textContent).toContain('織田信長');
    expect(oda.textContent).toContain('310,000');
    expect(oda.textContent).toContain('城：1');
    expect(oda.textContent).toContain('武將：1');
    fireEvent.click(oda);
    expect(view.onSelectClan).toHaveBeenCalledWith('clan.oda');
    expect(view.onNext).not.toHaveBeenCalled();
    view.rerender(
      <DaimyoSelect
        bundle={fakeBundle()}
        selectedClanId={'clan.oda' as ClanId}
        onSelectClan={view.onSelectClan}
        onNext={view.onNext}
        onBack={view.onBack}
      />,
    );
    expect(oda.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('daimyo-next')).toHaveProperty('disabled', false);
    fireEvent.click(screen.getByTestId('daimyo-next'));
    expect(view.onNext).toHaveBeenCalledOnce();
  });

  it('retains controlled selection on remount and forwards Back', () => {
    const view = mount('clan.imagawa');
    expect(screen.getByTestId('clan-pick-clan.imagawa').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByTestId('daimyo-back'));
    expect(view.onBack).toHaveBeenCalledOnce();
  });
});
