// 最小主畫面／HUD（規格：plan/11-ui-screens.md §3.3 縮減版；plan/12-ui-components.md §3.2.11
// SpeedControl；18-roadmap.md M1-20）。
//
// M1 縮減：僅上緣資源列的三項（日期、金錢佔位、SpeedControl 簡版）；地圖（PixiJS）、左側快捷列、
// 通知堆疊、迷你地圖、底部上下文面板皆留待 M2 起（04/11/12 對應里程碑）。
// data-testid 依 plan/17-testing.md §6.2 契約：`screen-strategy`／`hud-date`／
// `speed-pause`／`speed-1`／`speed-2`／`speed-5`。

import type { ReactElement } from 'react';
import { gameLoop } from '@app/gameLoop';
import { store } from '@app/store';
import type { GameSpeed } from '@app/store';
import { formatDate, formatNumber, t, type StringKey } from '@i18n/zh-TW';
import { useGameSelector } from '../hooks/useGameSelector';
import { useSession } from '../hooks/useSession';
import { useHotkeys } from '../hooks/useHotkeys';

interface SpeedOption {
  speed: GameSpeed;
  testId: string;
  ariaLabelKey: StringKey;
  labelKey: StringKey;
}

/** 四檔速度按鈕（00 §5.2；12 §3.2.11）。 */
const SPEED_OPTIONS: readonly SpeedOption[] = [
  {
    speed: 'paused',
    testId: 'speed-pause',
    ariaLabelKey: 'ui.speed.aria.pause',
    labelKey: 'ui.speed.paused',
  },
  { speed: 'x1', testId: 'speed-1', ariaLabelKey: 'ui.speed.aria.x1', labelKey: 'ui.speed.x1' },
  { speed: 'x2', testId: 'speed-2', ariaLabelKey: 'ui.speed.aria.x2', labelKey: 'ui.speed.x2' },
  { speed: 'x5', testId: 'speed-5', ariaLabelKey: 'ui.speed.aria.x5', labelKey: 'ui.speed.x5' },
];

/** 反引號鍵開關除錯面板（01 §6.3；面板本體見 src/ui/debug/DebugPanel.tsx，M1-22）。 */
function toggleDebugPanel(): void {
  const isOpen = store.getState().session.debug.panelOpen;
  store.getState().actions.setDebugPanelOpen(!isOpen);
}

export function MainScreen(): ReactElement {
  const dateText = useGameSelector((g) => formatDate(g.time.day));
  const gold = useGameSelector((g) => g.clans[g.meta.playerClanId]?.gold ?? 0);
  const speed = useSession((s) => s.speed);

  // 空白鍵暫停⇄繼續、1/2/3 變速、反引號開除錯面板（01 §6.3；M1-16 已實作本 hook，此處掛載）。
  useHotkeys(gameLoop, toggleDebugPanel);

  return (
    <div
      data-testid="screen-strategy"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'var(--washi-200)',
        color: 'var(--ink-900)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-6)',
          height: '3rem',
          padding: '0 var(--space-4)',
          background: 'var(--ink-900)',
          color: 'var(--washi-100)',
        }}
      >
        <span data-testid="hud-date">{dateText}</span>
        <span>
          {t('ui.hud.gold')} {formatNumber(gold)}
          {t('term.unit.gold')}
        </span>
        <div style={{ display: 'flex', gap: 'var(--space-2)', marginLeft: 'auto' }}>
          {SPEED_OPTIONS.map((opt) => (
            <button
              key={opt.speed}
              type="button"
              data-testid={opt.testId}
              aria-label={t(opt.ariaLabelKey)}
              aria-pressed={speed === opt.speed}
              onClick={() => gameLoop.setSpeed(opt.speed)}
            >
              {t(opt.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
