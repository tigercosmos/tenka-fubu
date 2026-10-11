// 頂層元件：ErrorBoundary、畫面切換、DebugPanel 掛載（規格：plan/01-architecture.md §3.3／§3.6.2）。
// M1-20（畫面切換）／M1-22（除錯面板掛載＋debug flags）／M2-19（新遊戲精靈：ScenarioSelect→
// DaimyoSelect→MainScreen，18-roadmap M2-19）實作；ErrorBoundary 本體屬 M1-18，本檔依其檔頭
// 「攔截接線屬呼叫端（App.tsx）責任」完成 `onFatalError` 接線。
//
// 新遊戲精靈的「目前選定劇本」為畫面間過渡態（非 GameState、非 session 持久狀態），故以本元件的
// local state（`scenarioBundle`）承接，比照 11 §3.2 流程圖：標題→ScenarioSelect→DaimyoSelect→
// MainScreen（`session.screen` 僅記錄畫面 id，過渡資料留在呼叫端）。
// `?skipTitle=1` 維持 M1-20 既有行為（`src/app/newGame.ts` 之 tiny fixture 立即開局，供快速開發
// 迭代／未來 core-loop 相關 e2e 使用）——與本輪新增之「真實劇本」精靈流程（`title-newgame` 按鈕）
// 相互獨立，互不影響。

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { useStore } from 'zustand';
import { ErrorBoundary } from '../ui/components/ErrorBoundary';
import { MotionProvider } from '../ui/motion/MotionProvider';
import { ViewportProvider } from '../ui/viewport';
import { SystemMenuHost } from '../ui/screens/SystemMenuHost';
import { captureFatalError, type FatalErrorInfo } from './errors';
import { DebugPanel } from '../ui/debug/DebugPanel';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { ScenarioSelect } from '../ui/screens/ScenarioSelect';
import { DaimyoSelect } from '../ui/screens/DaimyoSelect';
import { MainScreen } from '../ui/screens/MainScreen';
import { BattleScreen } from '../ui/screens/BattleScreen';
import { EndingScreen } from '../ui/screens/EndingScreen';
import { useSession } from '../ui/hooks/useSession';
import { bumpTickSeq, store, setGame } from './store';
import { gameLoop } from './gameLoop';
import { parseDebugFlags, installDebugApi } from './debug';
import { startNewDemoGame } from './newGame';
import { bootVisualMapGame } from './visualMapBoot';
import { preloadFirstScreenAssets } from './visualAssetsBoot';

// 首屏視覺素材為「盡力預熱」（12 §3.7；M6-V3 唯一 runtime 接線，僅 warm Pixi Assets 快取，畫面
// 尚不顯示這些 texture）：失敗（如測試環境 mock pixi.js 未提供 Assets、或素材尚未生成）不得中斷
// 遊戲主流程，故一律 catch 並僅記錄，不 rethrow。
function warmVisualAssets(): void {
  void preloadFirstScreenAssets().catch((error: unknown) => {
    console.error('首屏視覺素材預熱失敗（不影響遊戲流程，12 §3.7）：', error);
  });
}
import type { ScenarioBundleData } from '@data/schemas';
import type { GameState } from '@core/state/gameState';
import type { BattleId } from '@core/state/ids';
import { abortDebugBattle } from '@core/debugBattle';
import { acknowledgeGameOver } from '@core/systems/victory';
import { acknowledgeBattleResult, clearAllBattleOrders, clearBattleOrders } from './battleBridge';
import { t } from '@i18n/zh-TW';
import { settingsStore } from './settings/runtime';
import { applySettings } from './settings';
import { uiStore, type ModalInstance } from '../ui/hooks/uiStore';
import { SettingsPanel } from '../ui/screens/SettingsPanel';
import { ConfirmDialog, Dialog, ReportStack } from '../ui/components';
import {
  captureSaveSnapshot,
  initializeBridgeSession,
  getBridgeProgressMark,
  registerSeasonalAutosave,
} from './bridge';
import type { Command } from '@core/commands/types';
import { createSessionProgressBinding } from './persistence/sessionProgress';
import { createSaveSessionController } from './persistence/saveSession';
import { useSaveLoad } from './persistence/useSaveLoad';
import type { SaveOperationGuard } from './persistence/saveStore';
import { SaveLoadPanel, type SaveLoadPanelProps } from '../ui/screens/SaveLoadPanel';
import {
  SaveConfirmationContext,
  useSaveConfirmationHost,
} from '../ui/screens/SaveConfirmationContext';
import { EventModalHost } from './events/EventModalHost';
import { isTypingTarget } from './hotkeys';
import { KamonIcon } from '../ui/components/KamonIcon';
import { clanKamonSpec } from '../ui/reports/clanKamon';
import { loadScenarioEventEngine } from './events/scenarioEventEngine';
import { createRuntimeEventEngine } from '@core/systems/events/runtime';
import type { EventEngine } from '@core/systems/events/engine';

function TitleSaveLoadDialog({
  panel,
  identity,
}: {
  panel: SaveLoadPanelProps;
  identity: object;
}): ReactElement {
  const body = useRef<HTMLElement>(null);
  const mounted = useRef(false);
  const revoked = useRef(false);
  const owner = useRef({
    game: store.getState().game,
    screen: store.getState().session.screen,
    identity,
  }).current;
  const latestIdentity = useRef(identity);
  latestIdentity.current = identity;
  useLayoutEffect(() => {
    mounted.current = true;
    const unsubscribe = store.subscribe((current, previous) => {
      if (current.game !== previous.game || current.session.screen !== previous.session.screen)
        revoked.current = true;
    });
    return () => {
      mounted.current = false;
      revoked.current = true;
      unsubscribe();
    };
  }, []);
  const isCurrent = () =>
    mounted.current &&
    !revoked.current &&
    owner.identity === latestIdentity.current &&
    store.getState().game === owner.game &&
    store.getState().session.screen === owner.screen &&
    owner.screen === 'title';
  const native = () => body.current?.closest('[data-ui-dialog]') ?? undefined;
  const canUse = (dialog: Element | undefined) =>
    isCurrent() &&
    dialog !== undefined &&
    dialog.isConnected &&
    dialog === native() &&
    Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1) === dialog;
  const confirmation = useSaveConfirmationHost(canUse, isCurrent);
  return (
    <SaveConfirmationContext.Provider value={confirmation.context}>
      <Dialog
        open
        title={confirmation.request?.title ?? t('ui.load.title')}
        size="lg"
        focusScopeKey={confirmation.request ? confirmation.focusKey : 'save-panel'}
        {...(confirmation.request
          ? { footer: confirmation.footer, initialFocusRef: confirmation.cancelRef }
          : {})}
        onClose={() => {
          if (!canUse(native())) return;
          if (confirmation.request) confirmation.request.onCancel();
          else panel.onClose();
        }}
      >
        {confirmation.request?.message}
        <section ref={body} hidden={confirmation.request !== null}>
          <SaveLoadPanel {...panel} />
        </section>
      </Dialog>
    </SaveConfirmationContext.Provider>
  );
}

interface QuickLoadRequest {
  game: GameState;
  playerClanId: GameState['meta']['playerClanId'];
  modal: ModalInstance;
  guard?: SaveOperationGuard;
  consumed: boolean;
  revoked: boolean;
  released: boolean;
}
let nextQuickLoadToken = 0;

export function App(): ReactElement {
  // location.search 於整個 session 期間不變（v1.0 無深連結／路由，01 §8-D8）；只解析一次。
  const flags = useMemo(() => parseDebugFlags(window.location.search), []);
  const screen = useSession((s) => s.screen);
  const currentGame = useStore(store, (state) => state.game);
  const systemModal = useStore(uiStore, (state) => state.modal);
  const tickSeq = useStore(store, (state) => state.tickSeq);
  const [scenarioBundle, setScenarioBundle] = useState<ScenarioBundleData | null>(null);
  const [battleId, setBattleId] = useState<BattleId | null>(null);
  // 敗北後「繼續觀戰」旗標（10 §3.8.4）：gameOver 維持非 null，僅抑制結局畫面重入；
  // 新局／回標題時重置。session 過渡態（不進 GameState），比照 scenarioBundle 留在外殼。
  const [observing, setObserving] = useState(false);
  // 換局世代：每次掛上新 GameState（新局／讀檔）遞增，作為 MainScreen 的 key 強制 remount
  //（selectMapStaticModel 以 useMemo([]) 快取靜態模型，換局必須重建；見 wip M6-V4 記錄）。
  const [gameEpoch, setGameEpoch] = useState(0);
  // 標題設定與本次遊戲的 app 層持久化狀態。
  const [titleSettingsOpen, setTitleSettingsOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [quickLoadRequest, setQuickLoadRequest] = useState<QuickLoadRequest | null>(null);
  const activeQuickLoad = useRef<QuickLoadRequest | null>(null);
  const quickLoadBody = useRef<HTMLSpanElement>(null);
  const quickLoadNativeObserver = useRef<MutationObserver | null>(null);
  const quickLoadMounted = useRef(true);
  const revokeQuickLoad = useCallback((request: QuickLoadRequest): void => {
    request.revoked = true;
    request.consumed = true;
    if (activeQuickLoad.current === request) activeQuickLoad.current = null;
    setQuickLoadRequest((current) => (current === request ? null : current));
    uiStore.getState().actions.closeOwnedModal(request.modal, { resume: false });
  }, []);
  const ownsQuickLoad = useCallback((request: QuickLoadRequest): boolean => {
    const current = store.getState();
    return (
      quickLoadMounted.current &&
      !request.revoked &&
      activeQuickLoad.current === request &&
      current.game === request.game &&
      current.game.meta.playerClanId === request.playerClanId &&
      current.session.screen === 'main' &&
      current.session.fatalError === null &&
      !current.session.viewportBlocked
    );
  }, []);
  const observeQuickLoadNative = useCallback(
    (records: readonly MutationRecord[]): void => {
      const request = activeQuickLoad.current;
      if (!request || request.revoked || request.released) return;
      const ownNative = quickLoadBody.current?.closest('[data-ui-dialog]');
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const dialogs = [
            ...(node.matches('[data-ui-dialog]') ? [node] : []),
            ...node.querySelectorAll('[data-ui-dialog]'),
          ];
          if (dialogs.some((dialog) => dialog !== ownNative)) {
            revokeQuickLoad(request);
            return;
          }
        }
      }
    },
    [revokeQuickLoad],
  );
  useLayoutEffect(() => {
    quickLoadMounted.current = true;
    const observer = new MutationObserver(observeQuickLoadNative);
    quickLoadNativeObserver.current = observer;
    observer.observe(document.body, { childList: true, subtree: true });
    const unsubscribeGame = store.subscribe(() => {
      const request = activeQuickLoad.current;
      if (request && !ownsQuickLoad(request)) revokeQuickLoad(request);
    });
    const unsubscribeUI = uiStore.subscribe((next, previous) => {
      const request = activeQuickLoad.current;
      if (!request || request.released) return;
      const wasPresent =
        previous.modal === request.modal || previous.modalQueue.includes(request.modal);
      const present = next.modal === request.modal || next.modalQueue.includes(request.modal);
      if ((wasPresent && !present) || (!request.guard && next.modal !== null))
        revokeQuickLoad(request);
    });
    return () => {
      quickLoadMounted.current = false;
      observer.disconnect();
      quickLoadNativeObserver.current = null;
      unsubscribeGame();
      unsubscribeUI();
      const request = activeQuickLoad.current;
      if (request) revokeQuickLoad(request);
    };
  }, [ownsQuickLoad, revokeQuickLoad, observeQuickLoadNative]);
  const saveErrorBody = useRef<HTMLDivElement>(null);
  const [autosaveSuspended, setAutosaveSuspended] = useState(false);
  const resetSaveUi = useRef<() => void>(() => {});
  const mountGeneration = useRef(0);
  const [mountLoading, setMountLoading] = useState(false);
  useEffect(
    () => () => {
      mountGeneration.current += 1;
    },
    [],
  );
  const sessionProgress = useMemo(
    () =>
      createSessionProgressBinding({
        getSession: () => store.getState().game,
        getMark: getBridgeProgressMark,
        subscribe: (listener) => store.subscribe(() => listener()),
        now: () => performance.now(),
        target: window,
        onDirtyChange: setDirty,
      }),
    [],
  );
  useEffect(() => sessionProgress.install(), [sessionProgress]);
  const saveController = useMemo(
    () =>
      createSaveSessionController({
        progress: sessionProgress,
        getSession: () => store.getState().game,
        captureSnapshot: captureSaveSnapshot,
        wallNow: () => Date.now(),
        appVersion: '0.0.0',
        onAutosaveStatusChange: setAutosaveSuspended,
      }),
    [sessionProgress],
  );
  const preferences = useStore(settingsStore, (state) => state.settings);
  const settingsPersistenceError = useStore(settingsStore, (state) => state.persistenceError);
  useEffect(() => {
    uiStore.getState().actions.setScreen(screen);
  }, [screen, gameEpoch]);
  useEffect(() => {
    applySettings(preferences, { rootStyle: document.documentElement.style });
    uiStore.getState().actions.applyPresentationSettings(preferences);
  }, [preferences]);

  // 掛上新 GameState 共同路徑（新局／讀檔）：重置觀戰旗標、遞增世代、轉場並預熱素材。
  const commitGame = useCallback(
    (
      game: GameState,
      eventEngine: EventEngine,
      pendingCommands: Command[] = [],
      playtimeSeconds = 0,
      loaded = false,
    ): void => {
      setObserving(false);
      setBattleId(null);
      clearAllBattleOrders();
      setGame(game);
      resetSaveUi.current();
      setQuickLoadRequest(null);
      uiStore.getState().actions.reset();
      const defaultSpeed = settingsStore.getState().settings.defaultSpeed;
      store.setState((state) => ({
        session: {
          ...state.session,
          speed: 'paused',
          resumeSpeed: defaultSpeed,
          lastPauseReason: 'user',
        },
      }));
      // Restore owned pending-event descriptors only after the UI/session reset.
      initializeBridgeSession(game, pendingCommands, { loaded, eventEngine });
      saveController.resetSession(playtimeSeconds);
      setGameEpoch((epoch) => epoch + 1);
      store.getState().actions.setScreen('main');
      warmVisualAssets(); // 進入 main 畫面：預熱首屏視覺素材快取（12 §3.7；M6-V3）
    },
    [saveController],
  );
  const mountGame = useCallback(
    async (
      game: GameState,
      pendingCommands: Command[] = [],
      playtimeSeconds = 0,
      loaded = false,
      isLoadCurrent: () => boolean = () => true,
    ): Promise<boolean> => {
      const generation = ++mountGeneration.current;
      const previousGame = store.getState().game;
      const previousScreen = store.getState().session.screen;
      const previousFatal = store.getState().session.fatalError;
      const isCurrent = () =>
        generation === mountGeneration.current &&
        store.getState().game === previousGame &&
        store.getState().session.screen === previousScreen &&
        store.getState().session.fatalError === previousFatal &&
        previousFatal === null &&
        isLoadCurrent();
      setMountLoading(true);
      try {
        let engine: EventEngine;
        try {
          engine = await loadScenarioEventEngine(game.meta.scenarioId);
        } catch (error) {
          if (isCurrent()) throw error;
          return false;
        }
        if (!isCurrent()) return false;
        commitGame(game, engine, pendingCommands, playtimeSeconds, loaded);
        return true;
      } finally {
        if (generation === mountGeneration.current) setMountLoading(false);
      }
    },
    [commitGame],
  );
  const saveUi = useSaveLoad(saveController, async (save, isCurrent) => {
    await mountGame(
      save.state,
      save.pendingCommands,
      save.meta.playtimeSeconds ?? 0,
      true,
      isCurrent,
    );
  });
  const { refresh: refreshSaves, resetUi: resetPersistenceUi } = saveUi;
  const ownsSaveErrorNative = () => {
    const native = saveErrorBody.current?.closest('[data-ui-dialog]');
    return (
      native !== undefined &&
      native !== null &&
      native.isConnected &&
      Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1) === native
    );
  };
  const closeSaveError = () => {
    if (ownsSaveErrorNative()) saveUi.close();
  };
  const exportSaveError = saveUi.panelProps('main', dirty).onExportCurrent;
  const saveNotices = saveUi.notice
    ? [
        {
          id: saveUi.notice.id,
          severity: 'info' as const,
          title: saveUi.notice.text,
          date: store.getState().game?.time.day ?? 0,
        },
      ]
    : [];
  useEffect(
    () =>
      registerSeasonalAutosave(() => {
        void saveController
          .saveSeasonSnapshot()
          .then((result) => {
            if (result.ok) return refreshSaves();
          })
          .catch(() => {});
      }),
    [saveController, refreshSaves],
  );
  useEffect(() => {
    resetSaveUi.current = saveUi.resetUi;
  }, [saveUi.resetUi]);

  // gameOver 偵測（10 §6.4：game.victory／game.defeat → UI 立即切結局畫面）：
  // 每 tick 檢查 state.meta.gameOver；勝敗成立時暫停時間並切至 EndingScreen。
  useEffect(() => {
    const { game, session, actions } = store.getState();
    if (game === null || game.meta.gameOver === null || observing) return;
    if (session.screen !== 'ending') {
      actions.requestPause('modalOpen');
      actions.setScreen('ending');
    }
  }, [gameEpoch, tickSeq, observing]);

  useEffect(() => {
    const game = store.getState().game;
    if (game !== null && game.meta.gameOver !== null && !observing) return;
    if (game !== null && battleId !== null && game.battles[battleId] !== undefined) {
      // Keep the selected battle through its resolved result screen until the player acknowledges it.
      return;
    }
    const activeBattle =
      game === null
        ? undefined
        : Object.values(game.battles)
            .filter((battle) => battle.result === null)
            .sort((a, b) => a.id.localeCompare(b.id))[0];
    if (activeBattle !== undefined && battleId !== activeBattle.id) {
      setBattleId(activeBattle.id);
      store.getState().actions.setScreen('battle');
    } else if (activeBattle === undefined && battleId !== null) {
      setBattleId(null);
    }
  }, [gameEpoch, battleId, tickSeq, observing]);

  const handleQuickDemo = useCallback((): void => {
    const game = startNewDemoGame(flags);
    mountGeneration.current += 1;
    commitGame(game, createRuntimeEventEngine([]));
    if (flags.initialSpeed !== 'paused') {
      gameLoop.setSpeed(flags.initialSpeed); // ?speed=x5 等開局預設檔位（01 §3.11.1）
    }
  }, [flags, commitGame]);

  // `?debug=visual-map`（M6-V2；17 §3.9.3）：載入固定 debugVisual fixture，刻意忽略 `?seed`／
  // `?speed`（速度維持 session 初始值 'paused'，供 e2e 截圖 harness 決定論等待，見任務說明第 2 點）；
  // 一次性場景 UI 態（選取行軍中我方部隊＋路徑預覽）由 `bootVisualMapGame` 內部佈置（見該檔）。
  const handleVisualMap = useCallback((): void => {
    mountGeneration.current += 1;
    bootVisualMapGame((game) => commitGame(game, createRuntimeEventEngine([])));
  }, [commitGame]);

  // 標題「新遊戲」→ ScenarioSelectScreen（11 §3.2.2；17 §3.8 P2 首步）。
  const handleNewGameClick = useCallback((): void => {
    store.getState().actions.setScreen('scenarioSelect');
  }, []);

  const handleSelectScenario = useCallback((bundle: ScenarioBundleData): void => {
    setScenarioBundle(bundle);
    store.getState().actions.setScreen('daimyoSelect');
  }, []);

  const handleBackToTitle = useCallback((): void => {
    mountGeneration.current += 1;
    setMountLoading(false);
    setScenarioBundle(null);
    store.getState().actions.setScreen('title');
  }, []);

  const handleBackToScenarioSelect = useCallback((): void => {
    mountGeneration.current += 1;
    setMountLoading(false);
    store.getState().actions.setScreen('scenarioSelect');
  }, []);

  // DaimyoSelectScreen「開始遊戲」→ GameState 已建好，僅需掛進 store 並轉場（11 §3.2.3）。
  const handleStartGame = useCallback(
    (game: GameState): void => {
      void mountGame(game)
        .then((mounted) => {
          if (mounted && store.getState().game === game && flags.initialSpeed !== 'paused')
            gameLoop.setSpeed(flags.initialSpeed);
        })
        .catch((error: unknown) => {
          gameLoop.stop();
          store.getState().actions.setFatalError(captureFatalError(error));
        });
    },
    [flags, mountGame],
  );

  // 標題「繼續」：載入 timestamp 最新的存檔槽（16 §5.8；MVP 槽位子集 auto:1/quick:1）。
  const handleContinue = (): void => {
    void saveUi.continueLatest();
  };

  // 快速存檔 Ctrl+S／快速讀檔 F9（16 §3.4；僅策略畫面有效，合戰／標題停用）。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const { screen: currentScreen } = store.getState().session;
      const game = store.getState().game;
      const saveChord = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's';
      if (currentScreen === 'battle' && (saveChord || e.key === 'F9')) {
        e.preventDefault();
        return;
      }
      if (currentScreen !== 'main' || game === null || store.getState().session.viewportBlocked)
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
      const target = e.target;
      if (isTypingTarget(target)) {
        return;
      }
      if (
        uiStore.getState().modal !== null ||
        document.querySelector('[data-ui-dialog]') !== null
      ) {
        // 系統選單／強制選擇期間不執行快存快讀，也不讓 Ctrl+S 開啟瀏覽器另存頁面。
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // 阻止瀏覽器「另存網頁」（16 §3.4）
        void saveUi.quickSave();
      } else if (e.key === 'F9') {
        e.preventDefault();
        store.getState().actions.requestPause('user');
        if (sessionProgress.isDirty()) {
          observeQuickLoadNative(quickLoadNativeObserver.current?.takeRecords() ?? []);
          if (activeQuickLoad.current !== null) return;
          const request: QuickLoadRequest = {
            game,
            playerClanId: game.meta.playerClanId,
            modal: {
              id: 'confirm',
              params: { owner: 'quickLoad', token: String(++nextQuickLoadToken) },
              pausesTime: false,
            },
            consumed: false,
            revoked: false,
            released: false,
          };
          activeQuickLoad.current = request;
          void saveUi
            .captureQuickLoadGuard(() => ownsQuickLoad(request))
            .then((guard) => {
              if (
                !guard ||
                !ownsQuickLoad(request) ||
                uiStore.getState().modal !== null ||
                document.querySelector('[data-ui-dialog]') !== null
              ) {
                revokeQuickLoad(request);
                return;
              }
              request.guard = guard;
              setQuickLoadRequest(request);
              uiStore.getState().actions.enqueueModal(request.modal);
              if (!ownsQuickLoad(request)) revokeQuickLoad(request);
            });
        } else void saveUi.quickLoad();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [saveUi, sessionProgress, ownsQuickLoad, revokeQuickLoad, observeQuickLoadNative]);

  useEffect(() => {
    installDebugApi(flags); // 僅 flags.enabled 時真的安裝 window.__TENKA_DEBUG__（01 §3.11.4）
    gameLoop.start(); // 掛上 rAF；game 未 boot 或 speed='paused' 時迴圈本身是 no-op（01 §5.1）
    if (flags.visualMap) {
      handleVisualMap(); // ?debug=visual-map：固定視覺 fixture（M6-V2），優先於 skipTitle
    } else if (flags.skipTitle) {
      handleQuickDemo(); // ?skipTitle=1：跳過標題直接開新局（01 §3.11.1；e2e／開發迭代用）
    }
    return () => gameLoop.stop();
  }, [flags, handleQuickDemo, handleVisualMap]);

  const handleFatalError = useCallback((info: FatalErrorInfo): void => {
    gameLoop.stop();
    store.getState().actions.setFatalError(info);
  }, []);

  // 結局畫面動作（10 §3.8.4：非 Command，外殼直接呼叫 core API）。
  const handleEndingContinue = useCallback((): void => {
    const game = store.getState().game;
    if (game === null) return;
    acknowledgeGameOver(game, 'continue'); // 記 ack 旗標、解除 gameOver
    bumpTickSeq();
    store.getState().actions.setScreen('main');
  }, []);

  const handleEndingObserve = useCallback((): void => {
    setObserving(true); // gameOver 維持原值：時間可推進、指令持續被拒（純觀戰）
    store.getState().actions.setScreen('main');
  }, []);

  const handleEndingTitle = useCallback(
    (expectedGame: GameState | null, expectedModal?: ModalInstance): void => {
      if (
        expectedGame === null ||
        store.getState().game !== expectedGame ||
        (expectedModal !== undefined &&
          (expectedModal.id !== 'systemMenu' || uiStore.getState().modal !== expectedModal))
      )
        return;
      const sourceScreen = store.getState().session.screen;
      const transition = ++mountGeneration.current;
      let releasedParent = false;
      let revoked = false;
      const unsubscribe = uiStore.subscribe((next, previous) => {
        if (
          releasedParent
            ? next.modal !== null || next.modalQueue.length !== 0
            : expectedModal !== undefined &&
              previous.modal === expectedModal &&
              next.modal !== expectedModal
        )
          revoked = true;
      });
      const owns = (game: GameState | null) =>
        !revoked &&
        mountGeneration.current === transition &&
        store.getState().game === game &&
        store.getState().session.screen === sourceScreen &&
        (releasedParent
          ? uiStore.getState().modal === null && uiStore.getState().modalQueue.length === 0
          : expectedModal === undefined || uiStore.getState().modal === expectedModal);
      try {
        gameLoop.requestPause('user');
        if (!owns(expectedGame)) return;
        releasedParent = true;
        uiStore.getState().actions.reset();
        if (!owns(expectedGame)) return;
        setMountLoading(false);
        setObserving(false);
        setScenarioBundle(null);
        setBattleId(null);
        clearAllBattleOrders();
        if (!owns(expectedGame)) return;
        setGame(null); // state 丟棄（10 §3.8.4）；保留已成功寫入的槽位。
        if (!owns(null)) return;
        saveController.resetSession();
        if (!owns(null)) return;
        resetPersistenceUi();
        if (!owns(null)) return;
        store.getState().actions.setScreen('title');
      } finally {
        unsubscribe();
      }
    },
    [saveController, resetPersistenceUi],
  );

  const handleBattleExit = useCallback((): void => {
    if (battleId === null || !acknowledgeBattleResult(battleId).ok) return;
    setBattleId(null);
    store.getState().actions.setScreen('main');
  }, [battleId]);

  const handleBattleRetreat = useCallback((): void => {
    if (battleId === null) return;
    const game = store.getState().game;
    if (game === null || !game.meta.debugMode) return;
    abortDebugBattle(game, battleId);
    clearBattleOrders(battleId);
    bumpTickSeq();
    setBattleId(null);
    store.getState().actions.setScreen('main');
  }, [battleId]);

  let content: ReactElement;
  if (screen === 'ending') {
    content = (
      <EndingScreen
        onContinue={handleEndingContinue}
        onObserve={handleEndingObserve}
        onTitle={() => handleEndingTitle(currentGame)}
      />
    );
  } else if (screen === 'battle' && battleId !== null) {
    content = (
      <BattleScreen battleId={battleId} onExit={handleBattleExit} onRetreat={handleBattleRetreat} />
    );
  } else if (screen === 'main') {
    content = (
      <MainScreen
        key={gameEpoch}
        autosaveSuspended={autosaveSuspended}
        appToasts={saveNotices}
        onDismissAppToast={saveUi.dismissNotice}
      />
    );
  } else if (screen === 'scenarioSelect') {
    content = <ScenarioSelect onSelectScenario={handleSelectScenario} onBack={handleBackToTitle} />;
  } else if (screen === 'daimyoSelect' && scenarioBundle !== null) {
    content = (
      <DaimyoSelect
        bundle={scenarioBundle}
        {...(flags.seed === null ? {} : { seed: flags.seed })}
        onBack={handleBackToScenarioSelect}
        onStart={handleStartGame}
      />
    );
  } else {
    content = (
      <TitleScreen
        onNewGame={handleNewGameClick}
        hasSave={saveUi.hasSave}
        continuePreview={saveUi.continuePreview}
        onContinue={handleContinue}
        onSettings={() => setTitleSettingsOpen(true)}
        onLoadGame={() => saveUi.open('load')}
      />
    );
  }

  return (
    <ViewportProvider>
      <MotionProvider>
        <ErrorBoundary onFatalError={handleFatalError}>
          <div id="app-root">
            {content}
            {mountLoading && <p role="status">{t('ui.scenario.loading')}</p>}
            {(screen === 'main' || screen === 'battle') && (
              <SystemMenuHost
                onReturnToTitle={() => {
                  if (systemModal?.id === 'systemMenu') handleEndingTitle(currentGame, systemModal);
                }}
                dirty={dirty}
                onOpenSaveLoad={screen === 'main' ? saveUi.open : undefined}
                saveUnavailableReason={
                  screen === 'battle' ? t('ui.save.battleUnavailable') : undefined
                }
                systemPanel={
                  screen === 'main' && saveUi.mode
                    ? {
                        identity: saveUi.panelIdentity,
                        title: t(saveUi.mode === 'save' ? 'ui.save.title' : 'ui.load.title'),
                        content: <SaveLoadPanel {...saveUi.panelProps('main', dirty)} />,
                        onBack: saveUi.close,
                      }
                    : null
                }
              />
            )}
            <EventModalHost
              key={`event:${gameEpoch}`}
              enabled={screen === 'main'}
              animateText={preferences.effectsEnabled}
              renderMon={(clanId) => {
                const game = store.getState().game;
                const spec = game ? clanKamonSpec(game, clanId) : null;
                return spec ? <KamonIcon spec={spec} size={64} /> : null;
              }}
              onExportCurrent={() => saveUi.panelProps('main', dirty).onExportCurrent?.()}
            />
            <ConfirmDialog
              open={quickLoadRequest !== null && systemModal === quickLoadRequest.modal}
              title={t('ui.load.title')}
              message={<span ref={quickLoadBody}>{t('ui.load.quickLoadConfirm')}</span>}
              danger
              onCancel={() => {
                observeQuickLoadNative(quickLoadNativeObserver.current?.takeRecords() ?? []);
                const request = quickLoadRequest;
                const native = quickLoadBody.current?.closest('[data-ui-dialog]');
                if (
                  request &&
                  ownsQuickLoad(request) &&
                  systemModal === request.modal &&
                  uiStore.getState().modal === request.modal &&
                  native &&
                  Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1) === native
                )
                  revokeQuickLoad(request);
              }}
              onConfirm={() => {
                observeQuickLoadNative(quickLoadNativeObserver.current?.takeRecords() ?? []);
                const request = quickLoadRequest;
                const native = quickLoadBody.current?.closest('[data-ui-dialog]');
                if (
                  !request ||
                  request.consumed ||
                  !request.guard ||
                  !ownsQuickLoad(request) ||
                  uiStore.getState().modal !== request.modal ||
                  !native ||
                  Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1) !== native
                )
                  return;
                request.consumed = true;
                const loading = saveUi.quickLoad(request.guard);
                if (
                  ownsQuickLoad(request) &&
                  uiStore.getState().modal === request.modal &&
                  quickLoadBody.current?.closest('[data-ui-dialog]') === native &&
                  Array.from(document.querySelectorAll('[data-ui-dialog]')).at(-1) === native
                ) {
                  request.released = true;
                  setQuickLoadRequest((current) => (current === request ? null : current));
                  uiStore.getState().actions.closeOwnedModal(request.modal, {
                    resume: false,
                    expectedGame: request.game,
                  });
                }
                void loading.finally(() => {
                  if (activeQuickLoad.current === request) {
                    revokeQuickLoad(request);
                  }
                });
              }}
            />
            {saveUi.mode && screen === 'title' && (
              <TitleSaveLoadDialog
                panel={saveUi.panelProps('title', false)}
                identity={saveUi.panelIdentity}
              />
            )}
            {saveUi.error && !saveUi.mode && (
              <Dialog
                open
                title={t('ui.save.title')}
                onClose={closeSaveError}
                footer={
                  <>
                    <button type="button" onClick={closeSaveError}>
                      {t('ui.common.back')}
                    </button>
                    {screen !== 'battle' && store.getState().game !== null && (
                      <button
                        type="button"
                        onClick={() => {
                          if (ownsSaveErrorNative()) void exportSaveError?.();
                        }}
                      >
                        {t('ui.save.exportCurrent')}
                      </button>
                    )}
                  </>
                }
              >
                <div ref={saveErrorBody} role="alert">
                  {saveUi.error}
                </div>
                {screen === 'battle' && <p>{t('ui.save.battleUnavailable')}</p>}
              </Dialog>
            )}
            {screen === 'title' && (
              <ReportStack items={saveNotices} onDismiss={saveUi.dismissNotice} />
            )}
            {titleSettingsOpen && screen === 'title' && (
              <Dialog
                open
                title={t('ui.settings.title')}
                size="lg"
                onClose={() => setTitleSettingsOpen(false)}
              >
                <SettingsPanel
                  settings={preferences}
                  onChange={(patch) => settingsStore.getState().updateSettings(patch)}
                  onReset={() => settingsStore.getState().resetSettings()}
                  onClose={() => setTitleSettingsOpen(false)}
                  persistenceError={settingsPersistenceError !== null}
                />
              </Dialog>
            )}
            {flags.enabled && <DebugPanel />}
          </div>
        </ErrorBoundary>
      </MotionProvider>
    </ViewportProvider>
  );
}
