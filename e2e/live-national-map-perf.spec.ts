import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import type { Page, Locator } from '@playwright/test';
import { test, expect } from './fixtures';
import { classifyLateWarmupOwner, clickInDocumentWarmup } from './warmup-owner-snapshot';

const catalog = JSON.parse(
  readFileSync(new URL('../src/data/scenarios/s1560/events.json', import.meta.url), 'utf8'),
) as {
  events: { id: string; cutscene: { title: string }; choices: { label: string }[] }[];
};
const okehazama = catalog.events.find((event) => event.id === 'evt.okehazama')!;

async function readWarmupOwnerSnapshot(page: Page) {
  return page.evaluate(() => {
    const visible = (node: Element): boolean => {
      if (node.closest('[aria-hidden="true"]')) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(node).visibility === 'visible';
    };
    const dialogs = [...document.querySelectorAll('[role="dialog"], dialog')].filter(visible);
    const roots = ['month-summary', 'proposal-inbox', 'envoy-modal', 'event-modal'].flatMap((id) =>
      [...document.querySelectorAll(`[data-testid="${id}"]`)]
        .filter(visible)
        .map((node) => ({ id, node })),
    );
    return {
      dialogs: dialogs.length,
      owners: roots.map((root) => root.id),
      unknownDialogs: dialogs.filter(
        (dialog) => !roots.some((root) => dialog === root.node || dialog.contains(root.node)),
      ).length,
    };
  });
}
async function clickBeforeWindow(page: Page, button: Locator) {
  expect(await button.count(), 'Warmup control must actually exist in the current owner').toBe(1);
  // These controls stay in this document. Preserve native actionability and the
  // 750ms action deadline, but do not spend it waiting for unrelated navigations.
  return clickInDocumentWarmup(
    (options) => button.click(options),
    () => readWarmupOwnerSnapshot(page),
  );
}
async function drainKnownOwner(page: Page, handled: string[]) {
  if (await page.getByTestId('month-summary').isVisible()) {
    if ((await clickBeforeWindow(page, page.getByTestId('month-summary-continue'))) === 'clicked')
      handled.push('month-summary');
  } else if (await page.getByTestId('proposal-inbox').isVisible()) {
    if (
      (await clickBeforeWindow(
        page,
        page
          .getByRole('dialog')
          .filter({ has: page.getByTestId('proposal-inbox') })
          .getByRole('button', { name: '全部駁回', exact: true }),
      )) === 'clicked'
    )
      handled.push('proposal');
  } else if (await page.getByTestId('envoy-modal').isVisible()) {
    if (
      (await clickBeforeWindow(
        page,
        page.getByTestId('envoy-modal').getByRole('button', { name: '拒絕', exact: true }),
      )) === 'clicked'
    )
      handled.push('envoy-rejected');
  } else if (await page.getByTestId('event-modal').isVisible()) {
    const pending = await page.evaluate(
      () => window.__tenka.debug.getState().events.pendingChoiceEventId,
    );
    if (
      pending === okehazama.id &&
      (await page.getByRole('dialog', { name: okehazama.cutscene.title, exact: true }).isVisible())
    )
      return;
    const button = page
      .getByTestId('event-modal')
      .getByRole('button', { name: '繼續', exact: true });
    expect(await button.count(), 'Never silently resolve an unexpected choice').toBe(1);
    if ((await clickBeforeWindow(page, button)) === 'clicked') handled.push('resolved-event');
  } else {
    // A registered FIFO owner may arrive after the separate negative reads above.
    // Read all fallback facts atomically; only defer to the next ordinary poll.
    classifyLateWarmupOwner(await readWarmupOwnerSnapshot(page));
  }
}

test.describe('actual command-driven national forty-army ×5 postrender acceptance', () => {
  test.describe.configure({ mode: 'serial' });
  for (const preset of ['overview', 'operational', 'close'] as const) {
    test(`${preset}: live strategy, native historical choice, full-wall rendering`, async ({
      page,
    }, info) => {
      test.skip(
        process.env.VISUAL_GPU !== '1' || process.env.VISUAL_PERF !== '1',
        'Requires an explicitly leased hardware GPU host; no software or discovery FPS claim.',
      );
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.goto('/?debug=1&seed=15600519');
      await page.getByTestId('title-settings').click();
      const settings = page.getByRole('dialog');
      await settings.getByRole('switch', { name: '月初', exact: true }).uncheck();
      await settings.getByRole('button', { name: '返回', exact: true }).click();
      await page.getByTestId('title-newgame').click();
      await page.getByTestId('scenario-pick-s1560').click();
      await page.getByTestId('clan-pick-clan.oda').click();
      await completeNewGameWizard(page);
      await expect(page.getByTestId('screen-strategy')).toBeVisible();
      await page.getByTestId('speed-pause').click();
      const original = await page.evaluate(() => window.__tenka.debug.getState());
      const preparation = await page.evaluate(() =>
        window.__tenka.debug.prepareLiveNationalMapWorkload(),
      );
      expect(preparation.geographyRegions).toHaveLength(9);
      expect(preparation.armyRegions).toHaveLength(7);
      expect(preparation.count).toBe(40);
      const environment = await page.evaluate(() => {
        const canvas = document.querySelector('canvas');
        const gl = canvas?.getContext('webgl2') ?? canvas?.getContext('webgl');
        if (!(gl instanceof WebGLRenderingContext || gl instanceof WebGL2RenderingContext))
          throw new Error('Live measurement requires actual WebGL hardware renderer');
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {
          userAgent: navigator.userAgent,
          renderer: String(
            gl.getParameter(extension ? extension.UNMASKED_RENDERER_WEBGL : gl.RENDERER),
          ),
        };
      });
      expect(environment.renderer).not.toMatch(/swiftshader|llvmpipe|software/i);
      const handled: string[] = [];
      await page.getByTestId('speed-5').click();
      await expect
        .poll(
          async () => {
            const pending = await page.evaluate(
              () => window.__tenka.debug.getState().events.pendingChoiceEventId,
            );
            if (
              pending === okehazama.id &&
              (await page
                .getByRole('dialog', { name: okehazama.cutscene.title, exact: true })
                .isVisible())
            )
              return true;
            await drainKnownOwner(page, handled);
            if (
              (await page.getByRole('dialog').count()) === 0 &&
              (await page.getByTestId('speed-5').isEnabled())
            ) {
              if ((await page.getByTestId('speed-5').getAttribute('aria-pressed')) !== 'true')
                await clickBeforeWindow(page, page.getByTestId('speed-5'));
            }
            expect(
              (await page.evaluate(() => window.__tenka.debug.getLiveNationalMapWorkload()))
                ?.failure,
            ).toBeNull();
            return false;
          },
          { timeout: 55_000, intervals: [100] },
        )
        .toBe(true);
      await page
        .getByRole('dialog', { name: okehazama.cutscene.title, exact: true })
        .getByRole('button', { name: okehazama.choices[0]!.label, exact: true })
        .click();
      await expect
        .poll(() =>
          page.evaluate(() => window.__tenka.debug.getState().events.pendingChoiceEventId),
        )
        .toBeNull();
      // Set the measured camera while paused. No strategy or army progress writes.
      await expect
        .poll(
          async () => {
            await drainKnownOwner(page, handled);
            if (
              (await page.getByRole('dialog').count()) > 0 ||
              !(await page.getByTestId('speed-pause').isEnabled())
            )
              return false;
            await clickBeforeWindow(page, page.getByTestId('speed-pause'));
            return (await page.getByTestId('speed-pause').getAttribute('aria-pressed')) === 'true';
          },
          { timeout: 15_000, intervals: [100] },
        )
        .toBe(true);
      await page.evaluate(async (camera) => {
        await window.__tenka.debug.setMapCameraPreset(camera);
        await window.__tenka.debug.waitMapIdle(3);
      }, preset);
      const before = await page.evaluate(() => ({
        state: window.__tenka.debug.getState(),
        log: window.__tenka.debug.exportCommandLog(),
      }));
      await page.getByTestId('speed-5').click();
      // No owner handling during the window: every pause/interruption remains in the artifact.
      const measurement = await page.evaluate(() =>
        window.__tenka.debug.measureLiveNationalMapFrames(30_000),
      );
      const after = await page.evaluate(() => ({
        state: window.__tenka.debug.getState(),
        log: window.__tenka.debug.exportCommandLog(),
        workload: window.__tenka.debug.getLiveNationalMapWorkload(),
      }));
      const path = info.outputPath(`live-national-${preset}.json`);
      await writeFile(
        path,
        JSON.stringify(
          { environment, original, preparation, handled, before, measurement, after },
          null,
          2,
        ),
      );
      await info.attach('actual-live-frame-and-command-proof', {
        path,
        contentType: 'application/json',
      });
      await info.attach('actual-live-national-map', {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
      // Preserve raw evidence even when a mandatory owner disabled the pause button.
      if (
        (await page.getByRole('dialog').count()) === 0 &&
        (await page.getByTestId('speed-pause').isEnabled())
      )
        await clickBeforeWindow(page, page.getByTestId('speed-pause'));
      expect(measurement.valid).toBe(true);
      expect(measurement.minMountedArmies).toBeGreaterThanOrEqual(40);
      expect(measurement.averageFps).toBeGreaterThanOrEqual(60);
      expect(measurement.frameTimeP95).toBeLessThanOrEqual(1000 / 60);
      expect(after.state.time.day).toBeGreaterThan(before.state.time.day);
      expect(after.workload?.minimumMarching).toBe(40);
      expect(after.workload?.failure).toBeNull();
      await page.evaluate(() => window.__tenka.debug.stopLiveNationalMapWorkload());
    });
  }
});
