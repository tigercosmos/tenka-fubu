import { PNG } from 'pngjs';
import { test, expect } from './fixtures';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
type RGB = [number, number, number];
const earth: RGB = [155, 146, 125];
const distance = (a: RGB, b: RGB) => Math.hypot(...a.map((value, i) => value - b[i]!));
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
function sample(png: PNG, p: Point): RGB {
  const values: RGB = [0, 0, 0];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.round(p.x) + dx,
        y = Math.round(p.y) + dy;
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(png.width);
      expect(y).toBeLessThan(png.height);
      for (let channel = 0; channel < 3; channel++)
        values[channel]! += png.data[(y * png.width + x) * 4 + channel]! / 9;
    }
  return values;
}

test('native district seals keep visible owner accents, quiet bodies and physical district picking without gameplay changes', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/?debug=visual-map');
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const before = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  const owners = new Set<string>();
  const districts = new Set<string>();
  let tested = 0;
  let picked = 0;
  for (const focus of [
    'castle.sunpu',
    'castle.narumi',
    'castle.kiyosu',
    'castle.kakegawa',
    'castle.gifu',
  ]) {
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
    if (focus !== 'castle.sunpu') {
      const position = await page.evaluate(
        (id) =>
          Object.values(window.__tenka.debug.getState().castles).find((c) => c.id === id)!.pos,
        focus,
      );
      const mini = page.getByTestId('minimap-frame'),
        box = (await mini.boundingBox())!;
      await mini.click({
        position: { x: (position.x / 4096) * box.width, y: (position.y / 4096) * box.height },
      });
      // A wheel cancels focus animation. Observe a settled projection first.
      await page.evaluate(async () => {
        let previous = '',
          stable = 0;
        const deadline = performance.now() + 5000;
        while (stable < 6 && performance.now() < deadline) {
          await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
          const current = JSON.stringify(
            window.__tenka.debug.getMapDiagnostics().castleRendering.nodes.map((n) => n.anchor),
          );
          stable = current === previous ? stable + 1 : 0;
          previous = current;
        }
        if (stable < 6) throw new Error('Minimap camera projection did not settle');
      });
    }
    // Native minimap focusing can leave a castle selected. Its adjacent-road
    // highlight crosses nearby seals, so clear that separate selection state
    // before measuring the unselected material (picking is checked below).
    const selectedContext = page.locator(
      '[data-testid="screen-strategy"] > div[aria-hidden="false"]',
    );
    if (await selectedContext.isVisible()) {
      await selectedContext.getByRole('button').first().click();
      await expect(selectedContext).toHaveCount(0);
    }
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    expect(
      await page.evaluate(() => window.__tenka.debug.getMapPublishedViewSnapshot().selection),
    ).toBeNull();
    // Real native wheel input makes the small owner stroke independently measurable.
    await page.mouse.move(640, 350);
    for (let step = 0; step < 8; step++) await page.mouse.wheel(0, -100);
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    const scene = await page.evaluate(() => {
      const state = window.__tenka.debug.getState(),
        d = window.__tenka.debug.getMapDiagnostics();
      const style = getComputedStyle(document.documentElement);
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      return {
        origin: { x: canvas.x, y: canvas.y },
        anchors: d.castleRendering.nodes.map((n) => ({
          world: Object.values(state.castles).find((c) => c.id === n.id)!.pos,
          screen: n.anchor,
          scene: d.elevationRendering.nodes.find((node) => node.id === n.id)!.scene,
        })),
        armyAnchors: d.armyPlateLayout.plates.map((p) => p.anchor),
        districts: Object.values(state.districts).map((district) => ({
          ...district,
          rendered: d.elevationRendering.nodes.find((node) => node.id === district.id)!,
          ownerColor: style
            .getPropertyValue(
              `--clan-${String(state.clans[district.ownerClanId]!.colorIndex).padStart(2, '0')}`,
            )
            .trim(),
        })),
        obstacles: [
          ...d.actorDepth.bodies.filter((b) => b.visible && b.rect).map((b) => b.rect!),
          ...d.armyPlateLayout.plates.filter((p) => !p.collapsed).map((p) => p.rect),
          ...d.armyPlateLayout.castles.map((p) => p.rect),
          ...d.armyPlateLayout.foregroundBodies.map((p) => p.rect),
          ...d.geographicLabelLayout.labels.map((p) => p.rect),
        ],
        hud: [
          ...document.querySelectorAll(
            '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *',
          ),
        ].map((node) => {
          const r = node.getBoundingClientRect();
          return { x: r.x, y: r.y, width: r.width, height: r.height };
        }),
      };
    });
    const a = scene.anchors[0]!,
      b = scene.anchors.find((p) => p.scene.x !== a.scene.x)!;
    expect(b).toBeDefined();
    // Camera scaling acts on displayed terrain coordinates. Reconstruct it
    // from separate node containers, never from the seal/body bounds sampled below.
    const scale = (b.screen.x - a.screen.x) / (b.scene.x - a.scene.x);
    expect(scale).toBeGreaterThanOrEqual(2);
    const project = (p: Point) => ({
      x: scene.origin.x + a.screen.x + (p.x - a.scene.x) * scale,
      y: scene.origin.y + a.screen.y + (p.y - a.scene.y) * scale,
    });
    for (const anchor of scene.anchors) {
      const height = anchor.world.y - anchor.scene.y;
      expect(height).toBeGreaterThanOrEqual(-1e-8);
      expect(height).toBeLessThanOrEqual(20);
      expect(anchor.scene.x).toBeCloseTo(anchor.world.x - 0.18 * height, 8);
      const mapped = project(anchor.scene);
      expect(mapped.x).toBeCloseTo(scene.origin.x + anchor.screen.x, 6);
      expect(mapped.y).toBeCloseTo(scene.origin.y + anchor.screen.y, 6);
    }
    const observed = scene.districts
      .map((d) => {
        expect(d.ownerColor).toMatch(/^#[a-f\d]{6}$/i);
        const color: RGB = [1, 3, 5].map((i) => parseInt(d.ownerColor.slice(i, i + 2), 16)) as RGB;
        expect(d.rendered.canonical).toEqual(d.pos);
        const height = d.pos.y - d.rendered.scene.y;
        expect(height).toBeGreaterThanOrEqual(-1e-8);
        expect(height).toBeLessThanOrEqual(20);
        expect(d.rendered.scene.x).toBeCloseTo(d.pos.x - 0.18 * height, 8);
        const point = project(d.rendered.scene),
          box = {
            x: point.x - 6 * scale,
            y: point.y - 4 * scale,
            width: 12 * scale,
            height: 8 * scale,
          };
        return { ...d, color, point, box };
      })
      .filter(
        (d) =>
          distance(d.color, earth) >= 90 &&
          d.box.x > 40 &&
          d.box.y > 60 &&
          d.box.x + d.box.width < 1240 &&
          d.box.y + d.box.height < 680 &&
          !scene.hud.some((r) => intersects(d.box, r)) &&
          !scene.anchors.some(
            (a) =>
              Math.hypot(
                d.point.x - scene.origin.x - a.screen.x,
                d.point.y - scene.origin.y - a.screen.y,
              ) <= Math.max(20 * scale, 16),
          ) &&
          !scene.armyAnchors.some(
            (a) =>
              Math.hypot(d.point.x - scene.origin.x - a.x, d.point.y - scene.origin.y - a.y) <=
              16 * scale,
          ) &&
          !scene.obstacles.some((r) =>
            intersects(d.box, { ...r, x: r.x + scene.origin.x, y: r.y + scene.origin.y }),
          ),
      )
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 4);
    const png = PNG.sync.read(
      await page.screenshot({ path: info.outputPath(`district-seals-${focus}.png`) }),
    );
    const measurements = observed.map((d) => {
      const body = sample(png, { x: d.point.x - 3.5 * scale, y: d.point.y });
      const accent = sample(png, { x: d.point.x + 4 * scale, y: d.point.y });
      return {
        id: d.id,
        owner: d.ownerClanId,
        color: d.color,
        body,
        accent,
        point: d.point,
        name: d.name,
      };
    });
    await info.attach(`district-pixels-${focus}`, {
      body: JSON.stringify({ scale, measurements }),
      contentType: 'application/json',
    });
    for (const d of measurements) {
      expect(
        distance(d.body, earth),
        `${d.id}: body is quiet earth, not a full owner-colored disc`,
      ).toBeLessThanOrEqual(40);
      expect(
        distance(d.accent, d.color),
        `${d.id}: owner accent remains painted`,
      ).toBeLessThanOrEqual(35);
      owners.add(d.owner);
      districts.add(d.id);
      tested++;
    }
    const pick = measurements.at(-1);
    if (pick) {
      await page.mouse.click(pick.point.x, pick.point.y);
      const context = page.locator('[data-testid="screen-strategy"] > div[aria-hidden="false"]');
      await expect(context).toBeVisible();
      await expect(context).toContainText(pick.name);
      picked++;
      // Selection paint is a separate state; remove it before the next material sample.
      await context.getByRole('button', { name: new RegExp(pick.name) }).click();
      await expect(context).toHaveCount(0);
      await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    }
  }
  expect(tested).toBeGreaterThanOrEqual(4);
  // Scene projection and cleared selection expose four independently unobstructed seals.
  expect([...districts].sort()).toEqual([
    'dist.gifu-higashi',
    'dist.kakegawa-nishi',
    'dist.kiyosu-nishi',
    'dist.narumi-nishi',
  ]);
  expect(owners.size).toBeGreaterThanOrEqual(2);
  expect(picked).toBeGreaterThanOrEqual(2);
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(before);
});
