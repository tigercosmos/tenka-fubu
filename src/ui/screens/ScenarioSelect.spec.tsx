// ScenarioSelect 元件測試（M2-19；17 §6.2 testid 契約：`scenario-pick-s1560`）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ScenarioSelect } from './ScenarioSelect';
import type { ScenarioBundleData } from '@data/schemas';

afterEach(() => {
  cleanup();
});

/** 最小測試用 bundle：只填 ScenarioSelect 實際讀取的欄位（clans/castles 長度）。 */
function fakeBundle(clanCount: number, castleCount: number): ScenarioBundleData {
  return {
    id: 's1560',
    provinces: [],
    castles: Array.from(
      { length: castleCount },
      () => ({}) as ScenarioBundleData['castles'][number],
    ),
    districts: [],
    roads: [],
    clans: Array.from({ length: clanCount }, () => ({}) as ScenarioBundleData['clans'][number]),
    diplomacy: { pacts: [], wars: [], sentiments: [] },
    events: [],
    officers: [[], [], [], [], [], [], [], [], []],
    catalogs: { traits: [], policies: [], tactics: [], personas: [] },
  };
}

describe('ScenarioSelect（11 §3.2.2 縮減版）', () => {
  it('畫面根節點 data-testid="screen-scenario-select"；載入完成前卡片 disabled', () => {
    const loadScenario = vi.fn(() => new Promise<ScenarioBundleData>(() => {})); // 永不 resolve
    render(
      <ScenarioSelect onSelectScenario={vi.fn()} onBack={vi.fn()} loadScenario={loadScenario} />,
    );
    expect(screen.getByTestId('screen-scenario-select')).toBeTruthy();
    expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', true);
  });

  it('載入完成後卡片可點擊；顯示勢力數／城數統計（13 §6.2 ui.scenario.stats）', async () => {
    const bundle = fakeBundle(13, 34);
    const loadScenario = vi.fn().mockResolvedValue(bundle);
    render(
      <ScenarioSelect onSelectScenario={vi.fn()} onBack={vi.fn()} loadScenario={loadScenario} />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false);
    });
    expect(
      screen.getByText((content) => content.includes('勢力數：13') && content.includes('城數：34')),
    ).toBeTruthy();
  });

  it('點擊 data-testid="scenario-pick-s1560"（資料就緒後）呼叫 onSelectScenario(bundle)', async () => {
    const bundle = fakeBundle(13, 34);
    const loadScenario = vi.fn().mockResolvedValue(bundle);
    const onSelectScenario = vi.fn();
    render(
      <ScenarioSelect
        onSelectScenario={onSelectScenario}
        onBack={vi.fn()}
        loadScenario={loadScenario}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', false);
    });
    fireEvent.click(screen.getByTestId('scenario-pick-s1560'));
    expect(onSelectScenario).toHaveBeenCalledWith(bundle);
  });

  it('點擊 scenario-back 呼叫 onBack（17 §6.2「返回」流程）', () => {
    const loadScenario = vi.fn(() => new Promise<ScenarioBundleData>(() => {}));
    const onBack = vi.fn();
    render(
      <ScenarioSelect onSelectScenario={vi.fn()} onBack={onBack} loadScenario={loadScenario} />,
    );
    fireEvent.click(screen.getByTestId('scenario-back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('載入失敗：卡片保持 disabled，顯示錯誤字串', async () => {
    const loadScenario = vi.fn().mockRejectedValue(new Error('boom'));
    render(
      <ScenarioSelect onSelectScenario={vi.fn()} onBack={vi.fn()} loadScenario={loadScenario} />,
    );
    await waitFor(() => {
      expect(screen.getByText('劇本資料載入失敗')).toBeTruthy();
    });
    expect(screen.getByTestId('scenario-pick-s1560')).toHaveProperty('disabled', true);
  });
});
