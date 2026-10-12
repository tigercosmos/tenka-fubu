import { completeNewGameWizard } from './new-game-wizard';
// Playwright smoke（規格：plan/17-testing.md §3.8；5 條，不增不減）。
// M1-27：僅落地 P1（載入標題）；M2-20：補上 P2（開新局選織田，18-roadmap.md M2-20）。
// P3–P5 依 18-roadmap.md 各自里程碑到位時於本檔陸續補上（相依任務完成前，對應斷言的
// data-testid 尚不存在）。
import { test, expect } from './fixtures';
import type { Page, TestInfo } from '@playwright/test';
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
  const chosenEvents: Array<{ eventId: string; choiceIndex: number }> = [];

  const handleRequiredInteraction = async (): Promise<boolean> => {
    if (await page.getByTestId('month-summary').isVisible()) {
      await page.getByTestId('month-summary-continue').click();
      return true;
    }
    if (await page.getByTestId('proposal-inbox').isVisible()) {
      await page
        .getByRole('dialog')
        .filter({ has: page.getByTestId('proposal-inbox') })
        .getByRole('button', { name: '全部駁回', exact: true })
        .click();
      return true;
    }
    if (await page.getByTestId('envoy-modal').isVisible()) {
      await page
        .getByTestId('envoy-modal')
        .getByRole('button', { name: '拒絕', exact: true })
        .click();
      return true;
    }
    if (await page.getByTestId('event-modal').isVisible()) {
      const pendingEventId = await page.evaluate(
        () => window.__tenka.debug.getState().events.pendingChoiceEventId,
      );
      for (const event of eventCatalog.events) {
        const dialog = page.getByRole('dialog', { name: event.cutscene.title, exact: true });
        if (!(await dialog.isVisible())) continue;
        const continueButton = dialog.getByRole('button', { name: '繼續', exact: true });
        if (await continueButton.isVisible()) {
          await continueButton.click();
          return true;
        }
        // A real choice must match the saved core pending identity, not merely its title.
        if (event.id !== pendingEventId) return false;
        for (const [choiceIndex, choice] of event.choices.entries()) {
          const button = dialog.getByRole('button', { name: choice.label, exact: true });
          if (!(await button.isVisible()) || !(await button.isEnabled())) continue;
          await button.click();
          chosenEvents.push({ eventId: event.id, choiceIndex });
          return true;
        }
        // Known but unavailable choices stay blocking; never manufacture a decision.
        return false;
      }
      return false;
    }
    const battle = page.getByTestId('screen-battle');
    if (await battle.isVisible()) {
      const returnButton = battle.getByRole('button', {
        name: '返回策略畫面',
        exact: true,
      });
      if (await returnButton.isVisible()) {
        await returnButton.click();
      } else {
        // 正常遊戲沒有 debug 撤退；以真實委任和合戰 tick 完成戰鬥。
        const delegate = battle.getByRole('button', { name: '全軍委任：關', exact: true });
        if (await delegate.isVisible()) await delegate.click();
        const speed = battle.getByRole('button', { name: '五倍速 ×5', exact: true });
        if ((await speed.getAttribute('aria-pressed')) !== 'true') await speed.click();
      }
      return true;
    }
    return false;
  };

  await page.getByTestId('speed-5').click();
  await expect
    .poll(
      async () => {
        // 月初提案與使者必須先透過可見 UI 決定，才能排入下一 tick 並解除互動暫停。
        if (await handleRequiredInteraction()) return -1;
        // 未知對話框不能被速度按鈕繞過；保留阻塞以讓 smoke 明確失敗。
        if (await page.getByRole('dialog').isVisible()) return -1;
        if ((await page.getByTestId('speed-pause').getAttribute('aria-pressed')) === 'true') {
          await page.getByTestId('speed-5').click();
        }
        const text = await page.getByTestId('hud-date').textContent();
        const match = text?.match(/(\d+)年(\d+)月/);
        return match ? Number(match[1]) * 12 + Number(match[2]) - 1 : -1;
      },
      { timeout: 120_000 },
    )
    .toBeGreaterThanOrEqual(targetMonthIndex);
  await expect(page.getByTestId('error-boundary')).toHaveCount(0);

  await expect
    .poll(async () => {
      await handleRequiredInteraction();
      return !(await page.getByRole('dialog').isVisible());
    })
    .toBe(true);
  await page.getByTestId('speed-pause').click();
  const pausedDate = await page.getByTestId('hud-date').textContent();
  await page.waitForTimeout(500);
  await expect(page.getByTestId('hud-date')).toHaveText(pausedDate ?? '');
  expect(chosenEvents).toContainEqual({ eventId: 'evt.nanban-visit', choiceIndex: 0 });
  const state = await page.evaluate(() => window.__tenka.debug.getState());
  expect(state.events.flags[`unlock.pol.nanban.${state.meta.playerClanId}`]).toBe(1);
  const log = await page.evaluate(() => window.__tenka.debug.exportCommandLog());
  expect(
    log.entries.filter(
      (entry) =>
        entry.command.type === 'resolveEventChoice' &&
        entry.command.eventId === 'evt.nanban-visit' &&
        entry.command.choiceIndex === 0,
    ),
  ).toHaveLength(1);
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

  test('P3 推進 3 個月：x5 到月份 +3，暫停後日期不再前進', async ({ page }, info) => {
    test.setTimeout(150_000);
    await advanceThreeMonths(page, info);
  });

  test('P4 存檔再讀檔：承真正 P3，手動存檔後回標題載入同一時刻', async ({ page }, info) => {
    test.setTimeout(150_000);
    const { initialDate, pausedDate, state, log } = await advanceThreeMonths(page, info);
    await page.getByRole('button', { name: '系統選單', exact: true }).click();
    await page.getByRole('button', { name: '存檔', exact: true }).click();
    const savePanel = page.getByTestId('save-load-panel');
    await expect(savePanel).toHaveAttribute('aria-busy', 'false');
    const manual = page.getByTestId('save-slot-manual:1');
    await manual.getByRole('button', { name: '存檔', exact: true }).click();
    await expect(manual).toContainText('織田');
    await expect(savePanel).toHaveAttribute('aria-busy', 'false');
    const savedState = await page.evaluate(() => window.__tenka.debug.getState());
    expect(savedState.time).toEqual(state.time);
    await savePanel.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '回到標題', exact: true }).click();
    await expect(page.getByTestId('screen-title')).toBeVisible();
    await page.getByTestId('title-save-list').click();
    await expect(savePanel).toHaveAttribute('data-context', 'title');
    await expect(savePanel).toHaveAttribute('aria-busy', 'false');
    await manual.getByRole('button', { name: '載入', exact: true }).click();
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('hud-date')).toHaveText(pausedDate ?? '');
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
    const loadedState = await page.evaluate(() => window.__tenka.debug.getState());
    expect(loadedState.time).toEqual(savedState.time);
    expect(loadedState.meta.seed).toBe(savedState.meta.seed);
    expect(loadedState.castles).toEqual(savedState.castles);
    expect(loadedState.districts).toEqual(savedState.districts);
    expect(loadedState.officers).toEqual(savedState.officers);
    expect(loadedState.armies).toEqual(savedState.armies);
    expect(loadedState.events.flags[`unlock.pol.nanban.${loadedState.meta.playerClanId}`]).toBe(1);
    const p4Path = info.outputPath('actual-p3-manual-save-title-native-load.json');
    await writeFile(
      p4Path,
      JSON.stringify(
        {
          qualification:
            'Exact plan17 P4 after genuine P3. Ordinary UI manual slot and title load; no injected game/command. Load metadata and command-log provenance are captured, not asserted identical.',
          initialDate,
          pausedDate,
          loadedDate: await page.getByTestId('hud-date').textContent(),
          savedState,
          loadedState,
          savedLog: log,
          loadedLog: await page.evaluate(() => window.__tenka.debug.exportCommandLog()),
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
