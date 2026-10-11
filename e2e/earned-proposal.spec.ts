import { writeFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { GameState } from '../src/core/state/gameState';
import { validateState } from '../src/core/state/invariants';
import { validateCommand } from '../src/core/commands/validate';
import { encodeFullSnapshot } from './full-snapshot-transport';
import { test, expect } from './fixtures';

declare global {
  interface Window {
    __earnedProposalSettlement?: {
      state: GameState;
      log: ReturnType<typeof window.__tenka.debug.exportCommandLog>;
    };
  }
}

async function state(page: Page): Promise<GameState> {
  return JSON.parse(
    await page.evaluate<string>(
      `(${encodeFullSnapshot.toString()})(window.__tenka.debug.getState())`,
    ),
  ) as GameState;
}

test('earned monthly proposal adoption waits for summary ownership then executes on ordinary day31', async ({
  page,
}, info) => {
  test.setTimeout(90_000);
  const observations: Record<string, unknown> = {};
  const capture = async (name: string) => {
    const game = await state(page);
    observations[name] = {
      state: game,
      log: await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
      dialogs: await page.getByRole('dialog').allTextContents(),
      paused: await page.getByTestId('speed-pause').getAttribute('aria-pressed'),
    };
    // Keep the completed prefix available even if a later assertion fails.
    await writeFile(
      info.outputPath('earned-proposal-observations.json'),
      JSON.stringify(observations, null, 2),
    );
    return game;
  };
  await page.goto('/?debug=1&seed=42');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await page.getByTestId('newgame-start').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.getByTestId('speed-pause').click();
  const initial = await capture('initial');
  expect(initial.time.day).toBe(0);
  expect(initial.meta.playerClanId).toBe('clan.oda');
  expect(initial.meta.scenarioId).toBe('s1560');
  expect(Object.keys(initial.proposals)).toHaveLength(0);
  expect(new Set(Object.values(initial.provinces).map((p) => p.region)).size).toBe(9);
  expect(validateState(initial)).toEqual([]);

  await page.getByTestId('speed-1').click();
  const inbox = page.getByTestId('proposal-inbox');
  await expect(inbox).toBeVisible({ timeout: 45_000 });
  const generated = await capture('generated');
  expect(generated.time.day).toBe(30);
  expect(validateState(generated)).toEqual([]);
  const proposals = Object.values(generated.proposals).filter((p) => p.status === 'pending');
  expect(proposals).toHaveLength(3);
  const selected = proposals[0]!;
  expect(selected.createdDay).toBe(30);
  expect(selected.officerId).toBe('off.shibata-katsuie');
  expect(selected.command).toEqual({
    type: 'march',
    clanId: 'clan.oda',
    originCastleId: 'castle.kiyosu',
    leaderId: selected.officerId,
    deputyIds: [],
    soldiers: 1658,
    food: 1989,
    targetNodeId: 'castle.okazaki',
  });
  if (selected.command.type !== 'march') throw new Error('Expected the naturally generated march');
  const march = selected.command;
  expect(validateCommand(generated, march).ok).toBe(true);
  expect(
    generated.reports.filter(
      (r) => r.event.type === 'proposal.submitted' && r.event.proposalId === selected.id,
    ),
  ).toHaveLength(1);
  await expect(inbox.getByTestId('proposal-command-details')).toContainText('清洲城');
  await expect(inbox.getByTestId('proposal-command-details')).toContainText('岡崎城');
  await expect(inbox).toContainText('柴田勝家');
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByTestId('month-summary')).toHaveCount(0);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');

  await inbox.getByRole('button', { name: '採納', exact: true }).click();
  await expect(inbox).toContainText('瀧川一益');
  expect(await capture('adoptionQueued')).toEqual(generated);
  await page.getByRole('dialog').getByRole('button', { name: '全部駁回', exact: true }).click();
  await expect(inbox).toHaveCount(0);
  await expect(page.getByTestId('month-summary')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(1);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  expect(await capture('summaryOwnsPause')).toEqual(generated);

  // Observe the first real tick without driving, pausing or modifying the simulation.
  await page.evaluate(() => {
    delete window.__earnedProposalSettlement;
    const observe = () => {
      const game = window.__tenka.debug.getState();
      if (game.time.day <= 30) {
        requestAnimationFrame(observe);
        return;
      }
      window.__earnedProposalSettlement = {
        state: structuredClone(game),
        log: window.__tenka.debug.exportCommandLog(),
      };
    };
    requestAnimationFrame(observe);
  });
  await page.getByTestId('month-summary-continue').click();
  await expect(page.getByTestId('month-summary')).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.__earnedProposalSettlement?.state.time.day), {
      intervals: [50],
    })
    .toBe(31);
  await page.getByTestId('speed-pause').click();
  const settlement = await page.evaluate(() => window.__earnedProposalSettlement!);
  observations.firstOrdinaryTick = settlement;
  await capture('afterNativePause');
  const settled = settlement.state;
  expect(validateState(settled)).toEqual([]);
  expect(settled.proposals[selected.id]!.status).toBe('accepted');
  expect(proposals.slice(1).map((p) => settled.proposals[p.id]!.status)).toEqual([
    'rejected',
    'rejected',
  ]);
  const beforeOfficer = generated.officers[selected.officerId]!;
  const afterOfficer = settled.officers[selected.officerId]!;
  expect(afterOfficer.merit).toBe(beforeOfficer.merit + 30);
  expect(afterOfficer.statExp.ldr).toBe(beforeOfficer.statExp.ldr + 30);
  expect(afterOfficer.loyalty).toBe(beforeOfficer.loyalty + 2);
  const armies = Object.values(settled.armies).filter((a) => a.leaderId === selected.officerId);
  expect(armies).toHaveLength(1);
  expect(armies[0]).toMatchObject({
    originCastleId: march.originCastleId,
    targetNodeId: march.targetNodeId,
    soldiers: march.soldiers,
    initialTroops: march.soldiers,
  });
  expect(afterOfficer.armyId).toBe(armies[0]!.id);
  expect(
    settled.reports.filter(
      (r) => r.event.type === 'army.departed' && r.event.leaderId === selected.officerId,
    ),
  ).toHaveLength(1);
  const decisions = settlement.log.entries.filter((e) => e.command.type === 'resolveProposal');
  expect(decisions).toHaveLength(3);
  expect(decisions.map((e) => ({ day: e.day, command: e.command }))).toEqual(
    proposals.map((p, index) => ({
      day: 31,
      command: {
        type: 'resolveProposal',
        clanId: generated.meta.playerClanId,
        proposalId: p.id,
        accept: index === 0,
      },
    })),
  );
  expect(settled.rng).toEqual(generated.rng);
  await info.attach('earned-proposal-full-state-command-and-ownership-proof', {
    path: info.outputPath('earned-proposal-observations.json'),
    contentType: 'application/json',
  });
});
