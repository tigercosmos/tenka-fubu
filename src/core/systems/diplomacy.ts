import { BAL } from '../balance';
import { facilityIsActive, hasPolicy } from '../domestic';
import { traitModifier } from '../traits';
import type { GameState } from '../state/gameState';
import type { GameEvent } from '../state/events';
import type { ClanId } from '../state/ids';
import type { EmitFn } from '../commands/registry';
import { settleDiplomacyProposal } from '../commands/diplomacyCommands';
import { pairKey } from '../state/serialize';
import {
  courtFavorGainMonthly,
  courtMonthlyForClan,
  courtUnlocks,
  monthlyDiplomacyWorkCost,
} from './court';
import {
  adjustSentiment,
  adjustTrust,
  buildAdjacency,
  ensureDiplomacyRow,
  getSentiment,
  getTrust,
  isAtWar,
} from './diplomacyCommon';
import { evaluateProposal, hasCommonEnemy } from './diplomacyEval';
import { effectiveStat, gainMerit } from './officers';
import { betrayalDailyTick, plotsMonthlyForClan } from './plots';
import { reconcilePeace } from './diplomacyPeace';
import { taimeiEffects } from './events/taimei';

function missionsMonthlyForClan(state: GameState, clanId: ClanId, emit: EmitFn): void {
  const facilityGainMult = Object.values(state.castles).some(
    (castle) => castle.ownerClanId === clanId && facilityIsActive(state, castle, 'fac.hyojosho'),
  )
    ? BAL.facDiplomacyWorkGainMult
    : 1;
  const policyGainMult = hasPolicy(state, clanId, 'pol.enkokinko')
    ? BAL.polEnkokinkoWorkGainMult
    : 1;
  const missions = state.diplomacy.missions
    .filter((mission) => mission.fromClanId === clanId)
    .sort((a, b) => a.target.localeCompare(b.target) || a.officerId.localeCompare(b.officerId));
  for (const mission of missions) {
    const officer = state.officers[mission.officerId],
      clan = state.clans[clanId]!;
    const valid =
      officer?.status === 'serving' &&
      officer.clanId === clanId &&
      officer.armyId === null &&
      (mission.target === 'court' ||
        (mission.target === 'shogunate'
          ? state.court.shogunateExists
          : state.clans[mission.target]?.alive));
    const cost = monthlyDiplomacyWorkCost(state, mission);
    if (!valid || clan.gold < cost) {
      state.diplomacy.missions = state.diplomacy.missions.filter((entry) => entry !== mission);
      emit({
        type: 'diplo.workStopped',
        day: state.time.day,
        clanIds: [clanId],
        clanId,
        target: mission.target,
      });
      continue;
    }
    clan.gold -= cost;
    if (mission.target === 'court' || mission.target === 'shogunate') {
      const favor =
        mission.target === 'court' ? state.court.courtFavor : state.court.shogunateFavor;
      favor[clanId] = Math.min(
        mission.target === 'court' ? BAL.courtFavorMax : BAL.shogunateFavorMax,
        (favor[clanId] ?? 0) +
          courtFavorGainMonthly(officer, mission.target === 'court' ? 'court' : 'shogunate') *
            facilityGainMult *
            policyGainMult,
      );
    } else {
      const sentimentMult = Math.max(
        BAL.trustSentimentMultMin,
        Math.min(
          BAL.trustSentimentMultMax,
          1 + getSentiment(state, mission.target, clanId) / BAL.trustGainSentimentDivisor,
        ),
      );
      const rankMult = courtUnlocks(clan.courtRank).includes('trustGainBonus')
        ? BAL.courtTrustGainMult
        : 1;
      const trustBefore = getTrust(state, clanId, mission.target);
      adjustTrust(
        state,
        clanId,
        mission.target,
        (BAL.trustGainBase + effectiveStat(officer, 'pol') / BAL.trustGainPolDivisor) *
          traitModifier(officer, 'diplo.trustGainMult').mult *
          sentimentMult *
          rankMult *
          taimeiEffects(state, clanId).trustGainMult *
          facilityGainMult *
          policyGainMult,
      );
      // 06 §3.5: completing this paid work, not merely staying at the cap.
      // A later credit spend and genuine re-crossing is a new completion.
      if (trustBefore < BAL.trustMax && getTrust(state, clanId, mission.target) === BAL.trustMax) {
        gainMerit(officer, BAL.meritDiplomacy, ['pol']);
      }
    }
  }
}
function sentimentMonthly(state: GameState): void {
  const adjacency = buildAdjacency(state);
  const clans = Object.values(state.clans)
    .filter((clan) => clan.alive)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (let i = 0; i < clans.length; i++)
    for (let j = i + 1; j < clans.length; j++) {
      const a = clans[i]!.id,
        b = clans[j]!.id,
        key = pairKey(a, b);
      const commonEnemy = hasCommonEnemy(state, a, b);
      const existing = state.diplomacy.rows[key];
      if (!existing && !adjacency.has(key) && !commonEnemy) continue;
      const row = ensureDiplomacyRow(state, a, b);
      let delta = isAtWar(state, a, b)
        ? BAL.sentimentAtWarMonthly
        : adjacency.has(key) &&
            !row.pacts.some((pact) => pact.endDay === null || state.time.day <= pact.endDay)
          ? BAL.sentimentBorderTensionMonthly
          : 0;
      if (commonEnemy) delta += BAL.sentimentCommonEnemyMonthly;
      for (const [from, to] of [
        [a, b],
        [b, a],
      ] as const) {
        adjustSentiment(state, from, to, delta);
        const value = getSentiment(state, from, to);
        adjustSentiment(
          state,
          from,
          to,
          -Math.sign(value) * Math.min(Math.abs(value), BAL.sentimentDriftMonthly),
        );
      }
    }
}
export function diplomacySystem(state: GameState): GameEvent[] {
  const events: GameEvent[] = [],
    emit: EmitFn = (event) => events.push(event);
  for (const row of Object.values(state.diplomacy.rows).sort((a, b) =>
    a.key.localeCompare(b.key),
  )) {
    const expired = row.pacts.filter(
      (pact) => pact.endDay !== null && state.time.day > pact.endDay,
    );
    row.pacts = row.pacts.filter((pact) => pact.endDay === null || state.time.day <= pact.endDay);
    for (const pact of expired)
      emit({
        type: 'pact.expired',
        day: state.time.day,
        clanIds: [row.a, row.b],
        aClanId: row.a,
        bClanId: row.b,
        kind: pact.kind,
      });
  }
  for (const proposal of [...state.diplomacy.pendingProposals].sort((a, b) =>
    a.id.localeCompare(b.id),
  )) {
    if (state.time.day > proposal.expiresDay) settleDiplomacyProposal(state, proposal, false, emit);
    else if (proposal.toClanId !== state.meta.playerClanId || state.ai.allAi)
      settleDiplomacyProposal(
        state,
        proposal,
        evaluateProposal(state, proposal.fromClanId, proposal.toClanId, proposal.kind) >=
          BAL.dipAcceptThreshold,
        emit,
      );
  }
  betrayalDailyTick(state, emit);
  events.push(...reconcilePeace(state));
  if (state.time.dayOfMonth === 1) {
    for (const clan of Object.values(state.clans).sort((a, b) => a.id.localeCompare(b.id)))
      if (clan.alive) {
        missionsMonthlyForClan(state, clan.id, emit);
        plotsMonthlyForClan(state, clan.id, emit);
        courtMonthlyForClan(state, clan.id, emit);
      }
    sentimentMonthly(state);
  }
  return events;
}
