import { BAL } from '../../balance';
import { validateCommand } from '../../commands/validate';
import type { Command } from '../../commands/types';
import { FACILITIES } from '../../facilities';
import { RANK_VALUES } from '../../state/enums';
import type { GameState, Proposal } from '../../state/gameState';
import { effectiveStats } from '../officers';
import { isOfficerBusy } from '../diplomacyCommon';
import { proposalOfficerCooldownKey } from '../proposals';
import { traitModifier } from '../../traits';
import { availableExecutors, isThreatened, plotCandidates } from './council';
import { rankFacilities } from './domesticMetadata';
import { pickDevFocus } from './stewardAi';
import { scoreExpansionTargets } from './targetScoring';
import { officerTroopCap, planMarchFromCastle } from './shared';
import type { AiScope, AiSink } from './types';

export type ProposalCandidate = Omit<Proposal, 'id' | 'createdDay' | 'expiresDay' | 'status'>;
const clampNeed = (value: number) => Math.max(0.5, Math.min(2, value));
/** No proposal submission or command enqueue here: root owns Step10 delivery and limits. */
export function generateProposalCandidates(state: GameState, sink?: AiSink): ProposalCandidate[] {
  const clanId = state.meta.playerClanId;
  const scope: AiScope = {
    clanId,
    corpsId: null,
    targetNodeId: null,
    castleIds: Object.values(state.castles)
      .filter((c) => c.ownerClanId === clanId && c.corpsId === null && c.directControl)
      .map((c) => c.id),
  };
  const entries = state.ai.clans[clanId]?.threatCache?.entries ?? [];
  const expansion = scoreExpansionTargets(state, clanId, scope);
  const monthStart = state.time.day - state.time.dayOfMonth + 1;
  const ranked: { candidate: ProposalCandidate; score: number }[] = [];
  for (const officer of Object.values(state.officers).sort((a, b) => a.id.localeCompare(b.id))) {
    if (
      officer.clanId !== clanId ||
      officer.id === state.clans[clanId]?.leaderId ||
      officer.status !== 'serving' ||
      !officer.hasComeOfAge ||
      RANK_VALUES.indexOf(officer.rank) < RANK_VALUES.indexOf('samurai-taisho') ||
      isOfficerBusy(state, officer.id) ||
      (state.events.cooldownUntil[proposalOfficerCooldownKey(officer.id)] ?? 0) > state.time.day ||
      Object.values(state.proposals).some(
        (p) => p.officerId === officer.id && (p.status === 'pending' || p.createdDay >= monthStart),
      )
    )
      continue;
    const stats = effectiveStats(officer);
    // Stable stat tie order follows 09's listed pol/int/ldr/val candidate groups.
    const dominant = [...(['pol', 'int', 'ldr', 'val'] as const)].sort(
      (a, b) => stats[b] - stats[a],
    )[0]!;
    if (stats[dominant] < BAL.proposalStatThreshold) continue;
    const commands: { command: Command; kind: Proposal['kind']; need: number }[] = [];
    if (dominant === 'pol') {
      const fiefs = Object.values(state.districts).filter(
        (d) => d.stewardId === officer.id && d.ownerClanId === clanId,
      );
      const districts = fiefs.length
        ? fiefs
        : Object.values(state.districts).filter(
            (d) => d.castleId === officer.locationCastleId && d.ownerClanId === clanId,
          );
      const scored = districts
        .map((district) => {
          const focus = pickDevFocus(district);
          const gap =
            focus === 'agri'
              ? (district.kokudakaCap - district.kokudaka) / Math.max(1, district.kokudakaCap)
              : focus === 'commerce'
                ? (district.commerceCap - district.commerce) / Math.max(1, district.commerceCap)
                : (district.populationCap - district.population) /
                  Math.max(1, district.populationCap);
          return { district, focus, gap };
        })
        .sort((a, b) => b.gap - a.gap || a.district.id.localeCompare(b.district.id));
      for (const { district, focus, gap } of scored)
        if (focus !== district.developFocus)
          commands.push({
            command: { type: 'setDevelopFocus', clanId, districtId: district.id, focus },
            kind: 'develop',
            need: 1 + gap * 0.8,
          });
      const castle =
        officer.locationCastleId === null ? undefined : state.castles[officer.locationCastleId];
      if (castle?.ownerClanId === clanId)
        for (const def of rankFacilities(isThreatened(state, castle)))
          commands.push({
            command: { type: 'buildFacility', clanId, castleId: castle.id, facilityTypeId: def.id },
            kind: 'facility',
            need: 1 + (scored[0]?.gap ?? 0) * 0.8,
          });
    } else if (dominant === 'int') {
      const need = clampNeed(entries[0]?.threat ?? 0);
      for (const command of plotCandidates(state, clanId, officer))
        commands.push({ command, kind: 'plot', need });
      const enemy = entries.find((entry) => entry.threat >= BAL.aiDiploFearThreshold);
      if (enemy && availableExecutors(state, clanId, 'pol').some((o) => o.id === officer.id))
        commands.push({
          command: {
            type: 'startDiploWork',
            clanId,
            target: enemy.enemyClanId,
            executorId: officer.id,
          },
          kind: 'diplomacy',
          need,
        });
    } else {
      const castle =
        officer.locationCastleId === null ? undefined : state.castles[officer.locationCastleId];
      if (castle && scope.castleIds.includes(castle.id))
        for (const target of expansion) {
          const command = planMarchFromCastle(
            state,
            scope,
            castle,
            target.targetCastleId,
            officerTroopCap(state, officer),
          );
          // Proposer must command their own departure; shared planner picks a legal leader by ability.
          if (command)
            commands.push({
              command: { ...command, leaderId: officer.id },
              kind: 'march',
              need: clampNeed(target.score / BAL.aiExpandScoreMin),
            });
        }
    }
    const picked = commands.find(({ command }) => validateCommand(state, command).ok);
    if (!picked) continue;
    const cost =
      picked.command.type === 'buildFacility'
        ? (FACILITIES[picked.command.facilityTypeId]?.costGold ?? 0)
        : picked.command.type === 'startPlot'
          ? picked.command.investGold
          : 0;
    const candidate: ProposalCandidate = {
      clanId,
      officerId: officer.id,
      kind: picked.kind,
      command: picked.command,
      meritReward: BAL.meritProposalAdopted,
      estimatedCostGold: cost,
      summaryKey: `ui.proposal.kind.${picked.kind}`,
      summaryParams: {},
    };
    ranked.push({
      candidate,
      score: stats[dominant] * picked.need * traitModifier(officer, 'proposal.weightMult').mult,
    });
  }
  ranked.sort(
    (a, b) => b.score - a.score || a.candidate.officerId.localeCompare(b.candidate.officerId),
  );
  const result = ranked.slice(0, BAL.proposalTopK).map((entry) => entry.candidate);
  sink?.record({
    day: state.time.day,
    clanId,
    layer: 'proposal',
    kind: result.length ? 'proposal.generate' : 'proposal.none',
    detail: { count: result.length },
    scores: ranked
      .slice(0, BAL.proposalTopK)
      .map((entry) => ({ label: entry.candidate.officerId, value: entry.score })),
    commands: result.map((candidate) => candidate.command),
  });
  return result;
}
