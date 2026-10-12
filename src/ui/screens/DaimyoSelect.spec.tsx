// DaimyoSelect 元件測試（M8-17；選擇留在 App 精靈狀態）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { DaimyoSelect } from './DaimyoSelect';
import type { ScenarioBundleData } from '@data/schemas';
import type { ClanId } from '@core/state/ids';

beforeEach(() => {
  // jsdom has no 2D canvas; map raster/pointer behavior is covered by the real browser suite.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** 兩勢力元資料，加上正式地圖投影所需的最小連通圖。 */
function fakeBundle(): ScenarioBundleData {
  const castle = (id: string, ownerClanId: string, x: number, y: number) =>
    ({ id, ownerClanId, pos: { x, y } }) as unknown as ScenarioBundleData['castles'][number];
  const district = (id: string, castleId: string, kokudaka: number, x: number, y: number) =>
    ({
      id,
      castleId,
      kokudaka,
      pos: { x, y },
      isPort: false,
    }) as unknown as ScenarioBundleData['districts'][number];
  const road = (id: string, a: string, b: string) =>
    ({ id, a, b, type: 'land', grade: 1, baseDays: 1 }) as ScenarioBundleData['roads'][number];
  const officer = (id: string, name: string, clanId: string) =>
    ({ id, name, clanId }) as unknown as ScenarioBundleData['officers'][number][number];
  const clan = (
    id: string,
    name: string,
    leaderId: string,
    homeCastleId: string,
    colorIndex: number,
  ) =>
    ({
      id,
      name,
      leaderId,
      homeCastleId,
      colorIndex,
    }) as unknown as ScenarioBundleData['clans'][number];

  return {
    id: 's1560',
    provinces: [],
    castles: [
      castle('castle.kiyosu', 'clan.oda', 1966, 2838),
      castle('castle.sunpu', 'clan.imagawa', 2312, 2897),
    ],
    districts: [
      district('dist.a', 'castle.kiyosu', 100000, 1982, 2824),
      district('dist.b', 'castle.kiyosu', 210000, 1929, 2846),
      district('dist.c', 'castle.sunpu', 500000, 2312, 2878),
    ],
    roads: [
      road('road.fixture-1', 'castle.kiyosu', 'dist.a'),
      road('road.fixture-2', 'castle.kiyosu', 'dist.b'),
      road('road.fixture-3', 'castle.kiyosu', 'castle.sunpu'),
      road('road.fixture-4', 'castle.sunpu', 'dist.c'),
    ],
    clans: [
      clan('clan.oda', '織田家', 'off.oda-nobunaga', 'castle.kiyosu', 5),
      clan('clan.imagawa', '今川家', 'off.imagawa-yoshimoto', 'castle.sunpu', 31),
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
