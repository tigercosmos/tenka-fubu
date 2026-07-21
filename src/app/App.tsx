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

import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react';
import { useStore } from 'zustand';
import { ErrorBoundary } from '../ui/components/ErrorBoundary';
import type { FatalErrorInfo } from './errors';
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
import { acknowledgeBattleResult, clearBattleOrders } from './battleBridge';
import { hasAnySave, latestSlot, loadFromSlot, saveToSlot } from './persistence';
import { t } from '@i18n/zh-TW';

export function App(): ReactElement {
  // location.search 於整個 session 期間不變（v1.0 無深連結／路由，01 §8-D8）；只解析一次。
  const flags = useMemo(() => parseDebugFlags(window.location.search), []);
  const screen = useSession((s) => s.screen);
  const tickSeq = useStore(store, (state) => state.tickSeq);
  const [scenarioBundle, setScenarioBundle] = useState<ScenarioBundleData | null>(null);
  const [battleId, setBattleId] = useState<BattleId | null>(null);
  // 敗北後「繼續觀戰」旗標（10 §3.8.4）：gameOver 維持非 null，僅抑制結局畫面重入；
  // 新局／回標題時重置。session 過渡態（不進 GameState），比照 scenarioBundle 留在外殼。
  const [observing, setObserving] = useState(false);
  // 換局世代：每次掛上新 GameState（新局／讀檔）遞增，作為 MainScreen 的 key 強制 remount
  //（selectMapStaticModel 以 useMemo([]) 快取靜態模型，換局必須重建；見 wip M6-V4 記錄）。
  const [gameEpoch, setGameEpoch] = useState(0);
  // 標題「繼續」啟用判定（16 §5.8；讀 meta 鍵，便宜）。回標題時重新計算。
  const [saveAvailable, setSaveAvailable] = useState(() => hasAnySave());

  // 掛上新 GameState 共同路徑（新局／讀檔）：重置觀戰旗標、遞增世代、轉場並預熱素材。
  const mountGame = useCallback((game: GameState): void => {
    setObserving(false);
    setBattleId(null);
    setGame(game);
    setGameEpoch((epoch) => epoch + 1);
    store.getState().actions.setScreen('main');
    warmVisualAssets(); // 進入 main 畫面：預熱首屏視覺素材快取（12 §3.7；M6-V3）
  }, []);

  // gameOver 偵測（10 §6.4：game.victory／game.defeat → UI 立即切結局畫面）：
  // 每 tick 檢查 state.meta.gameOver；勝敗成立時暫停時間並切至 EndingScreen。
  useEffect(() => {
    const { game, session, actions } = store.getState();
    if (game === null || game.meta.gameOver === null || observing) return;
    if (session.screen !== 'ending') {
      actions.requestPause('modalOpen');
      actions.setScreen('ending');
    }
  }, [tickSeq, observing]);

  useEffect(() => {
    const game = store.getState().game;
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
  }, [battleId, tickSeq]);

  const handleQuickDemo = useCallback((): void => {
    const game = startNewDemoGame(flags);
    mountGame(game);
    if (flags.initialSpeed !== 'paused') {
      gameLoop.setSpeed(flags.initialSpeed); // ?speed=x5 等開局預設檔位（01 §3.11.1）
    }
  }, [flags, mountGame]);

  // `?debug=visual-map`（M6-V2；17 §3.9.3）：載入固定 debugVisual fixture，刻意忽略 `?seed`／
  // `?speed`（速度維持 session 初始值 'paused'，供 e2e 截圖 harness 決定論等待，見任務說明第 2 點）；
  // 一次性場景 UI 態（選取行軍中我方部隊＋路徑預覽）由 `bootVisualMapGame` 內部佈置（見該檔）。
  const handleVisualMap = useCallback((): void => {
    mountGame(bootVisualMapGame());
  }, [mountGame]);

  // 標題「新遊戲」→ ScenarioSelectScreen（11 §3.2.2；17 §3.8 P2 首步）。
  const handleNewGameClick = useCallback((): void => {
    store.getState().actions.setScreen('scenarioSelect');
  }, []);

  const handleSelectScenario = useCallback((bundle: ScenarioBundleData): void => {
    setScenarioBundle(bundle);
    store.getState().actions.setScreen('daimyoSelect');
  }, []);

  const handleBackToTitle = useCallback((): void => {
    setScenarioBundle(null);
    setSaveAvailable(hasAnySave());
    store.getState().actions.setScreen('title');
  }, []);

  const handleBackToScenarioSelect = useCallback((): void => {
    store.getState().actions.setScreen('scenarioSelect');
  }, []);

  // DaimyoSelectScreen「開始遊戲」→ GameState 已建好，僅需掛進 store 並轉場（11 §3.2.3）。
  const handleStartGame = useCallback(
    (game: GameState): void => {
      mountGame(game);
      if (flags.initialSpeed !== 'paused') {
        gameLoop.setSpeed(flags.initialSpeed);
      }
    },
    [flags, mountGame],
  );

  // 標題「繼續」：載入 timestamp 最新的存檔槽（16 §5.8；MVP 槽位子集 auto:1/quick:1）。
  const handleContinue = useCallback((): void => {
    const slot = latestSlot();
    if (slot === null) return;
    const result = loadFromSlot(slot);
    if (!result.ok) {
      console.warn(`讀取存檔失敗（${slot}）：${result.code}`);
      setSaveAvailable(hasAnySave());
      return;
    }
    mountGame(result.state);
  }, [mountGame]);

  // 快速存檔 Ctrl+S／快速讀檔 F9（16 §3.4；僅策略畫面有效，合戰／標題停用）。
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      const { screen: currentScreen } = store.getState().session;
      const game = store.getState().game;
      if (currentScreen !== 'main' || game === null) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault(); // 阻止瀏覽器「另存網頁」（16 §3.4）
        if (saveToSlot('quick:1', game)) setSaveAvailable(true);
      } else if (e.key === 'F9') {
        e.preventDefault();
        const result = loadFromSlot('quick:1');
        if (!result.ok) return; // 槽空／損毀：MVP 靜默（toast 屬 M8-20）
        if (!window.confirm(t('ui.load.quickLoadConfirm'))) return;
        store.getState().actions.requestPause('user');
        mountGame(result.state);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mountGame]);

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

  const handleEndingTitle = useCallback((): void => {
    setObserving(false);
    setScenarioBundle(null);
    setBattleId(null);
    setGame(null); // state 丟棄（10 §3.8.4；月結自動存檔已落地於 auto:1）
    setSaveAvailable(hasAnySave());
    store.getState().actions.setScreen('title');
  }, []);

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
        onTitle={handleEndingTitle}
      />
    );
  } else if (screen === 'battle' && battleId !== null) {
    content = (
      <BattleScreen battleId={battleId} onExit={handleBattleExit} onRetreat={handleBattleRetreat} />
    );
  } else if (screen === 'main') {
    content = <MainScreen key={gameEpoch} />;
  } else if (screen === 'scenarioSelect') {
    content = <ScenarioSelect onSelectScenario={handleSelectScenario} onBack={handleBackToTitle} />;
  } else if (screen === 'daimyoSelect' && scenarioBundle !== null) {
    content = (
      <DaimyoSelect
        bundle={scenarioBundle}
        onBack={handleBackToScenarioSelect}
        onStart={handleStartGame}
      />
    );
  } else {
    content = (
      <TitleScreen
        onNewGame={handleNewGameClick}
        hasSave={saveAvailable}
        onContinue={handleContinue}
      />
    );
  }

  return (
    <ErrorBoundary onFatalError={handleFatalError}>
      <div id="app-root">
        {content}
        {flags.enabled && <DebugPanel />}
      </div>
    </ErrorBoundary>
  );
}
