// 最小主畫面／HUD（規格：plan/11-ui-screens.md §3.3 縮減版；plan/12-ui-components.md §3.2.11
// SpeedControl；18-roadmap.md M1-20／M2-19）。
//
// M1 縮減：僅上緣資源列的三項（日期、金錢佔位、SpeedControl 簡版）；左側快捷列、通知堆疊、
// 迷你地圖、底部上下文面板留待 M3 起（11/12 對應里程碑）。
// M2-19 新增：掛載 `MapCanvasHost` 顯示地圖（勢力色；鏡頭初始 focusOn 玩家居城）——靜態資料
// （城∪郡節點圖＋勢力色索引）與動態視圖（owner）由 `@core/state/selectors` 之
// `selectMapStaticModel`／`selectMapViewModel` 純函式推導（04 §4.6）；地圖點擊/懸停事件目前僅
// 同步進 `session.selection`（面板開啟屬 M3 CastlePanel/DistrictPanel 範圍，11-T4/T5）。
// data-testid 依 plan/17-testing.md §6.2 契約：`screen-strategy`／`hud-date`／
// `speed-pause`／`speed-1`／`speed-2`／`speed-5`。

import { useCallback, useMemo, type ReactElement } from 'react';
import { gameLoop } from '@app/gameLoop';
import { store } from '@app/store';
import type { GameSpeed } from '@app/store';
import { selectMapStaticModel, selectMapViewModel } from '@core/state/selectors';
import type { MapStaticData, MapRendererEvent } from '../map/mapViewTypes';
import { formatDate, formatNumber, t, type StringKey } from '@i18n/zh-TW';
import { useGameSelector } from '../hooks/useGameSelector';
import { useSession } from '../hooks/useSession';
import { useHotkeys } from '../hooks/useHotkeys';
import { MapCanvasHost } from '../map/MapCanvasHost';

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
  const homeCastleId = useGameSelector((g) => g.clans[g.meta.playerClanId]?.homeCastleId);
  const speed = useSession((s) => s.speed);

  // 空白鍵暫停⇄繼續、1/2/3 變速、反引號開除錯面板（01 §6.3；M1-16 已實作本 hook，此處掛載）。
  useHotkeys(gameLoop, toggleDebugPanel);

  // 地圖靜態資料（城∪郡節點圖＋勢力色索引）只計算一次——開局後拓樸不變，僅 owner 會變動
  // （見 @core/state/selectors 檔頭裁決）。
  const staticData: MapStaticData | null = useMemo(() => {
    const game = store.getState().game;
    return game === null ? null : selectMapStaticModel(game);
  }, []);
  // 動態視圖（owner）：不經 useGameSelector（該 hook 之 select 規則禁止直接回傳整個 GameState，
  // 見其檔頭；且 game 於 advanceDay 內就地變異、參考不變，shallow compare 對此無效）。改比照本檔
  // 既有 `handleMapEvent`／`toggleDebugPanel` 慣例直接 `store.getState()` 讀取；`dateText`（上方
  // `useGameSelector`）已確保 tick 前進時本元件會重渲染，故每次 render 重算 owner 足夠新鮮
  // （成本 O(城數+郡數)，M2 子集規模可忽略）。
  const currentGame = store.getState().game;
  const viewState = currentGame === null ? undefined : selectMapViewModel(currentGame);

  // 地圖點擊/懸停事件：目前只同步進 session.selection（面板開啟屬 M3 CastlePanel/DistrictPanel
  // 範圍，11-T4/T5，尚未有面板消費此值）。
  const handleMapEvent = useCallback((event: MapRendererEvent): void => {
    if (event.type === 'nodeClick') {
      store.getState().actions.select({ kind: event.nodeKind, id: event.id });
    } else if (event.type === 'emptyClick' || event.type === 'rightClick') {
      store.getState().actions.select({ kind: 'none', id: null });
    }
  }, []);

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
      <MapCanvasHost
        onMapEvent={handleMapEvent}
        staticData={staticData}
        viewState={viewState}
        focusNodeId={homeCastleId}
      />
      <div
        style={{
          position: 'relative',
          zIndex: 'var(--z-hud)',
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
