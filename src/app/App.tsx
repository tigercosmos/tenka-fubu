// 頂層元件：ErrorBoundary、畫面切換、DebugPanel 掛載（規格：plan/01-architecture.md §3.3）。
// M0 鷹架階段：僅提供最小可跑空殼（空白頁、無 console error），不含任何遊戲邏輯。
// ErrorBoundary／畫面切換／DebugPanel 掛載留待 M1 依 01-A9、01-A11 補上。
import type { ReactElement } from 'react';

export function App(): ReactElement {
  return <div id="app-root" />;
}
