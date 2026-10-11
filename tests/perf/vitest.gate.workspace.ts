import { defineWorkspace } from 'vitest/config';

// Keep hardware timing separate from the parallel functional test workload.
export default defineWorkspace([
  {
    test: {
      name: 'perf',
      environment: 'node',
      include: ['tests/perf/advance-day.gate.spec.ts'],
      pool: 'forks',
    },
  },
]);
