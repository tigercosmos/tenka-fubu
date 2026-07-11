// 頂層元件：ErrorBoundary、畫面切換、DebugPanel 掛載（規格：plan/01-architecture.md §3.3／§3.6.2）。
// M1-20（畫面切換）／M1-22（除錯面板掛載＋debug flags）實作；ErrorBoundary 本體屬 M1-18，
// 本檔依其檔頭「攔截接線屬呼叫端（App.tsx）責任」完成 `onFatalError` 接線。

import { useCallback, useEffect, useMemo, type ReactElement } from 'react';
import { ErrorBoundary } from '../ui/components/ErrorBoundary';
import type { FatalErrorInfo } from './errors';
import { DebugPanel } from '../ui/debug/DebugPanel';
import { TitleScreen } from '../ui/screens/TitleScreen';
import { MainScreen } from '../ui/screens/MainScreen';
import { useSession } from '../ui/hooks/useSession';
import { store, setGame } from './store';
import { gameLoop } from './gameLoop';
import { parseDebugFlags, installDebugApi } from './debug';
import { startNewDemoGame } from './newGame';

export function App(): ReactElement {
  // location.search 於整個 session 期間不變（v1.0 無深連結／路由，01 §8-D8）；只解析一次。
  const flags = useMemo(() => parseDebugFlags(window.location.search), []);
  const screen = useSession((s) => s.screen);

  const handleNewGame = useCallback((): void => {
    const game = startNewDemoGame(flags);
    setGame(game);
    if (flags.initialSpeed !== 'paused') {
      gameLoop.setSpeed(flags.initialSpeed); // ?speed=x5 等開局預設檔位（01 §3.11.1）
    }
    store.getState().actions.setScreen('main');
  }, [flags]);

  useEffect(() => {
    installDebugApi(flags); // 僅 flags.enabled 時真的安裝 window.__TENKA_DEBUG__（01 §3.11.4）
    gameLoop.start(); // 掛上 rAF；game 未 boot 或 speed='paused' 時迴圈本身是 no-op（01 §5.1）
    if (flags.skipTitle) {
      handleNewGame(); // ?skipTitle=1：跳過標題直接開新局（01 §3.11.1；e2e／開發迭代用）
    }
    return () => gameLoop.stop();
  }, [flags, handleNewGame]);

  const handleFatalError = useCallback((info: FatalErrorInfo): void => {
    gameLoop.stop();
    store.getState().actions.setFatalError(info);
  }, []);

  return (
    <ErrorBoundary onFatalError={handleFatalError}>
      <div id="app-root">
        {screen === 'main' ? <MainScreen /> : <TitleScreen onNewGame={handleNewGame} />}
        {flags.enabled && <DebugPanel />}
      </div>
    </ErrorBoundary>
  );
}
