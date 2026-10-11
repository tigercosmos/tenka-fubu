import { afterEach, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { resetGameStoreForTests, store, bumpTickSeq, setGame } from '@app/store';
import { getQueuedPlayerCommands, resetBridgeForTests, runOneDay } from '@app/bridge';
import { FACILITIES, FACILITY_DEFS } from '@core/facilities';
import { BAL } from '@core/balance';
import { validateCommand } from '@core/index';
import { validateState } from '@core/state/invariants';
import type { Command } from '@core/commands/types';
import type { GameState, Proposal } from '@core/state/gameState';
import { encodeSave, decodeSave } from '@core/save/serialize';
import { generateProposalCandidates } from '@core/systems/ai/proposalGen';
import { submitProposal } from '@core/systems/proposals';
import { ensureDiplomacyRow } from '@core/systems/diplomacyCommon';
import { pickDevFocus } from '@core/systems/ai/stewardAi';
import { formatNumber, t } from '@i18n/zh-TW';
import {
  describeProposal,
  FACILITY_PROPOSAL_EFFECT_KEYS,
} from '../../src/ui/screens/proposalDescription';
import type { ProposalId, TraitId } from '@core/state/ids';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CASTLE_B1,
  OFF_ALPHA_BUSHO,
  OFF_ALPHA_TAISHO,
  OFF_BETA_BUSHO,
  CLAN_ALPHA,
  CLAN_BETA,
  DIST_A1X,
} from '../fixtures/tiny';
import { ProposalInbox } from '../../src/ui/screens/ProposalInbox';
import { uiStore } from '../../src/ui/hooks/uiStore';

afterEach(() => {
  cleanup();
  resetBridgeForTests();
  resetGameStoreForTests();
  uiStore.getState().actions.reset();
});

function suggestion(game: GameState, command: Command): Proposal {
  return {
    id: 'proposal.description' as ProposalId,
    clanId: CLAN_ALPHA,
    officerId: OFF_ALPHA_BUSHO,
    kind: 'develop',
    command,
    createdDay: game.time.day,
    expiresDay: game.time.day + 60,
    status: 'pending',
    meritReward: 5,
    estimatedCostGold: 777,
    summaryKey: 'ui.officer.actions',
    summaryParams: {},
  };
}

it.each(['poach', 'rumor', 'betrayal'] as const)(
  'describes %s intent, executor, target and real recurring cost without mutation',
  (kind) => {
    const game = buildTinyState();
    const command: Command = {
      type: 'startPlot',
      clanId: CLAN_ALPHA,
      kind,
      executorId: OFF_ALPHA_BUSHO,
      targetClanId: CLAN_BETA,
      targetOfficerId: kind === 'poach' ? OFF_BETA_BUSHO : null,
      targetCastleId: kind === 'poach' ? null : CASTLE_B1,
      investGold: kind === 'betrayal' ? BAL.plotBetrayalMinInvestGold : 0,
    };
    const before = JSON.stringify(game);
    const description = describeProposal(game, suggestion(game, command));
    expect(description.details[0]).toContain(t(`term.plot.${kind}`));
    expect(description.details[0]).toContain(game.clans[CLAN_BETA]!.name);
    expect(description.details[0]).toContain(game.officers[OFF_ALPHA_BUSHO]!.name);
    expect(description.details[0]).toContain(
      kind === 'poach' ? game.officers[OFF_BETA_BUSHO]!.name : game.castles[CASTLE_B1]!.name,
    );
    expect(description.details[0]).toContain(formatNumber(command.investGold));
    expect(description.details[1]).toBe(
      t('ui.diplomacy.monthlyCost', {
        gold: BAL.plotMonthlyCost * (kind === 'betrayal' ? BAL.plotBetrayalCostMult : 1),
      }),
    );
    expect(JSON.stringify(game)).toBe(before);
  },
);

it('describes development, facility base work and diplomacy with separate saved cost and actual roles', () => {
  const game = buildTinyState();
  const develop = describeProposal(
    game,
    suggestion(game, {
      type: 'setDevelopFocus',
      clanId: CLAN_ALPHA,
      districtId: DIST_A1X,
      focus: 'commerce',
    }),
  );
  expect(develop.details[0]).toContain(game.districts[DIST_A1X]!.name);
  expect(develop.details[0]).toContain(t('term.devPolicy.commerce'));
  const facility = Object.values(FACILITIES)[0]!;
  const built = suggestion(game, {
    type: 'buildFacility',
    clanId: CLAN_ALPHA,
    castleId: CASTLE_A1,
    facilityTypeId: facility.id,
  });
  const before = JSON.stringify(built);
  const build = describeProposal(game, built);
  expect(build.details[0]).toContain(game.castles[CASTLE_A1]!.name);
  expect(build.details[0]).toContain(t(facility.nameKey));
  expect(build.details[1]).toBe(
    t('ui.proposal.intent.buildCost', {
      gold: formatNumber(facility.costGold),
      days: formatNumber(facility.buildDays),
    }),
  );
  expect(JSON.stringify(built)).toBe(before);
  const diplo = describeProposal(
    game,
    suggestion(game, {
      type: 'startDiploWork',
      clanId: CLAN_ALPHA,
      target: CLAN_BETA,
      executorId: OFF_ALPHA_BUSHO,
    }),
  );
  expect(diplo.details[0]).toContain(game.clans[CLAN_BETA]!.name);
  expect(diplo.details[0]).toContain(game.officers[OFF_ALPHA_BUSHO]!.name);
  expect(diplo.details[1]).toBe(
    t('ui.diplomacy.monthlyCost', { gold: BAL.diplomacyWorkMonthlyCost }),
  );
  for (const target of ['court', 'shogunate'] as const) {
    const work = describeProposal(
      game,
      suggestion(game, {
        type: 'startDiploWork',
        clanId: CLAN_ALPHA,
        target,
        executorId: OFF_ALPHA_BUSHO,
      }),
    );
    expect(work.details[0]).toContain(t(`ui.proposal.purpose.${target}`));
    expect(work.details[0]).toContain(t(`ui.${target}.title`));
    expect(work.details[1]).toBe(
      t('ui.diplomacy.monthlyCost', {
        gold: target === 'court' ? BAL.courtWorkMonthlyCost : BAL.shogunateWorkMonthlyCost,
      }),
    );
  }
  const lord = suggestion(game, {
    type: 'setDevelopFocus',
    clanId: CLAN_ALPHA,
    districtId: DIST_A1X,
    focus: 'agri',
  });
  lord.officerId = OFF_ALPHA_TAISHO;
  expect(describeProposal(game, lord).proposer).toContain(t('term.title.lord'));
});

it('preserves a valid old generic summary through native codec, displays it and queues one actual generated adoption', () => {
  const game = buildTinyState();
  const officer = game.officers[OFF_ALPHA_BUSHO]!;
  officer.pol = 100;
  officer.int = 10;
  officer.ldr = 10;
  officer.val = 10;
  game.districts[DIST_A1X]!.developFocus = 'commerce';
  game.districts[DIST_A1X]!.kokudaka = 0;
  game.districts[DIST_A1X]!.commerce = game.districts[DIST_A1X]!.commerceCap;
  const candidate = generateProposalCandidates(game).find((x) => x.officerId === OFF_ALPHA_BUSHO);
  expect(candidate?.command.type).toBe('setDevelopFocus');
  if (!candidate || candidate.command.type !== 'setDevelopFocus')
    throw new Error('Expected legal generated development suggestion');
  expect(validateCommand(game, candidate.command)).toEqual({ ok: true });
  const event = submitProposal(game, candidate);
  if (!event || event.type !== 'proposal.submitted') throw new Error('Expected proposal delivery');
  expect(validateState(game)).toEqual([]);
  const loaded = decodeSave(encodeSave(game, 0));
  if (!loaded.ok) throw new Error(loaded.code);
  const restored = loaded.saveFile.state;
  expect(restored.proposals[event.proposalId]!).toEqual(game.proposals[event.proposalId]!);
  resetGameStoreForTests(restored);
  store.getState().actions.setScreen('main');
  store.getState().actions.requestPause('user');
  const before = JSON.stringify(restored);
  render(<ProposalInbox />);
  expect(
    screen.getAllByText(t(candidate.summaryKey, candidate.summaryParams)).length,
  ).toBeGreaterThan(0);
  expect(screen.getByTestId('proposal-kind').textContent).toBe(t('ui.proposal.kind.develop'));
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    restored.districts[candidate.command.districtId]!.name,
  );
  fireEvent.click(screen.getByRole('button', { name: t('ui.proposal.adopt') }));
  expect(JSON.stringify(restored)).toBe(before);
  expect(getQueuedPlayerCommands(restored)).toEqual([
    { type: 'resolveProposal', clanId: CLAN_ALPHA, proposalId: event.proposalId, accept: true },
  ]);
  act(() => {
    runOneDay();
  });
  expect(restored.proposals[event.proposalId]!.status).toBe('accepted');
  expect(restored.districts[candidate.command.districtId]!.developFocus).toBe(
    candidate.command.focus,
  );
  expect(validateState(restored)).toEqual([]);
});

it('uses stable IDs for missing names and truthful unsupported legacy-command fallback', () => {
  const game = buildTinyState();
  const missing = 'castle.missing' as typeof CASTLE_B1;
  const march = suggestion(game, {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    targetNodeId: missing,
    leaderId: OFF_ALPHA_BUSHO,
    deputyIds: [OFF_ALPHA_TAISHO],
    soldiers: 1234,
    food: 567,
  });
  const description = describeProposal(game, march);
  expect(description.details[0]).toContain(missing);
  expect(description.details[1]).toContain(game.officers[OFF_ALPHA_TAISHO]!.name);
  const legacy = suggestion(game, {
    type: 'rewardOfficer',
    clanId: CLAN_ALPHA,
    officerId: OFF_ALPHA_BUSHO,
    tier: 'small',
  });
  expect(describeProposal(game, legacy).details).toEqual([
    t('ui.proposal.legacyIntent', { type: 'rewardOfficer' }),
  ]);
  expect(legacy.summaryKey).toBe('ui.officer.actions');
});

it.each(['develop', 'facility', 'march', 'plot', 'diplomacy'] as const)(
  'describes actual legal generated %s payloads',
  (kind) => {
    const game = buildTinyState();
    const id = kind === 'march' ? OFF_ALPHA_TAISHO : OFF_ALPHA_BUSHO;
    const officer = game.officers[id]!;
    officer.pol = 10;
    officer.int = 10;
    officer.ldr = 10;
    officer.val = 10;
    officer.traits = [];
    if (kind === 'develop' || kind === 'facility') {
      officer.pol = 100;
      if (kind === 'develop') {
        game.districts[DIST_A1X]!.developFocus = 'commerce';
        game.districts[DIST_A1X]!.kokudaka = 0;
        game.districts[DIST_A1X]!.commerce = game.districts[DIST_A1X]!.commerceCap;
      } else {
        for (const district of Object.values(game.districts).filter(
          (x) => x.castleId === officer.locationCastleId,
        ))
          district.developFocus = pickDevFocus(district);
        game.clans[CLAN_ALPHA]!.gold = 10000;
      }
    } else if (kind === 'march') {
      officer.ldr = 100;
      game.castles[CASTLE_A2]!.soldiers = 3000;
      game.castles[CASTLE_A2]!.food = 20000;
      game.castles[CASTLE_B1]!.soldiers = 100;
    } else {
      officer.int = 100;
      game.officers[OFF_BETA_BUSHO]!.loyalty = kind === 'plot' ? 20 : 100;
      game.castles[CASTLE_B1]!.lordId = OFF_BETA_BUSHO;
      game.ai.clans[CLAN_ALPHA]!.threatCache = {
        computedDay: game.time.day,
        totalThreat: 2,
        entries: [
          {
            enemyClanId: CLAN_BETA,
            borderPowerEnemy: 1000,
            borderPowerOurs: 500,
            relationFactor: 1,
            threat: 2,
            threatenedCastleIds: [CASTLE_A1],
          },
        ],
      };
      if (kind === 'diplomacy')
        ensureDiplomacyRow(game, CLAN_ALPHA, CLAN_BETA).pacts.push({
          kind: 'alliance',
          startDay: game.time.day,
          endDay: game.time.day + 300,
          vassalClanId: null,
        });
    }
    const candidate = generateProposalCandidates(game).find((x) => x.officerId === id);
    expect(candidate?.kind).toBe(kind);
    if (!candidate) throw new Error('Missing generated candidate');
    expect(validateCommand(game, candidate.command)).toEqual({ ok: true });
    const event = submitProposal(game, candidate);
    if (!event || event.type !== 'proposal.submitted')
      throw new Error('Missing delivered proposal');
    const before = JSON.stringify(game);
    const description = describeProposal(game, game.proposals[event.proposalId]!);
    const c = candidate.command;
    const expectedTarget =
      c.type === 'setDevelopFocus'
        ? game.districts[c.districtId]!.name
        : c.type === 'buildFacility'
          ? t(FACILITIES[c.facilityTypeId]!.nameKey)
          : c.type === 'march'
            ? game.castles[c.targetNodeId as typeof CASTLE_B1]!.name
            : c.type === 'startDiploWork'
              ? game.clans[CLAN_BETA]!.name
              : game.officers[OFF_BETA_BUSHO]!.name;
    expect(description.details.join(' ')).toContain(expectedTarget);
    expect(description.kind).toBe(t(`ui.proposal.kind.${kind}`));
    expect(JSON.stringify(game)).toBe(before);
    resetGameStoreForTests(game);
    render(<ProposalInbox />);
    expect(screen.getByTestId('proposal-command-details').textContent).toContain(expectedTarget);
    if (c.type === 'buildFacility')
      expect(screen.getByTestId('proposal-command-details').textContent).toContain(
        t(FACILITY_PROPOSAL_EFFECT_KEYS[c.facilityTypeId]!),
      );
    expect(JSON.stringify(game)).toBe(before);
  },
);

it('refreshes command details on ordinary same-object ticks and same-ID game replacement', () => {
  const game = buildTinyState();
  const proposal = suggestion(game, {
    type: 'setDevelopFocus',
    clanId: CLAN_ALPHA,
    districtId: DIST_A1X,
    focus: 'agri',
  });
  game.proposals[proposal.id] = proposal;
  resetGameStoreForTests(game);
  render(<ProposalInbox />);
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    game.districts[DIST_A1X]!.name,
  );
  act(() => {
    game.districts[DIST_A1X]!.name = '同局更新';
    bumpTickSeq();
  });
  expect(screen.getByTestId('proposal-command-details').textContent).toContain('同局更新');
  const replacement = buildTinyState();
  replacement.proposals[proposal.id] = structuredClone(proposal);
  replacement.districts[DIST_A1X]!.name = '新局更新';
  act(() => setGame(replacement));
  expect(screen.getByTestId('proposal-command-details').textContent).toContain('新局更新');
  expect(screen.getByTestId('proposal-command-details').textContent).not.toContain('同局更新');
});

it('covers every facility with a current-runtime purpose or an explicit unverified-effect warning', () => {
  expect(Object.keys(FACILITY_PROPOSAL_EFFECT_KEYS).sort()).toEqual(
    FACILITY_DEFS.map((x) => x.id).sort(),
  );
  const game = buildTinyState();
  for (const facility of FACILITY_DEFS) {
    const view = describeProposal(
      game,
      suggestion(game, {
        type: 'buildFacility',
        clanId: CLAN_ALPHA,
        castleId: CASTLE_A1,
        facilityTypeId: facility.id,
      }),
    );
    expect(view.details).toContain(t(FACILITY_PROPOSAL_EFFECT_KEYS[facility.id]!));
    if (facility.id === 'fac.hyojosho') {
      expect(FACILITY_PROPOSAL_EFFECT_KEYS[facility.id]).toBe('ui.proposal.facility.hyojosho');
      expect(view.details.join(' ')).toContain('多座不疊加');
      expect(view.details.join(' ')).toContain('具申品質效果尚未確認');
    }
  }
});

it('shows simultaneous current posts and executor-trait recurring cost rounded once', () => {
  const game = buildTinyState();
  game.districts[DIST_A1X]!.stewardId = OFF_ALPHA_TAISHO;
  const roles = suggestion(game, {
    type: 'setDevelopFocus',
    clanId: CLAN_ALPHA,
    districtId: DIST_A1X,
    focus: 'agri',
  });
  roles.officerId = OFF_ALPHA_TAISHO;
  const proposer = describeProposal(game, roles).proposer;
  expect(proposer).toContain(game.castles[CASTLE_A2]!.name + t('term.title.lord'));
  expect(proposer).toContain(game.districts[DIST_A1X]!.name + t('term.title.steward'));
  const plot = suggestion(game, {
    type: 'startPlot',
    clanId: CLAN_ALPHA,
    kind: 'betrayal',
    executorId: OFF_ALPHA_BUSHO,
    targetClanId: CLAN_BETA,
    targetCastleId: CASTLE_B1,
    targetOfficerId: null,
    investGold: BAL.plotBetrayalMinInvestGold,
  });
  game.proposals[plot.id] = plot;
  resetGameStoreForTests(game);
  render(<ProposalInbox />);
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    t('ui.diplomacy.monthlyCost', { gold: BAL.plotMonthlyCost * BAL.plotBetrayalCostMult }),
  );
  act(() => {
    game.officers[OFF_ALPHA_BUSHO]!.traits = ['trait.boshin' as TraitId];
    bumpTickSeq();
  });
  const before = JSON.stringify(game);
  expect(screen.getByTestId('proposal-command-details').textContent).toContain(
    t('ui.diplomacy.monthlyCost', {
      gold: Math.round(
        BAL.plotMonthlyCost * BAL.plotBetrayalCostMult * (1 - BAL.traitBoshinCostCut),
      ),
    }),
  );
  expect(JSON.stringify(game)).toBe(before);
});

it('shows the actual destination and payload of a generic legacy march suggestion', () => {
  const game = buildTinyState();
  const id = 'proposal.description' as ProposalId;
  game.proposals[id] = {
    id,
    clanId: game.meta.playerClanId,
    officerId: OFF_ALPHA_BUSHO,
    kind: 'march',
    command: {
      type: 'march',
      clanId: game.meta.playerClanId,
      originCastleId: CASTLE_A1,
      targetNodeId: CASTLE_B1,
      leaderId: OFF_ALPHA_BUSHO,
      deputyIds: [],
      soldiers: 1234,
      food: 567,
    },
    createdDay: game.time.day,
    expiresDay: game.time.day + 60,
    status: 'pending',
    meritReward: 5,
    estimatedCostGold: 0,
    summaryKey: 'ui.proposal.kind.march',
    summaryParams: {},
  };
  resetGameStoreForTests(game);
  const before = JSON.stringify(game);
  render(<ProposalInbox />);
  const details = screen.getByTestId('proposal-command-details');
  expect(details.textContent).toContain(game.castles[CASTLE_B1]!.name);
  expect(details.textContent).toContain('1,234');
  expect(details.textContent).toContain('567');
  expect(JSON.stringify(game)).toBe(before);
});
