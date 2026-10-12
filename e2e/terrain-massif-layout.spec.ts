import { completeNewGameWizard } from './new-game-wizard';
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { test, expect } from './fixtures';
import { DEBUG_VISUAL_ROAD_DISPLAY } from '../src/core/state/debugVisualRoadDisplay';

type Point = { x: number; y: number };
type Rect = Point & { width: number; height: number };
const terrain = JSON.parse(
  readFileSync(new URL('../src/data/map/terrain.json', import.meta.url), 'utf8'),
) as { mountains: { id: string; mass: number[] }[] };
const controls = [
  { id: 'mt.akaishi', asset: 'terrain-mountain-akaishi-massif-v3.png' },
  { id: 'mt.kyushu-aso', asset: 'terrain-mountain-aso-massif-v1.png' },
  { id: 'mt.echigo', asset: 'terrain-mountain-echigo-massif-v1.png' },
  { id: 'mt.chugoku', asset: 'terrain-mountain-chugoku-massif-v1.png' },
  { id: 'mt.shikoku', asset: 'terrain-mountain-shikoku-massif-v1.png' },
  { id: 'mt.kii', asset: 'terrain-mountain-kii-massif-v1.png' },
];
const intersects = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

test('massif reference captures preserve full authored masses, projection and idle resources', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  const responses: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('response', (response) => {
    if (response.ok() && controls.some((c) => response.url().endsWith(c.asset)))
      responses.push(response.url());
  });
  const supportedNational = process.env.MASSIF_SUPPORTED_NATIONAL === '1';
  if (supportedNational) {
    await page.goto('/?debug=1&seed=15600519');
    await page.getByTestId('title-newgame').click();
    await page.getByTestId('scenario-pick-s1560').click();
    await page.getByTestId('clan-pick-clan.oda').click();
    await completeNewGameWizard(page);
    await expect(page.getByTestId('screen-strategy')).toBeVisible();
    await page.getByTestId('speed-pause').click();
    await expect(page.getByTestId('speed-pause')).toHaveAttribute('aria-pressed', 'true');
  } else {
    await page.goto('/?debug=visual-map');
  }
  await expect(page.getByTestId('screen-strategy')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return window.__tenka.debug.getMapDiagnostics().ready;
        } catch (error) {
          if (
            error instanceof Error &&
            error.message ===
              '__TENKA_DEBUG__: map renderer 尚未掛載（尚未進入含地圖的畫面，如 MainScreen）'
          )
            return false;
          throw error;
        }
      }),
    )
    .toBe(true);
  await page.evaluate(() => document.fonts.ready);
  const sourceScope = await page.evaluate(() => {
    const state = window.__tenka.debug.getState();
    return {
      scenario: state.meta.scenarioId,
      castles: Object.keys(state.castles).length,
      roads: Object.keys(state.roads).length,
      shikokuRoadPresent: state.roads['road.b7-30' as keyof typeof state.roads] !== undefined,
    };
  });
  await info.attach('massif-source-scope', {
    body: JSON.stringify({ supportedNational, ...sourceScope }),
    contentType: 'application/json',
  });
  if (supportedNational) {
    expect(sourceScope.scenario).toBe('s1560');
    expect(sourceScope.castles).toBe(121);
    expect(sourceScope.shikokuRoadPresent).toBe(true);
  }
  const before = await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()));
  await page.evaluate(async () => {
    await window.__tenka.debug.setMapCameraPreset('overview');
    await window.__tenka.debug.waitMapIdle(3);
  });
  await page.screenshot({ path: info.outputPath('massif-national-overview-scene.png') });
  const observations = [];
  for (const control of controls) {
    const raw = terrain.mountains.find((m) => m.id === control.id)!;
    const xs = raw.mass.filter((_, i) => i % 2 === 0);
    const ys = raw.mass.filter((_, i) => i % 2 === 1);
    const mass = {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
    const focus = { x: mass.x + mass.width / 2, y: mass.y + mass.height / 2 };
    const settle = async () => {
      let previous = '';
      let stable = 0;
      await expect
        .poll(async () => {
          const signature = await page.evaluate(() =>
            JSON.stringify(
              window.__tenka.debug.getMapDiagnostics().waterRendering.lakes[0]?.points,
            ),
          );
          stable = signature === previous ? stable + 1 : 0;
          previous = signature;
          return stable;
        })
        .toBeGreaterThanOrEqual(3);
    };
    const focusView = async () => {
      await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('close'));
      const mini = page.getByTestId('minimap-frame');
      const box = (await mini.boundingBox())!;
      await mini.click({
        position: { x: (focus.x / 4096) * box.width, y: (focus.y / 4096) * box.height },
      });
      await settle();
    };
    await focusView();
    const scene = await page.evaluate(() => {
      const d = window.__tenka.debug.getMapDiagnostics();
      const canvas = document
        .querySelector('[data-testid="map-canvas-host"] canvas')!
        .getBoundingClientRect();
      const rect = (r: DOMRect) => ({ x: r.x, y: r.y, width: r.width, height: r.height });
      const hud = [
        ...document.querySelectorAll(
          '[data-testid="screen-strategy"] > header, [data-testid="screen-strategy"] > nav, [data-testid="layer-control"], [data-testid="minimap"], section[aria-live="polite"] > *, [data-testid="siege-overlay"]',
        ),
      ]
        .map((n) => rect(n.getBoundingClientRect()))
        .filter((r) => r.width > 0 && r.height > 0);
      const state = window.__tenka.debug.getState();
      const position = (id: string) =>
        Object.values(state.castles).find((n) => n.id === id)?.pos ??
        Object.values(state.districts).find((n) => n.id === id)?.pos;
      return {
        d,
        canvas: rect(canvas),
        hud,
        roads: Object.values(state.roads).map((r) => ({
          id: r.id,
          a: position(r.a)!,
          b: position(r.b)!,
        })),
      };
    });
    const lake = scene.d.waterRendering.lakes[0]!;
    const p = lake.worldPoints[0]!;
    const index = lake.worldPoints.findIndex((q) => q.x !== p.x);
    expect(index).toBeGreaterThan(0);
    const scale = (lake.points[index]!.x - lake.points[0]!.x) / (lake.worldPoints[index]!.x - p.x);
    const project = (q: Point) => ({
      x: scene.canvas.x + lake.points[0]!.x + (q.x - p.x) * scale,
      y: scene.canvas.y + lake.points[0]!.y + (q.y - p.y) * scale,
    });
    const top = project({ x: mass.x - 6, y: mass.y - 6 });
    const crop = {
      x: Math.floor(top.x),
      y: Math.floor(top.y),
      width: Math.ceil((mass.width + 12) * scale),
      height: Math.ceil((mass.height + 12) * scale),
    };
    const actors = scene.d.actorDepth.bodies.flatMap((b) =>
      b.visible && b.rect
        ? [{ id: b.id, ...b.rect, x: b.rect.x + scene.canvas.x, y: b.rect.y + scene.canvas.y }]
        : [],
    );
    const roads = scene.roads.flatMap((r) => {
      const w = DEBUG_VISUAL_ROAD_DISPLAY[r.id]?.waypoints ?? [];
      const points = [
        r.a,
        ...Array.from({ length: w.length / 2 }, (_, i) => ({ x: w[i * 2]!, y: w[i * 2 + 1]! })),
        r.b,
      ].map(project);
      return points.slice(1).flatMap((b, i) => {
        const a = points[i]!;
        const bounds = {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x) + 0.001,
          height: Math.abs(a.y - b.y) + 0.001,
        };
        return intersects(crop, bounds) ? [{ id: r.id, a, b }] : [];
      });
    });
    const coast = scene.d.coastRendering.displayPolygons.flatMap((polygon) => {
      const points = Array.from({ length: polygon.points.length / 2 }, (_, i) =>
        project({ x: polygon.points[i * 2]!, y: polygon.points[i * 2 + 1]! }),
      );
      return points.flatMap((a, i) => {
        const b = points[(i + 1) % points.length]!;
        return intersects(crop, {
          x: Math.min(a.x, b.x),
          y: Math.min(a.y, b.y),
          width: Math.abs(a.x - b.x) + 0.001,
          height: Math.abs(a.y - b.y) + 0.001,
        })
          ? [{ a, b }]
          : [];
      });
    });
    const observation = {
      ...control,
      sourceScope: { supportedNational, ...sourceScope },
      rawMass: raw.mass,
      mass,
      focus,
      scale,
      crop,
      canvas: scene.canvas,
      projection: lake,
      resources: scene.d.resources,
      castleRibbonLayout: control.id === 'mt.kii' ? scene.d.castleRibbonLayout : undefined,
      geographicLabelLayout: control.id === 'mt.kii' ? scene.d.geographicLabelLayout : undefined,
      hudIntersections: scene.hud.filter((r) => intersects(crop, r)),
      actorIntersections: actors.filter((r) => intersects(crop, r)),
      authoredRoadBoundingIntersections: roads,
      displayCoastBoundingIntersections: coast,
      qualification:
        'full mass rectangle, not opaque asset coverage; road/coast bounding intersections are conservative, not exact paint masks',
    };
    observations.push(observation);
    writeFileSync(
      info.outputPath(`massif-${control.id}-observation.json`),
      JSON.stringify(observation, null, 2),
    );
    await info.attach(`massif-${control.id}`, {
      body: JSON.stringify(observation, null, 2),
      contentType: 'application/json',
    });
    const paintedScene = await page.screenshot({
      path: info.outputPath(`massif-${control.id}-scene.png`),
    });
    expect(crop.x).toBeGreaterThanOrEqual(scene.canvas.x);
    expect(crop.y).toBeGreaterThanOrEqual(scene.canvas.y);
    expect(crop.x + crop.width).toBeLessThanOrEqual(scene.canvas.x + scene.canvas.width);
    expect(crop.y + crop.height).toBeLessThanOrEqual(scene.canvas.y + scene.canvas.height);
    await page.screenshot({ path: info.outputPath(`massif-${control.id}-mass.png`), clip: crop });
    if (supportedNational && control.id === 'mt.kii') {
      // A supported national view must not disable every ribbon placement merely
      // because irrelevant distant leader obstacles exhaust the guard budget.
      expect(scene.d.castleRibbonLayout.limited).toBe(false);
      const ribbons = scene.d.castleRibbonLayout;
      const obstructionRows = ribbons.ribbons.flatMap((ribbon) =>
        ribbons.obstacles
          .filter((obstacle) => obstacle.hard)
          .map((obstacle) => ({
            castle: ribbon.id,
            obstacle: obstacle.id,
            kind: obstacle.kind,
            before: overlapArea(ribbon.baseline, obstacle.rect),
            after: overlapArea(ribbon.rect, obstacle.rect),
          })),
      );
      const obstruction = {
        before: obstructionRows.reduce((sum, row) => sum + row.before, 0),
        after: obstructionRows.reduce((sum, row) => sum + row.after, 0),
        checkedPairs: obstructionRows.length,
        positiveRows: obstructionRows.filter((row) => row.before > 0 || row.after > 0),
        qualification: 'CSS rectangle overlap, not opaque glyph or roof pixels',
      };
      writeFileSync(
        info.outputPath('kii-castle-ribbon-obstruction.json'),
        JSON.stringify(obstruction, null, 2),
      );
      await info.attach('kii-castle-ribbon-obstruction', {
        body: JSON.stringify(obstruction),
        contentType: 'application/json',
      });
      expect(ribbons.ribbons.map((ribbon) => ribbon.id).sort()).toEqual(
        scene.d.armyPlateLayout.castles.map((castle) => castle.id).sort(),
      );
      for (const ribbon of ribbons.ribbons) {
        expect(Math.hypot(ribbon.offset.x, ribbon.offset.y)).toBeLessThanOrEqual(48 + 1e-7);
        expect(ribbon.rect.width).toBe(ribbon.baseline.width);
        expect(ribbon.rect.height).toBe(ribbon.baseline.height);
      }
      for (const row of obstructionRows)
        expect(row.after, `${row.castle}/${row.kind}/${row.obstacle}`).toBeLessThanOrEqual(
          row.before + 1e-7,
        );
      expect(obstruction.before).toBeGreaterThan(0);
      expect(obstruction.after).toBeLessThan(obstruction.before);
      const takayaBody = obstructionRows.find(
        (row) =>
          row.castle === 'castle.takaya' &&
          row.obstacle === 'castle.kishiwada' &&
          row.kind === 'castleBody',
      );
      expect(takayaBody).toBeDefined();
      expect(takayaBody!.before).toBeGreaterThan(0);
      expect(takayaBody!.after, 'Takaya text must clear the Kishiwada castle frame').toBe(0);
      // Fixed authored Kumano vertex, not a pixel-selected or relocated successful sample.
      const station = project({ x: 1792, y: 3155 });
      const roi = {
        x: Math.floor(station.x) - 4,
        y: Math.floor(station.y) - 4,
        width: 9,
        height: 9,
      };
      const foreground = [
        ...scene.hud,
        ...actors,
        ...scene.d.geographicLabelLayout.labels.map((label) => ({
          ...label.rect,
          x: label.rect.x + scene.canvas.x,
          y: label.rect.y + scene.canvas.y,
        })),
      ];
      const overlays = foreground.filter((rect) => intersects(roi, rect));
      const commands = await page.evaluate(() =>
        JSON.stringify(window.__tenka.debug.exportCommandLog()),
      );
      expect(scene.d.riverRendering.visible).toBe(true);
      expect(
        scene.d.riverRendering.materials.rivers.some((river) => river.id === 'rv.kumano'),
      ).toBe(true);
      const previousWater = await page.evaluate(() =>
        window.__tenka.debug.setMapWaterPaintVisible(false),
      );
      let hiddenScene: Buffer;
      try {
        expect(previousWater).toBe(true);
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
        hiddenScene = await page.screenshot({ path: info.outputPath('kii-water-off-scene.png') });
        const hidden = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
        expect(hidden.riverRendering.visible).toBe(false);
        expect(hidden.resources).toEqual(scene.d.resources);
        expect(hidden.layers.waterFeatures?.children).toBe(scene.d.layers.waterFeatures?.children);
        expect(hidden.layers.waterFeatures?.rebuildCount).toBe(
          scene.d.layers.waterFeatures?.rebuildCount,
        );
      } finally {
        await page.evaluate(
          (visible) => window.__tenka.debug.setMapWaterPaintVisible(visible),
          previousWater,
        );
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
      }
      const restoredScene = await page.screenshot({
        path: info.outputPath('kii-water-restored-scene.png'),
      });
      const on = PNG.sync.read(paintedScene),
        off = PNG.sync.read(hiddenScene!),
        restoredWater = PNG.sync.read(restoredScene);
      expect(restoredWater.data.equals(on.data)).toBe(true);
      const pixels = [];
      for (let y = roi.y; y < roi.y + roi.height; y++)
        for (let x = roi.x; x < roi.x + roi.width; x++) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThan(on.width);
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThan(on.height);
          const index = (y * on.width + x) * 4;
          const onRGB = [...on.data.subarray(index, index + 3)],
            offRGB = [...off.data.subarray(index, index + 3)];
          pixels.push({
            x,
            y,
            onRGB,
            offRGB,
            delta: Math.max(...onRGB.map((value, channel) => Math.abs(value - offRGB[channel]!))),
          });
        }
      const waterObservation = {
        worldStation: { x: 1792, y: 3155 },
        station,
        roi,
        overlays,
        pixels,
        maxDelta: Math.max(...pixels.map((pixel) => pixel.delta)),
        qualification:
          'attributable water paint at one fixed river station, not complete river contrast or continuity acceptance',
      };
      writeFileSync(
        info.outputPath('kii-kumano-water-paint.json'),
        JSON.stringify(waterObservation, null, 2),
      );
      await info.attach('kii-kumano-water-paint', {
        body: JSON.stringify(waterObservation),
        contentType: 'application/json',
      });
      expect(overlays, 'fixed Kumano station must not be covered by text, actors or HUD').toEqual(
        [],
      );
      expect(
        waterObservation.maxDelta,
        'Kumano must retain attributable water paint above Kii terrain',
      ).toBeGreaterThan(0);
      expect(
        await page.evaluate(() => JSON.stringify(window.__tenka.debug.exportCommandLog())),
      ).toBe(commands);
      const previousHero = await page.evaluate(() =>
        window.__tenka.debug.setMapMountainHeroVisible(false),
      );
      let withoutHero: Buffer;
      try {
        expect(previousHero).toBe(true);
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
        withoutHero = await page.screenshot({ path: info.outputPath('kii-hero-off-scene.png') });
        expect(
          await page.evaluate(() => window.__tenka.debug.getMapDiagnostics().resources),
        ).toEqual(scene.d.resources);
      } finally {
        await page.evaluate(
          (visible) => window.__tenka.debug.setMapMountainHeroVisible(visible),
          previousHero,
        );
        await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
      }
      const heroRestored = PNG.sync.read(
        await page.screenshot({ path: info.outputPath('kii-hero-restored-scene.png') }),
      );
      expect(heroRestored.data.equals(on.data)).toBe(true);
      const heroOff = PNG.sync.read(withoutHero!);
      const displayLandAt = (x: number, y: number) =>
        scene.d.coastRendering.displayPolygons.some((polygon) => {
          const points = polygon.points;
          let inside = false;
          for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
            const ax = points[i]!,
              ay = points[i + 1]!,
              bx = points[j]!,
              by = points[j + 1]!;
            if (ay > y !== by > y && x < ((bx - ax) * (y - ay)) / (by - ay) + ax) inside = !inside;
          }
          return inside;
        });
      // Fixed offshore stations and an inland positive control remain unchanged after RED.
      const heroStations = [
        { world: { x: 1840, y: 3148 }, expectedLand: false },
        { world: { x: 1848, y: 3158 }, expectedLand: false },
        { world: { x: 1838, y: 3140 }, expectedLand: false },
        { world: { x: 1718, y: 3120 }, expectedLand: true },
      ].map((control) => {
        const center = project(control.world);
        const bounds = {
          x: Math.floor(center.x) - 4,
          y: Math.floor(center.y) - 4,
          width: 9,
          height: 9,
        };
        const values = [];
        for (let y = bounds.y; y < bounds.y + bounds.height; y++)
          for (let x = bounds.x; x < bounds.x + bounds.width; x++) {
            const worldX = p.x + (x - scene.canvas.x - lake.points[0]!.x) / scale;
            const worldY = p.y + (y - scene.canvas.y - lake.points[0]!.y) / scale;
            expect(displayLandAt(worldX, worldY)).toBe(control.expectedLand);
            const index = (y * on.width + x) * 4;
            const painted = [...on.data.subarray(index, index + 3)],
              absent = [...heroOff.data.subarray(index, index + 3)];
            values.push({
              x,
              y,
              worldX,
              worldY,
              painted,
              absent,
              delta: Math.max(
                ...painted.map((value, channel) => Math.abs(value - absent[channel]!)),
              ),
            });
          }
        return {
          ...control,
          center,
          bounds,
          overlays: foreground.filter((rect) => intersects(bounds, rect)),
          pixels: values,
          maxDelta: Math.max(...values.map((value) => value.delta)),
        };
      });
      writeFileSync(
        info.outputPath('kii-hero-coast-stations.json'),
        JSON.stringify(heroStations, null, 2),
      );
      await info.attach('kii-hero-coast-stations', {
        body: JSON.stringify(heroStations),
        contentType: 'application/json',
      });
      for (const control of heroStations) {
        expect(control.overlays).toEqual([]);
        if (control.expectedLand)
          expect(control.maxDelta, 'inland Kii hero must remain painted').toBeGreaterThan(0);
        else
          expect(control.maxDelta, 'Kii forest ground must not paint fixed offshore stations').toBe(
            0,
          );
      }
      expect(
        await page.evaluate(() => JSON.stringify(window.__tenka.debug.exportCommandLog())),
      ).toBe(commands);
    }
    await page.evaluate(() => window.__tenka.debug.waitMapIdle(3));
    expect(await page.evaluate(() => window.__tenka.debug.getMapDiagnostics().resources)).toEqual(
      scene.d.resources,
    );
    await page.evaluate(() => window.__tenka.debug.setMapCameraPreset('overview'));
    await settle();
    await focusView();
    const restored = await page.evaluate(() => window.__tenka.debug.getMapDiagnostics());
    expect(restored.waterRendering.lakes[0]!.points).toEqual(lake.points);
    const owned = (resources: typeof restored.resources) =>
      Object.fromEntries(
        Object.entries(resources).filter(
          ([key]) => key.startsWith('owned') || key.endsWith('Bytes'),
        ),
      );
    expect(owned(restored.resources)).toEqual(owned(scene.d.resources));
  }
  await info.attach('massif-asset-admission', {
    body: JSON.stringify({
      responses,
      qualification: 'successful response is admission evidence, not paint or visual acceptance',
    }),
    contentType: 'application/json',
  });
  expect(observations).toHaveLength(6);
  expect(await page.evaluate(() => JSON.stringify(window.__tenka.debug.getState()))).toBe(before);
  expect(errors).toEqual([]);
  // Opt in only when collecting the separate new-asset admission RED/GREEN.
  if (process.env.MASSIF_REQUIRE_NEW_ASSETS === '1')
    for (const control of controls)
      expect(
        responses.some((url) => url.endsWith(control.asset)),
        control.id,
      ).toBe(true);
  // Resource admission is separate from actual painted pixels and art acceptance.
  if (process.env.MOUNTAIN_REQUIRE_SHADE === '1') {
    const resources = observations[0]!.resources;
    expect(resources.ownedMountainShadeTextures).toBe(14);
    expect(resources.ownedMountainShadeSources).toBe(14);
    expect(resources.mountainShadeRgbaBytes).toBe(14 * 128 * 128 * 4);
  }
});
