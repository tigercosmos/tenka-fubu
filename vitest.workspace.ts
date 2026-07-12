// Vitest workspace：core（node 環境）／ui（jsdom 環境）／app（jsdom 環境）三個 project。
// 規格：plan/17-testing.md §3.2（core／ui 兩個 project 為 canonical 範本）；`app` project 為本檔
// 相對該範本的擴充，見 17 §8 決策記錄（M1-16／M1-17 新增）。
//
// path alias：src/app・src/ui 內較新檔案改採 `@core/*`／`@app/*` 等別名 import（與 tsconfig.json／
// vite.config.ts 一致）；vitest workspace 各 project 不會自動繼承 vite.config.ts 的 resolve.alias，
// 故於此各自補上，供這些檔案的測試正確解析（無別名的既有 core 檔案仍用相對路徑，不受影響）。
import { fileURLToPath } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const alias = {
  '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
  '@data': fileURLToPath(new URL('./src/data', import.meta.url)),
  '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
  '@app': fileURLToPath(new URL('./src/app', import.meta.url)),
  '@i18n': fileURLToPath(new URL('./src/i18n', import.meta.url)),
};

export default defineWorkspace([
  {
    resolve: { alias },
    test: {
      name: 'core',
      environment: 'node',
      include: ['src/core/**/*.spec.ts', 'tests/**/*.spec.ts'],
      // `tests/app/**` 需要 jsdom（rAF／document），改由下方 `app` project 收納，此處排除避免
      // 同一檔案在 node 環境下被重跑一次而失敗（glob 交集：本行 include 之 `tests/**/*.spec.ts`
      // 與 `app` project 的 `tests/app/**/*.spec.ts` 重疊）。
      exclude: ['tests/app/**'],
    },
  },
  {
    resolve: { alias },
    test: {
      name: 'ui',
      environment: 'jsdom',
      include: ['src/ui/**/*.spec.tsx'],
      setupFiles: ['tests/helpers/rtl-setup.ts'], // jest-dom matchers（於引入 @testing-library/jest-dom 時補上）
    },
  },
  {
    resolve: { alias },
    test: {
      // `src/app/**` 需要 DOM（rAF／document.visibilitychange）而非 React 元件，17 §3.2 canonical
      // 範本的兩個 project 皆不覆蓋（core 為 node 環境無 DOM；ui 僅收 `.spec.tsx`）；新增本 project
      // 補上這道測試環境缺口（17 §8 決策記錄）。`.spec.tsx` 一併收錄（M2-19 新增）：`src/app/App.tsx`
      // 本身是需要 RTL 渲染整合測試的 React 元件（新遊戲精靈全流程：Title→ScenarioSelect→
      // DaimyoSelect→MainScreen），既有兩個 project 皆非其歸屬（`ui` 只收 `src/ui/**`）。
      name: 'app',
      environment: 'jsdom',
      include: [
        'src/app/**/*.spec.ts',
        'src/app/**/*.spec.tsx',
        'tests/app/**/*.spec.ts',
        'tests/app/**/*.spec.tsx',
      ],
      setupFiles: ['tests/helpers/rtl-setup.ts'],
    },
  },
]);
