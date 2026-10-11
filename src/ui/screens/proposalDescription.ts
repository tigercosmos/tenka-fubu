import { selectM6View } from '@app/viewModels';
import { BAL } from '@core/balance';
import { FACILITIES } from '@core/facilities';
import { monthlyDiplomacyWorkCost } from '@core/index';
import { traitModifier } from '@core/traits';
import type { GameState, Proposal } from '@core/state/gameState';
import { formatNumber, t } from '@i18n/zh-TW';
import { rankLabel, roleLabel } from './OfficerList';

export interface ProposalDescription {
  proposer: string;
  kind: string;
  details: readonly string[];
}

export const FACILITY_PROPOSAL_EFFECT_KEYS: Readonly<Record<string, string>> = Object.freeze({
  'fac.ichi': 'ui.proposal.facility.ichi',
  'fac.komedoiya': 'ui.proposal.facility.komedoiya',
  'fac.heisha': 'ui.proposal.facility.heisha',
  'fac.minato': 'ui.proposal.facility.minato',
  'fac.jisha': 'ui.proposal.facility.jisha',
  'fac.nanbanji': 'ui.proposal.facility.nanbanji',
  'fac.kura': 'ui.proposal.facility.kura',
  'fac.umaya': 'ui.proposal.facility.unverified',
  'fac.kajiba': 'ui.proposal.facility.unverified',
  'fac.shagekijo': 'ui.proposal.facility.shagekijo',
  'fac.hyojosho': 'ui.proposal.facility.hyojosho',
  'fac.inkyo': 'ui.proposal.facility.unverified',
  'fac.toride': 'ui.proposal.facility.unverified',
  'fac.gakumonjo': 'ui.proposal.facility.unverified',
  'fac.ikan': 'ui.proposal.facility.unverified',
  'fac.jokaku': 'ui.proposal.facility.unverified',
});

/** Describes the queued intent, never its eventual success or an invented travel ETA. */
export function describeProposal(
  game: Readonly<GameState>,
  proposal: Readonly<Proposal>,
): ProposalDescription {
  const model = selectM6View(game);
  const name = (id: string) =>
    model.castles.find((x) => x.id === id)?.name ??
    model.districts.find((x) => x.id === id)?.name ??
    model.officers.find((x) => x.id === id)?.name ??
    model.clans.find((x) => x.id === id)?.name ??
    id;
  const officer = model.officers.find((x) => x.id === proposal.officerId);
  const roles: string[] = [];
  for (const castle of model.castles.filter((x) => x.lordId === proposal.officerId))
    roles.push(`${castle.name}${roleLabel('lord')}`);
  for (const district of model.districts.filter((x) => x.stewardId === proposal.officerId))
    roles.push(`${district.name}${roleLabel('steward')}`);
  for (const corps of Object.values(game.corps).filter(
    (x) => x.corpsLeaderId === proposal.officerId,
  ))
    roles.push(`${corps.id}・${roleLabel('corpsLeader')}`);
  for (const army of Object.values(game.armies)) {
    if (army.leaderId === proposal.officerId) roles.push(t('ui.march.leader'));
    else if (army.deputyIds.includes(proposal.officerId)) roles.push(t('ui.march.sub'));
  }
  const proposer = [name(proposal.officerId), officer && rankLabel(officer.rank), ...roles]
    .filter(Boolean)
    .join('・');
  const c = proposal.command;
  let kind: string;
  const details: string[] = [];
  switch (c.type) {
    case 'setDevelopFocus':
      kind = t('ui.proposal.kind.develop');
      details.push(
        t('ui.proposal.intent.develop', {
          district: name(c.districtId),
          focus: t(`term.devPolicy.${c.focus}`),
        }),
      );
      break;
    case 'buildFacility': {
      kind = t('ui.proposal.kind.facility');
      const facility = FACILITIES[c.facilityTypeId];
      details.push(
        t('ui.proposal.intent.facility', {
          castle: name(c.castleId),
          facility: facility ? t(facility.nameKey) : c.facilityTypeId,
        }),
      );
      if (facility)
        details.push(
          t('ui.proposal.intent.buildCost', {
            gold: formatNumber(facility.costGold),
            days: formatNumber(facility.buildDays),
          }),
        );
      details.push(
        t(FACILITY_PROPOSAL_EFFECT_KEYS[c.facilityTypeId] ?? 'ui.proposal.facility.unverified'),
      );
      break;
    }
    case 'march':
      kind = t('ui.proposal.kind.march');
      details.push(
        t('ui.proposal.intent.march', {
          from: name(c.originCastleId),
          to: name(c.targetNodeId),
          soldiers: formatNumber(c.soldiers),
          food: formatNumber(c.food),
        }),
      );
      details.push(
        t('ui.proposal.intent.commanders', {
          leader: name(c.leaderId),
          deputies: c.deputyIds.map(name).join('、') || t('ui.common.none'),
        }),
      );
      break;
    case 'startDiploWork':
      kind = t('ui.proposal.kind.diplomacy');
      details.push(
        t('ui.proposal.intent.diplomacy', {
          target:
            c.target === 'court'
              ? t('ui.court.title')
              : c.target === 'shogunate'
                ? t('ui.shogunate.title')
                : name(c.target),
          executor: name(c.executorId),
          purpose: t(
            c.target === 'court'
              ? 'ui.proposal.purpose.court'
              : c.target === 'shogunate'
                ? 'ui.proposal.purpose.shogunate'
                : 'ui.proposal.purpose.trust',
          ),
        }),
      );
      details.push(
        t('ui.diplomacy.monthlyCost', {
          gold: monthlyDiplomacyWorkCost(game, {
            fromClanId: c.clanId,
            target: c.target,
            officerId: c.executorId,
          }),
        }),
      );
      break;
    case 'startPlot': {
      kind = t('ui.proposal.kind.plot');
      details.push(
        t('ui.proposal.intent.plot', {
          kind: t(`term.plot.${c.kind}`),
          clan: name(c.targetClanId),
          target: name(c.targetCastleId ?? c.targetOfficerId ?? c.targetClanId),
          executor: name(c.executorId),
          gold: formatNumber(c.investGold),
        }),
      );
      const executor = game.officers[c.executorId];
      const cost = Math.round(
        BAL.plotMonthlyCost *
          (c.kind === 'betrayal' ? BAL.plotBetrayalCostMult : 1) *
          (executor ? traitModifier(executor, 'plot.costMult').mult : 1),
      );
      details.push(t('ui.diplomacy.monthlyCost', { gold: cost }));
      break;
    }
    default:
      kind = t('ui.proposal.legacyKind');
      details.push(t('ui.proposal.legacyIntent', { type: c.type }));
  }
  return { proposer, kind, details };
}
