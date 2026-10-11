import type { CouncilPhase, GameState } from '../../state/gameState';
import type { CorpsId } from '../../state/ids';
import { corpsCastleIds } from '../corps';
import { attackPlansDailyTick, militaryPhase } from './attackPlan';
import { runDomesticCouncil } from './council';
import { getThreatCache } from './threat';
import type { AiScope, AiSink } from './types';

export function corpsScope(state: GameState, corpsId: CorpsId): AiScope | null {
  const corps = state.corps[corpsId];
  if (!corps || !state.clans[corps.clanId]?.alive) return null;
  return {
    clanId: corps.clanId,
    corpsId,
    castleIds: corpsCastleIds(state, corpsId),
    targetNodeId: corps.targetNodeId,
  };
}

/** Scheduled through the shared phase budget, not a second independent council loop. */
export function runCorpsPhase(
  state: GameState,
  corpsId: CorpsId,
  phase: CouncilPhase,
  sink: AiSink,
): void {
  const scope = corpsScope(state, corpsId);
  if (!scope || scope.castleIds.length === 0) return;
  switch (phase) {
    case 'threat':
      getThreatCache(state, scope.clanId);
      break;
    case 'military':
      // 09's develop prohibition takes precedence over 07's earlier automatic advance wording.
      if (state.corps[corpsId]!.directive === 'advance') militaryPhase(state, scope, sink);
      else if (state.corps[corpsId]!.directive === 'hold')
        militaryPhase(state, scope, sink, { allowExpansion: false });
      break;
    case 'domestic':
      runDomesticCouncil(state, scope, sink, { rewards: false, policies: false });
      break;
    case 'diplomacy':
      break; // Corps cannot negotiate clan diplomacy.
  }
}

/** Existing plans still receive timeout/retreat maintenance after a directive changes. */
export function runCorpsDailyTick(state: GameState, sink: AiSink): void {
  for (const corpsId of Object.keys(state.corps).sort() as CorpsId[]) {
    const scope = corpsScope(state, corpsId);
    if (scope) attackPlansDailyTick(state, scope, sink);
  }
}
