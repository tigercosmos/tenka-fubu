import { afterEach, expect, it, vi } from 'vitest';
import { buildTinyState, OFF_ALPHA_BUSHO, CASTLE_A1 } from '../fixtures/tiny';
import { applyCreateCorps } from '../../src/core/commands/corpsCommands';
import { corpsScope, runCorpsPhase } from '../../src/core/systems/ai/corps';
import * as attackPlan from '../../src/core/systems/ai/attackPlan';
import * as council from '../../src/core/systems/ai/council';
import type { AiSink } from '../../src/core/systems/ai/types';

afterEach(() => vi.restoreAllMocks());

it('uses the same military planner only for advance and never negotiates/rewards/enacts policies', () => {
  const state = buildTinyState();
  state.officers[OFF_ALPHA_BUSHO]!.rank = 'karo';
  state.castles[CASTLE_A1]!.directControl = true;
  applyCreateCorps(
    state,
    {
      type: 'createCorps',
      clanId: state.meta.playerClanId,
      corpsLeaderId: OFF_ALPHA_BUSHO,
      castleIds: [CASTLE_A1],
      directive: 'hold',
      targetNodeId: null,
    },
    () => {},
  );
  const corps = Object.values(state.corps)[0]!;
  const sink: AiSink = { enqueue: () => ({ ok: true }), record: () => {} };
  const military = vi.spyOn(attackPlan, 'militaryPhase').mockImplementation(() => {});
  const domestic = vi.spyOn(council, 'runDomesticCouncil').mockImplementation(() => {});
  runCorpsPhase(state, corps.id, 'military', sink);
  expect(military).toHaveBeenCalledWith(state, corpsScope(state, corps.id), sink, {
    allowExpansion: false,
  });
  military.mockClear();
  corps.directive = 'develop';
  runCorpsPhase(state, corps.id, 'military', sink);
  expect(military).not.toHaveBeenCalled();
  corps.directive = 'advance';
  runCorpsPhase(state, corps.id, 'military', sink);
  expect(military).toHaveBeenCalledTimes(1);
  expect(military).toHaveBeenCalledWith(state, corpsScope(state, corps.id), sink);
  runCorpsPhase(state, corps.id, 'domestic', sink);
  expect(domestic).toHaveBeenCalledTimes(1);
  expect(domestic).toHaveBeenCalledWith(state, corpsScope(state, corps.id), sink, {
    rewards: false,
    policies: false,
  });
  runCorpsPhase(state, corps.id, 'diplomacy', sink);
  expect(domestic).toHaveBeenCalledTimes(1);
  expect(military).toHaveBeenCalledTimes(1);
});
