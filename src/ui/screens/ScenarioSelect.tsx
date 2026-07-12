// 劇本選擇畫面（規格：plan/11-ui-screens.md §3.2.2 縮減版；18-roadmap.md M2-19「11-T2 縮減」）。
//
// M2-19 縮減：v1.0 僅 s1560 一個劇本（11 §3.2.2「v1.0 僅 s1560 一個項目」），故省略左右兩欄佈局，
// 單張可點擊卡片即整個畫面；卡片本身兼「選取」與「確認」（無獨立「選擇此劇本」按鈕）——對齊
// plan/17-testing.md §3.8 P2 之實際步驟（`title-newgame` → `scenario-pick-s1560` → …），該流程
// 點下卡片即直接進入 DaimyoSelectScreen，並無中間確認步驟。
//
// 劇本資料經 `src/app/boot.ts` 的 `loadScenario`（動態 import，01 §3.9.3）非同步載入；卡片掛載後
// 立即顯示（loading 態下 disabled，待資料就緒才可點擊——資料量小，實測近乎即時）。
// data-testid 依 plan/17-testing.md §6.2 契約：`scenario-pick-s1560`；根節點比照 `screen-*`
// 命名慣例新增 `screen-scenario-select`（該表未列出但依表尾規則「新增畫面時比照命名」新增）。

import { useEffect, useState, type ReactElement } from 'react';
import { t } from '@i18n/zh-TW';
import { loadScenario as loadScenarioReal, getScenarioTitle } from '@app/boot';
import type { ScenarioBundleData } from '@data/schemas';

export interface ScenarioSelectProps {
  /** 選定劇本（資料已載入完成）後呼叫，交由呼叫端轉場至 DaimyoSelectScreen。 */
  onSelectScenario: (bundle: ScenarioBundleData) => void;
  onBack: () => void;
  /** 供測試替換（預設走 `src/app/boot.ts` 的真實 s1560 動態載入）。 */
  loadScenario?: (scenarioId: string) => Promise<ScenarioBundleData>;
}

const SCENARIO_ID = 's1560';

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; bundle: ScenarioBundleData }
  | { status: 'error'; message: string };

export function ScenarioSelect({
  onSelectScenario,
  onBack,
  loadScenario = loadScenarioReal,
}: ScenarioSelectProps): ReactElement {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    loadScenario(SCENARIO_ID)
      .then((bundle) => {
        if (!cancelled) setState({ status: 'ready', bundle });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setState({ status: 'error', message: e instanceof Error ? e.message : String(e) });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadScenario]);

  const handlePick = (): void => {
    if (state.status === 'ready') onSelectScenario(state.bundle);
  };

  const statsText =
    state.status === 'ready'
      ? t('ui.scenario.stats', {
          clans: state.bundle.clans.length,
          castles: state.bundle.castles.length,
        })
      : state.status === 'error'
        ? t('ui.scenario.loadError')
        : t('ui.scenario.loading');

  return (
    <div
      data-testid="screen-scenario-select"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-8)',
        padding: 'var(--space-8)',
        background: 'var(--ink-900)',
        color: 'var(--washi-100)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '40rem',
        }}
      >
        <h1 style={{ fontSize: 'var(--font-size-lg)', margin: 0 }}>{t('ui.scenario.title')}</h1>
        <button type="button" data-testid="scenario-back" onClick={onBack}>
          {t('ui.newGame.back')}
        </button>
      </div>

      <button
        type="button"
        data-testid="scenario-pick-s1560"
        disabled={state.status !== 'ready'}
        onClick={handlePick}
        style={{
          width: '100%',
          maxWidth: '40rem',
          textAlign: 'left',
          padding: 'var(--space-6)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        <span style={{ fontSize: 'var(--font-size-lg)' }}>
          1560 {getScenarioTitle(SCENARIO_ID)}
        </span>
        <span>{statsText}</span>
      </button>
    </div>
  );
}
