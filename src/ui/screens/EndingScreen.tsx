// 結局畫面（規格：plan/10-events-and-victory.md §3.9／§6.4、plan/11-ui-screens.md §3.12.3）。
// MVP 先行實作（原屬 M8-11 一部）：標語＋統計卡＋動作鈕（victory→繼續治世／回標題、
// defeat→繼續觀戰／回標題）。動作不是 Command——由 App 外殼直接呼叫 core API
// `acknowledgeGameOver`（10 §3.8.4；比照存讀檔 §8 D8），本元件只透過 props 回呼。
// data-testid：`screen-ending`／`ending-continue`／`ending-observe`／`ending-title`。

import type { ReactElement } from 'react';
import { t } from '@i18n/zh-TW';
import { buildEndingVM } from '@core/state/selectors';
import { useGameSelector } from '../hooks/useGameSelector';
import styles from './EndingScreen.module.css';

export interface EndingScreenProps {
  /** 「繼續治世」（勝利限定）：外殼 acknowledgeGameOver(state,'continue') 後回地圖。 */
  onContinue: () => void;
  /** 「繼續觀戰」（敗北限定）：gameOver 維持、指令持續被拒，外殼切回地圖純觀戰。 */
  onObserve: () => void;
  /** 「回到標題」：外殼丟棄 state、回標題流程。 */
  onTitle: () => void;
}

/** endingId → 標語 i18n key（10 §6.3；插值 clanName 僅敗北兩式使用）。 */
function sloganKey(endingId: string): string {
  switch (endingId) {
    case 'unification':
      return 'ui.ending.victory.unification';
    case 'tenkabito':
      return 'ui.ending.victory.tenkabito';
    case 'no-heir':
      return 'ui.ending.defeat.noHeir';
    default:
      return 'ui.ending.defeat.noCastle';
  }
}

export function EndingScreen({ onContinue, onObserve, onTitle }: EndingScreenProps): ReactElement {
  const vm = useGameSelector(buildEndingVM);
  if (vm === null) {
    // 防禦：gameOver 已被解除（如 StrictMode 雙渲染間 acknowledge）時不渲染內容，交由 App 切場。
    return <div data-testid="screen-ending" />;
  }
  const rootClass = vm.kind === 'victory' ? `${styles.screen} ${styles.victory}` : styles.screen;
  return (
    <div data-testid="screen-ending" className={rootClass}>
      <p className={styles.kind}>{`${vm.clanName}・${vm.leaderName}`}</p>
      <h1 className={styles.slogan}>{t(sloganKey(vm.endingId), { clanName: vm.clanName })}</h1>
      <ul className={styles.stats}>
        <li>{t('ui.ending.statYears', { years: vm.elapsedYears, months: vm.elapsedMonths })}</li>
        <li>{t('ui.ending.statBattles', { fought: vm.battlesFought, won: vm.battlesWon })}</li>
        <li>{t('ui.ending.statMaxCastles', { count: vm.maxCastles })}</li>
        <li>{t('ui.ending.statMaxKokudaka', { koku: vm.maxKokudaka })}</li>
        <li>{t('ui.ending.statOfficers', { count: vm.officerCount })}</li>
      </ul>
      <div className={styles.actions}>
        {vm.actions.includes('continue') && (
          <button type="button" data-testid="ending-continue" onClick={onContinue}>
            {t('ui.ending.actionContinue')}
          </button>
        )}
        {vm.actions.includes('observe') && (
          <button type="button" data-testid="ending-observe" onClick={onObserve}>
            {t('ui.ending.actionObserve')}
          </button>
        )}
        <button type="button" data-testid="ending-title" onClick={onTitle}>
          {t('ui.ending.actionTitle')}
        </button>
      </div>
    </div>
  );
}
