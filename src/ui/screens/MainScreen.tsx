// 主畫面／HUD 組裝（規格：plan/11-ui-screens.md §3.3；plan/12-ui-components.md §3.2；
// 18-roadmap.md M1-20／M2-19；M6-V4 §4.3 UI 接線改寫；M6-V9 §4 HUD 組裝定稿）。
//
// M6-V9（§4）：接上既有元件——頂墨帶 ResourceBar（§4.2 資料接線表：金/糧淨額/駐城兵同域量表/
// 威信）＋SpeedControl（§4.3）＋☰ 占位（§4.7，M8 前 disabled）；左欄 72×88 家紋塊＋四域 56×56
// IconButton（§4.5，testid 契約保留）；MiniMap onNavigate → `MapCanvasHost` forwardRef 之
// `panToWorld`（§4.4，鏡頭補間）；底部 ContextPanel 三態快覽條（§4.6，由 `uiStore.selection`
// 驅動）；ReportStack 可收合（§4.7）。
// 點擊語意修正（§4.6，評審 A B1）：點城/郡只 `setSelection`（開底部快覽條），**不再** `openPanel`
// ——完整面板（CastlePanel/DistrictPanel，左上浮層 `--z-panel`）改由快覽條動作鈕與左欄開啟，
// 消除雙開。
// [M6-V4] §4.1 兩層參考穩定化：`gameView` 經 `makeCachedSelector`（tickSeq 快取，同 tick 內重複
// 呼叫回傳同一參考）取得，`viewState` 再經 `useMemo(composeMapViewState, [gameView, selection])`
// 併入選取狀態——同 tick 內非選取變更的 UI 互動（開面板／hover／marchDraft）不再使 `viewState`
// 換新參考，`MapCanvasHost` 的 `useEffect([viewState])` 因而不觸發，`MapRenderer.updateView` 不再
// 被無謂呼叫；真正變更時交由 renderer 端結構 diff（§3.3）只重畫真的變了的東西。
// data-testid 依 plan/17-testing.md §6.2 契約：`screen-strategy`／`hud-date`（ResourceBar 內）／
// `speed-pause`／`speed-1`／`speed-2`／`speed-5`（SpeedControl 內）／`rail-*`／`minimap*`。

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { gameLoop } from '@app/gameLoop';
import { store } from '@app/store';
import {
  selectBudgetForecast,
  selectMapStaticModel,
  selectMapViewModel,
} from '@core/state/selectors';
import { castleFoodCap, castleMaxSoldiers } from '@core/domestic';
import { BAL } from '@core/balance';
import { computePath, getStance, severityOf } from '@core/index';
import type { MapStaticData, MapRendererEvent, MapPathPreview } from '../map/mapViewTypes';
import { composeMapViewState, stanceToRelation } from '../map/composeMapView';
import { formatNumber, t } from '@i18n/zh-TW';
import {
  makeCachedSelector,
  useCachedGameSelector,
  useGameSelector,
} from '../hooks/useGameSelector';
import { useSession } from '../hooks/useSession';
import { useHotkeys } from '../hooks/useHotkeys';
import { MapCanvasHost, type MapHandle } from '../map/MapCanvasHost';
import { WORLD_SIZE } from '../map/mapViewConfig';
import { buildTerrainPack } from '../map/terrain/terrainPack';
import { uiStore, useUIStore } from '../hooks/uiStore';
import { CastlePanel } from './panels/CastlePanel';
import { DistrictPanel } from './panels/DistrictPanel';
import { OfficerList } from './OfficerList';
import { OfficerDetail } from './OfficerDetail';
import { PolicyPanel } from './panels/PolicyPanel';
import type { CastleId, DistrictId, OfficerId } from '@core/state/ids';
import {
  ContextPanel,
  IconButton,
  ReportStack,
  ResourceBar,
  SpeedControl,
  StatBar,
  type ResourceDelta,
  type ToastItem,
} from '../components';
import { MiniMap, type MiniMapViewport } from '../components/MiniMap';
import { Icon } from '../components/IconButton/icons';
import { clanColorHex } from '@ui/styles/tokens';
import { UI } from '../uiConstants';
import { cameraToViewport } from '../hud/cameraToViewport';
import { selectPlayerMilitary } from '../hud/selectPlayerMilitary';
import { MarchModal } from './MarchModal';
import { SiegeOverlay } from './SiegeOverlay';
import { renderReport } from '../reports/renderReport';

// [M6-V4] Layer 1（producer 參考穩定）：同一 tickSeq 內重複呼叫回傳同一參考（比照下方
// `selectReportToasts` 既有慣例）。
const cachedSelectMapViewModel = makeCachedSelector(selectMapViewModel);
// [M6-V9b] §1.3：名牌兵數查表（UI selector；core VM 無 castle soldiers 欄）。
const cachedSelectSoldiersByCastle = makeCachedSelector((game): Record<string, number> =>
  Object.fromEntries(
    Object.values(game.castles).map((castle) => [castle.id, Math.floor(castle.soldiers)]),
  ),
);

// [M6-V9] §4.2：ResourceBar 資料接線——`selectBudgetForecast`（既有 core selector，UI 讀取合法）
// 與駐城兵 UI 匯總皆經 tickSeq 快取，避免每 render 重建物件觸發重渲染。
const cachedSelectBudget = makeCachedSelector((game) =>
  selectBudgetForecast(game, game.meta.playerClanId),
);
const cachedSelectPlayerMilitary = makeCachedSelector(selectPlayerMilitary);

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

/** 反引號鍵開關除錯面板（01 §6.3；面板本體見 src/ui/debug/DebugPanel.tsx，M1-22）。 */
function toggleDebugPanel(): void {
  const isOpen = store.getState().session.debug.panelOpen;
  store.getState().actions.setDebugPanelOpen(!isOpen);
}

/** 快覽條 StatBar 百分比（0..100；搭配 `max={100}` 使滿值填滿整條，非 0..120 能力尺）。 */
function pct(value: number, max: number): number {
  return max <= 0 ? 0 : Math.round(Math.min(100, (100 * value) / max));
}

/** ContextPanel 三態內容（M6-V9 §4.6 表）。 */
interface ContextView {
  title: string;
  actions: ReactNode;
  body: ReactNode;
}

export function MainScreen(): ReactElement {
  const day = useGameSelector((g) => g.time.day);
  const gold = useGameSelector((g) => g.clans[g.meta.playerClanId]?.gold ?? 0);
  const prestige = useGameSelector((g) => g.clans[g.meta.playerClanId]?.prestige ?? 0);
  const clanColorIndex = useGameSelector((g) => g.clans[g.meta.playerClanId]?.colorIndex ?? 0);
  const clanName = useGameSelector((g) => g.clans[g.meta.playerClanId]?.name ?? '');
  const homeCastleId = useGameSelector((g) => g.clans[g.meta.playerClanId]?.homeCastleId);
  const budget = useCachedGameSelector(cachedSelectBudget);
  const military = useCachedGameSelector(cachedSelectPlayerMilitary);
  const speed = useSession((s) => s.speed);
  const panelStack = useUIStore((s) => s.panelStack);
  const modal = useUIStore((s) => s.modal);
  const marchDraft = useUIStore((s) => s.marchDraft);
  const selection = useUIStore((s) => s.selection);
  const mapCamera = useUIStore((s) => s.mapCamera);
  const uiActions = useUIStore((s) => s.actions);
  const topPanel = panelStack.at(-1);
  const reportToasts = useCachedGameSelector(selectReportToasts);
  const [dismissedReports, setDismissedReports] = useState<readonly string[]>([]);
  const mapHandleRef = useRef<MapHandle>(null);

  // 空白鍵暫停⇄繼續、1/2/3 變速、反引號開除錯面板（01 §6.3；M1-16 已實作本 hook，此處掛載）。
  useHotkeys(gameLoop, toggleDebugPanel);

  // 地圖靜態資料（城∪郡節點圖＋勢力色索引＋顯示名／省標籤座標）只計算一次——開局後拓樸不變，
  // 僅 owner 會變動（見 @core/state/selectors 檔頭裁決）。[M6-V4]：`selectMapStaticModel` 已全量
  // 含 `names`／`provinceLabelPos`，不再手工拼裝。
  // [M6-V5]（VD6）：由 UI 邊界併入 terrain pack（地形浮雕/森林/河湖）——core `selectMapStaticModel`
  // 不 import terrain.json（維持純度／golden 不動）。`buildTerrainPack()` 為模組級快取純函式，回傳
  // 穩定參考，故 `useMemo` 仍在整局內只算一次。terrain 資產載入失敗時 renderer 優雅退回平面渲染。
  const staticData: MapStaticData | null = useMemo(() => {
    const game = store.getState().game;
    if (game === null) return null;
    return { ...selectMapStaticModel(game), terrain: buildTerrainPack() };
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
  // [M6-V8]（V8D3／MINOR6）：供給以 `getStance` 為底之 `relationOf`（敵我關係次級通道推導於 UI
  // 邊界，core selector/golden 不動）。復用組件本體既有 `currentGame`（非 memo 內 `store.getState()`
  // 之 stale-closure），並顯式加入 deps（與 `gameView` 每 tick 同步變，無多餘 re-render）。
  // [M6-V9b] §1.3：名牌兵數查表（castleId → 駐軍；core VM 無此欄，UI 端自 game 讀）；
  // tickSeq 快取確保同 tick 參考穩定，名牌只在 buildNameplateSig（含 soldiers）diff 命中時重繪。
  const soldiersByCastle = useCachedGameSelector(cachedSelectSoldiersByCastle);
  const viewState = useMemo(() => {
    const relationOf =
      currentGame === null
        ? undefined
        : (clanId: string) =>
            stanceToRelation(getStance(currentGame, playerClanId, clanId as never));
    return composeMapViewState(gameView, selection, playerClanId, relationOf, soldiersByCastle);
  }, [gameView, selection, playerClanId, currentGame, soldiersByCastle]);

  // [M6-V9] §4.2：金/糧增減明細（金＝淨 goldNetMonthly；糧＝淨：收成年化攤提 − 每月消耗，
  // 真實脈衝在 breakdown「下次收成」交代——評審 A m1，與金錢語意一致）。
  const goldDelta = useMemo<ResourceDelta>(
    () => ({
      perMonth: budget.goldNetMonthly,
      breakdown: [
        { label: t('ui.hud.income'), value: budget.goldIncomeMonthly },
        { label: t('ui.hud.salary'), value: -budget.salaryMonthly },
        { label: t('ui.hud.policyUpkeep'), value: -budget.policyUpkeepMonthly },
      ],
    }),
    [budget],
  );
  const foodDelta = useMemo<ResourceDelta>(() => {
    const harvestAmortized = Math.round(budget.harvestForecast / 12);
    return {
      perMonth: harvestAmortized - budget.foodUpkeepMonthly,
      breakdown: [
        { label: t('ui.hud.foodConsume'), value: -budget.foodUpkeepMonthly },
        { label: t('ui.hud.harvestAmortized'), value: harvestAmortized },
        { label: t('ui.hud.harvestNext'), value: budget.harvestForecast },
      ],
    };
  }, [budget]);

  // [M6-V9] §4.4：MiniMap 視窗框——uiStore `mapCamera`（cameraChanged 事件回寫）經純算 helper
  // 轉世界矩形；尚無鏡頭事件時以全圖為預設框。
  const minimapViewport = useMemo<MiniMapViewport>(
    () =>
      mapCamera === null
        ? { x: 0, y: 0, width: WORLD_SIZE, height: WORLD_SIZE }
        : cameraToViewport(mapCamera.camera, mapCamera.width, mapCamera.height),
    [mapCamera],
  );
  // [M6-V9 review 補跑] 斷點取自 state＋resize 監聽（unmount 時移除）——暫停中（無 tick 重渲染）
  // 跨越 1440px 斷點改視窗大小時，MiniMap/ContextPanel 尺寸仍即時更新。
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const minimapSize = viewportWidth > 1440 ? UI.minimapSizePx : 176;
  const contextHeight = viewportWidth >= 1440 ? 168 : 112;

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

  // 地圖點擊/懸停事件。[M6-V9] §4.6（評審 A B1）：點城/郡只 `setSelection`（開底部 ContextPanel
  // 快覽條），不再 `openPanel`——完整面板改由快覽條動作鈕與左欄開啟，消除雙開。
  const handleMapEvent = useCallback(
    (event: MapRendererEvent): void => {
      const activeDraft = uiStore.getState().marchDraft;
      if (activeDraft?.phase === 'pickTarget') {
        if (event.type === 'nodeHover' && event.id !== null) {
          previewMarchTarget(event.id, false);
          return;
        }
        if (event.type === 'nodeClick') {
          // [M6-V9b] §3.6：點選＝設目標＋預覽並停留 pickTarget（可比較敵我後再按「確認目標」
          // 藥丸回 compose）；不再自動 finishPick。
          previewMarchTarget(event.id, false);
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
        uiActions.setSelection({ kind: event.nodeKind, id: event.id });
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

  // [M6-V9] §4.6：ContextPanel 三態快覽內容（城/郡/軍）；`selection` 即開閉真相。
  const contextView = ((): ContextView | null => {
    if (currentGame === null || selection === null) return null;
    if (selection.kind === 'castle') {
      const castle = currentGame.castles[selection.id as CastleId];
      if (castle === undefined) return null;
      const provinceName = currentGame.provinces[castle.provinceId]?.name ?? '';
      const canMarch =
        castle.ownerClanId === currentGame.meta.playerClanId &&
        castle.directControl &&
        castle.corpsId === null;
      return {
        title: `${castle.name}（${provinceName}）`,
        actions: (
          <>
            <button
              type="button"
              onClick={() => uiActions.openPanel('castle', { castleId: castle.id })}
            >
              {t('ui.context.castle.panel')}
            </button>
            <button
              type="button"
              disabled={!canMarch}
              onClick={() => canMarch && openMarch(castle.id)}
            >
              {t('cmd.march.confirm')}
            </button>
            <button type="button" disabled title={t('ui.context.transport.locked')}>
              {t('cmd.transport.title')}
            </button>
          </>
        ),
        body: (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
            {/* [M6-V9 review 補跑] `max={100}`：快覽為 0..100 佔比條（滿值填滿整條，非 0..120
                能力尺）；`showValue={false}`：label 已含真值，抑制尾端佔比數字外洩。 */}
            <StatBar
              label={`${t('ui.hud.soldiers')} ${formatNumber(castle.soldiers)}`}
              value={pct(castle.soldiers, castleMaxSoldiers(currentGame, castle))}
              max={100}
              showValue={false}
            />
            <StatBar
              label={`${t('ui.hud.food')} ${formatNumber(castle.food)}`}
              value={pct(castle.food, castleFoodCap(castle))}
              max={100}
              showValue={false}
            />
            <StatBar
              label={`${t('ui.castle.durability')} ${formatNumber(castle.durability)}`}
              value={pct(castle.durability, castle.maxDurability)}
              max={100}
              showValue={false}
            />
            <StatBar
              label={`${t('ui.castle.morale')} ${formatNumber(castle.morale)}`}
              value={castle.morale}
              max={100}
              showValue={false}
            />
          </div>
        ),
      };
    }
    if (selection.kind === 'district') {
      const district = currentGame.districts[selection.id as DistrictId];
      if (district === undefined) return null;
      const castleName = currentGame.castles[district.castleId]?.name ?? '';
      return {
        title: `${district.name}（${castleName}）`,
        actions: (
          <button
            type="button"
            onClick={() => uiActions.openPanel('district', { districtId: district.id })}
          >
            {t('ui.context.district.panel')}
          </button>
        ),
        body: (
          <p style={{ margin: 0 }}>
            {t('ui.district.kokudaka')} {formatNumber(district.kokudaka)}
            {t('term.unit.koku')}
            {'　'}
            {t('ui.district.commerce')} {formatNumber(district.commerce)}
            {'　'}
            {t('ui.district.population')} {formatNumber(district.population)}
            {t('term.unit.people')}
          </p>
        ),
      };
    }
    const army = currentGame.armies[selection.id as never];
    if (army === undefined) return null;
    const leaderName = currentGame.officers[army.leaderId]?.name ?? '';
    const supplyDays = Math.floor(
      army.food / Math.max(1, Math.ceil(army.soldiers * BAL.fieldFoodPerSoldierDaily)),
    );
    const targetName =
      army.targetNodeId === null
        ? null
        : (currentGame.castles[army.targetNodeId as never]?.name ??
          currentGame.districts[army.targetNodeId as never]?.name ??
          null);
    return {
      title: leaderName,
      // 部隊完整面板屬後續里程碑（§4.6 表：disabled/匿）——本片以顯示資訊為主，不出動作鈕。
      actions: null,
      body: (
        <p style={{ margin: 0 }}>
          {t('ui.march.soldiers')} {formatNumber(army.soldiers)}
          {t('term.unit.people')}
          {'　'}
          {t('ui.march.foodDays', { days: supplyDays })}
          {'　'}
          {t('ui.march.target')} {targetName ?? t(`ui.army.status.${army.status}`)}
        </p>
      ),
    };
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
        ref={mapHandleRef}
        onMapEvent={handleMapEvent}
        staticData={staticData}
        viewState={viewState}
        focusNodeId={homeCastleId}
        pathPreview={marchDraft?.previewPath}
        interactionMode={marchDraft?.phase === 'pickTarget' ? 'orderMarch' : 'idle'}
        marchTargetId={marchDraft?.phase === 'pickTarget' ? marchDraft.targetNodeId : null}
      />
      {/* 頂墨帶（M6-V9 §4.1：48px ink900 底 washi 字）＝ResourceBar＋SpeedControl＋☰ 占位。 */}
      <header
        style={{
          position: 'relative',
          zIndex: 'var(--z-hud)',
          display: 'flex',
          alignItems: 'center',
          height: '48px',
          paddingRight: 'var(--space-2)',
          background: 'var(--ink-900)',
          color: 'var(--washi-100)',
        }}
      >
        <ResourceBar
          date={day}
          clanName={clanName}
          clanColorIndex={clanColorIndex}
          gold={gold}
          goldDelta={goldDelta}
          foodTotal={budget.foodStock}
          foodDelta={foodDelta}
          soldiersTotal={military.total}
          soldiersCap={military.cap}
          prestige={prestige}
        />
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: '2px',
            background: 'var(--washi-100)',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          <SpeedControl speed={speed} onChange={(next) => gameLoop.setSpeed(next)} />
          {/* ☰ 系統選單：M8 前 disabled 占位（M6-V9 §4.7）。 */}
          <IconButton icon="gear" ariaLabel={t('ui.system.menu')} disabled onClick={() => {}} />
        </div>
      </header>
      {/* 左欄（M6-V9 §4.5）：72×88 家紋塊（簽名）＋四域 56×56 IconButton；testid 契約保留。 */}
      <nav
        aria-label={t('ui.domestic.title')}
        style={{
          position: 'fixed',
          zIndex: 'var(--z-hud)',
          left: 0,
          top: '48px',
          width: '72px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-2)',
          paddingBottom: 'var(--space-2)',
          background: 'var(--washi-100)',
          borderRight: 'var(--border-thin)',
          borderBottom: 'var(--border-thin)',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: '72px',
            height: '88px',
            boxSizing: 'border-box',
            display: 'grid',
            placeItems: 'center',
            background: clanColorHex(clanColorIndex),
            border: '2px solid var(--accent-gold)',
            color: 'var(--washi-100)',
          }}
        >
          <Icon name="flag" style={{ width: '40px', height: '40px' }} />
        </div>
        <IconButton
          icon="sword"
          ariaLabel={t('ui.rail.military')}
          size="lg"
          testId="rail-military"
          disabled={marchOriginId === null}
          onClick={() => marchOriginId !== null && openMarch(marchOriginId)}
        />
        <IconButton
          icon="castle"
          ariaLabel={t('ui.rail.domestic')}
          size="lg"
          testId="rail-domestic"
          toggled={topPanel?.id === 'castle'}
          onClick={() => uiActions.openPanel('castle', { castleId: homeCastleId ?? '' })}
        />
        <IconButton
          icon="people"
          ariaLabel={t('ui.rail.officers')}
          size="lg"
          testId="rail-officers"
          toggled={topPanel?.id === 'officers'}
          onClick={() => uiActions.openPanel('officers')}
        />
        <IconButton
          icon="scroll"
          ariaLabel={t('ui.rail.policy')}
          size="lg"
          testId="rail-policy"
          toggled={topPanel?.id === 'policy'}
          onClick={() => uiActions.openPanel('policy')}
        />
      </nav>
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
      {/* 底部情境快覽條（M6-V9 §4.6）：城/郡/軍三態；完整面板由動作鈕開啟。 */}
      <ContextPanel
        open={contextView !== null && marchDraft?.phase !== 'pickTarget'}
        title={contextView?.title ?? ''}
        height={contextHeight}
        actions={contextView?.actions}
        onClose={() => uiActions.setSelection(null)}
      >
        {contextView?.body ?? null}
      </ContextPanel>
      {/* MiniMap（M6-V9 §4.4）：viewport＝主鏡頭世界矩形；點擊/拖曳 → panToWorld 補間導航。 */}
      <MiniMap
        size={minimapSize}
        viewport={minimapViewport}
        onNavigate={(x, y) => mapHandleRef.current?.panToWorld(x, y)}
        {...(contextView !== null ? { bottomOffset: contextHeight + 12 } : {})}
      />
      <ReportStack
        items={reportToasts.filter((item) => !dismissedReports.includes(item.id))}
        onDismiss={(id) => setDismissedReports((current) => [...current, id])}
      />
    </div>
  );
}
