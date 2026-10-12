import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import { appendFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { validateState } from '../src/core/state/invariants';
import { test, expect } from './fixtures';

const SEED = 15600519;
const DURATION_MS = 30 * 60_000;
const BLOCKED_LIMIT_MS = 60_000;
const catalog = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { id: string; cutscene: { title: string }; choices: { label: string }[] }[] };

test('opt-in national 30 wall-minute ordinary ×5 lifecycle observation', async ({ page }, info) => {
  test.skip(
    info.config.metadata.nationalSoak !== true,
    'Requires playwright.soak.config.ts; never claim a short regression as the 30-minute soak.',
  );
  const observations = info.outputPath('national-soak.jsonl');
  const memory = info.outputPath('national-soak-heap-resources.jsonl');
  const errors: string[] = [];
  const npcWars = new Set<string>();
  const transfers: Array<{ day: number; castleId: string; from: string; to: string }> = [];
  let owners: Record<string, string> = {};
  let started = 0;
  let initialDay = 0;
  let finalDay = 0;
  let completed = false;
  let failure: string | null = null;
  let contextLosses = 0;
  const cdp = await page.context().newCDPSession(page);
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(error.message));
  const record = async (value: object) =>
    appendFile(
      observations,
      `${JSON.stringify({ wallMs: started ? performance.now() - started : 0, ...value })}\n`,
    );

  const observe = () =>
    page.evaluate(() => {
      const game = window.__tenka.debug.getState();
      return {
        day: game.time.day,
        seed: game.meta.seed,
        ending: game.meta.gameOver,
        pendingEventId: game.events.pendingChoiceEventId,
        aliveClans: Object.values(game.clans).filter((clan) => clan.alive).length,
        armies: Object.keys(game.armies).length,
        battles: Object.values(game.battles).map((battle) => ({
          id: battle.id,
          tick: battle.tick,
          resolved: battle.result !== null,
        })),
        owners: Object.fromEntries(
          Object.values(game.castles).map((castle) => [castle.id, castle.ownerClanId]),
        ),
        npcWarReports: game.reports
          .filter((report) => {
            const event = report.event;
            return (
              event.type === 'battle.started' &&
              event.attackerClanId !== game.meta.playerClanId &&
              event.defenderClanId !== game.meta.playerClanId
            );
          })
          .map((report) => ({ id: report.id, day: report.day, event: report.event })),
        contextLosses: Number(document.documentElement.dataset.soakContextLosses ?? 0),
      };
    });

  const handleInteraction = async (reclassification = 0): Promise<string | null> => {
    if (await page.getByTestId('month-summary').isVisible()) {
      await page.getByTestId('month-summary-continue').click();
      await record({ kind: 'decision', action: 'month-summary.continue' });
      return 'month-summary';
    }
    if (await page.getByTestId('proposal-inbox').isVisible()) {
      await page
        .getByRole('dialog')
        .filter({ has: page.getByTestId('proposal-inbox') })
        .getByRole('button', { name: '全部駁回', exact: true })
        .click();
      await record({ kind: 'decision', action: 'proposal.rejectAll' });
      return 'proposal';
    }
    if (await page.getByTestId('envoy-modal').isVisible()) {
      await page
        .getByTestId('envoy-modal')
        .getByRole('button', { name: '拒絕', exact: true })
        .click();
      await record({ kind: 'decision', action: 'envoy.reject' });
      return 'envoy';
    }
    if (await page.getByTestId('battle-offer').isVisible()) {
      await page
        .getByTestId('battle-offer')
        .getByRole('button', { name: '繼續自動解算', exact: true })
        .click();
      await record({ kind: 'decision', action: 'kassen.decline' });
      return 'battle-offer';
    }
    if (await page.getByTestId('event-modal').isVisible()) {
      const pending = await page.evaluate(
        () => window.__tenka.debug.getState().events.pendingChoiceEventId,
      );
      for (const event of catalog.events) {
        const dialog = page.getByRole('dialog', { name: event.cutscene.title, exact: true });
        if (!(await dialog.isVisible())) continue;
        const continuation = dialog.getByRole('button', { name: '繼續', exact: true });
        if (await continuation.isVisible()) {
          await continuation.click();
          await record({ kind: 'decision', action: 'event.continue', eventId: event.id });
          return 'event';
        }
        expect(event.id, 'Visible choice must match actual pending event').toBe(pending);
        for (const [choiceIndex, choice] of event.choices.entries()) {
          const button = dialog.getByRole('button', { name: choice.label, exact: true });
          if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
          await button.click();
          await record({
            kind: 'decision',
            action: 'event.choose',
            eventId: event.id,
            choiceIndex,
          });
          return 'event';
        }
        throw new Error(`Known event ${event.id} has no enabled visible choice`);
      }
      throw new Error(`Unknown event dialog; pending=${pending}`);
    }
    if (await page.getByTestId('screen-battle').isVisible()) {
      const battle = page.getByTestId('screen-battle');
      const exit = battle.getByRole('button', { name: '返回策略畫面', exact: true });
      if (await exit.isVisible()) {
        await exit.click();
        await record({ kind: 'decision', action: 'battle.acknowledgeResult' });
      } else {
        const delegate = battle.getByRole('button', { name: '全軍委任：關', exact: true });
        if (await delegate.isVisible()) {
          await delegate.click();
          await record({ kind: 'decision', action: 'battle.delegateAll' });
        }
        const speed = battle.getByRole('button', { name: '五倍速 ×5', exact: true });
        if ((await speed.getAttribute('aria-pressed')) !== 'true') {
          await speed.click();
          await record({ kind: 'decision', action: 'battle.speed5' });
        }
      }
      return 'battle';
    }
    if (await page.getByRole('dialog').count()) {
      const identity = await page.getByRole('dialog').evaluateAll((dialogs) =>
        dialogs.map((dialog) => ({
          label: dialog.getAttribute('aria-label'),
          labelledBy: dialog.getAttribute('aria-labelledby'),
          heading: dialog.querySelector('h1,h2,h3')?.textContent ?? null,
          roots: [...dialog.querySelectorAll('[data-testid]')].map((node) =>
            node.getAttribute('data-testid'),
          ),
          text: dialog.textContent?.slice(0, 1500),
        })),
      );
      await record({ kind: 'dialog-reclassification', reclassification, identity });
      // A live tick can mount a known dialog after its earlier visibility check.
      // Retry classification only; never dismiss an unrecognized owner.
      if (reclassification < 3) {
        await page.waitForTimeout(100);
        return handleInteraction(reclassification + 1);
      }
      throw new Error(`Unknown dialog blocks the soak: ${JSON.stringify(identity)}`);
    }
    return null;
  };

  try {
    await writeFile(observations, '');
    await writeFile(memory, '');
    await page.addInitScript(() => {
      let losses = 0;
      document.addEventListener(
        'webglcontextlost',
        () => {
          losses += 1;
          document.documentElement.dataset.soakContextLosses = String(losses);
        },
        true,
      );
    });
    await page.goto(`/?debug=1&seed=${SEED}`);
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    const initial = await observe();
    expect(initial.seed).toBe(SEED);
    initialDay = initial.day;
    owners = initial.owners;
    await page.getByTestId('speed-5').click();
    started = performance.now();
    await record({
      kind: 'start',
      seed: SEED,
      durationMs: DURATION_MS,
      day: initialDay,
      scope: 'native-production/automated-known-decisions/not-unattended-manual-acceptance',
    });
    let lastProgress = started;
    let previousProgress = '';
    let nextSample = 0;
    let previousPause: string | null = null;
    while (performance.now() - started < DURATION_MS) {
      const current = await observe();
      finalDay = current.day;
      contextLosses = current.contextLosses;
      expect(errors, 'Console/page errors fail the soak').toEqual([]);
      expect(contextLosses).toBe(0);
      expect(current.ending, 'An ending is not 30 minutes of advancing gameplay').toBeNull();
      await expect(page.getByTestId('error-boundary')).toHaveCount(0);
      for (const report of current.npcWarReports) {
        if (report.day > initialDay && !npcWars.has(report.id)) {
          npcWars.add(report.id);
          await record({ kind: 'npc-war-evidence', ...report });
        }
      }
      for (const [castleId, owner] of Object.entries(current.owners)) {
        const before = owners[castleId];
        if (before !== undefined && before !== owner) {
          const transfer = { day: current.day, castleId, from: before, to: owner };
          transfers.push(transfer);
          await record({ kind: 'observed-castle-transfer', ...transfer });
        }
      }
      owners = current.owners;
      const progress = JSON.stringify([current.day, current.battles]);
      if (progress !== previousProgress) {
        lastProgress = performance.now();
        previousProgress = progress;
      }
      const interaction = await handleInteraction();
      const paused =
        interaction ??
        ((await page.getByTestId('speed-pause').getAttribute('aria-pressed')) === 'true'
          ? 'strategy-paused'
          : null);
      if (paused !== previousPause) {
        await record({
          kind: 'pause-transition',
          from: previousPause,
          to: paused,
          day: current.day,
        });
        previousPause = paused;
      }
      if (interaction === null && paused === 'strategy-paused') {
        await page.getByTestId('speed-5').click();
        await record({ kind: 'decision', action: 'strategy.resume5', day: current.day });
      }
      expect(
        performance.now() - lastProgress,
        'No strategy or tactical progress for a full minute',
      ).toBeLessThan(BLOCKED_LIMIT_MS);
      const elapsed = performance.now() - started;
      if (elapsed >= nextSample) {
        const state = await page.evaluate(() => window.__tenka.debug.getState());
        const violations = validateState(state);
        await record({
          kind: 'minute-sample',
          minute: Math.floor(elapsed / 60_000),
          ...current,
          violations,
        });
        expect(violations, 'Actual current state invariants').toEqual([]);
        await cdp.send('HeapProfiler.collectGarbage');
        const heap = await cdp.send('Runtime.getHeapUsage');
        // Tactical routing unmounts the strategic renderer; absence is not zero resources.
        const resources =
          (await page.getByTestId('map-canvas-host').count()) > 0
            ? await page.evaluate(() => window.__tenka.debug.getMapDiagnostics().resources)
            : null;
        await appendFile(
          memory,
          `${JSON.stringify({ wallMs: performance.now() - started, day: current.day, heap, resources, scope: 'post-GC-JS-heap/renderer-owned-counters/not-GPU-bytes-or-leak-verdict' })}\n`,
        );
        nextSample += 60_000;
      }
      await page.waitForTimeout(1000);
    }
    const terminal = await observe();
    finalDay = terminal.day;
    contextLosses = terminal.contextLosses;
    const violations = validateState(await page.evaluate(() => window.__tenka.debug.getState()));
    await record({ kind: 'final-state', ...terminal, violations });
    expect(terminal.ending).toBeNull();
    expect(errors).toEqual([]);
    expect(contextLosses).toBe(0);
    expect(violations).toEqual([]);
    expect(performance.now() - started).toBeGreaterThanOrEqual(DURATION_MS);
    expect(finalDay).toBeGreaterThan(initialDay);
    expect(npcWars.size, 'Observed actual NPC warfare').toBeGreaterThan(0);
    expect(transfers.length, 'Observed actual castle ownership transfer').toBeGreaterThan(0);
    completed = true;
  } catch (error) {
    failure = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await record({
      kind: 'terminal',
      completed,
      initialDay,
      finalDay,
      errors,
      contextLosses,
      npcWarEvidence: npcWars.size,
      transfers,
      failure,
      heapAcceptance: 'observations-only/no-arbitrary-growth-allowance/no-steady-state-claim',
    });
    await info.attach('national-soak-observations', {
      path: observations,
      contentType: 'application/x-ndjson',
    });
    await info.attach('national-soak-heap-resources', {
      path: memory,
      contentType: 'application/x-ndjson',
    });
    if (!page.isClosed())
      await page.screenshot({ path: info.outputPath('national-soak-terminal.png') });
    await cdp.detach();
  }
});
