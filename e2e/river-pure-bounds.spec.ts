import { test, expect } from './fixtures';

// Independent pure-producer control, not a replacement for strict material remount checks.
for (let isolation = 1; isolation <= 6; isolation++) {
  test(`pure river bounds isolation ${isolation}: consecutive calls after ten remounts`, async ({
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
      for (let remount = 0; remount <= 10; remount++) {
        if (remount > 0) {
          await page.evaluate(async () => {
            await window.__tenka.debug.remountMap();
            await window.__tenka.debug.waitMapIdle(3);
          });
        }
        const value = await page.evaluate(() => {
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
          const originalSentinel = sentinel;
          const sentinelMap = new Map([[sentinel, 'original-sentinel']]);
          const inspectSentinel = () => ({
            tuple: [sentinel.x, sentinel.y, sentinel.width, sentinel.height],
            descriptorValues: ['x', 'y', 'width', 'height'].map(
              (key) => Object.getOwnPropertyDescriptor(sentinel, key)?.value as unknown,
            ),
            descriptorFlags: ['x', 'y', 'width', 'height'].map((key) => {
              const descriptor = Object.getOwnPropertyDescriptor(sentinel, key);
              return {
                writable: descriptor?.writable === true,
                configurable: descriptor?.configurable === true,
                enumerable: descriptor?.enumerable === true,
                data: descriptor !== undefined && 'value' in descriptor,
              };
            }),
            nativeJSON: JSON.stringify(sentinel),
            frozen: Object.isFrozen(sentinel),
          });
          const sentinelBefore = inspectSentinel();
          const probe = debug.getRiverPureBoundsProbe('rv.chikugo', 'rv.fuji');
          const sentinelAfter = inspectSentinel();
          const sentinelIdentityUnchanged = sentinel === originalSentinel;
          const sentinelMapKeyUnchanged =
            sentinelMap.has(originalSentinel) &&
            sentinelMap.keys().next().value === originalSentinel &&
            sentinelMap.get(sentinel) === 'original-sentinel';
          const after = debug.getMapDiagnostics();
          return {
            sentinelBefore,
            sentinelAfter,
            sentinelIdentityUnchanged,
            sentinelMapKeyUnchanged,
            probe,
            probeJSON: JSON.stringify(probe),
            intrinsicsBefore,
            intrinsicsAfter: intrinsics(),
            intrinsicIdentitiesUnchanged:
              identities[0] === Object.freeze &&
              identities[1] === Object.getOwnPropertyDescriptor &&
              identities[2] === JSON.stringify &&
              identities[3] === Reflect.defineProperty,
            beforeMaterials: before.riverRendering.materials,
            afterMaterials: after.riverRendering.materials,
            resourcesBefore: before.resources,
            resourcesAfter: after.resources,
            coreUnchanged: core === JSON.stringify(debug.getState()),
            commandsUnchanged: commands === JSON.stringify(debug.exportCommandLog()),
          };
        });
        observations.push({ remount, value });
        await info.attach(`pure-river-bounds-${remount}`, {
          body: JSON.stringify({ isolation, remount, value, errors }),
          contentType: 'application/json',
        });
        expect(value.sentinelBefore.tuple).toEqual([656, 3418, 86, 153]);
        expect(value.sentinelBefore.descriptorValues).toEqual([656, 3418, 86, 153]);
        expect(value.sentinelAfter).toEqual(value.sentinelBefore);
        expect(JSON.parse(value.sentinelBefore.nativeJSON)).toEqual({
          x: 656,
          y: 3418,
          width: 86,
          height: 153,
        });
        expect(value.sentinelBefore.frozen && value.sentinelAfter.frozen).toBe(true);
        expect(
          value.sentinelAfter.descriptorFlags.every(
            (flag) => flag.data && !flag.writable && !flag.configurable && flag.enumerable,
          ),
        ).toBe(true);
        expect(value.sentinelIdentityUnchanged).toBe(true);
        expect(value.sentinelMapKeyUnchanged).toBe(true);
        expect(value.probe).not.toBeNull();
        expect(value.probe!.before.tuple).toEqual([656, 3418, 86, 153]);
        expect(value.probe!.after).toEqual(value.probe!.before);
        expect(value.probe!.second.tuple).toEqual([2343, 2758, 39, 135]);
        expect(value.probe!.firstEqualsOriginal).toBe(true);
        expect(value.probe!.firstEqualsSecond).toBe(false);
        for (const evidence of [value.probe!.sameValueBefore, value.probe!.sameValueAfter]) {
          expect(evidence.originalValues).toEqual([656, 3418, 86, 153]);
          expect(evidence.accepted).toEqual([true, true, true, true]);
          expect(evidence.afterOperation).toEqual(evidence.beforeOperation);
          expect(evidence.beforeOperation).toEqual(value.probe!.before);
          expect(evidence.mapHasOriginal).toBe(true);
          expect(evidence.mapHasCurrent).toBe(true);
          expect(evidence.mapKeyEqualsOriginal).toBe(true);
          expect(evidence.mapValueEqualsAllocation).toBe(true);
          expect(evidence.currentEqualsOriginal).toBe(true);
        }
        expect(JSON.parse(value.probeJSON)).toEqual(value.probe);
        expect(value.intrinsicIdentitiesUnchanged).toBe(true);
        expect(value.intrinsicsAfter).toEqual(value.intrinsicsBefore);
        expect(value.afterMaterials).toEqual(value.beforeMaterials);
        expect(value.resourcesAfter).toEqual(value.resourcesBefore);
        expect(value.coreUnchanged).toBe(true);
        expect(value.commandsUnchanged).toBe(true);
        expect(errors).toEqual([]);
      }
      expect(observations).toHaveLength(11);
    } finally {
      await info.attach('pure-river-bounds-summary', {
        body: JSON.stringify({ isolation, observations, errors }),
        contentType: 'application/json',
      });
    }
  });
}
