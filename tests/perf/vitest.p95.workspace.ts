import { defineWorkspace } from 'vitest/config';

// Explicit opt-in: npx vitest run --workspace tests/perf/vitest.p95.workspace.ts --minWorkers=1 --maxWorkers=1
export default defineWorkspace([
  {
    test: {
      name: 'national-p95',
      environment: 'node',
      include: ['tests/perf/advance-day.p95.gate.spec.ts'],
      pool: 'forks',
    },
  },
]);
