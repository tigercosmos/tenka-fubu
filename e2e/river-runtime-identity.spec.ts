import { test, expect } from './fixtures';
import type { probeRiverSurfaceBoundsPair } from '../src/ui/map/terrain/riverSurfaceMaterial';

function assertOriginalProbe(probe: ReturnType<typeof probeRiverSurfaceBoundsPair>) {
  expect(probe).not.toBeNull();
  expect(probe!.before.tuple).toEqual([656, 3418, 86, 153]);
  expect(probe!.sourceScalars).toEqual([656, 3418, 86, 153]);
  expect(probe!.second.tuple).toEqual([2343, 2758, 39, 135]);
  expect(probe!.secondSourceScalars).toEqual([2343, 2758, 39, 135]);
  expect(probe!.after).toEqual(probe!.before);
  expect(probe!.firstEqualsOriginal).toBe(true);
  expect(probe!.firstEqualsSecond).toBe(false);
  for (const evidence of [probe!.sameValueBefore, probe!.sameValueAfter]) {
    expect(evidence.originalValues).toEqual([656, 3418, 86, 153]);
    expect(evidence.accepted).toEqual([true, true, true, true]);
    expect(evidence.beforeOperation).toEqual(probe!.before);
    expect(evidence.afterOperation).toEqual(evidence.beforeOperation);
    expect(evidence.mapHasOriginal).toBe(true);
    expect(evidence.mapHasCurrent).toBe(true);
    expect(evidence.mapKeyEqualsOriginal).toBe(true);
    expect(evidence.mapValueEqualsAllocation).toBe(true);
    expect(evidence.currentEqualsOriginal).toBe(true);
  }
}

// Six fresh application contexts, not a renderer-remount or standalone protocol.
for (let isolation = 1; isolation <= 6; isolation++) {
  const order = isolation % 2 === 1 ? 'retained-first' : 'canonical-first';
  test(`river runtime identity ${isolation}: ${order} actual same-realm routes`, async ({
    page,
  }, info) => {
    const observations: unknown[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    try {
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto('/?debug=visual-map');
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
      await page.evaluate(async () => {
        await document.fonts.ready;
        await window.__tenka.debug.waitMapIdle(3);
      });
      for (let call = 0; call < 11; call++) {
        const value = await page.evaluate((routeOrder) => {
          if (routeOrder !== 'retained-first' && routeOrder !== 'canonical-first')
            throw new Error('Invalid diagnostic route order');
          const debug = window.__tenka.debug;
          const before = debug.getMapDiagnostics();
          const core = JSON.stringify(debug.getState());
          const commands = JSON.stringify(debug.exportCommandLog());
          const intrinsics = () => ({
            freeze: Function.prototype.toString.call(Object.freeze),
            descriptor: Function.prototype.toString.call(Object.getOwnPropertyDescriptor),
            stringify: Function.prototype.toString.call(JSON.stringify),
            defineProperty: Function.prototype.toString.call(Reflect.defineProperty),
          });
          const identities = [
            Object.freeze,
            Object.getOwnPropertyDescriptor,
            JSON.stringify,
            Reflect.defineProperty,
          ];
          const intrinsicsBefore = intrinsics();
          const sentinel = Object.freeze({ x: 656, y: 3418, width: 86, height: 153 });
          const sentinelReference = sentinel;
          const sentinelMap = new Map([[sentinel, 'original-sentinel']]);
          const inspectSentinel = () => ({
            tuple: [sentinel.x, sentinel.y, sentinel.width, sentinel.height],
            descriptorValues: ['x', 'y', 'width', 'height'].map(
              (key) => Object.getOwnPropertyDescriptor(sentinel, key)?.value as unknown,
            ),
            nativeJSON: JSON.stringify(sentinel),
            frozen: Object.isFrozen(sentinel),
          });
          const sentinelBefore = inspectSentinel();
          const result = debug.getRiverRuntimeIdentityProbe('rv.chikugo', 'rv.fuji', routeOrder);
          const after = debug.getMapDiagnostics();
          return {
            result,
            nativeJSON: JSON.stringify(result),
            sentinelBefore,
            sentinelAfter: inspectSentinel(),
            sentinelIdentityUnchanged:
              sentinel === sentinelReference &&
              sentinelMap.has(sentinelReference) &&
              sentinelMap.keys().next().value === sentinelReference &&
              sentinelMap.get(sentinel) === 'original-sentinel',
            intrinsicsBefore,
            intrinsicsAfter: intrinsics(),
            intrinsicIdentitiesUnchanged:
              identities[0] === Object.freeze &&
              identities[1] === Object.getOwnPropertyDescriptor &&
              identities[2] === JSON.stringify &&
              identities[3] === Reflect.defineProperty,
            resourcesBefore: before.resources,
            resourcesAfter: after.resources,
            materialsBefore: before.riverRendering.materials,
            materialsAfter: after.riverRendering.materials,
            coreUnchanged: core === JSON.stringify(debug.getState()),
            commandsUnchanged: commands === JSON.stringify(debug.exportCommandLog()),
          };
        }, order);
        observations.push({ call, value });
        await info.attach(`runtime-identity-${call}`, {
          body: JSON.stringify({ isolation, order, call, value, errors }),
          contentType: 'application/json',
        });
        expect(value.result).not.toBeNull();
        const result = value.result!;
        expect(result.order).toBe(order);
        expect(result.inspectionTiming).toBe('before');
        expect(result.identityBefore).not.toBeNull();
        expect(result.identityAfter).toBeNull();
        expect(result.identityBefore!.probeImportEqualsDirect).toBe(true);
        expect(result.identityBefore!.rivers.map((river) => river.id)).toEqual([
          'rv.chikugo',
          'rv.fuji',
        ]);
        for (const river of result.identityBefore!.rivers) {
          expect(river.riverReferenceEqualsCanonical).toBe(true);
          expect(river.pointsReferenceEqualsCanonical).toBe(true);
          expect(river.pointReferencesEqual).toBe(true);
          expect(river.retainedWidth).toBe(4);
          expect(river.canonicalWidth).toBe(4);
          expect(river.retained).toEqual(river.canonical);
          expect(river.retained.arrayPrototypeIsNative).toBe(true);
          for (const point of river.retained.points) {
            expect(point.prototypeIsNative).toBe(true);
            expect(
              point.descriptors.every(
                (descriptor) =>
                  descriptor.data && descriptor.enumerable && Number.isFinite(descriptor.value),
              ),
            ).toBe(true);
          }
        }
        assertOriginalProbe(result.retained);
        assertOriginalProbe(result.canonical);
        expect(result.retained).toEqual(result.canonical);
        expect(JSON.parse(value.nativeJSON)).toEqual(result);
        expect(value.sentinelBefore.tuple).toEqual([656, 3418, 86, 153]);
        expect(value.sentinelBefore.descriptorValues).toEqual([656, 3418, 86, 153]);
        expect(value.sentinelBefore.frozen).toBe(true);
        expect(value.sentinelAfter).toEqual(value.sentinelBefore);
        expect(value.sentinelIdentityUnchanged).toBe(true);
        expect(value.intrinsicsAfter).toEqual(value.intrinsicsBefore);
        expect(value.intrinsicIdentitiesUnchanged).toBe(true);
        expect(value.resourcesAfter).toEqual(value.resourcesBefore);
        expect(value.materialsAfter).toEqual(value.materialsBefore);
        expect(value.coreUnchanged).toBe(true);
        expect(value.commandsUnchanged).toBe(true);
        expect(errors).toEqual([]);
      }
      expect(observations).toHaveLength(11);
    } finally {
      await info.attach('runtime-identity-summary', {
        body: JSON.stringify({ isolation, order, observations, errors }),
        contentType: 'application/json',
      });
    }
  });
}
