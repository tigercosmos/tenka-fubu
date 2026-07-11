// Vitest workspace：core（node 環境）／ui（jsdom 環境）兩個 project。
// 規格：plan/17-testing.md §3.2。
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      environment: 'node',
      include: ['src/core/**/*.spec.ts', 'tests/**/*.spec.ts'],
    },
  },
  {
    test: {
      name: 'ui',
      environment: 'jsdom',
      include: ['src/ui/**/*.spec.tsx'],
      setupFiles: ['tests/helpers/rtl-setup.ts'], // jest-dom matchers（於引入 @testing-library/jest-dom 時補上）
    },
  },
]);
