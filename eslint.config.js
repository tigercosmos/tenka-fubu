// ESLint flat config（規格：plan/01-architecture.md §3.7.3；決定論守門：plan/03-game-loop.md T12）。
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // 根目錄設定檔（eslint.config.js 本身等）不在 tsconfig.json 的 include 內，
        // 以 allowDefaultProject 讓 typescript-eslint 的 projectService 仍能解析它們。
        projectService: { allowDefaultProject: ['*.config.js', '*.config.mjs'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // React 規則只作用於 ui/app
  {
    files: ['src/ui/**/*.{ts,tsx}', 'src/app/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': 'warn',
    },
  },

  // ── 邊界規則 1：core 與 data 的純度 ──
  {
    files: ['src/core/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'core/data 不得依賴 React。',
            },
            { group: ['pixi.js', '@pixi/*'], message: 'core/data 不得依賴 PixiJS。' },
            {
              group: ['zustand', 'zustand/*'],
              message: 'core/data 不得依賴 Zustand；狀態橋接屬 app 層。',
            },
            { group: ['idb-keyval'], message: '儲存 IO 屬 app 層（src/app/persistence.ts）。' },
            {
              group: ['@ui/*', '@app/*', '@i18n/*', '**/ui/**', '**/app/**', '**/i18n/**'],
              message: 'core/data 不得 import UI／app／i18n 層。',
            },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'core 禁用 DOM 全域。' },
        { name: 'document', message: 'core 禁用 DOM 全域。' },
        { name: 'navigator', message: 'core 禁用 BOM 全域。' },
        { name: 'localStorage', message: 'core 禁止直接 IO。' },
        { name: 'requestAnimationFrame', message: '迴圈驅動屬 app 層。' },
        { name: 'setTimeout', message: 'core 必須是同步純函式。' },
        { name: 'setInterval', message: 'core 必須是同步純函式。' },
        { name: 'fetch', message: 'core 禁止網路 IO。' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: '用 core/rng.ts（00 §5.5）。' },
        { object: 'Date', property: 'now', message: '用 state.time（00 §5.5）。' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: "NewExpression[callee.name='Date']", message: '用 state.time（00 §5.5）。' },
      ],
    },
  },
  // 例外：core/save 允許 lz-string（§3.1 第 6 條）——以覆蓋順序後置放行
  {
    files: ['src/core/save/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'react/*', 'react-dom/*'],
              message: 'core/data 不得依賴 React。',
            },
            { group: ['pixi.js', '@pixi/*'], message: 'core/data 不得依賴 PixiJS。' },
            {
              group: ['zustand', 'zustand/*'],
              message: 'core/data 不得依賴 Zustand；狀態橋接屬 app 層。',
            },
            { group: ['idb-keyval'], message: '儲存 IO 屬 app 層（src/app/persistence.ts）。' },
            {
              group: ['@ui/*', '@app/*', '@i18n/*', '**/ui/**', '**/app/**', '**/i18n/**'],
              message: 'core/data 不得 import UI／app／i18n 層。',
            },
          ],
        },
      ],
    },
  },

  // ── 邊界規則 2：ui 不碰 core 內部與 IO ──
  {
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@core/systems/*', '@core/systems/**', '@core/commands/apply'],
              message: 'UI 只能用 core 公開 API（@core/index、selectors、型別）。',
            },
            { group: ['idb-keyval'], message: '存檔 IO 走 app 層。' },
            { group: ['zustand/vanilla'], message: 'UI 經 hooks 訂閱，不直接建 store。' },
          ],
        },
      ],
    },
  },

  // ── 邊界規則 3：i18n 零依賴 ──
  {
    files: ['src/i18n/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['*'], message: 'i18n 不得 import 任何模組。' }] },
      ],
    },
  },
);
