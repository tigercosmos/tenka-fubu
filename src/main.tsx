// 進入點：解析 URL 參數 → boot() → ReactDOM.createRoot（M0 為最小空殼；
// URL 參數解析與 boot 流程留待 M1／M2 依 plan/01-architecture.md §3.11、§3.9.3 補上）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@app/App';
import { injectCssVariables } from '@ui/styles/tokens';
import '@ui/styles/global.css';
import { configureDayExecutor } from '@app/bridge';
import { createSimulationWorkerClient } from '@app/worker/client';

configureDayExecutor(createSimulationWorkerClient());

// design tokens 的 CSS 變數注入必須在任何元件掛載前執行一次（12 §3.1.1）。
injectCssVariables();

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到 #root 掛載點');
}

const root = createRoot(container);
async function renderRoute(): Promise<void> {
  if (import.meta.env.DEV && window.location.hash === '#/dev/battle-layout') {
    const { default: BattleLayoutGallery } = await import('@ui/dev/BattleLayoutGallery');
    if (window.location.hash !== '#/dev/battle-layout') return;
    root.render(
      <StrictMode>
        <BattleLayoutGallery />
      </StrictMode>,
    );
    return;
  }
  if (import.meta.env.DEV && window.location.hash === '#/dev/components') {
    const { default: ComponentGallery } = await import('@ui/dev/ComponentGallery');
    // Ignore a stale import when navigation already returned to the game.
    if (window.location.hash !== '#/dev/components') return;
    root.render(
      <StrictMode>
        <ComponentGallery />
      </StrictMode>,
    );
    return;
  }
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
if (import.meta.env.DEV) window.addEventListener('hashchange', () => void renderRoute());
void renderRoute();
