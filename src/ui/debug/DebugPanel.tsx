// 除錯面板（規格：plan/01-architecture.md §3.11.2；M1-22（01-A11／03-T11）縮減版）。
//
// M1 範圍：01 §3.11.2 六區塊中僅落地「時間」（+1日／+30日，對應已定案之 `debugSkipDays`）與
// 「資源作弊」子集（僅金錢；`addFood`／`addTroops` 需先在地圖選取我方城，依賴 M2 地圖選取機制，
// 延後）；另新增「狀態」區塊顯示種子與 `stateHash()`，供 03-T11「跳轉 360 日與逐日 hash 一致」
// 人工核對用。AI 意圖／尋路 overlay／StateViewer JSON 樹／效能六區塊留待 M2（地圖）／M7（AI）／
// M1-23（perfMonitor，已有資料來源 `perfMonitor.getSnapshot()`，僅未接顯示）等里程碑補齊。
// 字串 key 見 13 §8 D17（草案併入）／`src/i18n/zh-TW.ts`。

import type { ReactElement } from 'react';
import { useStore } from 'zustand';
import { store } from '@app/store';
import { gameLoop } from '@app/gameLoop';
import { dispatchCommand } from '@app/bridge';
import { BAL } from '@core/balance';
import { stateHash } from '@core/state/serialize';
import { t } from '@i18n/zh-TW';
import { useSession } from '../hooks/useSession';

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  right: 0,
  bottom: 0,
  width: '320px',
  overflowY: 'auto',
  background: 'var(--ink-900)',
  color: 'var(--washi-100)',
  padding: 'var(--space-4)',
  boxShadow: 'var(--shadow-2)',
  zIndex: 'var(--z-dev)', // CSS custom property；React CSSProperties.zIndex 型別本就接受字串
  fontSize: 'var(--font-size-sm)',
};

const SECTION_STYLE: React.CSSProperties = {
  marginTop: 'var(--space-4)',
  paddingTop: 'var(--space-2)',
  borderTop: 'var(--border-thin)',
};

const BUTTON_ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  gap: 'var(--space-2)',
  flexWrap: 'wrap',
};

/** 除錯面板（01 §3.11.2）：`session.debug.panelOpen === false` 時回傳 `null`（不佔用 DOM）。 */
export function DebugPanel(): ReactElement | null {
  const panelOpen = useSession((s) => s.debug.panelOpen);
  const jumping = useSession((s) => s.debug.jumping);
  // 直接訂閱 game／tickSeq（非 useGameSelector：game 尚未 boot 時該 hook 會擲例外，除錯面板
  // 在「新遊戲」按下前即可能已掛載，須容忍 game === null，見檔頭）。
  const game = useStore(store, (s) => s.game);
  useStore(store, (s) => s.tickSeq); // 訂閱 tickSeq：每 tick 重渲染以更新下方 stateHash 顯示

  if (!panelOpen) {
    return null;
  }

  const jumpDisabled = jumping !== null || game === null;

  function handleJump(days: number): () => void {
    return () => gameLoop.stepDays(days);
  }

  function handleAddGold(): void {
    if (game === null) return;
    dispatchCommand({
      type: 'debugGrant',
      clanId: game.meta.playerClanId,
      gold: BAL.debugGrantGoldAmount,
      food: null,
      castleId: null,
    });
  }

  return (
    <div data-testid="debug-panel" style={PANEL_STYLE}>
      <h2 style={{ margin: 0, fontSize: 'var(--font-size-lg)' }}>{t('ui.debug.title')}</h2>

      <section style={SECTION_STYLE}>
        <h3 style={{ margin: '0 0 var(--space-2) 0' }}>{t('ui.debug.section.time')}</h3>
        <div style={BUTTON_ROW_STYLE}>
          <button
            type="button"
            data-testid="debug-jump-1"
            onClick={handleJump(1)}
            disabled={jumpDisabled}
          >
            {t('ui.debug.skipDays', { days: 1 })}
          </button>
          <button
            type="button"
            data-testid="debug-jump-30"
            onClick={handleJump(30)}
            disabled={jumpDisabled}
          >
            {t('ui.debug.skipDays', { days: 30 })}
          </button>
        </div>
        {jumping !== null && (
          <p data-testid="debug-jump-progress">
            {t('ui.debug.skipping', { done: jumping.doneDays, total: jumping.totalDays })}
          </p>
        )}
      </section>

      <section style={SECTION_STYLE}>
        <h3 style={{ margin: '0 0 var(--space-2) 0' }}>{t('ui.debug.section.cheat')}</h3>
        <div style={BUTTON_ROW_STYLE}>
          <button
            type="button"
            data-testid="debug-add-gold"
            onClick={handleAddGold}
            disabled={game === null}
          >
            {t('ui.debug.addGold', { amount: BAL.debugGrantGoldAmount })}
          </button>
        </div>
      </section>

      <section style={SECTION_STYLE}>
        <h3 style={{ margin: '0 0 var(--space-2) 0' }}>{t('ui.debug.section.state')}</h3>
        {game === null ? (
          <p>{t('ui.common.noData')}</p>
        ) : (
          <>
            <p data-testid="debug-seed">{t('ui.debug.seed', { seed: game.meta.seed })}</p>
            <p data-testid="debug-state-hash">
              {t('ui.debug.stateHash', { hash: stateHash(game) })}
            </p>
          </>
        )}
      </section>
    </div>
  );
}
