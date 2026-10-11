import { describe, expect, it } from 'vitest';
import { BAL } from '../../src/core/balance';
import { createRngStream } from '../../src/core/rng';
import type { CommandByType } from '../../src/core/commands/registry';
import type { GameEvent } from '../../src/core/state/events';
import type { Plot } from '../../src/core/state/gameState';
import type { SiegeId, TraitId } from '../../src/core/state/ids';
import { canonicalStringify } from '../../src/core/state/serialize';
import {
  validateStartPlot,
  applyStartPlot,
  validateCancelPlot,
  applyCancelPlot,
  validateUseBetrayal,
  applyUseBetrayal,
} from '../../src/core/commands/plotCommands';
import {
  getPlotSuccessRate,
  plotsMonthlyForClan,
  betrayalDailyTick,
} from '../../src/core/systems/plots';
import { ensureDiplomacyRow, getSentiment } from '../../src/core/systems/diplomacyCommon';
import {
  buildTinyState,
  CLAN_ALPHA,
  CLAN_BETA,
  CASTLE_A1,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_LORD,
  OFF_BETA_TAISHO,
  OFF_BETA_BUSHO,
} from '../fixtures/tiny';

function prepared() {
  const state = buildTinyState();
  state.clans[CLAN_ALPHA]!.gold = 100_000;
  const executor = state.officers[OFF_ALPHA_BUSHO]!;
  executor.int = 100;
  executor.traits = [];
  const target = state.officers[OFF_BETA_TAISHO]!;
  target.loyalty = 10;
  target.kinship = 'tozama';
  target.traits = [];
  return state;
}
function command(overrides: Partial<CommandByType['startPlot']> = {}): CommandByType['startPlot'] {
  return {
    type: 'startPlot',
    clanId: CLAN_ALPHA,
    kind: 'poach',
    executorId: OFF_ALPHA_BUSHO,
    targetClanId: CLAN_BETA,
    targetOfficerId: OFF_BETA_TAISHO,
    targetCastleId: null,
    investGold: BAL.plotPoachInvestGoldOptions[0],
    ...overrides,
  };
}
function start(state: ReturnType<typeof prepared>, cmd = command()): Plot {
  expect(validateStartPlot(state, cmd)).toEqual({ ok: true });
  applyStartPlot(state, cmd, () => {});
  return state.diplomacy.plots.at(-1)!;
}
function resultCollector() {
  const events: GameEvent[] = [];
  return { events, emit: (event: GameEvent) => events.push(event) };
}
function chooseOutcome(
  state: ReturnType<typeof prepared>,
  plot: Plot,
  success: boolean,
  exposed = false,
) {
  const p = getPlotSuccessRate(state, plot);
  const exposeP =
    plot.kind === 'poach'
      ? BAL.plotExposeChancePoach
      : plot.kind === 'rumor'
        ? BAL.plotExposeChanceRumor
        : BAL.plotExposeChanceBetrayal;
  for (let seed = 0; seed < 100_000; seed += 1) {
    const rngState = { ...state.rng, misc: seed },
      rng = createRngStream(rngState, 'misc');
    if (rng.chance(p) !== success) continue;
    if (!success && rng.chance(exposeP) !== exposed) continue;
    state.rng.misc = seed;
    return;
  }
  throw new Error('Expected deterministic outcome not reachable');
}

describe('plot command validation and lifecycle', () => {
  it('is pure, validates target shape, initial loyalty, kin and leader immunity, and investment options', () => {
    const state = prepared(),
      cmd = command(),
      before = canonicalStringify(state);
    expect(validateStartPlot(state, cmd).ok).toBe(true);
    expect(canonicalStringify(state)).toBe(before);
    for (const bad of [
      command({ targetOfficerId: OFF_BETA_LORD }),
      command({ targetCastleId: CASTLE_B1 }),
      command({ investGold: 1 }),
      command({ investGold: NaN }),
    ])
      expect(validateStartPlot(state, bad).ok).toBe(false);
    const target = state.officers[OFF_BETA_TAISHO]!;
    target.loyalty = BAL.plotPoachLoyaltyThreshold;
    expect(validateStartPlot(state, cmd).ok).toBe(false);
    target.loyalty -= 1;
    target.kinship = 'kin';
    expect(validateStartPlot(state, cmd).ok).toBe(false);
    target.kinship = 'tozama';
    target.traits = ['trait.chushin' as TraitId];
    expect(validateStartPlot(state, cmd).ok).toBe(false);
    expect(
      validateStartPlot(
        state,
        command({ kind: 'rumor', targetOfficerId: null, targetCastleId: CASTLE_B1 }),
      ).ok,
    ).toBe(true);
    expect(validateStartPlot(state, command({ kind: 'rumor', targetOfficerId: null })).ok).toBe(
      false,
    );
  });
  it.each(['alliance', 'marriage', 'ceasefire', 'vassal'] as const)(
    'rejects a target protected by %s',
    (kind) => {
      const state = prepared();
      ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA).pacts.push({
        kind,
        startDay: state.time.day,
        endDay: kind === 'marriage' || kind === 'vassal' ? null : state.time.day + 1,
        vassalClanId: kind === 'vassal' ? CLAN_BETA : null,
      });
      expect(validateStartPlot(state, command()).ok).toBe(false);
    },
  );
  it('enforces executor busy, per-clan limit, duplicate target, cost and ownership; cancellation has no refund or RNG', () => {
    const state = prepared(),
      cmd = command(),
      gold = state.clans[CLAN_ALPHA]!.gold;
    const plot = start(state, command({ investGold: BAL.plotPoachInvestGoldOptions[1] }));
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - plot.investGold);
    expect(plot.officerId).toBe(cmd.executorId);
    const beforeBusyValidation = structuredClone(state);
    expect(validateStartPlot(state, cmd)).toEqual({
      ok: false,
      reasonKey: 'cmd.reject.officerBusy',
      params: { name: state.officers[cmd.executorId]!.name },
    });
    expect(state).toEqual(beforeBusyValidation);
    expect(validateStartPlot(state, command({ executorId: OFF_ALPHA_TAISHO }))).toMatchObject({
      reasonKey: 'cmd.reject.alreadyActive',
    });
    const cancel = {
      type: 'cancelPlot',
      clanId: CLAN_ALPHA,
      plotId: plot.id,
    } as CommandByType['cancelPlot'];
    expect(validateCancelPlot(state, { ...cancel, clanId: CLAN_BETA }).ok).toBe(false);
    const rng = { ...state.rng };
    applyCancelPlot(state, cancel, () => {});
    expect(state.diplomacy.plots).toHaveLength(0);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - plot.investGold);
    expect(state.rng).toEqual(rng);
    state.clans[CLAN_ALPHA]!.gold = 0;
    expect(
      validateStartPlot(state, command({ investGold: BAL.plotPoachInvestGoldOptions[1] })),
    ).toMatchObject({ reasonKey: 'cmd.reject.insufficientGold' });
    state.diplomacy.plots = Array.from({ length: BAL.plotMaxConcurrent }, () => ({
      ...plot,
      officerId: OFF_ALPHA_TAISHO,
    }));
    expect(validateStartPlot(state, command())).toMatchObject({
      reasonKey: 'cmd.reject.alreadyActive',
    });
  });
  it('deducts monthly cost, keeps fractional progress and does not consume RNG before completion', () => {
    const state = prepared(),
      plot = start(state),
      rng = { ...state.rng },
      gold = state.clans[CLAN_ALPHA]!.gold;
    state.officers[OFF_ALPHA_BUSHO]!.int = 91;
    state.officers[OFF_BETA_TAISHO]!.loyalty = BAL.plotPoachLoyaltyThreshold + 1; // Only initiation checks loyalty.
    const { events, emit } = resultCollector();
    plotsMonthlyForClan(state, CLAN_ALPHA, emit);
    expect(plot.progress).toBe(BAL.plotPoachProgressBase + 91 / BAL.plotPoachProgressIntDivisor);
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(gold - BAL.plotMonthlyCost);
    expect(events).toHaveLength(0);
    expect(state.rng).toEqual(rng);
  });
  it('applies the executor cost trait to monthly maintenance, not the declared one-time investment', () => {
    const state = prepared();
    state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.boshin' as TraitId];
    const before = state.clans[CLAN_ALPHA]!.gold;
    const plot = start(state, command({ investGold: BAL.plotPoachInvestGoldOptions[1] }));
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(before - plot.investGold);
    plotsMonthlyForClan(state, CLAN_ALPHA, () => {});
    expect(state.clans[CLAN_ALPHA]!.gold).toBe(
      before - plot.investGold - Math.round(BAL.plotMonthlyCost * (1 - BAL.traitBoshinCostCut)),
    );
  });
  it.each(['poor', 'transferred', 'dead'] as const)(
    'cancels %s plots without consuming randomness',
    (reason) => {
      const state = prepared(),
        plot = start(state),
        { events, emit } = resultCollector(),
        rng = { ...state.rng };
      if (reason === 'poor') state.clans[CLAN_ALPHA]!.gold = 0;
      if (reason === 'transferred') state.officers[plot.targetOfficerId!]!.clanId = CLAN_ALPHA;
      if (reason === 'dead') state.officers[plot.targetOfficerId!]!.status = 'dead';
      plotsMonthlyForClan(state, CLAN_ALPHA, emit);
      expect(state.diplomacy.plots).toHaveLength(0);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({ type: 'plot.failed' });
      expect(state.rng).toEqual(rng);
    },
  );
});

describe('plot probabilities, traits, resolution and replay', () => {
  it('applies canonical base formula and independent acceptance factor, and previews without writes', () => {
    const state = prepared(),
      cmd = command();
    const base = Math.min(
      BAL.plotPoachPMax,
      Math.max(
        BAL.plotPoachPMin,
        BAL.plotPoachBase +
          (100 - 10) / BAL.plotPoachLoyaltyDivisor +
          (100 - BAL.plotPoachIntBaseline) / BAL.plotPoachIntDivisor,
      ),
    );
    const before = canonicalStringify(state);
    expect(getPlotSuccessRate(state, cmd)).toBe(
      (base * (BAL.poachEligibleLoyalty - 10)) / BAL.poachEligibleLoyalty,
    );
    expect(canonicalStringify(state)).toBe(before);
    state.officers[OFF_BETA_TAISHO]!.loyalty = BAL.poachEligibleLoyalty;
    expect(getPlotSuccessRate(state, cmd)).toBe(0);
    state.officers[OFF_BETA_TAISHO]!.loyalty = 10;
    state.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.ninja' as TraitId];
    expect(getPlotSuccessRate(state, cmd)).toBeCloseTo(
      ((base + BAL.traitNinja) * (BAL.poachEligibleLoyalty - 10)) / BAL.poachEligibleLoyalty,
    );
  });
  it('uses castle lord counter intelligence, vacant default, and resident early-warning defense', () => {
    const state = prepared(),
      cmd = command({ kind: 'rumor', targetOfficerId: null, targetCastleId: CASTLE_B1 });
    state.officers[OFF_BETA_LORD]!.int = 100;
    expect(getPlotSuccessRate(state, cmd)).toBe(BAL.plotRumorBase);
    state.castles[CASTLE_B1]!.lordId = null;
    expect(getPlotSuccessRate(state, cmd)).toBe(
      BAL.plotRumorBase + (100 - BAL.plotCounterIntFallback) / BAL.plotRumorIntDivisor,
    );
    state.officers[OFF_BETA_BUSHO]!.traits = ['trait.hayamimi' as TraitId];
    state.officers[OFF_BETA_BUSHO]!.locationCastleId = CASTLE_B1;
    expect(getPlotSuccessRate(state, cmd)).toBe(
      BAL.plotRumorBase +
        (100 - BAL.plotCounterIntFallback) / BAL.plotRumorIntDivisor -
        BAL.traitHayamimi,
    );
  });
  it('transfers a successful poach, strips lordship, initializes loyalty and emits both canonical events', () => {
    const state = prepared(),
      plot = start(state);
    plot.progress = BAL.plotProgressMax;
    state.castles[CASTLE_B1]!.lordId = OFF_BETA_TAISHO;
    chooseOutcome(state, plot, true);
    const replay = structuredClone(state),
      { events, emit } = resultCollector(),
      two = resultCollector();
    plotsMonthlyForClan(state, CLAN_ALPHA, emit);
    plotsMonthlyForClan(replay, CLAN_ALPHA, two.emit);
    const target = state.officers[OFF_BETA_TAISHO]!;
    expect(target.clanId).toBe(CLAN_ALPHA);
    expect(target.loyalty).toBe(BAL.poachedInitialLoyalty);
    expect(target.locationCastleId).not.toBeNull();
    expect(state.castles[target.locationCastleId!]!.ownerClanId).toBe(CLAN_ALPHA);
    expect(state.castles[CASTLE_B1]!.lordId).not.toBe(OFF_BETA_TAISHO);
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(BAL.plotPoachSuccessSentimentHit);
    expect(events.map((event) => event.type)).toContain('officer.recruited');
    expect(events.at(-1)).toMatchObject({
      type: 'plot.succeeded',
      targetOfficerId: OFF_BETA_TAISHO,
      targetCastleId: null,
    });
    expect(state.officers[OFF_ALPHA_BUSHO]!.merit).toBeGreaterThanOrEqual(BAL.meritPlot);
    expect(canonicalStringify(state)).toBe(canonicalStringify(replay));
    expect(events).toEqual(two.events);
  });
  it.each([true, false])('fails with exposed=%s and takes precisely two misc draws', (exposed) => {
    const state = prepared(),
      plot = start(state);
    plot.progress = BAL.plotProgressMax;
    chooseOutcome(state, plot, false, exposed);
    const expectedRng = { ...state.rng },
      rng = createRngStream(expectedRng, 'misc');
    rng.next();
    rng.next();
    const loyalty = state.officers[OFF_BETA_TAISHO]!.loyalty,
      { events, emit } = resultCollector();
    plotsMonthlyForClan(state, CLAN_ALPHA, emit);
    expect(state.rng).toEqual(expectedRng);
    expect(events.map((event) => event.type)).toEqual([exposed ? 'plot.exposed' : 'plot.failed']);
    expect(state.officers[OFF_BETA_TAISHO]!.loyalty).toBe(
      loyalty + (exposed ? BAL.plotPoachExposeLoyaltyGain : 0),
    );
    expect(getSentiment(state, CLAN_BETA, CLAN_ALPHA)).toBe(
      exposed ? BAL.plotPoachExposeSentimentHit : 0,
    );
  });
  it.each(['officer', 'castle'] as const)(
    'resolves rumor %s with bounded loyalty/morale',
    (mode) => {
      const state = prepared(),
        plot = start(
          state,
          command({
            kind: 'rumor',
            targetOfficerId: mode === 'officer' ? OFF_BETA_TAISHO : null,
            targetCastleId: mode === 'castle' ? CASTLE_B1 : null,
          }),
        );
      plot.progress = BAL.plotProgressMax;
      chooseOutcome(state, plot, true);
      state.castles[CASTLE_B1]!.morale = 1;
      plotsMonthlyForClan(state, CLAN_ALPHA, () => {});
      if (mode === 'officer')
        expect(state.officers[OFF_BETA_TAISHO]!.loyalty).toBe(
          Math.max(0, 10 - BAL.plotRumorLoyaltyHit),
        );
      else expect(state.castles[CASTLE_B1]!.morale).toBe(0);
    },
  );
  it('matches the final poach probability within three percentage points over 1000 deterministic trials', () => {
    const base = prepared(),
      plot = start(base);
    plot.progress = BAL.plotProgressMax;
    const probability = getPlotSuccessRate(base, plot),
      streamState = { ...base.rng },
      stream = createRngStream(streamState, 'misc');
    let successes = 0;
    for (let i = 0; i < 1000; i += 1) {
      const state = structuredClone(base);
      stream.next();
      state.rng.misc = streamState.misc;
      plotsMonthlyForClan(state, CLAN_ALPHA, (event) => {
        if (event.type === 'plot.succeeded') successes += 1;
      });
    }
    expect(Math.abs(successes / 1000 - probability)).toBeLessThanOrEqual(0.03);
  });
});

describe('betrayal persistent mark, immunity and siege activation', () => {
  function setup() {
    const state = prepared();
    state.castles[CASTLE_B1]!.lordId = OFF_BETA_TAISHO;
    const cmd = command({
      kind: 'betrayal',
      targetOfficerId: null,
      targetCastleId: CASTLE_B1,
      investGold: BAL.plotBetrayalInvestGoldOptions[0],
    });
    return { state, cmd };
  }
  it('snapshots the targeted owner/lord and invalidates after loading a changed or expired castle', () => {
    const { state, cmd } = setup(),
      plot = start(state, cmd);
    plot.progress = BAL.plotProgressMax;
    expect(plot.targetOfficerId).toBe(OFF_BETA_TAISHO);
    chooseOutcome(state, plot, true);
    plotsMonthlyForClan(state, CLAN_ALPHA, () => {});
    expect(state.castles[CASTLE_B1]).toMatchObject({
      betrayalReadyClanId: CLAN_ALPHA,
      betrayalReadyTargetClanId: CLAN_BETA,
      betrayalReadyTargetLordId: OFF_BETA_TAISHO,
      betrayalReadyUntilDay: state.time.day + BAL.plotBetrayalMarkMonths * 30,
    });
    for (const change of ['owner', 'lord', 'expiry'] as const) {
      const loaded = JSON.parse(canonicalStringify(state)) as typeof state,
        castle = loaded.castles[CASTLE_B1]!;
      if (change === 'owner') castle.ownerClanId = CLAN_ALPHA;
      if (change === 'lord') castle.lordId = OFF_BETA_LORD;
      if (change === 'expiry') loaded.time.day = castle.betrayalReadyUntilDay + 1;
      betrayalDailyTick(loaded, () => {});
      expect(castle).toMatchObject({
        betrayalReadyClanId: null,
        betrayalReadyTargetClanId: null,
        betrayalReadyTargetLordId: null,
        betrayalReadyUntilDay: 0,
      });
    }
  });
  it('rejects a replaced target lord mid-plot without consuming RNG', () => {
    const { state, cmd } = setup(),
      plot = start(state, cmd),
      rng = { ...state.rng },
      { events, emit } = resultCollector();
    state.castles[CASTLE_B1]!.lordId = OFF_BETA_LORD;
    plot.progress = BAL.plotProgressMax;
    plotsMonthlyForClan(state, CLAN_ALPHA, emit);
    expect(events[0]).toMatchObject({ type: 'plot.failed' });
    expect(state.rng).toEqual(rng);
  });
  it('persists exposure immunity across save/load and respects its exact end day', () => {
    const { state, cmd } = setup(),
      plot = start(state, cmd);
    plot.progress = BAL.plotProgressMax;
    chooseOutcome(state, plot, false, true);
    plotsMonthlyForClan(state, CLAN_ALPHA, () => {});
    const loaded = JSON.parse(canonicalStringify(state)) as typeof state,
      castle = loaded.castles[CASTLE_B1]!;
    expect(castle.betrayalImmunityUntilDay).toBe(
      state.time.day + BAL.plotBetrayalImmunityMonths * 30,
    );
    expect(getSentiment(loaded, CLAN_BETA, CLAN_ALPHA)).toBe(BAL.plotBetrayalExposeSentimentHit);
    expect(loaded.officers[OFF_BETA_TAISHO]!.loyalty).toBe(10 + BAL.plotBetrayalExposeLoyaltyGain);
    loaded.time.day = castle.betrayalImmunityUntilDay - 1;
    expect(validateStartPlot(loaded, cmd).ok).toBe(false);
    loaded.time.day += 1;
    expect(validateStartPlot(loaded, cmd).ok).toBe(true);
  });
  it('activates once in the owning siege, sets morale min and lord loyalty zero, consumes the mark', () => {
    const { state, cmd } = setup(),
      plot = start(state, cmd);
    plot.progress = BAL.plotProgressMax;
    chooseOutcome(state, plot, true);
    plotsMonthlyForClan(state, CLAN_ALPHA, () => {});
    const siegeId = 'siege.test' as SiegeId;
    state.sieges[siegeId] = {
      id: siegeId,
      castleId: CASTLE_B1,
      attackerClanId: CLAN_ALPHA,
      attackerArmyIds: [],
      mode: 'assault',
      startDay: state.time.day,
      interrupted: false,
      betrayalUsed: false,
    };
    const activate = {
      type: 'useBetrayal',
      clanId: CLAN_ALPHA,
      siegeId,
    } as CommandByType['useBetrayal'];
    expect(validateUseBetrayal(state, { ...activate, clanId: CLAN_BETA }).ok).toBe(false);
    expect(validateUseBetrayal(state, activate).ok).toBe(true);
    const row = ensureDiplomacyRow(state, CLAN_ALPHA, CLAN_BETA);
    row.pacts.push({
      kind: 'ceasefire',
      startDay: state.time.day,
      endDay: state.time.day + 1,
      vassalClanId: null,
    });
    expect(validateUseBetrayal(state, activate).ok).toBe(false);
    row.pacts = [];
    const castle = state.castles[CASTLE_B1]!;
    castle.morale = BAL.plotBetrayalMoraleFloor - 1;
    const rng = { ...state.rng },
      { events, emit } = resultCollector();
    applyUseBetrayal(state, activate, emit);
    expect(castle.morale).toBe(BAL.plotBetrayalMoraleFloor - 1);
    expect(state.officers[OFF_BETA_TAISHO]!.loyalty).toBe(0);
    expect(castle.betrayalReadyClanId).toBeNull();
    expect(state.sieges[siegeId].betrayalUsed).toBe(true);
    expect(events[0]).toMatchObject({ type: 'plot.betrayalActivated', castleId: CASTLE_B1 });
    expect(validateUseBetrayal(state, activate).ok).toBe(false);
    expect(state.rng).toEqual(rng);
    expect(state.castles[CASTLE_A1]!.ownerClanId).toBe(CLAN_ALPHA);
  });
});
