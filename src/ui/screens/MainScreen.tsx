// 主畫面／HUD 組裝（規格：plan/11-ui-screens.md §3.3；plan/12-ui-components.md §3.2；
// 18-roadmap.md M1-20／M2-19；M6-V4 §4.3 UI 接線改寫；M6-V9 §4 HUD 組裝定稿）。
//
// M6-V9（§4）：接上既有元件——頂墨帶 ResourceBar（§4.2 資料接線表：金/糧淨額/駐城兵同域量表/
// 威信）＋SpeedControl（§4.3）＋系統入口；資源獨立捲動，命令區固定。左欄家紋與領域入口
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
  useLayoutEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { gameLoop } from '@app/gameLoop';
import { dispatchCommand, getQueuedPlayerCommands, getSessionEventEngine } from '@app/bridge';
import { store } from '@app/store';
import {
  selectBudgetForecast,
  selectMapStaticModel,
  selectMapViewModel,
} from '@core/state/selectors';
import { castleFoodCap, castleMaxSoldiers } from '@core/domestic';
import { armyFoodDays } from '@core/armyFood';
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
import { useMapGameSelector } from '../hooks/useMapGameSelector';
import { useHotkeys } from '../hooks/useHotkeys';
import { MapCanvasHost, type MapHandle } from '../map/MapCanvasHost';
import { measuredFocusViewport, type FocusViewport } from '../map/hudFocus';
import { MapHoverTooltip } from '../map/MapHoverTooltip';
import type { MapHoverTarget } from '../map/mapHoverContent';
import { useReducedMotion } from '../motion/MotionContext';
import { WORLD_SIZE } from '../map/mapViewConfig';
import { buildTerrainPack } from '../map/terrain/terrainPack';
import { uiStore, useUIStore, type MarchDraft, type ModalInstance } from '../hooks/uiStore';
import { CastlePanel } from './panels/CastlePanel';
import { DistrictPanel } from './panels/DistrictPanel';
import { OfficerList } from './OfficerList';
import { RealmNavigator } from './RealmNavigator';
import { RewardRoster } from './RewardRoster';
import { OfficerDetail } from './OfficerDetail';
import { PolicyPanel } from './panels/PolicyPanel';
import { TaimeiPanel } from './TaimeiPanel';
import { ReportsPanel } from './ReportsPanel';
import { getTaimeiDef } from '@core/index';
import { CorpsScreen } from './CorpsScreen';
import type { ArmyId, CastleId, DistrictId, OfficerId } from '@core/state/ids';
import type { GameState } from '@core/state/gameState';
import {
  ContextPanel,
  IconButton,
  ReportStack,
  ResourceBar,
  SpeedControl,
  StatBar,
  Tooltip,
  type ResourceDelta,
  type ToastItem,
} from '../components';
import { MiniMap, type MiniMapViewport } from '../components/MiniMap';
import { miniMapLayout } from '../components/miniMapLayout';
import { LayerControl } from '../components/LayerControl';
import { armyWorldPos } from '../map/dirty';
import { Icon } from '../components/IconButton/icons';
import { KamonIcon } from '../components/KamonIcon';
import { clanKamonSpec, clanShortName } from '../reports/clanKamon';
import styles from './MainScreen.module.css';
import { UI } from '../uiConstants';
import { cameraToViewport } from '../hud/cameraToViewport';
import { selectPlayerMilitary } from '../hud/selectPlayerMilitary';
import { MarchModal } from './MarchModal';
import { createMarchDraft } from './marchDraft';
import { SiegeOverlay } from './SiegeOverlay';
import { renderReport } from '../reports/renderReport';
import { REPORT_CATEGORIES } from '../reports/reportCenter';
import { MonthSummaryModal } from './MonthSummaryModal';
import {
  monthSummaryStore,
  getMonthSummaryView,
  continueMonthSummary,
  openMonthSummaryRewards,
  openMonthSummaryToastRewards,
  dismissMonthSummaryToast,
} from '@app/monthSummaryFlow';
import { DiplomacyPanel } from './DiplomacyPanel';
import { PlotPanel } from './PlotPanel';
import { RecruitPanel } from './RecruitPanel';
import { CaptiveModal } from './CaptiveModal';
import { EnvoyModal } from './EnvoyModal';
import { ProposalInbox } from './ProposalInbox';
import { useM6Dialogs } from '../hooks/useM6Dialogs';
import { useKassenOffers } from '../hooks/useKassenOffers';
import { BattlePrompt } from './BattlePrompt';
import { ArmyAutoReturnControl } from '../army/ArmyAutoReturnControl';
import { requestArmyAutoReturn, selectArmyAutoReturn } from '../army/autoReturn';
import { ArmyOrdersControl } from '../army/ArmyOrdersControl';
import { ArmyTargetModal } from '../army/ArmyTargetModal';
import {
  getArmyTargetPreviews,
  requestArmyRecall,
  requestArmyTarget,
  selectArmyOrders,
} from '../army/orders';
import { useM6View } from '../hooks/useM6View';
import type { ProposalId } from '@core/state/ids';
import { useStore } from 'zustand';

// [M6-V4] Layer 1（producer 參考穩定）：同一 tickSeq 內重複呼叫回傳同一參考（比照下方
// `selectReportToasts` 既有慣例）。
const cachedSelectMapViewModel = makeCachedSelector(selectMapViewModel);
let realmRequest = 0;
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
    const title = renderReport(report.event, game, game.meta.playerClanId, {
      eventTitle: (id) => getSessionEventEngine()?.getDef(id)?.cutscene.title,
    });
    if (title === null) return [];
    const severity = severityOf(report.event, game.meta.playerClanId);
    return [
      {
        id: report.id,
        severity,
        category: REPORT_CATEGORIES[report.event.type],
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
interface ArmyTargetOwner {
  game: GameState;
  armyId: ArmyId;
  token: string;
}

export function MainScreen({
  autosaveSuspended = false,
  appToasts = [],
  onDismissAppToast,
}: {
  autosaveSuspended?: boolean;
  appToasts?: ToastItem[];
  onDismissAppToast?: ((id: string) => void) | undefined;
} = {}): ReactElement {
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const day = useGameSelector((g) => g.time.day);
  const gold = useGameSelector((g) => g.clans[g.meta.playerClanId]?.gold ?? 0);
  const prestige = useGameSelector((g) => g.clans[g.meta.playerClanId]?.prestige ?? 0);
  const activeTaimei = useGameSelector((g) => {
    const state = g.clans[g.meta.playerClanId]?.taimei;
    const def = state?.activeTaimeiId ? getTaimeiDef(state.activeTaimeiId) : undefined;
    return def && state && state.activeUntilDay >= g.time.day
      ? t('ui.hud.taimeiActive', {
          name: def.name,
          days: Math.max(0, state.activeUntilDay - g.time.day),
        })
      : null;
  });
  const clanColorIndex = useGameSelector((g) => g.clans[g.meta.playerClanId]?.colorIndex ?? 0);
  const playerKamon = useGameSelector((g) => clanKamonSpec(g, g.meta.playerClanId));
  const clanName = useGameSelector((g) => g.clans[g.meta.playerClanId]?.name ?? '');
  const homeCastleId = useGameSelector((g) => g.clans[g.meta.playerClanId]?.homeCastleId);
  const budget = useCachedGameSelector(cachedSelectBudget);
  const military = useCachedGameSelector(cachedSelectPlayerMilitary);
  const speed = useSession((s) => s.speed);
  const panelStack = useUIStore((s) => s.panelStack);
  const modal = useUIStore((s) => s.modal);
  const marchDraft = useUIStore((s) => s.marchDraft);
  const [marchNavigation, setMarchNavigation] = useState<{
    game: NonNullable<typeof currentGame>;
    modal: ModalInstance;
    draft: MarchDraft;
  } | null>(null);
  const selection = useUIStore((s) => s.selection);
  const mapCamera = useUIStore((s) => s.mapCamera);
  const analysisMode = useUIStore((s) => s.analysisMode);
  const analysisOpacity = useUIStore((s) => s.analysisOpacity);
  const mapLabelDensity = useUIStore((s) => s.mapLabelDensity);
  const effectsEnabled = useUIStore((s) => s.effectsEnabled);
  const reducedMotion = useReducedMotion();
  const notificationFilter = useUIStore((s) => s.notificationFilter);
  const uiActions = useUIStore((s) => s.actions);
  const topPanel = panelStack.at(-1);
  const reportToasts = useCachedGameSelector(selectReportToasts);
  const [dismissedReports, setDismissedReports] = useState<readonly string[]>([]);
  const gameSession = useStore(store, (state) => state.game);
  const tickSeq = useStore(store, (state) => state.tickSeq);
  const viewportBlocked = useSession((s) => s.viewportBlocked);
  const [mapHover, setMapHover] = useState<MapHoverTarget | null>(null);
  const hoverFrame = useRef<number | null>(null);
  const hoverPending = useRef<MapHoverTarget | null>(null);
  const clearMapHover = useCallback(() => {
    if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    hoverFrame.current = null;
    hoverPending.current = null;
    setMapHover(null);
  }, []);
  useLayoutEffect(() => {
    clearMapHover();
    return () => {
      if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
    };
  }, [gameSession, modal, marchDraft, viewportBlocked, clearMapHover]);
  const armyTargetOwnerId = useId();
  const armyTargetSequence = useRef(0);
  const armySelectionFocus = useRef<{
    game: GameState;
    army: Readonly<GameState['armies'][ArmyId]>;
  } | null>(null);
  const armyContextRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const owner = armySelectionFocus.current;
    if (owner === null) return;
    armySelectionFocus.current = null;
    const current = store.getState();
    const ui = uiStore.getState();
    const context = armyContextRef.current;
    if (
      current.game !== owner.game ||
      current.game.armies[owner.army.id] !== owner.army ||
      ui.selection?.kind !== 'army' ||
      ui.selection.id !== owner.army.id ||
      ui.modal !== null ||
      current.session.viewportBlocked ||
      context === null ||
      document.querySelector('[data-ui-dialog]') !== null
    )
      return;
    const retarget = context.querySelector<HTMLButtonElement>(
      '[data-testid="army-retarget"]:not(:disabled)',
    );
    (retarget ?? context).focus();
  }, [selection, gameSession]);
  const [armyTargetSession, setArmyTargetSession] = useState<ArmyTargetOwner | null>(null);
  const [armyOrderFeedback, setArmyOrderFeedback] = useState<{
    game: GameState;
    armyId: ArmyId;
    text: string;
  } | null>(null);
  const targetOwner = armyTargetSession?.game === gameSession ? armyTargetSession : null;
  const targetModalOwned =
    modal?.id === 'confirm' &&
    modal.params.owner === 'armyTarget' &&
    modal.params.requestToken === armyTargetSession?.token;
  const targetView =
    targetModalOwned && targetOwner
      ? selectArmyOrders(
          targetOwner.game,
          targetOwner.armyId,
          getQueuedPlayerCommands(targetOwner.game),
        )
      : null;
  const closeArmyTarget = useCallback(
    (owner: ArmyTargetOwner) => {
      if (store.getState().game !== owner.game) return;
      const current = uiStore.getState().modal;
      if (
        current?.id !== 'confirm' ||
        current.params.owner !== 'armyTarget' ||
        current.params.requestToken !== owner.token ||
        current.params.armyId !== owner.armyId
      )
        return;
      uiActions.closeModal();
      setArmyTargetSession((active) => (active?.token === owner.token ? null : active));
    },
    [uiActions],
  );
  useEffect(() => {
    const owner = armyTargetSession;
    if (!owner) return;
    const replaced = owner.game !== gameSession;
    if (!replaced && (!targetModalOwned || targetView)) return;
    const matches = (entry: typeof modal) =>
      entry?.id === 'confirm' &&
      entry.params.owner === 'armyTarget' &&
      entry.params.requestToken === owner.token;
    const current = uiStore.getState();
    uiStore.setState({
      modalQueue: current.modalQueue.filter((entry) => !matches(entry)),
      ...(replaced && matches(current.modal) ? { restoreSpeedOnQueueDrain: false } : {}),
    });
    if (matches(current.modal)) uiActions.closeModal();
    setArmyTargetSession((active) => (active?.token === owner.token ? null : active));
  }, [armyTargetSession, gameSession, targetModalOwned, targetView, modal, uiActions, tickSeq]);
  const monthly = useStore(monthSummaryStore);
  const monthlyView =
    modal?.id === 'monthSummary'
      ? getMonthSummaryView(gameSession, modal.params.summaryKey ?? '')
      : null;
  const monthlyToast = monthly.game === gameSession ? monthly.toast : null;
  const [dismissedAutosaveSession, setDismissedAutosaveSession] =
    useState<typeof gameSession>(null);
  const [autosaveToastGeneration, setAutosaveToastGeneration] = useState(0);
  const autosaveToastId = `app-autosave-failed:${autosaveToastGeneration}`;
  useEffect(() => {
    setDismissedAutosaveSession(null);
    // Remount the toast so an old exit timer cannot dismiss a newer session's warning.
    setAutosaveToastGeneration((current) => current + 1);
  }, [autosaveSuspended, gameSession]);
  const mapHandleRef = useRef<MapHandle>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [focusViewport, setFocusViewport] = useState<FocusViewport | null>(null);
  const [screenOcclusions, setScreenOcclusions] = useState<readonly FocusViewport[]>([]);
  const [siegeDock, setSiegeDock] = useState<{
    left: number;
    top: number;
    maxHeight: number;
    maxWidth: number;
  } | null>(null);
  const measureFocus = useRef<() => FocusViewport | null>(() => null);
  const pendingFocusFrame = useRef<number | null>(null);
  const pendingFocusCleanup = useRef<(() => void) | null>(null);
  useLayoutEffect(
    () => () => {
      if (pendingFocusFrame.current !== null) cancelAnimationFrame(pendingFocusFrame.current);
      pendingFocusFrame.current = null;
      pendingFocusCleanup.current?.();
      pendingFocusCleanup.current = null;
    },
    [gameSession],
  );
  const focusMap = (target: { nodeId: string } | { x: number; y: number }) => {
    const expectedGame = store.getState().game;
    const expectedUi = uiStore.getState();
    const expectedModal = expectedUi.modal;
    const expectedDraft = expectedUi.marchDraft;
    const picking =
      !('nodeId' in target) &&
      expectedModal?.id === 'march' &&
      expectedDraft?.phase === 'pickTarget';
    if (pendingFocusFrame.current !== null) cancelAnimationFrame(pendingFocusFrame.current);
    pendingFocusCleanup.current?.();
    pendingFocusCleanup.current = null;
    let revoked = false;
    const owns = () => {
      const state = store.getState();
      const ui = uiStore.getState();
      return (
        !revoked &&
        mounted.current &&
        expectedGame !== null &&
        state.game === expectedGame &&
        state.session.screen === 'main' &&
        !state.session.viewportBlocked &&
        !state.session.fatalError &&
        (picking
          ? ui.modal === expectedModal &&
            ui.marchDraft === expectedDraft &&
            ui.marchDraft?.phase === 'pickTarget'
          : ui.modal === null)
      );
    };
    const revoke = () => {
      if (owns()) return;
      revoked = true;
      if (pendingFocusFrame.current !== null) cancelAnimationFrame(pendingFocusFrame.current);
      pendingFocusFrame.current = null;
      pendingFocusCleanup.current?.();
      pendingFocusCleanup.current = null;
    };
    if (picking) {
      const stopUi = uiStore.subscribe(revoke);
      const stopGame = store.subscribe(revoke);
      pendingFocusCleanup.current = () => {
        stopUi();
        stopGame();
      };
    }
    pendingFocusFrame.current = requestAnimationFrame(() => {
      pendingFocusFrame.current = null;
      pendingFocusCleanup.current?.();
      pendingFocusCleanup.current = null;
      if (!owns() || document.querySelector('[data-ui-dialog], dialog[open]')) return;
      const freshViewport = measureFocus.current();
      if ('nodeId' in target) mapHandleRef.current?.focusNode(target.nodeId, freshViewport);
      else mapHandleRef.current?.panToWorld(target.x, target.y, freshViewport);
    });
  };

  const [miniMapVisible, setMiniMapVisible] = useState(true);
  useM6Dialogs();
  const kassen = useKassenOffers();
  const m6 = useM6View();
  const pendingCommands = useStore(store, (state) => state.session.pendingCommandCount);

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
  const gameView = useMapGameSelector(cachedSelectMapViewModel);
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
  const soldiersByCastle = useMapGameSelector(cachedSelectSoldiersByCastle);
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
    (originCastleId: CastleId, selectedOfficerIds: readonly OfficerId[] = []): void => {
      const current = store.getState();
      const panel = uiStore.getState().panelStack.at(-1);
      const game = current.game;
      const available = () => {
        const fresh = store.getState();
        const ui = uiStore.getState();
        return (
          mounted.current &&
          game !== null &&
          fresh.game === game &&
          game === gameSession &&
          fresh.session.screen === 'main' &&
          fresh.session.fatalError === null &&
          !fresh.session.viewportBlocked &&
          game.meta.gameOver === null &&
          ui.modal === null &&
          ui.panelStack.at(-1) === panel &&
          document.querySelector('[data-ui-dialog]') === null
        );
      };
      if (!available() || game === null) return;
      const draft = createMarchDraft(game, originCastleId, selectedOfficerIds);
      if (draft === null) return;
      uiActions.setMarchDraft(draft);
      // Store subscribers can replace the session or open a dialog synchronously.
      const freshDraft = createMarchDraft(game, originCastleId, selectedOfficerIds);
      if (
        !available() ||
        uiStore.getState().marchDraft !== draft ||
        freshDraft === null ||
        freshDraft.soldiers !== draft.soldiers ||
        freshDraft.food !== draft.food
      ) {
        if (uiStore.getState().marchDraft === draft) uiActions.setMarchDraft(null);
        return;
      }
      uiActions.enqueueModal({
        id: 'march',
        params: { castleId: originCastleId },
        pausesTime: false,
      });
    },
    [gameSession, uiActions],
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

  const marchTargetNavigation = useMemo(
    () =>
      marchNavigation === null
        ? null
        : {
            draft: marchNavigation.draft,
            onClose: () =>
              setMarchNavigation((current) => (current === marchNavigation ? null : current)),
            onPick: (id: string) => {
              const current = store.getState();
              const ui = uiStore.getState();
              if (
                current.game !== marchNavigation.game ||
                ui.modal !== marchNavigation.modal ||
                ui.marchDraft !== marchNavigation.draft
              )
                return;
              setMarchNavigation((owned) => (owned === marchNavigation ? null : owned));
              previewMarchTarget(id, false);
            },
          },
    [marchNavigation, previewMarchTarget],
  );
  // 地圖點擊/懸停事件。[M6-V9] §4.6（評審 A B1）：點城/郡只 `setSelection`（開底部 ContextPanel
  // 快覽條），不再 `openPanel`——完整面板改由快覽條動作鈕與左欄開啟，消除雙開。
  const handleMapEvent = useCallback(
    (event: MapRendererEvent): void => {
      const activeDraft = uiStore.getState().marchDraft;
      if (event.type === 'nodeHover' || event.type === 'armyHover') {
        if (
          store.getState().game !== gameSession ||
          gameSession === null ||
          uiStore.getState().modal !== null ||
          activeDraft !== null ||
          store.getState().session.viewportBlocked
        ) {
          clearMapHover();
        } else if (event.id === null || (event.type === 'nodeHover' && event.nodeKind === null)) {
          clearMapHover();
        } else {
          const next: MapHoverTarget = {
            game: gameSession,
            kind: event.type === 'armyHover' ? 'army' : event.nodeKind!,
            id: event.id,
            screenX: event.screenX,
            screenY: event.screenY,
          };
          const old = hoverPending.current;
          hoverPending.current = next;
          if (old?.game !== next.game || old.kind !== next.kind || old.id !== next.id) {
            if (hoverFrame.current !== null) cancelAnimationFrame(hoverFrame.current);
            hoverFrame.current = null;
            setMapHover(next);
          } else if (hoverFrame.current === null) {
            hoverFrame.current = requestAnimationFrame(() => {
              hoverFrame.current = null;
              const pending = hoverPending.current;
              if (
                pending?.game !== store.getState().game ||
                uiStore.getState().modal !== null ||
                uiStore.getState().marchDraft !== null ||
                store.getState().session.viewportBlocked
              )
                clearMapHover();
              else setMapHover(pending);
            });
          }
        }
      } else {
        clearMapHover();
      }
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
    [previewMarchTarget, uiActions, gameSession, clearMapHover],
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
    return home?.ownerClanId === currentGame.meta.playerClanId &&
      home.directControl &&
      home.corpsId === null
      ? home.id
      : null;
  })();
  const focusHome = (): void => {
    const game = store.getState().game;
    const homeId = game?.clans[game.meta.playerClanId]?.homeCastleId;
    if (
      game === null ||
      game !== currentGame ||
      homeId === undefined ||
      game.castles[homeId]?.ownerClanId !== game.meta.playerClanId ||
      store.getState().session.viewportBlocked ||
      uiStore.getState().modal !== null
    )
      return;
    uiActions.setSelection({ kind: 'castle', id: homeId });
    focusMap({ nodeId: homeId });
  };
  const canFocusHome =
    currentGame !== null &&
    homeCastleId !== undefined &&
    currentGame.castles[homeCastleId]?.ownerClanId === currentGame.meta.playerClanId;
  const openDomestic = (): void => {
    const current = store.getState();
    const ui = uiStore.getState();
    const game = current.game;
    if (
      !mounted.current ||
      game === null ||
      game !== currentGame ||
      current.session.screen !== 'main' ||
      current.session.fatalError !== null ||
      current.session.viewportBlocked ||
      ui.modal !== null ||
      document.querySelector('[data-ui-dialog]') !== null
    )
      return;
    const chosen =
      ui.selection?.kind === 'castle' ? game.castles[ui.selection.id as CastleId] : undefined;
    const castleId =
      chosen?.ownerClanId === game.meta.playerClanId
        ? chosen.id
        : game.clans[game.meta.playerClanId]?.homeCastleId;
    if (castleId !== undefined && game.castles[castleId]?.ownerClanId === game.meta.playerClanId)
      ui.actions.openPanel('castle', { castleId, tab: 'domestic' });
  };
  useHotkeys(gameLoop, toggleDebugPanel, {
    openDomestic,
    openMarch: () => {
      if (marchOriginId !== null) openMarch(marchOriginId);
    },
    focusHome,
    toggleMiniMap: () => setMiniMapVisible((value) => !value),
    pan: (x, y) => mapHandleRef.current?.panByKeyboard(x, y),
    zoom: (direction) => mapHandleRef.current?.zoomByKeyboard(direction),
  });
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
            <button
              type="button"
              data-testid="context-transport"
              disabled={castle.ownerClanId !== currentGame.meta.playerClanId}
              title={
                castle.ownerClanId !== currentGame.meta.playerClanId
                  ? t('ui.context.transport.locked')
                  : undefined
              }
              onClick={() =>
                castle.ownerClanId === currentGame.meta.playerClanId &&
                uiActions.openPanel('castle', { castleId: castle.id, tab: 'transport' })
              }
            >
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
          <div data-testid="district-context-facts">
            <p style={{ margin: 0 }}>
              {t('ui.district.kokudaka')} {formatNumber(district.kokudaka)}
              {t('term.unit.koku')}
              {'　'}
              {t('ui.district.commerce')} {formatNumber(district.commerce)}
              {'　'}
              {t('ui.district.population')} {formatNumber(district.population)}
              {t('term.unit.people')}
            </p>
            <StatBar label={t('ui.district.security')} value={district.publicOrder} max={100} />
            <p style={{ margin: 0 }}>
              {t('ui.district.steward')}：
              <span>
                {district.stewardId === null
                  ? t('ui.district.direct')
                  : (currentGame.officers[district.stewardId]?.name ?? district.stewardId)}
              </span>
              {'　'}
              {t('ui.district.devPolicy')}：
              <span>{t(`term.devPolicy.${district.developFocus}`)}</span>
            </p>
          </div>
        ),
      };
    }
    const army = currentGame.armies[selection.id as never];
    if (army === undefined) return null;
    const autoReturn = selectArmyAutoReturn(
      currentGame,
      army.id,
      getQueuedPlayerCommands(currentGame),
    );
    const orders = selectArmyOrders(currentGame, army.id, getQueuedPlayerCommands(currentGame));
    const manualKassen = kassen.manualEntry(army.id);
    const leaderName = currentGame.officers[army.leaderId]?.name ?? '';
    const supplyDays = Math.floor(armyFoodDays(currentGame, army));
    const targetName =
      army.targetNodeId === null
        ? null
        : (currentGame.castles[army.targetNodeId as never]?.name ??
          currentGame.districts[army.targetNodeId as never]?.name ??
          null);
    return {
      title: leaderName,
      actions:
        autoReturn === null ? null : (
          <div
            ref={armyContextRef}
            tabIndex={-1}
            role="group"
            aria-label={leaderName}
            data-testid="army-context-controls"
          >
            <ArmyAutoReturnControl
              view={autoReturn}
              onToggle={(enabled) => {
                requestArmyAutoReturn(currentGame, army.id, enabled, {
                  getGame: () => store.getState().game,
                  getPendingCommands: () => getQueuedPlayerCommands(currentGame),
                  dispatch: dispatchCommand,
                });
              }}
            />
            {orders && (
              <ArmyOrdersControl
                view={orders}
                feedback={
                  armyOrderFeedback?.game === currentGame && armyOrderFeedback.armyId === army.id
                    ? armyOrderFeedback.text
                    : null
                }
                onRetarget={() => {
                  if (store.getState().game !== currentGame) return;
                  const fresh = selectArmyOrders(
                    currentGame,
                    army.id,
                    getQueuedPlayerCommands(currentGame),
                  );
                  if (!fresh?.canRetarget) return;
                  const currentUi = uiStore.getState();
                  if (
                    [currentUi.modal, ...currentUi.modalQueue].some(
                      (entry) => entry?.id === 'confirm' && entry.params.owner === 'armyTarget',
                    )
                  )
                    return;
                  const owner = {
                    game: currentGame,
                    armyId: army.id,
                    token: `${armyTargetOwnerId}-${++armyTargetSequence.current}`,
                  };
                  setArmyTargetSession(owner);
                  setArmyOrderFeedback(null);
                  uiActions.enqueueModal({
                    id: 'confirm',
                    params: { owner: 'armyTarget', armyId: army.id, requestToken: owner.token },
                    pausesTime: true,
                  });
                }}
                onRecall={() => {
                  const result = requestArmyRecall(currentGame, army.id, {
                    getGame: () => store.getState().game,
                    getPendingCommands: () => getQueuedPlayerCommands(currentGame),
                    dispatch: dispatchCommand,
                  });
                  if (result.status === 'rejected')
                    setArmyOrderFeedback({
                      game: currentGame,
                      armyId: army.id,
                      text: t(result.reason, { name: army.id, ...result.params }),
                    });
                  else if (result.status === 'stale' || result.status === 'unavailable')
                    setArmyOrderFeedback({
                      game: currentGame,
                      armyId: army.id,
                      text: t('ui.army.orderStale'),
                    });
                  else setArmyOrderFeedback(null);
                }}
              />
            )}
            {manualKassen && (
              <button
                type="button"
                data-testid="army-kassen-offer"
                disabled={manualKassen.queued}
                onClick={() => kassen.openOffer(manualKassen.fieldCombatId)}
              >
                {t('ui.battle.offer.open')}
              </button>
            )}
          </div>
        ),
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

  useLayoutEffect(() => {
    const root = screenRef.current;
    if (!root) return;
    let disposed = false;
    let frame: number | null = null;
    const observed = new Set<Element>();
    const resize =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => schedule());
    const measure = () => {
      if (disposed) return null;
      const canvas =
        root.querySelector('[data-testid="map-canvas-host"] canvas') ??
        root.querySelector('[data-testid="map-canvas-host"]');
      if (!canvas) return null;
      const header = root.querySelector(':scope > header');
      const legend = root.querySelector('[data-testid="layer-control"]');
      const rail = root.querySelector(':scope > nav');
      const context = root.querySelector(':scope > div[aria-hidden="false"]');
      const minimap = root.querySelector('[data-testid="minimap"]');
      const siege = root.querySelector('[data-testid="siege-overlay"]');
      const reports = root.querySelector(':scope > section[aria-live="polite"]');
      const reportParts =
        reports && !reports.hasAttribute('hidden')
          ? [...reports.children].filter((child) => !child.hasAttribute('hidden'))
          : [];
      const elements = [
        canvas,
        header,
        legend,
        rail,
        context,
        minimap,
        siege,
        ...reportParts,
      ].filter((element): element is Element => element !== null);
      for (const element of observed)
        if (!elements.includes(element)) {
          resize?.unobserve(element);
          observed.delete(element);
        }
      for (const element of elements)
        if (!observed.has(element)) {
          resize?.observe(element);
          observed.add(element);
        }
      const tops = [header, legend]
        .filter((element): element is Element => element !== null)
        .map((element) => element.getBoundingClientRect())
        .filter((rect) => rect.width > 0 && rect.height > 0);
      const top = tops.length
        ? {
            left: Math.min(...tops.map((rect) => rect.left)),
            top: Math.min(...tops.map((rect) => rect.top)),
            width:
              Math.max(...tops.map((rect) => rect.right)) -
              Math.min(...tops.map((rect) => rect.left)),
            height:
              Math.max(...tops.map((rect) => rect.bottom)) -
              Math.min(...tops.map((rect) => rect.top)),
          }
        : undefined;
      let contextBounds = context?.getBoundingClientRect();
      if (context && contextBounds) {
        const transform = getComputedStyle(context).transform;
        const matrix = /^matrix(3d)?\(([^)]+)\)$/.exec(transform);
        if (matrix) {
          const values = matrix[2]!.split(',').map(Number);
          const x = values[matrix[1] ? 12 : 4];
          const y = values[matrix[1] ? 13 : 5];
          if (
            values.length === (matrix[1] ? 16 : 6) &&
            values.every(Number.isFinite) &&
            x !== undefined &&
            y !== undefined
          ) {
            contextBounds = new DOMRect(
              contextBounds.left - x,
              contextBounds.top - y,
              contextBounds.width,
              contextBounds.height,
            );
          }
        }
      }
      const canvasBounds = canvas.getBoundingClientRect();
      const occlusions = [header, legend, rail, context, minimap, siege, ...reportParts]
        .filter((element): element is Element => element !== null)
        .map((element) => element.getBoundingClientRect())
        .filter(
          (rect) =>
            [rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) &&
            rect.width > 0 &&
            rect.height > 0,
        )
        .map((rect) => ({
          x: rect.left - canvasBounds.left,
          y: rect.top - canvasBounds.top,
          width: rect.width,
          height: rect.height,
        }));
      setScreenOcclusions((previous) =>
        previous.length === occlusions.length &&
        previous.every((rect, index) => {
          const next = occlusions[index]!;
          return (
            rect.x === next.x &&
            rect.y === next.y &&
            rect.width === next.width &&
            rect.height === next.height
          );
        })
          ? previous
          : occlusions,
      );
      let leftBounds = rail?.getBoundingClientRect();
      if (siege) {
        const dock = {
          left: (leftBounds && leftBounds.width > 0 ? leftBounds.right : canvasBounds.left) + 12,
          top: (top ? top.top + top.height : canvasBounds.top) + 12,
          maxHeight: 0,
          maxWidth: 0,
        };
        dock.maxHeight = Math.max(
          0,
          (contextBounds && contextBounds.height > 0 ? contextBounds.top : canvasBounds.bottom) -
            dock.top -
            12,
        );
        dock.maxWidth = Math.max(0, Math.min(280, canvasBounds.right - dock.left - 12));
        setSiegeDock((previous) =>
          previous?.left === dock.left &&
          previous?.top === dock.top &&
          previous?.maxHeight === dock.maxHeight &&
          previous?.maxWidth === dock.maxWidth
            ? previous
            : dock,
        );
        const actual = siege.getBoundingClientRect();
        if (actual.width > 0 && actual.height > 0) {
          const right = Math.max(
            leftBounds?.right ?? dock.left,
            dock.left + Math.min(actual.width, dock.maxWidth),
          );
          const left = leftBounds?.left ?? dock.left;
          leftBounds = new DOMRect(
            left,
            dock.top,
            right - left,
            Math.min(actual.height, dock.maxHeight),
          );
        }
      } else setSiegeDock((previous) => (previous === null ? previous : null));
      const next = measuredFocusViewport(canvasBounds, {
        top,
        left: leftBounds,
        bottom: contextBounds,
        right: [minimap, ...reportParts]
          .filter((element): element is Element => element !== null)
          .map((element) => element.getBoundingClientRect()),
      });
      setFocusViewport((previous) =>
        previous?.x === next?.x &&
        previous?.y === next?.y &&
        previous?.width === next?.width &&
        previous?.height === next?.height
          ? previous
          : next,
      );
      return next;
    };
    function schedule() {
      if (disposed || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        measure();
      });
    }
    measureFocus.current = measure;
    measure();
    const mutation = new MutationObserver(schedule);
    mutation.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
    });
    window.addEventListener('resize', schedule);
    root.addEventListener('toggle', schedule, true);
    root.addEventListener('transitionend', schedule);
    return () => {
      disposed = true;
      if (frame !== null) cancelAnimationFrame(frame);
      resize?.disconnect();
      mutation.disconnect();
      observed.clear();
      window.removeEventListener('resize', schedule);
      root.removeEventListener('toggle', schedule, true);
      root.removeEventListener('transitionend', schedule);
      measureFocus.current = () => null;
    };
  }, []);

  return (
    <div ref={screenRef} data-testid="screen-strategy" className={styles.screen}>
      <MapCanvasHost
        ref={mapHandleRef}
        onMapEvent={handleMapEvent}
        staticData={staticData}
        viewState={viewState}
        focusNodeId={homeCastleId}
        focusViewport={focusViewport}
        screenOcclusions={screenOcclusions}
        pathPreview={marchDraft?.previewPath}
        interactionMode={marchDraft?.phase === 'pickTarget' ? 'orderMarch' : 'idle'}
        marchTargetId={marchDraft?.phase === 'pickTarget' ? marchDraft.targetNodeId : null}
        analysisMode={analysisMode}
        analysisOpacity={analysisOpacity}
        mapLabelDensity={mapLabelDensity}
        effectsEnabled={effectsEnabled}
        reducedMotion={reducedMotion}
      />
      <LayerControl />
      <MapHoverTooltip target={mapHover} onDismiss={clearMapHover} />
      {/* 資源獨立捲動；速度、待執行狀態與系統入口固定在同層命令區。 */}
      <header className={styles.hud}>
        <div
          className={styles.resourceViewport}
          data-testid="hud-resources"
          role="group"
          aria-label={['ui.hud.gold', 'ui.hud.food', 'ui.hud.soldiers', 'ui.hud.prestige']
            .map((key) => t(key))
            .join('、')}
          tabIndex={0}
          onKeyDown={(event) => {
            if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
              event.stopPropagation();
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
            foodMonthsLeft={budget.foodMonthsLeft}
            soldiersTotal={military.total}
            soldiersCap={military.cap}
            prestige={prestige}
          />
        </div>
        <div className={styles.commandBar} data-testid="hud-commands">
          {activeTaimei && (
            <Tooltip content={activeTaimei}>
              <button
                type="button"
                data-testid="hud-taimei-active"
                aria-label={activeTaimei}
                onClick={() => uiActions.openPanel('taimei')}
              >
                <Icon name="crown" />
              </button>
            </Tooltip>
          )}
          <SpeedControl
            speed={speed}
            disabled={modal !== null}
            onChange={(next) => gameLoop.setSpeed(next)}
          />
          {pendingCommands > 0 && (
            <span
              role="status"
              title={t('ui.command.pending', { count: pendingCommands })}
              aria-label={t('ui.command.pending', { count: pendingCommands })}
            >
              {t('ui.command.pending', { count: pendingCommands })}
            </span>
          )}
          {autosaveSuspended && (
            <Tooltip content={t('ui.hud.autosaveSuspendedTip')}>
              <span
                data-testid="hud-autosave-suspended"
                role="img"
                aria-label={t('ui.hud.autosaveSuspendedTip')}
                tabIndex={0}
                style={{ display: 'inline-flex', color: 'var(--status-danger)' }}
              >
                <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 3 22 21H2Z" fill="none" stroke="currentColor" strokeWidth="2" />
                  <path d="M12 8v6" stroke="currentColor" strokeWidth="2" />
                  <circle cx="12" cy="18" r="1" fill="currentColor" />
                </svg>
              </span>
            </Tooltip>
          )}
          {/* 系統互動沿用 modal 的暫停所有權；設定子頁不提前恢復時間。 */}
          <IconButton
            icon="gear"
            ariaLabel={t('ui.system.menu')}
            onClick={() => {
              if (uiStore.getState().modal !== null) return;
              uiActions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
            }}
          />
        </div>
      </header>
      {/* 左欄：家紋、地圖入口與三組命令；順序、操作及 testid 契約保留。 */}
      <nav aria-label={t('ui.domestic.title')} className={styles.rail}>
        <button
          type="button"
          className={styles.realmEntry}
          aria-label={t('ui.realm.title')}
          aria-pressed={false}
          aria-disabled={false}
          data-testid="rail-realm"
          onClick={() => {
            const current = store.getState();
            const ui = uiStore.getState();
            if (
              !mounted.current ||
              current.game === null ||
              current.game !== currentGame ||
              current.session.screen !== 'main' ||
              current.session.fatalError ||
              current.session.viewportBlocked ||
              (ui.modal !== null &&
                !(ui.modal.id === 'march' && ui.marchDraft?.phase === 'pickTarget')) ||
              document.querySelector('[data-ui-dialog]') !== null
            )
              return;
            if (ui.modal?.id === 'march' && ui.marchDraft?.phase === 'pickTarget') {
              setMarchNavigation({ game: current.game, modal: ui.modal, draft: ui.marchDraft });
              return;
            }
            ui.actions.enqueueModal({
              id: 'realmNavigator',
              params: { token: String(++realmRequest) },
              pausesTime: false,
            });
          }}
        >
          <Icon name="search" width={42} height={42} />
          <span className={styles.realmLabel} data-testid="rail-realm-label" aria-hidden="true">
            <span>{t('ui.realm.title').slice(0, 2)}</span>
            <span>{t('ui.realm.title').slice(2)}</span>
          </span>
        </button>
        <button
          type="button"
          data-testid="rail-home"
          aria-label={`${clanName} ${t('ui.castle.mainSuffix')}`}
          disabled={!canFocusHome}
          onClick={focusHome}
          className={styles.crest}
        >
          {playerKamon && <KamonIcon spec={playerKamon} size={64} />}
          <span title={clanName} className={styles.clanName}>
            {clanShortName(clanName)}
          </span>
        </button>
        <div className={styles.railSeparator} data-rail-group="management" aria-hidden="true">
          <span className={styles.railGroupLabel}>{t('ui.rail.group.management')}</span>
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
          onClick={openDomestic}
        />
        <IconButton
          icon="people"
          ariaLabel={t('ui.rail.officers')}
          size="lg"
          testId="rail-officers"
          toggled={topPanel?.id === 'officers'}
          onClick={() => uiActions.openPanel('officers')}
        />
        <div className={styles.railSeparator} data-rail-group="relations" aria-hidden="true">
          <span className={styles.railGroupLabel}>{t('ui.rail.group.relations')}</span>
        </div>
        <IconButton
          icon="handshake"
          ariaLabel={t('ui.diplomacy.title')}
          size="lg"
          testId="rail-diplomacy"
          toggled={topPanel?.id === 'diplomacy'}
          onClick={() => uiActions.openPanel('diplomacy')}
        />
        <IconButton
          icon="search"
          ariaLabel={t('ui.plot.title')}
          size="lg"
          testId="rail-plot"
          toggled={topPanel?.id === 'plot'}
          onClick={() => uiActions.openPanel('plot')}
        />
        <div className={styles.railSeparator} data-rail-group="strategy" aria-hidden="true">
          <span className={styles.railGroupLabel}>{t('ui.rail.group.strategy')}</span>
        </div>
        <IconButton
          icon="scroll"
          ariaLabel={t('ui.rail.policy')}
          size="lg"
          testId="rail-policy"
          toggled={topPanel?.id === 'policy'}
          onClick={() => uiActions.openPanel('policy')}
        />
        <IconButton
          icon="flag"
          ariaLabel={t('ui.corps.title')}
          size="lg"
          testId="rail-corps"
          toggled={topPanel?.id === 'corps'}
          onClick={() => uiActions.openPanel('corps')}
        />
        <IconButton
          icon="crown"
          ariaLabel={t('ui.rail.taimei')}
          size="lg"
          testId="rail-taimei"
          toggled={topPanel?.id === 'taimei'}
          onClick={() => uiActions.openPanel('taimei')}
        />
      </nav>
      {topPanel?.id === 'castle' && topPanel.params.castleId && (
        <CastlePanel
          key={`${topPanel.params.castleId}-${topPanel.params.tab === 'domestic' ? 'domestic' : topPanel.params.tab === 'transport' ? 'transport' : 'overview'}`}
          castleId={topPanel.params.castleId as CastleId}
          onOpenMarch={(castleId, selectedOfficerIds) => {
            if (
              store.getState().game !== currentGame ||
              uiStore.getState().panelStack.at(-1) !== topPanel ||
              topPanel.params.castleId !== castleId
            )
              return;
            openMarch(castleId, selectedOfficerIds);
          }}
          onSelectArmy={(armyId, expectedArmy) => {
            const current = store.getState();
            const ui = uiStore.getState();
            const panel = ui.panelStack.at(-1);
            const army = current.game?.armies[armyId];
            if (
              current.game === null ||
              current.game !== currentGame ||
              army === undefined ||
              army !== expectedArmy ||
              army.clanId !== current.game.meta.playerClanId ||
              army.originCastleId !== topPanel.params.castleId ||
              panel?.id !== 'castle' ||
              panel.params.castleId !== army.originCastleId ||
              ui.modal !== null ||
              current.session.viewportBlocked ||
              document.querySelector('[data-ui-dialog]') !== null ||
              staticData === null
            )
              return;
            const projected = selectMapViewModel(current.game).armies.find(
              (candidate) => candidate.id === armyId,
            );
            if (projected === undefined || !staticData.graph.nodes.has(projected.fromNode)) return;
            const position = armyWorldPos(projected, staticData.graph);
            armySelectionFocus.current = { game: current.game, army };
            uiActions.closePanelById('castle');
            current.actions.select({ kind: 'army', id: armyId });
            uiActions.setSelection({ kind: 'army', id: armyId });
            focusMap(position);
          }}
          initialTab={
            topPanel.params.tab === 'domestic'
              ? 'domestic'
              : topPanel.params.tab === 'transport'
                ? 'transport'
                : 'overview'
          }
        />
      )}
      {topPanel?.id === 'district' && topPanel.params.districtId && (
        <DistrictPanel districtId={topPanel.params.districtId as DistrictId} />
      )}
      {topPanel?.id === 'officers' && <OfficerList />}
      {topPanel?.id === 'policy' && <PolicyPanel />}
      {topPanel?.id === 'corps' && <CorpsScreen />}
      {topPanel?.id === 'taimei' && <TaimeiPanel />}
      {topPanel?.id === 'reports' && (
        <ReportsPanel
          onGoto={(destination) => {
            focusMap({ x: destination.x, y: destination.y });
            uiActions.closePanelById('reports');
          }}
        />
      )}
      {topPanel?.id === 'diplomacy' && <DiplomacyPanel />}
      {topPanel?.id === 'plot' && <PlotPanel key={JSON.stringify(topPanel.params)} />}
      {topPanel?.id === 'ronin' && (
        <RecruitPanel
          key={topPanel.params.castleId ?? 'global'}
          {...(topPanel.params.castleId ? { castleId: topPanel.params.castleId as CastleId } : {})}
        />
      )}
      {topPanel?.id === 'officerDetail' && topPanel.params.officerId && (
        <OfficerDetail officerId={topPanel.params.officerId as OfficerId} />
      )}
      {modal?.id === 'march' && <MarchModal targetNavigationActive={marchNavigation !== null} />}
      {marchNavigation !== null &&
        marchTargetNavigation !== null &&
        modal === marchNavigation.modal &&
        currentGame === marchNavigation.game && (
          <RealmNavigator
            modal={marchNavigation.modal}
            onFocus={() => {}}
            target={marchTargetNavigation}
          />
        )}
      {modal?.id === 'realmNavigator' && (
        <RealmNavigator
          modal={modal}
          onFocus={(pos, expectedGame) => {
            if (store.getState().game !== expectedGame || uiStore.getState().modal !== modal)
              return;
            focusMap(pos);
          }}
        />
      )}
      <BattlePrompt
        offer={kassen.activeOffer}
        onAccept={kassen.acceptOffer}
        onDecline={kassen.declineOffer}
      />
      {targetModalOwned &&
        targetOwner &&
        targetView &&
        modal.params.armyId === targetOwner.armyId && (
          <ArmyTargetModal
            session={targetOwner.game}
            view={targetView}
            previews={getArmyTargetPreviews(
              targetOwner.game,
              targetOwner.armyId,
              getQueuedPlayerCommands(targetOwner.game),
            )}
            onClose={() => closeArmyTarget(targetOwner)}
            onSubmit={(targetNodeId) => {
              const current = uiStore.getState().modal;
              if (
                store.getState().game !== targetOwner.game ||
                current?.id !== 'confirm' ||
                current.params.owner !== 'armyTarget' ||
                current.params.requestToken !== targetOwner.token ||
                current.params.armyId !== targetOwner.armyId
              )
                return { status: 'stale' };
              return requestArmyTarget(targetOwner.game, targetOwner.armyId, targetNodeId, {
                getGame: () => store.getState().game,
                getPendingCommands: () => getQueuedPlayerCommands(targetOwner.game),
                dispatch: dispatchCommand,
              });
            }}
          />
        )}
      {modal?.id === 'envoy' && modal.params.proposalId && (
        <EnvoyModal
          key={modal.params.proposalId}
          proposalId={modal.params.proposalId as ProposalId}
        />
      )}
      {modal?.id === 'proposalInbox' && <ProposalInbox />}
      {modal?.id === 'monthSummary' && monthlyView !== null && (
        <MonthSummaryModal
          view={monthlyView}
          onContinue={() => continueMonthSummary(gameSession, monthlyView.key)}
          onRewards={() => openMonthSummaryRewards(gameSession, monthlyView.key)}
        />
      )}
      {modal?.id === 'captive' && modal.params.officerId && (
        <CaptiveModal officerId={modal.params.officerId as OfficerId} />
      )}
      {modal?.id === 'rewards' && (
        <RewardRoster
          key={modal.params.monthSummaryOwner ?? 'rewards'}
          onClose={() => {
            if (store.getState().game === gameSession && uiStore.getState().modal === modal)
              uiStore.getState().actions.closeModal();
          }}
        />
      )}
      {selectedSiegeId !== null && (
        <SiegeOverlay
          siegeId={selectedSiegeId}
          {...(siegeDock === null ? {} : { dock: siegeDock })}
        />
      )}
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
      {miniMapVisible && (
        <MiniMap
          size={minimapSize}
          viewport={minimapViewport}
          onNavigate={(x, y) => focusMap({ x, y })}
          {...(contextView !== null ? { bottomOffset: contextHeight + 12 } : {})}
        />
      )}
      <ReportStack
        hidden={topPanel?.id === 'reports'}
        bottomInset={
          miniMapVisible
            ? miniMapLayout(minimapSize, contextView !== null ? contextHeight + 12 : undefined)
                .reservedBottom
            : contextView !== null
              ? `${(contextHeight + 24) / 16}rem`
              : 'var(--space-3)'
        }
        {...(topPanel?.id === 'officers'
          ? {}
          : {
              onOpenReports: () => {
                if (
                  uiStore.getState().modal !== null ||
                  document.querySelector('[data-ui-dialog]') !== null
                )
                  return;
                uiActions.openPanel('reports');
              },
            })}
        items={[
          ...appToasts,
          ...(monthlyToast !== null
            ? [
                {
                  id: monthlyToast.key,
                  severity: 'info' as const,
                  title: t('ui.summary.title', {
                    year: String(monthlyToast.year),
                    month: String(monthlyToast.month),
                  }),
                  body:
                    monthlyToast.settlement === null
                      ? t('ui.summary.unavailable')
                      : t('ui.summary.toast', {
                          net: formatNumber(
                            monthlyToast.settlement.goldAfter - monthlyToast.settlement.goldBefore,
                          ),
                          food: formatNumber(monthlyToast.foodStock),
                        }),
                  date: monthlyToast.day,
                  onClick: () => openMonthSummaryToastRewards(gameSession, monthlyToast.key),
                },
              ]
            : []),
          ...(autosaveSuspended && dismissedAutosaveSession !== gameSession
            ? [
                {
                  id: autosaveToastId,
                  severity: 'critical' as const,
                  title: t('ui.save.autosaveFailed'),
                  date: day,
                  sticky: true,
                  dismissible: true,
                },
              ]
            : []),
          ...(m6.proposals.length > 0
            ? [
                {
                  id: 'proposal-inbox-unread',
                  severity: 'warning' as const,
                  title: t('ui.proposal.unread', { count: m6.proposals.length }),
                  date: day,
                  sticky: true,
                  dismissible: false,
                  onClick: () => {
                    const ui = uiStore.getState();
                    if (
                      ui.modal?.id !== 'proposalInbox' &&
                      !ui.modalQueue.some((item) => item.id === 'proposalInbox')
                    )
                      uiActions.enqueueModal({ id: 'proposalInbox', params: {}, pausesTime: true });
                  },
                },
              ]
            : []),
          ...reportToasts.filter(
            (item) =>
              !dismissedReports.includes(item.id) &&
              (notificationFilter === 'all' ||
                item.severity === 'critical' ||
                (notificationFilter === 'major' && item.severity === 'warning')),
          ),
        ]}
        onDismiss={(id) => {
          if (id.startsWith('month-summary:')) dismissMonthSummaryToast(gameSession, id);
          else if (id.startsWith('save-action:') || appToasts.some((item) => item.id === id))
            onDismissAppToast?.(id);
          else if (id === autosaveToastId) setDismissedAutosaveSession(gameSession);
          else if (!id.startsWith('app-autosave-failed:'))
            setDismissedReports((current) => [...current, id]);
        }}
      />
    </div>
  );
}
