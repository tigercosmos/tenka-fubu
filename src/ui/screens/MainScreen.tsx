// 最小主畫面／HUD（規格：plan/11-ui-screens.md §3.3 縮減版；plan/12-ui-components.md §3.2.11
// SpeedControl；18-roadmap.md M1-20／M2-19；M6-V4 §4.3 UI 接線改寫）。
//
// M1 縮減：僅上緣資源列的三項（日期、金錢佔位、SpeedControl 簡版）；左側快捷列、通知堆疊、
// 迷你地圖、底部上下文面板留待 M3 起（11/12 對應里程碑）。
// M2-19 新增：掛載 `MapCanvasHost` 顯示地圖（勢力色；鏡頭初始 focusOn 玩家居城）——靜態資料
// （城∪郡節點圖＋勢力色索引）與動態視圖（owner）由 `@core/state/selectors` 之
// `selectMapStaticModel`／`selectMapViewModel` 純函式推導（04 §4.6）；地圖點擊/懸停事件目前僅
// 同步進 `session.selection`（面板開啟屬 M3 CastlePanel/DistrictPanel 範圍，11-T4/T5）。
// [M6-V4] §4.1 兩層參考穩定化：`gameView` 經 `makeCachedSelector`（tickSeq 快取，同 tick 內重複
// 呼叫回傳同一參考）取得，`viewState` 再經 `useMemo(composeMapViewState, [gameView, selection])`
// 併入選取狀態——同 tick 內非選取變更的 UI 互動（開面板／hover／marchDraft）不再使 `viewState`
// 換新參考，`MapCanvasHost` 的 `useEffect([viewState])` 因而不觸發，`MapRenderer.updateView` 不再
// 被無謂呼叫；真正變更時交由 renderer 端結構 diff（§3.3）只重畫真的變了的東西。
// data-testid 依 plan/17-testing.md §6.2 契約：`screen-strategy`／`hud-date`／
// `speed-pause`／`speed-1`／`speed-2`／`speed-5`。

import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { gameLoop } from '@app/gameLoop';
import { store } from '@app/store';
import type { GameSpeed } from '@app/store';
import { selectMapStaticModel, selectMapViewModel } from '@core/state/selectors';
import { computePath, getStance, severityOf } from '@core/index';
import type { MapStaticData, MapRendererEvent, MapPathPreview } from '../map/mapViewTypes';
import { composeMapViewState } from '../map/composeMapView';
import { formatDate, formatNumber, t, type StringKey } from '@i18n/zh-TW';
import {
  makeCachedSelector,
  useCachedGameSelector,
  useGameSelector,
} from '../hooks/useGameSelector';
import { useSession } from '../hooks/useSession';
import { useHotkeys } from '../hooks/useHotkeys';
import { MapCanvasHost } from '../map/MapCanvasHost';
import { uiStore, useUIStore } from '../hooks/uiStore';
import { CastlePanel } from './panels/CastlePanel';
import { DistrictPanel } from './panels/DistrictPanel';
import { OfficerList } from './OfficerList';
import { OfficerDetail } from './OfficerDetail';
import { PolicyPanel } from './panels/PolicyPanel';
import type { CastleId, DistrictId, OfficerId } from '@core/state/ids';
import { ReportStack, type ToastItem } from '../components';
import { MarchModal } from './MarchModal';
import { SiegeOverlay } from './SiegeOverlay';
import { renderReport } from '../reports/renderReport';

// [M6-V4] Layer 1（producer 參考穩定）：同一 tickSeq 內重複呼叫回傳同一參考（比照下方
// `selectReportToasts` 既有慣例）。
const cachedSelectMapViewModel = makeCachedSelector(selectMapViewModel);

const selectReportToasts = makeCachedSelector((game): ToastItem[] =>
  game.reports.slice(0, 20).flatMap((report) => {
    const title = renderReport(report.event, game, game.meta.playerClanId);
    if (title === null) return [];
    const severity = severityOf(report.event, game.meta.playerClanId);
    return [
      {
        id: report.id,
        severity,
        title,
        date: report.day,
        sticky: severity === 'critical',
      },
    ];
  }),
);

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
  const panelStack = useUIStore((s) => s.panelStack);
  const modal = useUIStore((s) => s.modal);
  const marchDraft = useUIStore((s) => s.marchDraft);
  const selection = useUIStore((s) => s.selection);
  const uiActions = useUIStore((s) => s.actions);
  const topPanel = panelStack.at(-1);
  const reportToasts = useCachedGameSelector(selectReportToasts);
  const [dismissedReports, setDismissedReports] = useState<readonly string[]>([]);

  // 空白鍵暫停⇄繼續、1/2/3 變速、反引號開除錯面板（01 §6.3；M1-16 已實作本 hook，此處掛載）。
  useHotkeys(gameLoop, toggleDebugPanel);

  // 地圖靜態資料（城∪郡節點圖＋勢力色索引＋顯示名／省標籤座標）只計算一次——開局後拓樸不變，
  // 僅 owner 會變動（見 @core/state/selectors 檔頭裁決）。[M6-V4]：`selectMapStaticModel` 已全量
  // 含 `names`／`provinceLabelPos`，不再手工拼裝。
  const staticData: MapStaticData | null = useMemo(() => {
    const game = store.getState().game;
    if (game === null) return null;
    return selectMapStaticModel(game);
  }, []);

  // 動態視圖：[M6-V4] §4.1 兩層參考穩定化。
  // Layer 1（producer 參考穩定）：`gameView` 經 `useCachedGameSelector`（tickSeq 快取）取得，
  // 同一 tickSeq 內重複呼叫回傳同一參考。
  const gameView = useCachedGameSelector(cachedSelectMapViewModel);
  const playerClanId = useGameSelector((g) => g.meta.playerClanId);
  const currentGame = store.getState().game;
  // Layer 2（UI 邊界組裝）：`composeMapViewState`（純函式，D7）併入目前選取狀態；`useMemo` 確保
  // `gameView`／`selection`（uiStore 參考穩定）皆不變時 `viewState` 參考不變——`MapCanvasHost` 的
  // `useEffect([viewState])` 因而不觸發，開面板/hover/marchDraft 不再誤觸 `updateView`。
  const viewState = useMemo(
    () => composeMapViewState(gameView, selection, playerClanId),
    [gameView, selection, playerClanId],
  );

  const openMarch = useCallback(
    (originCastleId: CastleId): void => {
      uiActions.setMarchDraft({
        originCastleId,
        leaderOfficerId: null,
        subOfficerIds: [],
        soldiers: 0,
        food: 0,
        targetNodeId: null,
        previewPath: null,
        previewDays: null,
        phase: 'compose',
        errorKey: null,
      });
      uiActions.enqueueModal({
        id: 'march',
        params: { castleId: originCastleId },
        pausesTime: false,
      });
    },
    [uiActions],
  );

  const previewMarchTarget = useCallback(
    (targetId: string, finishPick: boolean): void => {
      const game = store.getState().game;
      const draft = uiStore.getState().marchDraft;
      if (game === null || staticData === null || draft === null) return;
      const result = computePath(game, staticData.graph, {
        clanId: game.meta.playerClanId,
        from: draft.originCastleId as never,
        to: targetId as never,
        speedFactor: 1,
      });
      const valid = result.found && result.nodes.length > 1;
      let previewResult = result;
      if (!valid) {
        const targetPos = staticData.graph.nodes.get(targetId as never)?.pos;
        if (targetPos !== undefined) {
          const candidates = [...staticData.graph.nodes.values()].sort((a, b) => {
            const da = Math.hypot(a.pos.x - targetPos.x, a.pos.y - targetPos.y);
            const db = Math.hypot(b.pos.x - targetPos.x, b.pos.y - targetPos.y);
            return da - db || a.id.localeCompare(b.id);
          });
          for (const candidate of candidates) {
            const partial = computePath(game, staticData.graph, {
              clanId: game.meta.playerClanId,
              from: draft.originCastleId as never,
              to: candidate.id,
              speedFactor: 1,
            });
            if (partial.found) {
              previewResult = partial;
              break;
            }
          }
        }
      }
      const hostileNodeIds = previewResult.steps
        .filter((step) => step.needsSubjugate)
        .map((step) => step.nodeId);
      const targetOwner =
        game.castles[targetId as never]?.ownerClanId ??
        game.districts[targetId as never]?.ownerClanId;
      if (
        targetOwner !== undefined &&
        ['war', 'neutral'].includes(getStance(game, game.meta.playerClanId, targetOwner)) &&
        !hostileNodeIds.includes(targetId as never)
      ) {
        hostileNodeIds.push(targetId as never);
      }
      const previewPath: MapPathPreview = {
        result: previewResult,
        originNodeId: draft.originCastleId as never,
        targetNodeId: targetId as never,
        unreachable: !valid,
        hostileNodeIds,
      };
      uiActions.setMarchDraft({
        ...draft,
        targetNodeId: valid ? targetId : null,
        previewPath,
        previewDays: valid ? result.totalDays : null,
        errorKey: valid ? null : 'ui.map.path.unreachable',
        phase: finishPick && valid ? 'compose' : 'pickTarget',
      });
    },
    [staticData, uiActions],
  );

  // 地圖點擊/懸停事件：目前只同步進 session.selection（面板開啟屬 M3 CastlePanel/DistrictPanel
  // 範圍，11-T4/T5，尚未有面板消費此值）。
  const handleMapEvent = useCallback(
    (event: MapRendererEvent): void => {
      const activeDraft = uiStore.getState().marchDraft;
      if (activeDraft?.phase === 'pickTarget') {
        if (event.type === 'nodeHover' && event.id !== null) {
          previewMarchTarget(event.id, false);
          return;
        }
        if (event.type === 'nodeClick') {
          previewMarchTarget(event.id, true);
          return;
        }
        if (event.type === 'rightClick') {
          uiActions.setMarchDraft({
            ...activeDraft,
            targetNodeId: null,
            previewPath: null,
            previewDays: null,
            errorKey: null,
            phase: 'compose',
          });
          return;
        }
      }
      if (event.type === 'cameraChanged') {
        uiActions.setMapCamera({ camera: event.camera, width: event.width, height: event.height });
        return;
      }
      if (event.type === 'nodeClick') {
        store.getState().actions.select({ kind: event.nodeKind, id: event.id });
        if (event.nodeKind === 'castle') {
          uiActions.setSelection({ kind: 'castle', id: event.id });
          uiActions.openPanel('castle', { castleId: event.id });
        } else if (event.nodeKind === 'district') {
          uiActions.setSelection({ kind: 'district', id: event.id });
          uiActions.openPanel('district', { districtId: event.id });
        }
      } else if (event.type === 'armyClick') {
        store.getState().actions.select({ kind: 'army', id: event.id });
        uiActions.setSelection({ kind: 'army', id: event.id });
      } else if (event.type === 'emptyClick' || event.type === 'rightClick') {
        store.getState().actions.select({ kind: 'none', id: null });
        uiActions.setSelection(null);
      }
    },
    [previewMarchTarget, uiActions],
  );

  const marchOriginId = (() => {
    if (currentGame === null) return null;
    const selectedCastle =
      selection?.kind === 'castle' ? currentGame.castles[selection.id as CastleId] : undefined;
    if (
      selectedCastle?.ownerClanId === currentGame.meta.playerClanId &&
      selectedCastle.directControl &&
      selectedCastle.corpsId === null
    )
      return selectedCastle.id;
    const home = homeCastleId === undefined ? undefined : currentGame.castles[homeCastleId];
    return home?.directControl && home.corpsId === null ? home.id : null;
  })();
  const selectedSiegeId = (() => {
    if (currentGame === null || selection === null) return null;
    if (selection.kind === 'army') {
      return currentGame.armies[selection.id as never]?.siegeId ?? null;
    }
    if (selection.kind !== 'castle') return null;
    return (
      Object.values(currentGame.sieges).find(
        (siege) =>
          siege.castleId === selection.id && siege.attackerClanId === currentGame.meta.playerClanId,
      )?.id ?? null
    );
  })();

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
        pathPreview={marchDraft?.previewPath}
        interactionMode={marchDraft?.phase === 'pickTarget' ? 'orderMarch' : 'idle'}
      />
      <nav
        aria-label={t('ui.domestic.title')}
        style={{
          position: 'fixed',
          zIndex: 'var(--z-hud)',
          left: 'var(--space-2)',
          top: '4rem',
          display: 'grid',
          gap: 'var(--space-2)',
        }}
      >
        <button
          type="button"
          data-testid="rail-military"
          disabled={marchOriginId === null}
          onClick={() => marchOriginId !== null && openMarch(marchOriginId)}
        >
          {t('ui.rail.military')}
        </button>
        <button
          type="button"
          data-testid="rail-domestic"
          onClick={() => uiActions.openPanel('castle', { castleId: homeCastleId ?? '' })}
        >
          {t('ui.rail.domestic')}
        </button>
        <button
          type="button"
          data-testid="rail-officers"
          onClick={() => uiActions.openPanel('officers')}
        >
          {t('ui.rail.officers')}
        </button>
        <button
          type="button"
          data-testid="rail-policy"
          onClick={() => uiActions.openPanel('policy')}
        >
          {t('ui.rail.policy')}
        </button>
      </nav>
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
      {topPanel?.id === 'castle' && topPanel.params.castleId && (
        <CastlePanel castleId={topPanel.params.castleId as CastleId} onOpenMarch={openMarch} />
      )}
      {topPanel?.id === 'district' && topPanel.params.districtId && (
        <DistrictPanel districtId={topPanel.params.districtId as DistrictId} />
      )}
      {topPanel?.id === 'officers' && <OfficerList />}
      {topPanel?.id === 'policy' && <PolicyPanel />}
      {topPanel?.id === 'officerDetail' && topPanel.params.officerId && (
        <OfficerDetail officerId={topPanel.params.officerId as OfficerId} />
      )}
      {modal?.id === 'march' && <MarchModal />}
      {selectedSiegeId !== null && <SiegeOverlay siegeId={selectedSiegeId} />}
      <ReportStack
        items={reportToasts.filter((item) => !dismissedReports.includes(item.id))}
        onDismiss={(id) => setDismissedReports((current) => [...current, id])}
      />
    </div>
  );
}
