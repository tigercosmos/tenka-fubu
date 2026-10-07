import { BAL } from '../balance';
import { createRngStream } from '../rng';
import { traitModifier } from '../traits';
import type { CommandByType, EmitFn } from '../commands/registry';
import type { Castle, GameState, Plot } from '../state/gameState';
import type { ClanId } from '../state/ids';
import { adjustSentiment, canPlot } from './diplomacyCommon';
import {
  adjustLoyalty,
  effectiveStat,
  gainMerit,
  poachAcceptanceFactor,
  transferOfficer,
} from './officers';
import { nearestOwnedCastleByTravelTime } from './castleSelection';
import { DAYS_PER_MONTH } from './time';

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
type PlotInput = Plot | CommandByType['startPlot'];

export function plotMonthlyProgress(state: Readonly<GameState>, plot: PlotInput): number {
  const executor = state.officers['executorId' in plot ? plot.executorId : plot.officerId];
  if (!executor) return 0;
  const int = effectiveStat(executor, 'int');
  return plot.kind === 'poach'
    ? BAL.plotPoachProgressBase + int / BAL.plotPoachProgressIntDivisor
    : plot.kind === 'rumor'
      ? BAL.plotRumorProgressBase + int / BAL.plotRumorProgressIntDivisor
      : BAL.plotBetrayalProgressBase + int / BAL.plotBetrayalProgressIntDivisor;
}

export function getPlotSuccessRate(state: Readonly<GameState>, plot: PlotInput): number {
  const executor = state.officers['executorId' in plot ? plot.executorId : plot.officerId];
  if (!executor) return 0;
  const castle = plot.targetCastleId === null ? undefined : state.castles[plot.targetCastleId];
  const targetId =
    plot.kind === 'betrayal' && 'executorId' in plot ? castle?.lordId : plot.targetOfficerId;
  const target = targetId == null ? undefined : state.officers[targetId];
  const targetCastle =
    castle ??
    (target?.locationCastleId == null ? undefined : state.castles[target.locationCastleId]);
  const int = effectiveStat(executor, 'int');
  let p: number;
  if (plot.kind === 'poach') {
    if (!target) return 0;
    p = clamp(
      BAL.plotPoachBase +
        (100 - target.loyalty) / BAL.plotPoachLoyaltyDivisor +
        (int - BAL.plotPoachIntBaseline) / BAL.plotPoachIntDivisor +
        plot.investGold / BAL.plotPoachGoldDivisor,
      BAL.plotPoachPMin,
      BAL.plotPoachPMax,
    );
  } else if (plot.kind === 'betrayal') {
    if (!target) return 0;
    p = clamp(
      BAL.plotBetrayalBase +
        (100 - target.loyalty) / BAL.plotBetrayalLoyaltyDivisor +
        int / BAL.plotBetrayalIntDivisor +
        plot.investGold / BAL.plotBetrayalGoldDivisor,
      BAL.plotBetrayalPMin,
      BAL.plotBetrayalPMax,
    );
  } else {
    const lord = targetCastle?.lordId == null ? undefined : state.officers[targetCastle.lordId];
    const counter = lord === undefined ? BAL.plotCounterIntFallback : effectiveStat(lord, 'int');
    p = clamp(
      BAL.plotRumorBase + (int - counter) / BAL.plotRumorIntDivisor,
      BAL.plotRumorPMin,
      BAL.plotRumorPMax,
    );
  }
  p += traitModifier(executor, 'plot.successAdd').add;
  // Early warning protects the castle of the officer who carries the trait.
  if (targetCastle)
    for (const defender of Object.values(state.officers))
      if (
        defender.status === 'serving' &&
        defender.clanId === plot.targetClanId &&
        defender.locationCastleId === targetCastle.id
      )
        p += traitModifier(defender, 'plot.defenseAdd').add;
  p = clamp(p, 0, 1);
  return plot.kind === 'poach' && target ? p * poachAcceptanceFactor(state, target.id) : p;
}

export function clearBetrayalMark(castle: Castle): void {
  castle.betrayalReadyClanId = null;
  castle.betrayalReadyUntilDay = 0;
  castle.betrayalReadyTargetClanId = null;
  castle.betrayalReadyTargetLordId = null;
}

export function validBetrayalMark(
  state: Readonly<GameState>,
  castle: Castle,
  actor: ClanId,
): boolean {
  const lord = castle.lordId === null ? undefined : state.officers[castle.lordId];
  return (
    castle.betrayalReadyClanId === actor &&
    state.clans[actor]?.alive === true &&
    castle.ownerClanId !== actor &&
    castle.betrayalReadyTargetClanId === castle.ownerClanId &&
    castle.betrayalReadyTargetLordId === castle.lordId &&
    state.time.day <= castle.betrayalReadyUntilDay &&
    lord?.status === 'serving' &&
    lord.clanId === castle.ownerClanId
  );
}

export function betrayalDailyTick(state: GameState, _emit: EmitFn): void {
  void _emit; // Silent expiry: no canonical event is defined for clearing a mark.
  for (const castle of Object.values(state.castles).sort((a, b) => a.id.localeCompare(b.id)))
    if (
      castle.betrayalReadyClanId !== null &&
      !validBetrayalMark(state, castle, castle.betrayalReadyClanId)
    )
      clearBetrayalMark(castle);
}

function plotTargetValid(state: Readonly<GameState>, plot: Plot): boolean {
  if (
    !state.clans[plot.targetClanId]?.alive ||
    !canPlot(state, plot.ownerClanId, plot.targetClanId)
  )
    return false;
  const officer = plot.targetOfficerId === null ? undefined : state.officers[plot.targetOfficerId];
  const castle = plot.targetCastleId === null ? undefined : state.castles[plot.targetCastleId];
  if (castle && castle.ownerClanId !== plot.targetClanId) return false;
  if (plot.targetCastleId !== null && !castle) return false;
  if (
    plot.targetOfficerId !== null &&
    (!officer ||
      officer.status !== 'serving' ||
      officer.clanId !== plot.targetClanId ||
      !officer.hasComeOfAge ||
      officer.id === state.clans[plot.targetClanId]?.leaderId)
  )
    return false;
  if (
    plot.kind === 'betrayal' &&
    (castle?.lordId !== plot.targetOfficerId ||
      officer?.id === state.clans[plot.targetClanId]?.leaderId)
  )
    return false;
  if (
    plot.kind === 'poach' &&
    officer &&
    (officer.kinship === 'kin' ||
      officer.id === state.clans[plot.targetClanId]?.leaderId ||
      officer.traits.some((id) => id === 'trait.chushin'))
  )
    return false;
  return true;
}

function emitResolution(
  state: GameState,
  plot: Plot,
  type: 'plot.succeeded' | 'plot.failed' | 'plot.exposed',
  emit: EmitFn,
): void {
  emit({
    type,
    day: state.time.day,
    clanIds: [plot.ownerClanId, plot.targetClanId],
    kind: plot.kind,
    actorClanId: plot.ownerClanId,
    targetClanId: plot.targetClanId,
    targetOfficerId: plot.targetOfficerId,
    targetCastleId: plot.targetCastleId,
  });
}

function succeed(state: GameState, plot: Plot, emit: EmitFn): void {
  const target = plot.targetOfficerId === null ? undefined : state.officers[plot.targetOfficerId];
  const castle = plot.targetCastleId === null ? undefined : state.castles[plot.targetCastleId];
  if (plot.kind === 'poach' && target) {
    const from = target.locationCastleId ?? state.clans[plot.targetClanId]!.homeCastleId;
    const destination =
      nearestOwnedCastleByTravelTime(state, plot.ownerClanId, from)?.castle ??
      state.castles[state.clans[plot.ownerClanId]!.homeCastleId];
    // Every living clan owns its home castle; pathfinding may not cross a hostile boundary.
    transferOfficer(
      state,
      target.id,
      {
        clanId: plot.ownerClanId,
        castleId: destination!.id,
        loyalty: BAL.poachedInitialLoyalty,
        rank: target.rank,
      },
      emit,
    );
    adjustSentiment(state, plot.targetClanId, plot.ownerClanId, BAL.plotPoachSuccessSentimentHit);
  } else if (plot.kind === 'rumor') {
    if (target) adjustLoyalty(target, -BAL.plotRumorLoyaltyHit);
    else if (castle) castle.morale = Math.max(0, castle.morale - BAL.plotRumorMoraleHit);
  } else if (castle) {
    castle.betrayalReadyClanId = plot.ownerClanId;
    castle.betrayalReadyUntilDay = state.time.day + BAL.plotBetrayalMarkMonths * DAYS_PER_MONTH;
    castle.betrayalReadyTargetClanId = plot.targetClanId;
    castle.betrayalReadyTargetLordId = plot.targetOfficerId;
  }
  const executor = state.officers[plot.officerId];
  if (executor) gainMerit(executor, BAL.meritPlot, ['int']);
  emitResolution(state, plot, 'plot.succeeded', emit);
}

function expose(state: GameState, plot: Plot, emit: EmitFn): void {
  const target = plot.targetOfficerId === null ? undefined : state.officers[plot.targetOfficerId];
  const castle = plot.targetCastleId === null ? undefined : state.castles[plot.targetCastleId];
  if (plot.kind === 'poach') {
    adjustSentiment(state, plot.targetClanId, plot.ownerClanId, BAL.plotPoachExposeSentimentHit);
    if (target) adjustLoyalty(target, BAL.plotPoachExposeLoyaltyGain);
  } else if (plot.kind === 'rumor')
    adjustSentiment(state, plot.targetClanId, plot.ownerClanId, BAL.plotRumorExposeSentimentHit);
  else {
    adjustSentiment(state, plot.targetClanId, plot.ownerClanId, BAL.plotBetrayalExposeSentimentHit);
    if (target) adjustLoyalty(target, BAL.plotBetrayalExposeLoyaltyGain);
    if (castle)
      castle.betrayalImmunityUntilDay =
        state.time.day + BAL.plotBetrayalImmunityMonths * DAYS_PER_MONTH;
  }
  emitResolution(state, plot, 'plot.exposed', emit);
}

export function plotsMonthlyForClan(state: GameState, clanId: ClanId, emit: EmitFn): void {
  const clan = state.clans[clanId];
  if (!clan?.alive) return;
  const plots = state.diplomacy.plots
    .filter((plot) => plot.ownerClanId === clanId)
    .sort((a, b) => a.id.localeCompare(b.id));
  for (const plot of plots) {
    // Earlier poaching may cancel another executor's plot; never process stale entries.
    if (!state.diplomacy.plots.some((live) => live.id === plot.id)) continue;
    const executor = state.officers[plot.officerId];
    const cost = Math.round(
      BAL.plotMonthlyCost *
        (plot.kind === 'betrayal' ? BAL.plotBetrayalCostMult : 1) *
        (executor ? traitModifier(executor, 'plot.costMult').mult : 1),
    );
    const remove = () => {
      state.diplomacy.plots = state.diplomacy.plots.filter((live) => live.id !== plot.id);
    };
    if (
      clan.gold < cost ||
      executor?.status !== 'serving' ||
      executor.clanId !== clanId ||
      executor.armyId !== null
    ) {
      remove();
      emitResolution(state, plot, 'plot.failed', emit);
      continue;
    }
    clan.gold -= cost;
    if (!plotTargetValid(state, plot)) {
      remove();
      emitResolution(state, plot, 'plot.failed', emit);
      continue;
    }
    const progress = plotMonthlyProgress(state, plot);
    plot.progress = Math.min(BAL.plotProgressMax, plot.progress + progress);
    if (plot.progress < BAL.plotProgressMax) continue;
    const rng = createRngStream(state.rng, 'misc');
    if (rng.chance(getPlotSuccessRate(state, plot))) succeed(state, plot, emit);
    else {
      const exposure =
        plot.kind === 'poach'
          ? BAL.plotExposeChancePoach
          : plot.kind === 'rumor'
            ? BAL.plotExposeChanceRumor
            : BAL.plotExposeChanceBetrayal;
      if (rng.chance(exposure)) expose(state, plot, emit);
      else emitResolution(state, plot, 'plot.failed', emit);
    }
    remove();
  }
}
