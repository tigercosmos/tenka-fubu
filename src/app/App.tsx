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
import { useSession } from '../ui/hooks/useSession';
import { bumpTickSeq, store, setGame } from './store';
import { gameLoop } from './gameLoop';
import { parseDebugFlags, installDebugApi } from './debug';
import { startNewDemoGame } from './newGame';
import type { ScenarioBundleData } from '@data/schemas';
import type { GameState } from '@core/state/gameState';
import type { BattleId } from '@core/state/ids';
import { abortDebugBattle } from '@core/debugBattle';
import { acknowledgeBattleResult, clearBattleOrders } from './battleBridge';

export function App(): ReactElement {
  // location.search 於整個 session 期間不變（v1.0 無深連結／路由，01 §8-D8）；只解析一次。
  const flags = useMemo(() => parseDebugFlags(window.location.search), []);
  const screen = useSession((s) => s.screen);
  const tickSeq = useStore(store, (state) => state.tickSeq);
  const [scenarioBundle, setScenarioBundle] = useState<ScenarioBundleData | null>(null);
  const [battleId, setBattleId] = useState<BattleId | null>(null);

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
    setGame(game);
    if (flags.initialSpeed !== 'paused') {
      gameLoop.setSpeed(flags.initialSpeed); // ?speed=x5 等開局預設檔位（01 §3.11.1）
    }
    store.getState().actions.setScreen('main');
  }, [flags]);

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
    store.getState().actions.setScreen('title');
  }, []);

  const handleBackToScenarioSelect = useCallback((): void => {
    store.getState().actions.setScreen('scenarioSelect');
  }, []);

  // DaimyoSelectScreen「開始遊戲」→ GameState 已建好，僅需掛進 store 並轉場（11 §3.2.3）。
  const handleStartGame = useCallback(
    (game: GameState): void => {
      setGame(game);
      if (flags.initialSpeed !== 'paused') {
        gameLoop.setSpeed(flags.initialSpeed);
      }
      store.getState().actions.setScreen('main');
    },
    [flags],
  );

  useEffect(() => {
    installDebugApi(flags); // 僅 flags.enabled 時真的安裝 window.__TENKA_DEBUG__（01 §3.11.4）
    gameLoop.start(); // 掛上 rAF；game 未 boot 或 speed='paused' 時迴圈本身是 no-op（01 §5.1）
    if (flags.skipTitle) {
      handleQuickDemo(); // ?skipTitle=1：跳過標題直接開新局（01 §3.11.1；e2e／開發迭代用）
    }
    return () => gameLoop.stop();
  }, [flags, handleQuickDemo]);

  const handleFatalError = useCallback((info: FatalErrorInfo): void => {
    gameLoop.stop();
    store.getState().actions.setFatalError(info);
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
  if (screen === 'battle' && battleId !== null) {
    content = (
      <BattleScreen battleId={battleId} onExit={handleBattleExit} onRetreat={handleBattleRetreat} />
    );
  } else if (screen === 'main') {
    content = <MainScreen />;
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
    content = <TitleScreen onNewGame={handleNewGameClick} />;
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
