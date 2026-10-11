import { expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { balanceHash, canonicalStringify, fnv1a64 } from '../../src/core/state/serialize';
import { UI } from '../../src/ui/uiConstants';
import { PERFCFG } from '../../src/app/perfMonitor';

it('keeps Table-D operational settings outside the simulation balance object', () => {
  for (const name of ['aiTickBudgetMs', 'kassenTickMs', 'uiDprMax', 'uiReportPageSize'])
    expect(Object.hasOwn(BAL, name)).toBe(false);
  expect(UI.kassenTickMs).toBe(800);
  expect(UI.uiDprMax).toBe(2);
  expect(UI.uiReportPageSize).toBe(50);
  expect(PERFCFG.aiTickBudgetMs).toBe(4);
  expect(BAL.commerceMaxAbs).toBe(2000);
  expect(BAL.mainCastleSlots).toBe(6);
  expect(BAL.branchCastleSlots).toBe(3);
  expect(BAL.devInvariantCheckEveryDays).toBe(30);
  expect(balanceHash()).toBe(fnv1a64(canonicalStringify(BAL)));
});
