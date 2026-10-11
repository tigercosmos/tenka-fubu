import type { Locator, Page } from '@playwright/test';
import { test, expect } from './fixtures';

async function bootBattle(page: Page): Promise<void> {
  await page.goto('/?debug=1');
  // Existing fixed seed fixture uses actual march/field-combat/startKassen core paths.
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  await expect(page.getByTestId('screen-battle')).toBeVisible();
  await expect(page.getByRole('button', { name: '暫停', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByTestId('battle-canvas').locator('canvas')).toHaveCount(1);
}

async function battleState(page: Page) {
  return page.evaluate(() => {
    const state = window.__tenka.debug.getState();
    const battle = Object.values(state.battles)[0];
    if (!battle) throw new Error('Actual debug battle missing');
    return { battle, playerClanId: state.meta.playerClanId };
  });
}

async function contained(page: Page, locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  const viewport = page.viewportSize()!;
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.y).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1);
}

async function coversProjectedGlyph(page: Page, control: Locator): Promise<void> {
  await contained(page, control);
  const geometry = await control.evaluate((element) => {
    const parent = element.parentElement!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return {
      left: box.left - parent.left,
      top: box.top - parent.top,
      right: box.right - parent.left,
      bottom: box.bottom - parent.top,
      width: box.width,
      height: box.height,
      x: Number(element.dataset.projectionX),
      y: Number(element.dataset.projectionY),
      glyphLeft: Number(element.dataset.glyphLeft),
      glyphTop: Number(element.dataset.glyphTop),
      glyphRight: Number(element.dataset.glyphRight),
      glyphBottom: Number(element.dataset.glyphBottom),
    };
  });
  expect(Object.values(geometry).every(Number.isFinite)).toBe(true);
  expect(geometry.width).toBeGreaterThanOrEqual(32);
  expect(geometry.height).toBeGreaterThanOrEqual(32);
  expect(geometry.left).toBeLessThanOrEqual(geometry.glyphLeft + 1);
  expect(geometry.top).toBeLessThanOrEqual(geometry.glyphTop + 1);
  expect(geometry.right).toBeGreaterThanOrEqual(geometry.glyphRight - 1);
  expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.glyphBottom - 1);
  // Logical node/flag anchor is asymmetric within its full glyph, not the hitbox center.
  expect(geometry.x).toBeGreaterThanOrEqual(geometry.glyphLeft);
  expect(geometry.x).toBeLessThanOrEqual(geometry.glyphRight);
  expect(geometry.y).toBeGreaterThanOrEqual(geometry.glyphTop);
  expect(geometry.y).toBeLessThanOrEqual(geometry.glyphBottom);
  const hits = await control.evaluate((element) => {
    const parent = element.parentElement!.getBoundingClientRect();
    const box = element.getBoundingClientRect();
    return [
      { name: 'native-center', x: box.x + box.width / 2, y: box.y + box.height / 2 },
      { name: 'top-left', x: box.left + 2, y: box.top + 2 },
      { name: 'top-right', x: box.right - 2, y: box.top + 2 },
      { name: 'bottom-left', x: box.left + 2, y: box.bottom - 2 },
      { name: 'bottom-right', x: box.right - 2, y: box.bottom - 2 },
      {
        name: 'glyph-anchor',
        x: parent.x + Number(element.dataset.projectionX),
        y: parent.y + Number(element.dataset.projectionY),
      },
    ].map((point) => {
      const hit = document.elementFromPoint(point.x, point.y);
      return {
        ...point,
        owned: hit === element || (hit !== null && element.contains(hit)),
        hit: hit?.getAttribute('data-testid') ?? hit?.tagName ?? null,
      };
    });
  });
  expect(
    hits.every((hit) => hit.owned),
    JSON.stringify(hits),
  ).toBe(true);
}

async function setScale(page: Page, scale: number): Promise<void> {
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: '回到遊戲', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '設定', exact: true }).click();
  const dialog = page.getByRole('dialog');
  const slider = dialog.getByRole('slider', { name: '介面縮放', exact: true });
  await slider.press(scale === 1.5 ? 'End' : 'Home');
  if (scale === 1) for (let i = 0; i < 4; i += 1) await slider.press('ArrowRight');
  await expect(slider).toHaveValue(String(scale));
  await dialog.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '回到遊戲', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('switching tactical actor cancels a targeted tactic through cards and native map controls', async ({
  page,
}, info) => {
  await bootBattle(page);
  const initial = await page.evaluate(() => window.__tenka.debug.getState());
  const { battle, playerClanId } = await battleState(page);
  const side = battle.attackerClanId === playerClanId ? 'attacker' : 'defender';
  const actors = battle.units.filter(
    (unit) => unit.side === side && !unit.routed && !unit.exited && unit.troops > 0,
  );
  expect(actors).toHaveLength(2);
  const [first, second] = actors;
  const volley = page.getByRole('button', { name: '齊射 4', exact: true });
  const hint = page.getByText('請選擇敵方部隊', { exact: true });
  for (const surface of ['card', 'map'] as const) {
    const control = (id: string) =>
      page.getByTestId(surface === 'card' ? `battle-unit-card-${id}` : `battle-unit-${id}`);
    await control(first!.id).click();
    await expect(volley).toBeEnabled();
    await volley.click();
    await expect(volley).toHaveAttribute('data-pending', 'true');
    await expect(hint).toBeVisible();
    // Reselecting the same actor retains its draft; selecting a different actor cancels it.
    await control(first!.id).click();
    await expect(hint).toBeVisible();
    await control(second!.id).click();
    await expect(page.getByTestId(`battle-unit-card-${second!.id}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(hint).toHaveCount(0);
    await expect(volley).toHaveAttribute('data-pending', 'false');
    await control(first!.id).click();
    await expect(hint).toHaveCount(0);
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(initial);
  }
  await info.attach('actual-actor-draft-cancellation', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});

test('actual tactical fixture shares canvas/native projection across sizes, scales and motion preference', async ({
  page,
}, testInfo) => {
  await bootBattle(page);
  const before = await page.evaluate(() => window.__tenka.debug.getState());
  const { battle } = await battleState(page);
  const field = page.getByTestId('battlefield');
  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1920, height: 1080 },
  ]) {
    await page.setViewportSize(viewport);
    for (const scale of [0.8, 1, 1.5]) {
      await setScale(page, scale);
      await expect(field).toHaveAttribute('data-node-count', String(battle.jins.length));
      await expect(field).toHaveAttribute('data-edge-count', String(battle.edges.length));
      const canvas = page.getByTestId('battle-canvas').locator('canvas');
      await expect(canvas).toHaveCount(1);
      await contained(page, field);
      for (const jin of battle.jins) {
        const button = page.getByTestId(`battle-jin-${jin.id}`);
        await coversProjectedGlyph(page, button);
      }
      for (const unit of battle.units.filter((unit) => !unit.exited))
        await coversProjectedGlyph(page, page.getByTestId(`battle-unit-${unit.id}`));
      await testInfo.attach(`battle-${viewport.width}-${scale}`, {
        body: await page.screenshot(),
        contentType: 'image/png',
      });
    }
  }
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
  // Retreat here is the explicit DEBUG fixture abort, never production retreat coverage.
  await page.getByTestId('battle-retreat').click();
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => window.__tenka.debug.startBattle('debug-battle-01'));
  await expect(page.getByTestId('battle-canvas').locator('canvas')).toHaveCount(1);
});

test('native tactical node and enemy controls apply real movement and attack orders', async ({
  page,
}) => {
  await bootBattle(page);
  let current = await battleState(page);
  const side = current.battle.attackerClanId === current.playerClanId ? 'attacker' : 'defender';
  const unit = current.battle.units.find((unit) => unit.side === side && !unit.delegated)!;
  expect(unit).toBeDefined();
  await page.getByTestId(`battle-unit-${unit.id}`).click();
  let moved = false;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    current = await battleState(page);
    const ours = current.battle.units.find((candidate) => candidate.id === unit.id)!;
    const enemies = current.battle.units.filter(
      (candidate) =>
        candidate.side !== side && !candidate.routed && !candidate.exited && candidate.troops > 0,
    );
    const adjacent = (a: string, b: string) =>
      a === b ||
      current.battle.edges.some(
        (edge) => (edge.a === a && edge.b === b) || (edge.a === b && edge.b === a),
      );
    const enemy = enemies.find((candidate) => adjacent(ours.jinId, candidate.jinId));
    if (enemy && moved) {
      await page.getByTestId(`battle-unit-${enemy.id}`).click();
      await page.getByRole('button', { name: '一倍速', exact: true }).click();
      await expect
        .poll(
          async () =>
            (await battleState(page)).battle.units.find((candidate) => candidate.id === unit.id)
              ?.attackTargetUnitId,
        )
        .toBe(enemy.id);
      await page.getByRole('button', { name: '暫停', exact: true }).click();
      return;
    }
    const queue = [[ours.jinId]];
    const seen = new Set([ours.jinId]);
    let path: string[] | undefined;
    while (queue.length > 0 && !path) {
      const candidate = queue.shift()!;
      const end = candidate.at(-1)!;
      if (candidate.length > 1 && enemies.some((enemy) => adjacent(end, enemy.jinId))) {
        path = candidate;
        break;
      }
      for (const edge of current.battle.edges) {
        const next = edge.a === end ? edge.b : edge.b === end ? edge.a : null;
        if (next === null || seen.has(next) || enemies.some((enemy) => enemy.jinId === next))
          continue;
        seen.add(next);
        queue.push([...candidate, next]);
      }
    }
    expect(
      path,
      'Must find an authored adjacent route, not silently accept an invalid move',
    ).toBeDefined();
    const target = path![1]!;
    const before = await page.evaluate(() => window.__tenka.debug.getState());
    await page.getByTestId(`battle-jin-${target}`).click();
    expect(await page.evaluate(() => window.__tenka.debug.getState())).toEqual(before);
    await page.getByRole('button', { name: '一倍速', exact: true }).click();
    await expect
      .poll(
        async () =>
          (await battleState(page)).battle.units.find((candidate) => candidate.id === unit.id)
            ?.jinId,
      )
      .toBe(target);
    await page.getByRole('button', { name: '暫停', exact: true }).click();
    moved = true;
  }
  throw new Error('No verified authoritative attack target after bounded native movement');
});
