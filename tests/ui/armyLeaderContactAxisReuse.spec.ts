import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { layoutArmyPlates } from '@ui/map/armyPlateLayout';

// Exact retained native Narumi UI1.5 geometry from armyAnnotationLayout; only the
// already-established physical V2 height differs from its archived V1 envelope.
const retainedV1Fixture = {
  candidates: [
    {
      id: 'army.000001',
      rect: {
        x: 979.9640350877185,
        y: 396.33991228070136,
        width: 79.33333333333334,
        height: 25.083333333333332,
      },
      anchor: {
        x: 980.5473684210519,
        y: 395.7565789473683,
      },
      priority: 1,
    },
    {
      id: 'army.000002',
      rect: {
        x: 850.9640350877185,
        y: 480.33991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 851.5473684210519,
        y: 479.7565789473683,
      },
      priority: 1,
    },
    {
      id: 'army.000003',
      rect: {
        x: 486.46403508771846,
        y: 360.33991228070136,
        width: 46.666666666666664,
        height: 25.083333333333332,
      },
      anchor: {
        x: 487.04736842105194,
        y: 359.7565789473683,
      },
      priority: 3,
    },
    {
      id: 'army.000004',
      rect: {
        x: 505.96403508771846,
        y: 322.83991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 506.54736842105194,
        y: 322.2565789473683,
      },
      priority: 1,
    },
    {
      id: 'army.000005',
      rect: {
        x: 549.4640350877185,
        y: 378.33991228070136,
        width: 70,
        height: 25.083333333333332,
      },
      anchor: {
        x: 550.0473684210519,
        y: 377.7565789473683,
      },
      priority: 1,
    },
    {
      id: 'army.000006',
      rect: {
        x: 934.9640350877185,
        y: 426.33991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 935.5473684210519,
        y: 425.7565789473683,
      },
      priority: 3,
    },
    {
      id: 'army.000007',
      rect: {
        x: 1002.4640350877185,
        y: 378.33991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 1003.0473684210519,
        y: 377.7565789473683,
      },
      priority: 3,
    },
    {
      id: 'army.000008',
      rect: {
        x: 895.9640350877185,
        y: 510.33991228070136,
        width: 46.666666666666664,
        height: 25.083333333333332,
      },
      anchor: {
        x: 896.5473684210519,
        y: 509.7565789473683,
      },
      priority: 3,
    },
    {
      id: 'army.000009',
      rect: {
        x: 373.96403508771846,
        y: 241.83991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 374.54736842105194,
        y: 241.25657894736833,
      },
      priority: 3,
    },
    {
      id: 'army.000010',
      rect: {
        x: 441.46403508771846,
        y: 226.83991228070136,
        width: 46.666666666666664,
        height: 25.083333333333332,
      },
      anchor: {
        x: 442.04736842105194,
        y: 226.25657894736833,
      },
      priority: 3,
    },
    {
      id: 'army.000011',
      rect: {
        x: 1017.4640350877185,
        y: 366.33991228070136,
        width: 63,
        height: 25.083333333333332,
      },
      anchor: {
        x: 1018.0473684210519,
        y: 365.7565789473683,
      },
      priority: 3,
    },
  ],
  ribbons: [
    {
      x: 358.64736842105185,
      y: 247.256578947368,
      width: 121.8,
      height: 20,
    },
    {
      x: 797.9723684210521,
      y: 506.7565789473683,
      width: 107.15,
      height: 16,
    },
    {
      x: 395.3853686041574,
      y: 343.2565789473683,
      width: 132.32399963378907,
      height: 20,
    },
    {
      x: 451.4723684210521,
      y: 374.7565789473683,
      width: 107.15,
      height: 16,
    },
    {
      x: 914.3853686041574,
      y: 431.7565789473688,
      width: 132.32399963378907,
      height: 20,
    },
  ],
  bodies: [
    {
      x: 390.055842997323,
      y: 168.74810437109682,
      width: 60,
      height: 56.69491525423729,
    },
    {
      x: 829.083894395078,
      y: 454.55365686944606,
      width: 45,
      height: 34.443993506493506,
    },
    {
      x: 431.54736842105194,
      y: 269.63600016923374,
      width: 60,
      height: 51.31832797427652,
    },
    {
      x: 482.583894395078,
      y: 322.55365686944606,
      width: 45,
      height: 34.443993506493506,
    },
    {
      x: 950.5473684210519,
      y: 358.13600016923374,
      width: 60,
      height: 51.31832797427652,
    },
  ],
  foreground: [
    {
      x: 994.2640262132218,
      y: 369.0065789473683,
      width: 33.72433246550001,
      height: 44.25,
    },
    {
      x: 977.6864868783523,
      y: 352.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 849.2640262132218,
      y: 437.0065789473683,
      width: 30.424332465500015,
      height: 44.25,
    },
    {
      x: 848.6864868783523,
      y: 436.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 484.76402621322177,
      y: 317.0065789473683,
      width: 16.116684415660565,
      height: 44.25,
    },
    {
      x: 484.0657473088936,
      y: 321.8296232452003,
      width: 39,
      height: 36.46371347785109,
    },
    {
      x: 504.26402621322177,
      y: 279.5065789473683,
      width: 27.55834220783028,
      height: 44.25,
    },
    {
      x: 503.6864868783523,
      y: 278.7951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 547.7640262132218,
      y: 335.0065789473683,
      width: 30.3391826810123,
      height: 44.25,
    },
    {
      x: 547.1864868783523,
      y: 334.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 933.2640262132218,
      y: 383.0065789473683,
      width: 26.13334220783028,
      height: 44.25,
    },
    {
      x: 932.6864868783523,
      y: 382.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 984.7640262132218,
      y: 319.0065789473683,
      width: 26.13334220783028,
      height: 44.25,
    },
    {
      x: 1000.1864868783523,
      y: 334.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 894.2640262132218,
      y: 467.0065789473683,
      width: 22.833342207830285,
      height: 44.25,
    },
    {
      x: 893.6864868783523,
      y: 466.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 372.26402621322177,
      y: 193.16558868969878,
      width: 29.224332465500012,
      height: 49.59099025766973,
    },
    {
      x: 371.6864868783523,
      y: 197.7951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 439.76402621322177,
      y: 178.16558868969878,
      width: 25.92433246550001,
      height: 49.59099025766973,
    },
    {
      x: 439.1864868783523,
      y: 182.7951464404814,
      width: 38.760330578512395,
      height: 42,
    },
    {
      x: 1034.1206938483483,
      y: 324.24100247268143,
      width: 36.992251047391086,
      height: 43.015576474687265,
    },
    {
      x: 1015.1864868783523,
      y: 322.2951464404814,
      width: 38.760330578512395,
      height: 42,
    },
  ],
  options: {
    maxOffset: 80,
    canvas: {
      x: 0,
      y: 0,
      width: 1280,
      height: 720,
    },
    screenOcclusions: [
      {
        x: 126,
        y: 96,
        width: 223.4375,
        height: 59,
      },
      {
        x: 18,
        y: 12,
        width: 1244,
        height: 72,
      },
      {
        x: 12,
        y: 96,
        width: 96,
        height: 606,
      },
      {
        x: 126,
        y: 540,
        width: 1136,
        height: 168,
      },
      {
        x: 1070,
        y: 342,
        width: 192,
        height: 192,
      },
      {
        x: 902,
        y: 90,
        width: 360,
        height: 48,
      },
      {
        x: 902,
        y: 150,
        width: 360,
        height: 64.75,
      },
      {
        x: 902,
        y: 226.75,
        width: 360,
        height: 59.59375,
      },
    ],
  },
};

describe('leader contact axis reuse', () => {
  it('sorts unchanged contact axes once while preserving the retained native result', () => {
    const fixture = structuredClone(retainedV1Fixture);
    for (const c of fixture.candidates) c.rect.height = 20.75 * (14 / 12);
    const before = structuredClone(fixture);
    const originalSort = Array.prototype.sort;
    let previous = '',
      consecutive = 0,
      maximumRepeated = 0,
      numericSorts = 0;
    const spy = vi.spyOn(Array.prototype, 'sort').mockImplementation(function (
      this: unknown[],
      compare,
    ) {
      const contact = new Error().stack?.includes('leaderContacts') ?? false;
      if (contact && this.length > 0 && this.every((value) => typeof value === 'number')) {
        numericSorts++;
        const key = JSON.stringify(this);
        consecutive = key === previous ? consecutive + 1 : 1;
        previous = key;
        maximumRepeated = Math.max(maximumRepeated, consecutive);
      } else {
        previous = '';
        consecutive = 0;
      }
      return originalSort.call(this, compare) as unknown[];
    });
    let output: [string, { x: number; y: number }][];
    try {
      output = [
        ...layoutArmyPlates(
          fixture.candidates,
          fixture.ribbons,
          fixture.bodies,
          fixture.foreground,
          fixture.options,
        ),
      ];
    } finally {
      spy.mockRestore();
    }
    const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
    console.info(JSON.stringify({ numericSorts, maximumRepeated, output, hash }));
    expect(fixture).toEqual(before);
    expect(numericSorts).toBeGreaterThan(0);
    expect(maximumRepeated).toBe(1);
    expect(hash).toBe('440f3e5b72669176e0906738fa07f16886ac0583a500a9784d53a3bde690d188');
  });
});
