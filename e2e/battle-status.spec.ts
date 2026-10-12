import { writeFile } from 'node:fs/promises';
import { test, expect } from './fixtures';

test('real queued moves and tactical lifecycle produce factual unit status badges', async ({
  page,
}, info) => {
  test.setTimeout(60_000);
  await page.goto('/?debug=1');
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  const screen = page.getByTestId('screen-battle');
  await expect(screen).toBeVisible();
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  const battle = Object.values(initial.battles)[0]!;
  const side = initial.meta.playerClanId === battle.attackerClanId ? 'attacker' : 'defender';
  const unit = battle.units.find((candidate) => candidate.side === side && !candidate.delegated)!;
  const card = page.getByTestId(`battle-unit-card-${unit.id}`);
  await expect(card).toBeVisible();
  await card.click();
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  const target = battle.edges
    .flatMap((edge) => (edge.a === unit.jinId ? [edge.b] : edge.b === unit.jinId ? [edge.a] : []))
    .find(
      (id) => !battle.units.some((candidate) => candidate.side !== side && candidate.jinId === id),
    )!;
  expect(target).toBeDefined();
  await page.getByTestId(`battle-jin-${target}`).click();
  await expect(card.locator('[data-battle-status="moving"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  // Current real terrain resolver yields plain/coast, hence cost1 edges. No intermediate-moving proof is claimed.
  expect(battle.edges.every((edge) => edge.moveCost === 1)).toBe(true);
  await screen.getByRole('button', { name: '一倍速 ×1', exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        ({ id, unitId }) =>
          window.__tenka.debug
            .getState()
            .battles[id]?.units.find((candidate) => candidate.id === unitId)?.jinId,
        { id: battle.id, unitId: unit.id },
      ),
    )
    .toBe(target);
  await screen.getByRole('button', { name: '暫停', exact: true }).click();
  const paused = await page.evaluate(() => window.__tenka.debug.getState());
  await card.scrollIntoViewIfNeeded();
  await card.focus();
  await expect(card.locator('[data-battle-status="moving"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(paused);
  const screenshotPath = info.outputPath('actual-paused-unit-status.png');
  await page.screenshot({ path: screenshotPath });
  await info.attach('actual-paused-unit-status', {
    path: screenshotPath,
    contentType: 'image/png',
  });

  await screen.getByRole('button', { name: /^全軍委任：/ }).click();
  await screen.getByRole('button', { name: '五倍速 ×5', exact: true }).click();
  const observed: {
    tick: number;
    unitId: string;
    kind: string;
    routed: boolean;
    exited: boolean;
    jinId: string;
  }[] = [];
  const seen = new Set<string>();
  await expect
    .poll(
      async () => {
        const { current, badges } = await page.evaluate(
          (id) => ({
            current: window.__tenka.debug.getState().battles[id]!,
            badges: [
              ...document.querySelectorAll('[data-testid="screen-battle"] [data-battle-status]'),
            ].map((element) => ({
              kind: element.getAttribute('data-battle-status')!,
              card:
                element
                  .closest('[data-testid^="battle-unit-card-"]')
                  ?.getAttribute('data-testid') ?? null,
            })),
          }),
          battle.id,
        );
        for (const badge of badges) {
          if (badge.card === null) continue;
          const unitId = badge.card.slice('battle-unit-card-'.length);
          const actual = current.units.find((candidate) => candidate.id === unitId)!;
          if (badge.kind === 'routed') expect(actual.routed).toBe(true);
          if (badge.kind === 'exited') expect(actual.exited).toBe(true);
          if (badge.kind === 'contact') {
            expect(actual.troops > 0 && !actual.routed && !actual.exited).toBe(true);
            expect(
              current.units.some(
                (enemy) =>
                  enemy.side !== actual.side &&
                  enemy.troops > 0 &&
                  !enemy.routed &&
                  !enemy.exited &&
                  (enemy.jinId === actual.jinId ||
                    current.edges.some(
                      (edge) =>
                        (edge.a === actual.jinId && edge.b === enemy.jinId) ||
                        (edge.b === actual.jinId && edge.a === enemy.jinId),
                    )),
              ),
              'Visible contact needs actual live enemy at same/authored adjacent jin, not a queued target',
            ).toBe(true);
          }
          if (['contact', 'routed', 'exited'].includes(badge.kind)) {
            seen.add(badge.kind);
            observed.push({
              tick: current.tick,
              unitId,
              kind: badge.kind,
              routed: actual.routed,
              exited: actual.exited,
              jinId: actual.jinId,
            });
          }
        }
        return current.result !== null;
      },
      { timeout: 35_000, intervals: [80, 160] },
    )
    .toBe(true);
  expect(
    [...seen].sort(),
    'Only actual seeded core-generated lifecycle statuses count as coverage',
  ).toEqual(['contact', 'exited', 'routed']);
  const final = await page.evaluate(() => window.__tenka.debug.getState());
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(final);
  const evidencePath = info.outputPath('actual-unit-status-evidence.json');
  await writeFile(
    evidencePath,
    JSON.stringify(
      {
        observed,
        gap: 'No intermediate moving-state browser proof: existing runtime terrain produces cost1 edges.',
      },
      null,
      2,
    ),
  );
  await info.attach('actual-unit-status-evidence', {
    path: evidencePath,
    contentType: 'application/json',
  });
});
