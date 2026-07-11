// 進入點：解析 URL 參數 → boot() → ReactDOM.createRoot（M0 為最小空殼；
// URL 參數解析與 boot 流程留待 M1／M2 依 plan/01-architecture.md §3.11、§3.9.3 補上）。
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@app/App';

const container = document.getElementById('root');
if (container === null) {
  throw new Error('找不到 #root 掛載點');
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
