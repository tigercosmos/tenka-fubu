// Vitest ui／app project 的 setupFiles（規格：plan/17-testing.md §3.2）。
// 待導入 @testing-library/jest-dom 時在此擴充 expect matchers。

import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// React 18 的 `act()` 需要明確告知目前處於測試環境（jest 的 jsdom 環境會自動設定，vitest 不會），
// 否則 @testing-library/react 的 render/act 會印出
// 「The current testing environment is not configured to support act(...)」警告
//（M1-15 導入 useGameSelector 元件測試時發現，見 tests/app/、src/ui/hooks/*.spec.tsx）。
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// @testing-library/react 的自動 cleanup 依賴全域 `afterEach`（本專案 vitest 未開 `test.globals`，
// 各檔皆明確 `import { afterEach } from 'vitest'`，RTL 偵測不到框架注入的全域 afterEach），
// 故於此手動註冊，避免元件殘留掛載並持續訂閱 store，污染下一個測試（M1-15 實作時發現）。
afterEach(() => {
  cleanup();
});
