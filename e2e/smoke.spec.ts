import { completeNewGameWizard } from './new-game-wizard';
// Playwright smoke（規格：plan/17-testing.md §3.8；5 條，不增不減）。
// M1-27：僅落地 P1（載入標題）；M2-20：補上 P2（開新局選織田，18-roadmap.md M2-20）。
// P3–P5 依 18-roadmap.md 各自里程碑到位時於本檔陸續補上（相依任務完成前，對應斷言的
// data-testid 尚不存在）。
import { test, expect } from './fixtures';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';

const eventCatalog = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as { events: { id: string; cutscene: { title: string }; choices: { label: string }[] }[] };

async function advanceThreeMonths(page: Page, info: TestInfo) {
  // Seed 1 naturally presents the canonical nanban choice in March; debug is read-only evidence.
  await page.goto('/?debug=1&seed=1');
  await page.getByTestId('title-newgame').click();
  await page.getByTestId('scenario-pick-s1560').click();
  await page.getByTestId('clan-pick-clan.oda').click();
  await completeNewGameWizard(page);

  const initialDate = await page.getByTestId('hud-date').textContent();
  const initialMatch = initialDate?.match(/(\d+)年(\d+)月/);
  expect(initialMatch).not.toBeNull();
  const initialMonthIndex = Number(initialMatch?.[1]) * 12 + Number(initialMatch?.[2]) - 1;
  const targetMonthIndex = initialMonthIndex + 3;
  expect(await page.evaluate(() => window.__tenka.debug.getState().meta.seed)).toBe(1);
  const eventChoices = Object.fromEntries(
    eventCatalog.events.map((event) => [event.id, event.choices.map((choice) => choice.label)]),
  );

  // Keep the whole running-time loop inside the page. A Playwright locator/evaluate call records a
  // trace snapshot before and after every poll; on a CPU-constrained runner those snapshots can cost
  // several seconds apiece and make the smoke test measure tracing rather than the real ×5 journey.
  await page.evaluate(() => {
    document.querySelector<HTMLElement>('[data-testid="speed-5"]')?.click();
  });
  await page.waitForFunction(
    ({ choicesByEvent, target }) => {
      const visible = (element: Element | null): element is HTMLElement => {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          element.getClientRects().length > 0
        );
      };
      const exactButton = (root: Element, label: string) =>
        Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(
          (button) => button.textContent?.trim() === label && visible(button) && !button.disabled,
        );

      const monthSummary = document.querySelector('[data-testid="month-summary"]');
      if (visible(monthSummary)) {
        document.querySelector<HTMLElement>('[data-testid="month-summary-continue"]')?.click();
        return false;
      }
      const proposal = document.querySelector('[data-testid="proposal-inbox"]');
      if (visible(proposal)) {
        const dialog = proposal.closest('[role="dialog"]');
        if (dialog) exactButton(dialog, '全部駁回')?.click();
        return false;
      }
      const envoy = document.querySelector('[data-testid="envoy-modal"]');
      if (visible(envoy)) {
        exactButton(envoy, '拒絕')?.click();
        return false;
      }
      const eventModal = document.querySelector('[data-testid="event-modal"]');
      if (visible(eventModal)) {
        const dialog = eventModal.closest('[role="dialog"]');
        if (!dialog) return false;
        const continueButton = exactButton(dialog, '繼續');
        if (continueButton) {
          continueButton.click();
          return false;
        }
        const pendingId = window.__tenka.debug.getState().events.pendingChoiceEventId;
        const labels = pendingId === null ? undefined : choicesByEvent[pendingId];
        const choice = labels?.map((label) => exactButton(dialog, label)).find(Boolean);
        choice?.click();
        return false;
      }
      const battle = document.querySelector('[data-testid="screen-battle"]');
      if (visible(battle)) {
        const returnButton = exactButton(battle, '返回策略畫面');
        if (returnButton) returnButton.click();
        else {
          exactButton(battle, '全軍委任：關')?.click();
          const speed = exactButton(battle, '五倍速 ×5');
          if (speed?.getAttribute('aria-pressed') !== 'true') speed?.click();
        }
        return false;
      }
      if (Array.from(document.querySelectorAll('[role="dialog"]')).some(visible)) return false;

      const pause = document.querySelector<HTMLElement>('[data-testid="speed-pause"]');
      if (pause?.getAttribute('aria-pressed') === 'true') {
        document.querySelector<HTMLElement>('[data-testid="speed-5"]')?.click();
      }
      const date = document.querySelector('[data-testid="hud-date"]')?.textContent;
      const match = date?.match(/(\d+)年(\d+)月/);
      const month = match ? Number(match[1]) * 12 + Number(match[2]) - 1 : -1;
      if (month < target) return false;
      pause?.click();
      return true;
    },
    { choicesByEvent: eventChoices, target: targetMonthIndex },
    { polling: 250, timeout: 105_000 },
  );
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  const pausedDate = await page.getByTestId('hud-date').textContent();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('hud-date')).toHaveText(pausedDate ?? '');
  const state = await page.evaluate(() => window.__tenka.debug.getState());
  expect(state.events.flags[`unlock.pol.nanban.${state.meta.playerClanId}`]).toBe(1);
  const log = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  const chosenEvents = log.entries.flatMap((entry) =>
    entry.command.type === 'resolveEventChoice'
      ? [{ eventId: entry.command.eventId, choiceIndex: entry.command.choiceIndex }]
      : [],
  );
  expect(chosenEvents).toContainEqual({ eventId: 'evt.nanban-visit', choiceIndex: 0 });
  const evidencePath = info.outputPath('actual-smoke-months-and-nanban-choice.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        seed: state.meta.seed,
        initialDate,
        pausedDate,
        chosenEvents,
        nanbanAccepted: state.events.flags[`unlock.pol.nanban.${state.meta.playerClanId}`],
        appliedChoices: log.entries.filter((entry) => entry.command.type === 'resolveEventChoice'),
      },
      null,
      2,
    ),
    'utf8',
  );
  await info.attach('actual-smoke-months-and-nanban-choice', {
    path: evidencePath,
    contentType: 'application/json',
  });
  return { initialDate, pausedDate, state, log };
}

test.describe('Playwright smoke（17 §3.8）', () => {
  test('P1 載入標題：screen-title 可見，頁面含「天下布武」字樣，無 console error', async ({
    page,
  }) => {
    await page.goto('/');

    await expect(page.getByTestId('screen-title')).toBeVisible();
    await expect(page.getByText('天下布武')).toBeVisible();
  });

  test('P2 開新局選織田：screen-strategy 可見，hud-date 顯示 s1560 開局日期（1560年），無 console error', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);

    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByTestId('hud-date')).toContainText('1560年');
  });

  test.describe.serial('P3 → P4 共用同一局', () => {
    let journeyContext: BrowserContext;
    let journeyPage: Page;
    let journeyProblems: string[];
    let p3Result: Awaited<ReturnType<typeof advanceThreeMonths>>;

    test.beforeAll(async ({ browser }) => {
      journeyContext = await browser.newContext();
      journeyPage = await journeyContext.newPage();
      journeyProblems = [];
      journeyPage.on('console', (message) => {
        if (message.type() === 'error') journeyProblems.push(`[console.error] ${message.text()}`);
      });
      journeyPage.on('pageerror', (error) => {
        journeyProblems.push(`[pageerror] ${error.message}`);
      });
    });

    test.afterEach(() => {
      expect(
        journeyProblems,
        `偵測到 console error／pageerror：\n${journeyProblems.join('\n')}`,
      ).toEqual([]);
    });

    test.afterAll(async () => {
      await journeyContext.close();
    });

    test('P3 推進 3 個月：x5 到月份 +3，暫停後日期不再前進', async ({ browser }, info) => {
      // A hosted two-core runner can need about 90 seconds for the full national worker simulation.
      test.setTimeout(120_000);
      expect(journeyContext.browser()).toBe(browser);
      p3Result = await advanceThreeMonths(journeyPage, info);
    });

    test('P4 存檔再讀檔：承真正 P3，手動存檔後回標題載入同一時刻', async ({ browser }, info) => {
      test.setTimeout(120_000);
      expect(journeyContext.browser()).toBe(browser);
      const { initialDate, pausedDate, state, log } = p3Result;
      await journeyPage.getByRole('button', { name: '系統選單', exact: true }).click();
      await journeyPage.getByRole('button', { name: '存檔', exact: true }).click();
      const savePanel = journeyPage.getByTestId('save-load-panel');
      await expect(savePanel).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
      const manual = journeyPage.getByTestId('save-slot-manual:1');
      await manual.getByRole('button', { name: '存檔', exact: true }).click();
      await expect(manual).toContainText('織田', { timeout: 20_000 });
      await expect(savePanel).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
      const savedState = await journeyPage.evaluate(() => window.__tenka.debug.getState());
      expect(savedState.time).toEqual(state.time);
      await savePanel.getByRole('button', { name: '返回', exact: true }).click();
      await journeyPage.getByRole('button', { name: '回到標題', exact: true }).click();
      await expect(journeyPage.getByTestId('screen-title')).toBeVisible();
      await journeyPage.getByTestId('title-save-list').click();
      await expect(savePanel).toHaveAttribute('data-context', 'title');
      await expect(savePanel).toHaveAttribute('aria-busy', 'false', { timeout: 20_000 });
      await manual.getByRole('button', { name: '載入', exact: true }).click();
      await expect(journeyPage.getByTestId('screen-strategy')).toBeVisible();
      await expect(journeyPage.getByRole('dialog')).toHaveCount(0);
      await expect(journeyPage.getByTestId('hud-date')).toHaveText(pausedDate ?? '');
      await expect(journeyPage.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
      const loadedState = await journeyPage.evaluate(() => window.__tenka.debug.getState());
      expect(loadedState.time).toEqual(savedState.time);
      expect(loadedState.meta.seed).toBe(savedState.meta.seed);
      expect(loadedState.castles).toEqual(savedState.castles);
      expect(loadedState.districts).toEqual(savedState.districts);
      expect(loadedState.officers).toEqual(savedState.officers);
      expect(loadedState.armies).toEqual(savedState.armies);
      expect(loadedState.events.flags[`unlock.pol.nanban.${loadedState.meta.playerClanId}`]).toBe(
        1,
      );
      const p4Path = info.outputPath('actual-p3-manual-save-title-native-load.json');
      await writeFile(
        p4Path,
        JSON.stringify(
          {
            qualification:
              'Exact plan17 P4 after genuine P3. Ordinary UI manual slot and title load; no injected game/command. Load metadata and command-log provenance are captured, not asserted identical.',
            initialDate,
            pausedDate,
            loadedDate: await journeyPage.getByTestId('hud-date').textContent(),
            savedState,
            loadedState,
            savedLog: log,
            loadedLog: await journeyPage.evaluate(() => window.__tenka.debug.exportCommandLog()),
          },
          null,
          2,
        ),
      );
      await info.attach('actual-p3-manual-save-title-native-load', {
        path: p4Path,
        contentType: 'application/json',
      });
    });
  });

  test('P5 直達合戰畫面：debug-battle-01 可載入並撤退回策略畫面', async ({ page }) => {
    await page.goto('/?debug=1');
    await page.evaluate(() => {
      const debugWindow = window as unknown as {
        __tenka: { debug: { startBattle(layoutId: string): void } };
      };
      debugWindow.__tenka.debug.startBattle('debug-battle-01');
    });

    await expect(page.getByTestId('screen-battle')).toBeVisible();
    await page.getByTestId('battle-retreat').click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
  });
});
