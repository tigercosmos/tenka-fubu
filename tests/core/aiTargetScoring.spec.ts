import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { validateCommand } from '../../src/core/commands/validate';
import { ensureDiplomacyRow } from '../../src/core/systems/diplomacyCommon';
import { scoreExpansionTargets } from '../../src/core/systems/ai/targetScoring';
import {
  planMarchFromCastle,
  retainedGarrison,
  scopeAuthority,
} from '../../src/core/systems/ai/shared';
import { aiScenario } from '../helpers/aiScenario';
import { CLAN_ALPHA, CLAN_BETA, CASTLE_B1 } from '../fixtures/tiny';

describe('M7 expansion scoring', () => {
  it('selects weak adjacent targets, cooperates and preserves home garrisons with valid commands', () => {
    const { state, scope } = aiScenario(),
      before = structuredClone(state);
    const candidates = scoreExpansionTargets(state, CLAN_ALPHA, scope);
    expect(candidates[0]!.targetCastleId).toBe(CASTLE_B1);
    expect(candidates[0]!.score).toBeGreaterThanOrEqual(BAL.aiExpandScoreMin);
    expect(candidates[0]!.requiredRatio).toBeCloseTo(1.26);
    expect(candidates[0]!.sources).toHaveLength(2);
    for (const source of candidates[0]!.sources) {
      const castle = state.castles[source.castleId]!;
      expect(castle.soldiers - source.soldiers).toBeGreaterThanOrEqual(retainedGarrison(castle));
      const command = planMarchFromCastle(state, scope, castle, CASTLE_B1, source.soldiers)!;
      expect(validateCommand(state, command, scopeAuthority(scope))).toEqual({ ok: true });
    }
    expect(state).toEqual(before);
  });
  it.each(['alliance', 'marriage', 'ceasefire', 'vassal'] as const)(
    'never targets a %s partner',
    (kind) => {
      const { state, scope } = aiScenario();
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
        kind,
        vassalClanId: kind === 'vassal' ? CLAN_ALPHA : null,
        startDay: state.time.day,
        endDay: null,
      });
      expect(scoreExpansionTargets(state, CLAN_ALPHA, scope)).toEqual([]);
    },
  );
  it('does not create self-target staging commands or over-commit starving sources', () => {
    const { state, scope } = aiScenario();
    const castle = state.castles[scope.castleIds[0]!]!;
    expect(planMarchFromCastle(state, scope, castle, castle.id)).toBeNull();
    castle.food = 0;
    expect(planMarchFromCastle(state, scope, castle, CASTLE_B1)).toBeNull();
  });
});
