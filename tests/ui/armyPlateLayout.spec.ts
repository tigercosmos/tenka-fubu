import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import nativeFixtures from './fixtures/armyPlatePixelHud.json';
import * as plateModule from '../../src/ui/map/armyPlateLayout';
// Captured actual frozen native MID call266; original body/world/camera inputs, not a synthetic town.
const townMidFixture = {
  candidates: [
    {
      id: 'army.000001',
      rect: {
        x: 553.8692504575179,
        y: 341.86910995865856,
        width: 40.833333333333336,
        height: 18.666666666666668,
      },
      anchor: { x: 554.4525837908511, y: 341.28577662532507 },
      priority: 1,
    },
    {
      id: 'army.000002',
      rect: {
        x: 481.0521134805806,
        y: 389.2849200831761,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 481.63544681391386, y: 388.7015867498426 },
      priority: 1,
    },
    {
      id: 'army.000003',
      rect: {
        x: 275.3013659759788,
        y: 321.54804847672267,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 275.88469930931205, y: 320.9647151433892 },
      priority: 3,
    },
    {
      id: 'army.000004',
      rect: {
        x: 286.30860761202734,
        y: 300.38027609970595,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 286.8919409453606, y: 299.79694276637247 },
      priority: 1,
    },
    {
      id: 'army.000005',
      rect: {
        x: 310.8632235693667,
        y: 331.7085792176904,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 311.44655690269997, y: 331.1252458843569 },
      priority: 1,
    },
    {
      id: 'army.000006',
      rect: {
        x: 528.4679236050979,
        y: 358.803327860272,
        width: 40.833333333333336,
        height: 18.666666666666668,
      },
      anchor: { x: 529.0512569384312, y: 358.21999452693854 },
      priority: 3,
    },
    {
      id: 'army.000007',
      rect: {
        x: 566.5699138837278,
        y: 331.7085792176904,
        width: 40.833333333333336,
        height: 18.666666666666668,
      },
      anchor: { x: 567.1532472170611, y: 331.1252458843569 },
      priority: 3,
    },
    {
      id: 'army.000008',
      rect: {
        x: 506.4534403330006,
        y: 406.2191379847891,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 507.03677366633383, y: 405.6358046514556 },
      priority: 3,
    },
    {
      id: 'army.000009',
      rect: {
        x: 211.79804884492887,
        y: 254.6578877653501,
        width: 40.833333333333336,
        height: 18.666666666666668,
      },
      anchor: { x: 212.38138217826213, y: 254.0745544320166 },
      priority: 3,
    },
    {
      id: 'army.000010',
      rect: {
        x: 249.90003912355883,
        y: 246.19077881454314,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 250.48337245689208, y: 245.60744548120965 },
      priority: 3,
    },
    {
      id: 'army.000011',
      rect: {
        x: 575.0370228345344,
        y: 324.9348920570451,
        width: 32.66666666666667,
        height: 18.666666666666668,
      },
      anchor: { x: 575.6203561678676, y: 324.3515587237116 },
      priority: 3,
    },
  ],
  seed: [
    ['army.000001', { x: 0, y: 40 }],
    ['army.000002', { x: -8.296899528739615, y: 0.26337756174689275 }],
    ['army.000003', { x: 0, y: 10.102846820779178 }],
    ['army.000004', { x: 20.847636417343665, y: -12.454542494945297 }],
    ['army.000005', { x: 0, y: 0.2633775617473475 }],
    ['army.000006', { x: -48, y: -16 }],
    ['army.000007', { x: 32, y: -32 }],
    ['army.000008', { x: 0, y: 0.2633775617473475 }],
    ['army.000009', { x: -8.074985986934813, y: 22.803510246988935 }],
    ['army.000010', { x: 20.847636417343665, y: -4.916048384398135 }],
    ['army.000011', { x: 13.163180291845947, y: 0.2633775617473475 }],
  ],
  fixed: [
    { x: 176.88270903068195, y: 257.46139801233903, width: 121.8, height: 20 },
    { x: 195.3286142760462, y: 311.65089529750185, width: 132.32399963378907, height: 20 },
    { x: 488.2905839739565, y: 361.60683810726096, width: 132.32399963378907, height: 20 },
    {
      x: 221.13551177146883,
      y: 213.14541082574397,
      width: 33.86843580322663,
      height: 32.00280162762517,
    },
    {
      x: 244.5563961913274,
      y: 270.09399786177437,
      width: 33.86843580322663,
      height: 28.967858275428565,
    },
    {
      x: 537.5183658892377,
      y: 320.0499406715335,
      width: 33.86843580322663,
      height: 28.967858275428565,
    },
    {
      x: 569.1636966411393,
      y: 334.3732208298038,
      width: 19.03650648524098,
      height: 23.759266690602086,
    },
    {
      x: 552.837690743025,
      y: 316.7529310123955,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 480.346559664202,
      y: 365.7890309543209,
      width: 17.17374251606352,
      height: 23.759266690602086,
    },
    {
      x: 480.0205537660877,
      y: 364.16874113691256,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 274.5958121596002,
      y: 299.3547665117417,
      width: 9.097448191544384,
      height: 22.456659526728274,
    },
    {
      x: 274.20165192220065,
      y: 299.5559374032109,
      width: 22.014483272097312,
      height: 20.58281565119749,
    },
    {
      x: 285.603053795649,
      y: 277.01924460734836,
      width: 15.555965731820848,
      height: 23.624409054104813,
    },
    {
      x: 285.27704789753443,
      y: 275.2640971534429,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 310.15766975298834,
      y: 308.2607549223285,
      width: 17.125677682570508,
      height: 23.71120185710907,
    },
    {
      x: 309.8316638548738,
      y: 306.5924002714273,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 527.7623697887193,
      y: 336.61004589529057,
      width: 14.751590381494216,
      height: 22.456659526728274,
    },
    {
      x: 527.436363890605,
      y: 333.6871489140085,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 549.8643600673495,
      y: 293.5152972527094,
      width: 14.751590381494216,
      height: 22.456659526728274,
    },
    {
      x: 565.5383541692349,
      y: 306.5924002714273,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 505.747886516622,
      y: 384.0258560198081,
      width: 12.888826412316751,
      height: 22.456659526728274,
    },
    {
      x: 505.42188061850766,
      y: 381.102959038526,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 211.09249502855027,
      y: 226.92844416109165,
      width: 16.496373799998985,
      height: 27.992821166005413,
    },
    {
      x: 210.76648913043596,
      y: 229.54170881908703,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 249.19448530718023,
      y: 218.46133521028514,
      width: 14.63360983082152,
      height: 27.992821166005413,
    },
    {
      x: 248.8684794090659,
      y: 221.07459986828007,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
    {
      x: 571.1459550195561,
      y: 300.9170981125967,
      width: 20.881161330256806,
      height: 24.281171506195527,
    },
    {
      x: 574.0054631200417,
      y: 299.818713110782,
      width: 21.879196131836487,
      height: 23.707905062258646,
    },
  ],
  content: [
    { x: 207.88270903068218, y: 258.68639686792994, width: 45, height: 17.55000228881836 },
    { x: 272.8827090306822, y: 260.44139709681167, width: 19.8, height: 14.040001831054687 },
    { x: 226.3286142760462, y: 312.87589415309276, width: 45, height: 17.55000228881836 },
    {
      x: 291.3286142760462,
      y: 314.6308943819745,
      width: 30.32399963378906,
      height: 14.040001831054687,
    },
    { x: 519.2905839739565, y: 362.83183696285187, width: 45, height: 17.55000228881836 },
    {
      x: 584.2905839739567,
      y: 364.5868371917336,
      width: 30.32399963378906,
      height: 14.040001831054687,
    },
  ],
  towns: [
    {
      x: 261.2697937044384,
      y: 198.51763330448387,
      width: 9.863084692593077,
      height: 11.463875978540557,
    },
    {
      x: 214.59307040530499,
      y: 268.53271825318404,
      width: 9.863084692593048,
      height: 11.463875978540557,
    },
    {
      x: 276.51058981589074,
      y: 208.67816404545204,
      width: 9.86308469259302,
      height: 11.463875978540557,
    },
    {
      x: 314.6751459583356,
      y: 278.8119594019584,
      width: 8.671849196765322,
      height: 12.819543779131834,
    },
    {
      x: 290.11178106415406,
      y: 252.45583417582924,
      width: 9.639125813285261,
      height: 10.03723054001955,
    },
    {
      x: 493.29579904518533,
      y: 339.668058702573,
      width: 9.080763392378799,
      height: 12.581235406417761,
    },
  ],
  options: {
    maxOffset: 80,
    canvas: { x: 0, y: 0, width: 1280, height: 720 },
    screenOcclusions: [
      { x: 84, y: 64, width: 240, height: 51 },
      { x: 12, y: 8, width: 1256, height: 48 },
      { x: 8, y: 64, width: 64, height: 644 },
      { x: 84, y: 600, width: 1184, height: 112 },
      { x: 1092, y: 420, width: 176, height: 176 },
      { x: 1028, y: 60, width: 240, height: 32 },
      { x: 1028, y: 100, width: 240, height: 86.1875 },
      { x: 1028, y: 194.1875, width: 240, height: 40.390625 },
    ],
  },
} as const;

describe('actual MID town-soft seed readability', () => {
  it('returns the resolved seed when the shared comparison budget is exhausted', () => {
    const candidates = Array.from({ length: 32 }, (_, i) => ({
      id: `blocked-${i}`,
      priority: 3,
      rect: { x: 300, y: 300, width: 20, height: 10 },
    }));
    const seed = new Map(candidates.map((c) => [c.id, { x: 0, y: 0 }]));
    const walls = [
      { x: 200, y: 200, width: 120, height: 100 },
      { x: 200, y: 310, width: 120, height: 100 },
      { x: 200, y: 300, width: 100, height: 10 },
      { x: 320, y: 200, width: 100, height: 210 },
    ];
    const fixed = Array.from({ length: 120 }, (_, i) => walls[i % 4]!);
    const content = Array.from({ length: 127 }, () => candidates[0]!.rect);
    const options = { maxOffset: 80 };
    const originalMin = Math.min;
    let calls = 0;
    Math.min = (...values) => {
      calls++;
      return originalMin(...values);
    };
    let resolved, withTown;
    try {
      resolved = plateModule.refineArmyPlateSeedReadability(
        candidates,
        seed,
        fixed,
        content,
        options,
      );
      const legacyCalls = calls;
      calls = 0;
      withTown = plateModule.refineArmyPlateSeedReadability(
        candidates,
        seed,
        fixed,
        content,
        options,
        [candidates[0]!.rect],
      );
      expect(legacyCalls).toBeGreaterThan(500_000);
      // Only bounded preliminary matrices/goal inspection remain: two min
      // calls per area, per candidate, per guarded fixed/pair/goal rectangle.
      const preliminary =
        2 * candidates.length * (fixed.length + content.length + candidates.length + 1);
      expect(calls).toBeLessThanOrEqual(legacyCalls + preliminary);
    } finally {
      Math.min = originalMin;
    }
    expect(resolved).toEqual(seed);
    expect(withTown).toEqual(resolved);
  });
  it('shares two substantive search passes instead of adding a third town pass', () => {
    const candidates = [
      { id: 'clearable', priority: 3, rect: { x: 100, y: 100, width: 20, height: 10 } },
      { id: 'blocked', priority: 3, rect: { x: 300, y: 300, width: 20, height: 10 } },
    ];
    const seed = new Map(candidates.map((c) => [c.id, { x: 0, y: 0 }]));
    const fixed = [
      { x: 200, y: 200, width: 120, height: 100 },
      { x: 200, y: 310, width: 120, height: 100 },
      { x: 200, y: 300, width: 100, height: 10 },
      { x: 320, y: 200, width: 100, height: 210 },
    ];
    const content = candidates.map((c) => c.rect);
    const options = { maxOffset: 80 };
    const resolved = plateModule.refineArmyPlateSeedReadability(
      candidates,
      seed,
      fixed,
      content,
      options,
    );
    expect(resolved.get('clearable')).not.toEqual(seed.get('clearable'));
    expect(resolved.get('blocked')).toEqual(seed.get('blocked'));
    const offset = resolved.get('clearable')!;
    const town = { ...content[0]!, x: content[0]!.x + offset.x, y: content[0]!.y + offset.y };
    // Castle pass1 moves the clearable label, but leaves the blocked label;
    // pass2 verifies no further improvement. No search budget remains for town.
    expect(
      plateModule.refineArmyPlateSeedReadability(candidates, seed, fixed, content, options, [town]),
    ).toEqual(resolved);
    // Independently starting at that resolved seed leaves the town move feasible.
    expect(
      plateModule.refineArmyPlateSeedReadability(candidates, resolved, fixed, [], options, [town]),
    ).not.toEqual(resolved);
  });
  it('resolves the original measured castle name first, including when town capacity overflows', () => {
    const c = {
      id: 'measured-unit',
      priority: 3,
      rect: { x: 134.41666666666652, y: 231.83333333333348, width: 49, height: 25.083333333333332 },
      anchor: { x: 135, y: 231.25 },
    };
    const seed = new Map([[c.id, { x: 0, y: -6.017148981779275 }]]);
    const name = {
      x: 142.5999999999999,
      y: 237.4749988555909,
      width: 45,
      height: 17.55000228881836,
    };
    const fixed = [
      { x: 147.92372881355914, y: 170.8262711864404, width: 50, height: 47.2457627118644 },
      { x: 182.5, y: 254.89951768488754, width: 50, height: 42.765273311897104 },
      {
        x: 102.89289321881324,
        y: 235.54289321881333,
        width: 132.50710678118656,
        height: 22.707106781186546,
      },
    ];
    const options = {
      maxOffset: 80,
      canvas: { x: 0, y: 0, width: 1280, height: 720 },
      screenOcclusions: [{ x: 12, y: 96, width: 96, height: 606 }],
    };
    const legacy = plateModule.refineArmyPlateSeedReadability([c], seed, fixed, [name], options);
    expect(legacy.get(c.id)).toEqual({ x: 0, y: 66.33145766345115 });
    const town = { x: 700, y: 500, width: 15, height: 12 };
    expect(
      plateModule.refineArmyPlateSeedReadability([c], seed, fixed, [name], options, [town]),
    ).toEqual(legacy);
    expect(
      plateModule.refineArmyPlateSeedReadability(
        [c],
        seed,
        fixed,
        [name],
        options,
        Array.from({ length: 128 }, () => town),
      ),
    ).toEqual(legacy);
  });
  it('retains each original castle-text ceiling instead of trading it for a clear town', () => {
    const c = { id: 'ordinary', priority: 3, rect: { x: 100, y: 100, width: 20, height: 10 } };
    const seed = new Map([[c.id, { x: 0, y: 0 }]]);
    const town = c.rect;
    const text = [
      { x: 76, y: 76, width: 68, height: 24 },
      { x: 76, y: 110, width: 68, height: 24 },
      { x: 76, y: 100, width: 24, height: 10 },
      { x: 120, y: 100, width: 24, height: 10 },
    ];
    // Every local town escape would introduce overlap with this original text.
    const result = plateModule.refineArmyPlateSeedReadability(
      [c],
      seed,
      [],
      text,
      { maxOffset: 80 },
      [town],
    );
    expect(result).toEqual(seed);
  });
  it('counts town goals and individually protected text within the existing capacities', () => {
    const c = { id: 'ordinary', priority: 3, rect: { x: 100, y: 100, width: 20, height: 10 } };
    const seed = new Map([[c.id, { x: 0, y: 0 }]]);
    const clear = { x: 500, y: 500, width: 10, height: 10 };
    const goal = c.rect;
    expect(
      plateModule.refineArmyPlateSeedReadability(
        [c],
        seed,
        Array.from({ length: 250 }, () => clear),
        Array.from({ length: 7 }, () => clear),
        { maxOffset: 80 },
        [goal],
      ),
    ).toEqual(seed);
    expect(
      plateModule.refineArmyPlateSeedReadability(
        [c],
        seed,
        [],
        Array.from({ length: 128 }, () => clear),
        { maxOffset: 80 },
        [goal],
      ),
    ).toEqual(seed);
    expect(() =>
      plateModule.refineArmyPlateSeedReadability([c], seed, [], [], { maxOffset: 80 }, [
        { ...goal, x: NaN },
      ]),
    ).toThrow();
    expect(plateModule.ARMY_SEED_READABILITY_LIMITS).toEqual({
      candidates: 32,
      fixed: 256,
      content: 128,
      hud: 16,
      proposals: 512,
      passes: 2,
      comparisons: 1_000_000,
    });
  });
  it('keeps selected town seeds locked and the absent/empty town path identical', () => {
    const c = { id: 'selected', priority: 0, rect: { x: 100, y: 100, width: 20, height: 10 } };
    const seed = new Map([[c.id, { x: 8, y: 8 }]]);
    expect(
      plateModule.refineArmyPlateSeedReadability([c], seed, [], [], { maxOffset: 80 }, [c.rect]),
    ).toEqual(seed);
    const ordinary = { ...c, priority: 3 };
    expect(
      plateModule.refineArmyPlateSeedReadability(
        [ordinary],
        seed,
        [],
        [c.rect],
        { maxOffset: 80 },
        [],
      ),
    ).toEqual(
      plateModule.refineArmyPlateSeedReadability([ordinary], seed, [], [c.rect], { maxOffset: 80 }),
    );
  });
  it('clears the captured ordinary army6 town model within24 CSS while preserving every original ceiling', () => {
    const f = townMidFixture;
    const seed = new Map(f.seed.map(([id, offset]) => [id, offset] as const));
    expect([
      f.candidates.length,
      f.fixed.length,
      f.content.length,
      f.towns.length,
      f.options.screenOcclusions.length,
    ]).toEqual([11, 28, 6, 6, 8]);
    const snap = structuredClone(f);
    const result = plateModule.refineArmyPlateSeedReadability(
      f.candidates,
      seed,
      f.fixed,
      f.content,
      f.options,
      f.towns,
    );
    const shifted = (i: number, offsets: ReadonlyMap<string, { x: number; y: number }>) => {
      const c = f.candidates[i]!,
        d = offsets.get(c.id)!;
      return { ...c.rect, x: c.rect.x + d.x, y: c.rect.y + d.y };
    };
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const old = f.candidates.map((_, i) => shifted(i, seed)),
      next = f.candidates.map((_, i) => shifted(i, result));
    const i = f.candidates.findIndex((c) => c.id === 'army.000006');
    expect(f.candidates[i]!.priority).toBe(3);
    expect(f.towns.reduce((sum, r) => sum + area(old[i]!, r), 0)).toBeCloseTo(85.77658451701063);
    expect(f.towns.reduce((sum, r) => sum + area(next[i]!, r), 0)).toBe(0);
    expect(result.get('army.000006')).toEqual({ x: -48, y: -40 });
    for (let i = 0; i < f.candidates.length; i++) {
      const c = f.candidates[i]!,
        before = seed.get(c.id)!,
        after = result.get(c.id)!;
      expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThanOrEqual(24 + 1e-8);
      expect(Math.hypot(after.x, after.y)).toBeLessThanOrEqual(80 + 1e-8);
      if (Number(c.priority) === 0) expect(after).toEqual(before);
      for (const r of [...f.fixed, ...f.content])
        expect(area(next[i]!, r)).toBeLessThanOrEqual(area(old[i]!, r) + 1e-8);
      expect(next[i]!.x).toBeGreaterThanOrEqual(0);
      expect(next[i]!.y).toBeGreaterThanOrEqual(0);
      expect(next[i]!.x + next[i]!.width).toBeLessThanOrEqual(f.options.canvas.width);
      expect(next[i]!.y + next[i]!.height).toBeLessThanOrEqual(f.options.canvas.height);
      for (const h of f.options.screenOcclusions)
        expect(area(next[i]!, h)).toBeLessThanOrEqual(area(old[i]!, h) + 1e-8);
      for (let j = 0; j < f.candidates.length; j++) {
        if (i === j) continue;
        expect(area(next[i]!, next[j]!)).toBeLessThanOrEqual(area(old[i]!, old[j]!) + 1e-8);
        const endpoint = (r: PlateRect) => ({
          x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
          y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
        });
        expect(Number(leaderCrosses(c.anchor, endpoint(next[i]!), next[j]!))).toBeLessThanOrEqual(
          Number(leaderCrosses(c.anchor, endpoint(old[i]!), old[j]!)),
        );
      }
    }
    expect(f).toEqual(snap);
  });
});

describe('resolved seed castle-content readability', () => {
  it('does not construct constraint matrices when all twenty seed contents are already clear', () => {
    const candidates = Array.from({ length: 20 }, (_, i) => ({
      id: `unit-${i}`,
      priority: 3,
      rect: { x: i * 50, y: 100, width: 20, height: 10 },
      anchor: { x: i * 50, y: 95 },
    }));
    const seed = new Map(candidates.map((c) => [c.id, { x: 0, y: 0 }]));
    const fixed = Array.from({ length: 256 }, (_, i) => ({
      x: i * 10,
      y: 300,
      width: 8,
      height: 8,
    }));
    const content = Array.from({ length: 100 }, (_, i) => ({
      x: i * 20,
      y: 500,
      width: 10,
      height: 10,
    }));
    const originalMin = Math.min;
    let calls = 0;
    Math.min = (...values: number[]) => {
      calls++;
      return originalMin(...values);
    };
    let result;
    try {
      result = plateModule.refineArmyPlateSeedReadability(candidates, seed, fixed, content, {
        maxOffset: 80,
      });
    } finally {
      Math.min = originalMin;
    }
    expect(result).toEqual(seed);
    expect(calls).toBeLessThanOrEqual(5000);
  });
  it('clears the measured close-view castle name while preserving the seed hard envelopes', () => {
    const candidate = {
      id: 'measured-unit',
      priority: 3,
      rect: { x: 134.41666666666652, y: 231.83333333333348, width: 49, height: 25.083333333333332 },
      anchor: { x: 135, y: 231.25 },
    };
    const seed = new Map([[candidate.id, { x: 0, y: -6.017148981779275 }]]);
    const name = {
      x: 142.5999999999999,
      y: 237.4749988555909,
      width: 45,
      height: 17.55000228881836,
    };
    const fixed = [
      { x: 147.92372881355914, y: 170.8262711864404, width: 50, height: 47.2457627118644 },
      { x: 182.5, y: 254.89951768488754, width: 50, height: 42.765273311897104 },
      {
        x: 102.89289321881324,
        y: 235.54289321881333,
        width: 132.50710678118656,
        height: 22.707106781186546,
      },
    ];
    const result = plateModule.refineArmyPlateSeedReadability([candidate], seed, fixed, [name], {
      maxOffset: 80,
      canvas: { x: 0, y: 0, width: 1280, height: 720 },
      screenOcclusions: [{ x: 12, y: 96, width: 96, height: 606 }],
    });
    const delta = result.get(candidate.id)!;
    // Exact output captured from the unoptimized readability pass before edits.
    expect(delta).toEqual({ x: 0, y: 66.33145766345115 });
    const rect = {
      ...candidate.rect,
      x: candidate.rect.x + delta.x,
      y: candidate.rect.y + delta.y,
    };
    const raw = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    expect(
      raw({ ...candidate.rect, y: candidate.rect.y + seed.get(candidate.id)!.y }, name),
    ).toBeCloseTo(547.9441102157842);
    expect(raw(rect, name)).toBe(0);
    for (const obstacle of fixed)
      expect(raw(rect, obstacle)).toBeLessThanOrEqual(
        raw({ ...candidate.rect, y: candidate.rect.y + seed.get(candidate.id)!.y }, obstacle) +
          1e-8,
      );
    expect(Math.hypot(delta.x, delta.y)).toBeLessThanOrEqual(80);
  });
  it('locks selected seeds and leaves clear seeds exactly unchanged', () => {
    const c = {
      id: 'selected',
      priority: 0,
      rect: { x: 100, y: 100, width: 20, height: 10 },
      anchor: { x: 100, y: 95 },
    };
    const seed = new Map([[c.id, { x: 8, y: 8 }]]);
    expect(
      plateModule.refineArmyPlateSeedReadability([c], seed, [], [c.rect], { maxOffset: 80 }),
    ).toEqual(seed);
    expect(
      plateModule.refineArmyPlateSeedReadability([{ ...c, priority: 3 }], seed, [], [], {
        maxOffset: 80,
      }),
    ).toEqual(seed);
  });
  it('is deterministic, immutable, and preserves each pair and directed tether while improving content', () => {
    const cs = [
      {
        id: 'a',
        priority: 3,
        rect: { x: 100, y: 100, width: 20, height: 10 },
        anchor: { x: 110, y: 95 },
      },
      {
        id: 'b',
        priority: 0,
        rect: { x: 100, y: 135, width: 20, height: 10 },
        anchor: { x: 110, y: 125 },
      },
    ];
    const seed = new Map(cs.map((c) => [c.id, { x: 0, y: 0 }]));
    const fixed = [{ x: 125, y: 0, width: 20, height: 200 }];
    const contents = [{ x: 100, y: 100, width: 20, height: 10 }];
    const options = {
      maxOffset: 80,
      canvas: { x: 0, y: 0, width: 300, height: 300 },
      screenOcclusions: [{ x: 0, y: 0, width: 70, height: 300 }],
    };
    const snapshot = structuredClone({ cs, seed, fixed, contents, options });
    const result = plateModule.refineArmyPlateSeedReadability(cs, seed, fixed, contents, options);
    expect(result).toEqual(
      plateModule.refineArmyPlateSeedReadability(
        [...cs].reverse(),
        seed,
        [...fixed].reverse(),
        contents,
        options,
      ),
    );
    expect({ cs, seed, fixed, contents, options }).toEqual(snapshot);
    expect(result.get('b')).toEqual({ x: 0, y: 0 });
    const rects = cs.map((c) => ({
      ...c.rect,
      x: c.rect.x + result.get(c.id)!.x,
      y: c.rect.y + result.get(c.id)!.y,
    }));
    expect(rects[0]!.x).toBeGreaterThanOrEqual(70);
    expect(rects[0]!.x + rects[0]!.width).toBeLessThanOrEqual(125);
    expect(
      rects[0]!.y + rects[0]!.height <= rects[1]!.y ||
        rects[1]!.y + rects[1]!.height <= rects[0]!.y,
    ).toBe(true);
    cs.forEach((c, i) => {
      const r = rects[i]!;
      const end = {
        x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
        y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
      };
      expect(leaderCrosses(c.anchor, end, rects[1 - i]!)).toBe(false);
    });
  });
  it('validates options and retains the exact seed on capacity overflow', () => {
    expect(() =>
      plateModule.refineArmyPlateSeedReadability([], new Map(), [], [], { maxOffset: NaN }),
    ).toThrow();
    const c = { id: 'a', priority: 3, rect: { x: 0, y: 0, width: 20, height: 10 } };
    const seed = new Map([[c.id, { x: 0, y: 0 }]]);
    expect(() =>
      plateModule.refineArmyPlateSeedReadability(
        [c],
        seed,
        [],
        [{ x: NaN, y: 0, width: 1, height: 1 }],
        { maxOffset: 80 },
      ),
    ).toThrow();
    expect(
      plateModule.refineArmyPlateSeedReadability(
        [c],
        seed,
        Array.from({ length: 257 }, () => c.rect),
        [c.rect],
        { maxOffset: 80 },
      ),
    ).toEqual(seed);
  });
});

// Independent segment partition oracle: each open interval lies wholly inside
// or outside an axis-aligned plate. Touching its boundary is not an interior crossing.
function leaderCrosses(
  start: { x: number; y: number },
  end: { x: number; y: number },
  r: PlateRect,
): boolean {
  if (start.x === end.x && start.y === end.y) return false;
  const cuts = [0, 1];
  for (const x of [r.x, r.x + r.width])
    if (end.x !== start.x) {
      const t = (x - start.x) / (end.x - start.x);
      if (t > 0 && t < 1) cuts.push(t);
    }
  for (const y of [r.y, r.y + r.height])
    if (end.y !== start.y) {
      const t = (y - start.y) / (end.y - start.y);
      if (t > 0 && t < 1) cuts.push(t);
    }
  cuts.sort((a, b) => a - b);
  return cuts.some((t, i) => {
    if (i === 0) return false;
    const mid = (cuts[i - 1]! + t) / 2,
      x = start.x + (end.x - start.x) * mid,
      y = start.y + (end.y - start.y) * mid;
    return x > r.x && x < r.x + r.width && y > r.y && y < r.y + r.height;
  });
}
import {
  layoutArmyPlates,
  type ArmyPlateCandidate,
  type PlateRect,
} from '../../src/ui/map/armyPlateLayout';

const plate = (id: string, x = 630, y = 365, priority = 3): ArmyPlateCandidate => ({
  id,
  priority,
  rect: { x, y, width: 32, height: 14 },
});

describe('competitive refinement work', () => {
  it('retains every captured six-view offset from the frozen unpruned solver', () => {
    const results = nativeFixtures.map((f) => [
      ...layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, {
        maxOffset: 80,
        canvas: f.canvas,
        screenOcclusions: f.hud,
      }),
    ]);
    // New UI-only baseline recorded before this optimization; not a core/replay oracle.
    expect(createHash('sha256').update(JSON.stringify(results)).digest('hex')).toBe(
      'bfbd50d43af145cbbb4b8048cfb49ec1b6ea014cf8397dc5ed8e24da6cc0c06e',
    );
  });
  it('avoids repeated endpoint clamps and scoring noncompetitive captured proposals', () => {
    const f = nativeFixtures[0]!;
    const original = Math.min;
    let calls = 0;
    Math.min = (...values) => {
      calls++;
      return original(...values);
    };
    try {
      layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, {
        maxOffset: 80,
        canvas: f.canvas,
        screenOcclusions: f.hud,
      });
    } finally {
      Math.min = original;
    }
    // Original algorithm: 2,020,009 calls; require over 50% less work, not wall-clock speed.
    expect(calls).toBeLessThan(1_000_000);
  });
  it('does not construct leader bounds for every noncompetitive feasible proposal', () => {
    const f = nativeFixtures[0]!;
    const original = Math.min;
    let calls = 0;
    Math.min = (...values) => {
      calls++;
      return original(...values);
    };
    try {
      layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, {
        maxOffset: 80,
        canvas: f.canvas,
        screenOcclusions: f.hud,
      });
    } finally {
      Math.min = original;
    }
    // Eager endpoint/AABB cache: 596,962 calls. No wall-clock/native FPS assertion.
    expect(calls).toBeLessThan(580_000);
  });
  it('preserves anchored primary costs, selected plates and permuted generic scenes', () => {
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    for (let scene = 0; scene < 8; scene++) {
      const cs = Array.from({ length: 5 }, (_, i) => ({
        id: String(i),
        priority: i === 0 ? 0 : 3,
        rect: { x: (i % 3) * 14 + scene, y: Math.floor(i / 3) * 18, width: 32, height: 14 },
        anchor: { x: (i % 3) * 14 + scene + 10, y: Math.floor(i / 3) * 18 - 20 },
      }));
      const fixed = [{ x: 18, y: -5, width: 25, height: 18 }];
      const options = {
        maxOffset: 80,
        canvas: { x: -100, y: -100, width: 300, height: 250 },
        screenOcclusions: [{ x: 100, y: 20, width: 20, height: 100 }],
      };
      const before = structuredClone({ cs, fixed, options });
      const old = layoutArmyPlates(cs, fixed),
        result = layoutArmyPlates(cs, fixed, [], [], options);
      const cost = (offsets: Map<string, { x: number; y: number }>) => {
        const rs = cs.map((c) => moved(c.rect, offsets.get(c.id)!));
        let pair = 0,
          cross = 0;
        for (let i = 0; i < cs.length; i++) {
          const r = rs[i]!,
            c = cs[i]!,
            d = offsets.get(c.id)!;
          const end = {
            x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
            y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
          };
          for (let j = 0; j < cs.length; j++) {
            if (j > i) pair += area(r, rs[j]!);
            if (j !== i && (d.x !== 0 || d.y !== 0))
              cross += Number(leaderCrosses(c.anchor, end, rs[j]!));
          }
        }
        return { pair, cross };
      };
      const previous = cost(old),
        next = cost(result);
      expect(next.pair).toBeLessThanOrEqual(previous.pair + 1e-8);
      if (Math.abs(next.pair - previous.pair) <= 1e-8)
        expect(next.cross).toBeLessThanOrEqual(previous.cross);
      expect(result.get('0')).toEqual(old.get('0'));
      for (const c of cs) {
        expect(Math.hypot(result.get(c.id)!.x, result.get(c.id)!.y)).toBeLessThanOrEqual(80 + 1e-8);
        expect(area(moved(c.rect, result.get(c.id)!), fixed[0]!)).toBeLessThanOrEqual(
          area(moved(c.rect, old.get(c.id)!), fixed[0]!) + 1e-8,
        );
      }
      const permuted = layoutArmyPlates([...cs].reverse(), [...fixed].reverse(), [], [], options);
      expect([...permuted]).toEqual([...result]);
      expect({ cs, fixed, options }).toEqual(before);
    }
  });
});
const moved = (r: PlateRect, d: { x: number; y: number }): PlateRect => ({
  ...r,
  x: r.x + d.x,
  y: r.y + d.y,
});
// Independent separating-axis oracle, including the four-pixel reserved gap.
const separated = (a: PlateRect, b: PlateRect) =>
  a.x + a.width + 4 <= b.x ||
  b.x + b.width + 4 <= a.x ||
  a.y + a.height + 4 <= b.y ||
  b.y + b.height + 4 <= a.y;

describe('screen-space troop plate placement', () => {
  it('does not fast-path pair-free plates whose visible association line crosses another plate', () => {
    const cs: ArmyPlateCandidate[] = [
      {
        id: 'a',
        priority: 1,
        rect: { x: 0, y: 0, width: 10, height: 10 },
        anchor: { x: 5, y: -30 },
      },
      {
        id: 'b',
        priority: 3,
        rect: { x: 0, y: -15, width: 10, height: 10 },
        anchor: { x: 5, y: -20 },
      },
    ];
    const fixed = [{ x: 0, y: 0, width: 10, height: 10 }];
    const legacy = layoutArmyPlates(cs, fixed);
    const a = moved(cs[0]!.rect, legacy.get('a')!);
    expect(
      leaderCrosses(cs[0]!.anchor!, { x: 5, y: a.y }, moved(cs[1]!.rect, legacy.get('b')!)),
    ).toBe(true);
    const result = layoutArmyPlates(cs, fixed, [], [], { maxOffset: 80 });
    const rects = cs.map((c) => moved(c.rect, result.get(c.id)!));
    for (let i = 0; i < cs.length; i++) {
      const c = cs[i]!,
        r = rects[i]!,
        d = result.get(c.id)!;
      if (d.x === 0 && d.y === 0) continue;
      const end = {
        x: Math.max(r.x, Math.min(c.anchor!.x, r.x + r.width)),
        y: Math.max(r.y, Math.min(c.anchor!.y, r.y + r.height)),
      };
      expect(leaderCrosses(c.anchor!, end, rects[1 - i]!)).toBe(false);
    }
    expect([...layoutArmyPlates(cs, fixed)]).toEqual([
      ...layoutArmyPlates(
        cs.map((c) => ({ id: c.id, rect: c.rect, priority: c.priority })),
        fixed,
      ),
    ]);
    expect(() => layoutArmyPlates([{ ...cs[0]!, anchor: { x: Infinity, y: 0 } }], fixed)).toThrow(
      'Invalid plate anchor',
    );
  });
  it('preserves actual anchor association without leaders crossing another mandatory plate', () => {
    for (const f of nativeFixtures) {
      const result = layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, {
        maxOffset: 80,
        canvas: f.canvas,
        screenOcclusions: f.hud,
      });
      const rects = f.candidates.map((c) => moved(c.rect, result.get(c.id)!));
      for (let i = 0; i < f.candidates.length; i++) {
        const c = f.candidates[i]!,
          d = result.get(c.id)!,
          r = rects[i]!;
        if (d.x === 0 && d.y === 0) continue;
        const end = {
          x: Math.max(r.x, Math.min(c.anchor.x, r.x + r.width)),
          y: Math.max(r.y, Math.min(c.anchor.y, r.y + r.height)),
        };
        for (let j = 0; j < rects.length; j++)
          if (i !== j)
            expect(
              leaderCrosses(c.anchor, end, rects[j]!),
              `${f.castle}/${f.scale}:${c.id}->${f.candidates[j]!.id}`,
            ).toBe(false);
      }
    }
  });
  it('keeps bounded seeded scenes pair-nonincreasing and individually fixed-safe', () => {
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    let seed = 947;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let scene = 0; scene < 24; scene++) {
      const cs = Array.from({ length: 5 }, (_, i) =>
        plate(String(i), Math.floor(random() * 120), Math.floor(random() * 80), i === 0 ? 0 : 3),
      );
      const fixed = Array.from({ length: 5 }, () => ({
        x: Math.floor(random() * 140),
        y: Math.floor(random() * 100),
        width: 10 + Math.floor(random() * 20),
        height: 10 + Math.floor(random() * 20),
      }));
      const legacy = layoutArmyPlates(cs, fixed.slice(0, 1), fixed.slice(1, 2), fixed.slice(2));
      const result = layoutArmyPlates(cs, fixed.slice(0, 1), fixed.slice(1, 2), fixed.slice(2), {
        maxOffset: 80,
        canvas: { x: -100, y: -100, width: 500, height: 400 },
        screenOcclusions: [{ x: 300, y: 0, width: 50, height: 200 }],
      });
      let oldPairs = 0,
        newPairs = 0;
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i]!,
          before = moved(c.rect, legacy.get(c.id)!),
          after = moved(c.rect, result.get(c.id)!);
        expect(Math.hypot(result.get(c.id)!.x, result.get(c.id)!.y)).toBeLessThanOrEqual(80 + 1e-8);
        for (const obstacle of fixed)
          expect(area(after, obstacle)).toBeLessThanOrEqual(area(before, obstacle) + 1e-8);
        for (let j = i + 1; j < cs.length; j++) {
          oldPairs += area(before, moved(cs[j]!.rect, legacy.get(cs[j]!.id)!));
          newPairs += area(after, moved(cs[j]!.rect, result.get(cs[j]!.id)!));
        }
      }
      expect(newPairs).toBeLessThanOrEqual(oldPairs + 1e-8);
      expect(result.get('0')).toEqual(legacy.get('0'));
    }
  });
  it('validates opt-in options even for empty scenes and retains capped legacy output', () => {
    for (const maxOffset of [NaN, Infinity, 47, 97])
      expect(() => layoutArmyPlates([], [], [], [], { maxOffset })).toThrow();
    expect(() =>
      layoutArmyPlates([], [], [], [], {
        maxOffset: 80,
        canvas: { x: 0, y: 0, width: -1, height: 1 },
      }),
    ).toThrow();
    expect(() =>
      layoutArmyPlates([], [], [], [], {
        maxOffset: 80,
        screenOcclusions: [{ x: NaN, y: 0, width: 1, height: 1 }],
      }),
    ).toThrow();
    const cs = Array.from({ length: 33 }, (_, i) => plate(String(i), i * 100, 0));
    expect([...layoutArmyPlates(cs, [], [], [], { maxOffset: 80 })]).toEqual([
      ...layoutArmyPlates(cs, []),
    ]);
    const hud = Array.from({ length: 17 }, (_, i) => ({ x: i, y: 0, width: 10, height: 10 }));
    const one = [plate('one', 0, 0)];
    expect([
      ...layoutArmyPlates(one, [], [], [], { maxOffset: 80, screenOcclusions: hud }),
    ]).toEqual([...layoutArmyPlates(one, [])]);
    const fixed = Array.from({ length: 257 }, () => ({ x: 0, y: 0, width: 10, height: 10 }));
    expect([...layoutArmyPlates(one, fixed, [], [], { maxOffset: 80 })]).toEqual([
      ...layoutArmyPlates(one, fixed),
    ]);
  });
  it('fast-paths a clear scene without constructing circle proposals', () => {
    const cs = [plate('a', 100, 100), plate('b', 200, 100)];
    const sqrt = vi.spyOn(Math, 'sqrt');
    try {
      expect([
        ...layoutArmyPlates(cs, [], [], [], {
          maxOffset: 80,
          canvas: { x: 0, y: 0, width: 1000, height: 800 },
        }),
      ]).toEqual([...layoutArmyPlates(cs, [])]);
      expect(sqrt).not.toHaveBeenCalled();
    } finally {
      sqrt.mockRestore();
    }
  });
  it('locks selected plates and safely retains legacy when HUD admission is impossible', () => {
    const cs = [plate('selected', 0, 0, 0), plate('normal', 10, 0)];
    const options = { maxOffset: 80, canvas: { x: -100, y: -100, width: 400, height: 400 } };
    const legacy = layoutArmyPlates(cs, []);
    expect(layoutArmyPlates(cs, [], [], [], options).get('selected')).toEqual(
      legacy.get('selected'),
    );
    const allHud = { x: -1000, y: -1000, width: 2000, height: 2000 };
    expect([
      ...layoutArmyPlates(cs, [], [], [], { ...options, screenOcclusions: [allHud] }),
    ]).toEqual([...legacy]);
    // A nearly covering HUD leaves no allowed escape preserving current fixed overlap.
    const f = nativeFixtures.find((f) => f.castle === 'castle.narumi' && f.scale === 1)!;
    expect([
      ...layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, {
        maxOffset: 80,
        canvas: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ]).toEqual([...layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground)]);
  });
  it('treats overlapping HUD rectangles as a union, not double-counted lost visibility', () => {
    const cs = [plate('a', 0, 0), plate('b', 10, 0)];
    const hud = [
      { x: 0, y: 0, width: 8, height: 14 },
      { x: 4, y: 0, width: 8, height: 14 },
    ];
    const options = {
      maxOffset: 80,
      canvas: { x: -100, y: -100, width: 400, height: 400 },
      screenOcclusions: hud,
    };
    const a = layoutArmyPlates(cs, [], [], [], options);
    const b = layoutArmyPlates(cs, [], [], [], {
      ...options,
      screenOcclusions: [{ x: 0, y: 0, width: 12, height: 14 }],
    });
    // Both representations admit fully visible, pair-free placements.
    for (const result of [a, b]) {
      const rects = cs.map((c) => moved(c.rect, result.get(c.id)!));
      expect(
        rects.every((r) =>
          hud.every(
            (h) =>
              r.x + r.width <= h.x ||
              h.x + h.width <= r.x ||
              r.y + r.height <= h.y ||
              h.y + h.height <= r.y,
          ),
        ),
      ).toBe(true);
      expect(
        separated(rects[0]!, rects[1]!) ||
          rects[0]!.x + rects[0]!.width <= rects[1]!.x ||
          rects[0]!.y + rects[0]!.height <= rects[1]!.y ||
          rects[1]!.x + rects[1]!.width <= rects[0]!.x ||
          rects[1]!.y + rects[1]!.height <= rects[0]!.y,
      ).toBe(true);
    }
  });
  it('clears all captured pixel-locked pairs without obscuring HUD or increasing fixed overlaps', () => {
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    for (const f of nativeFixtures) {
      const before = JSON.stringify(f);
      const legacy = layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground);
      // Native projection and CPU reconstruction differ below 1e-12; legacy
      // controls below remain exact, independent of serialized GPU diagnostics.
      for (const p of f.legacy) {
        expect(legacy.get(p.id)!.x).toBeCloseTo(p.offset.x, 10);
        expect(legacy.get(p.id)!.y).toBeCloseTo(p.offset.y, 10);
      }
      const options = { maxOffset: 80, canvas: f.canvas, screenOcclusions: f.hud };
      const result = layoutArmyPlates(f.candidates, f.ribbons, f.bodies, f.foreground, options);
      const rects = f.candidates.map((c) => moved(c.rect, result.get(c.id)!));
      for (const [i, c] of f.candidates.entries()) {
        const r = rects[i]!;
        const d = result.get(c.id)!;
        expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(80 + 1e-8);
        expect(r.x).toBeGreaterThanOrEqual(f.canvas.x - 1e-8);
        expect(r.y).toBeGreaterThanOrEqual(f.canvas.y - 1e-8);
        expect(r.x + r.width).toBeLessThanOrEqual(f.canvas.x + f.canvas.width + 1e-8);
        expect(r.y + r.height).toBeLessThanOrEqual(f.canvas.y + f.canvas.height + 1e-8);
        for (const hud of f.hud) expect(area(r, hud)).toBeLessThanOrEqual(1e-8);
        const prior = moved(c.rect, legacy.get(c.id)!);
        for (const fixed of [...f.ribbons, ...f.bodies, ...f.foreground])
          expect(area(r, fixed)).toBeLessThanOrEqual(area(prior, fixed) + 1e-8);
        for (let j = i + 1; j < rects.length; j++) expect(area(r, rects[j]!)).toBe(0);
      }
      expect([...result]).toEqual([
        ...layoutArmyPlates(
          [...f.candidates].reverse(),
          [...f.ribbons].reverse(),
          [...f.bodies].reverse(),
          [...f.foreground].reverse(),
          { ...options, screenOcclusions: [...f.hud].reverse() },
        ),
      ]);
      expect(JSON.stringify(f)).toBe(before);
    }
  });
  it('never trades increased unpadded castle-body overlap for a giant ribbon escape', () => {
    const c = plate('army.body-primary', 0, 0);
    const body = { x: -30, y: 10, width: 60, height: 80 };
    const ribbon = { x: -50, y: -60, width: 120, height: 70 };
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    expect(area(c.rect, body)).toBe(120);
    const d = layoutArmyPlates([c], [ribbon], [body]).get(c.id)!;
    expect(area(moved(c.rect, d), body)).toBeLessThanOrEqual(area(c.rect, body));
    expect(area(moved(c.rect, d), body)).toBe(0);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
  });
  it('reserves visible castle body frames as well as their separate ribbons', () => {
    const c = plate('army.castle', 0, 0);
    const body = { x: -10, y: -10, width: 56, height: 42 };
    const ribbon = { x: -30, y: -40, width: 90, height: 16 };
    const d = layoutArmyPlates([c], [ribbon], [body]).get(c.id)!;
    expect(separated(moved(c.rect, d), body)).toBe(true);
    expect(separated(moved(c.rect, d), ribbon)).toBe(true);
    expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
  });
  it('uses a local diagonal around a castle foundation when ribbons block axis escapes', () => {
    const c = plate('army.corner', 0, 0);
    const body = { x: -10, y: -10, width: 25, height: 15 };
    const ribbons = [
      { x: 15, y: -25, width: 60, height: 25 },
      { x: -30, y: 5, width: 45, height: 70 },
    ];
    const d = layoutArmyPlates([c], ribbons, [body]).get(c.id)!;
    expect(d).toEqual({ x: 19, y: 9 });
    for (const r of [body, ...ribbons]) expect(separated(moved(c.rect, d), r)).toBe(true);
    expect(Math.hypot(d.x, d.y)).toBeLessThan(43);
  });
  it('keeps castle-body inputs immutable and their ordering deterministic; default remains legacy', () => {
    const cs = [plate('a'), plate('b', 665, 365)];
    const bodies = [
      { x: 615, y: 345, width: 55, height: 40 },
      { x: 670, y: 360, width: 25, height: 15 },
    ];
    const ribbons = [{ x: 610, y: 325, width: 90, height: 14 }];
    const before = structuredClone({ cs, bodies, ribbons });
    expect([...layoutArmyPlates(cs, ribbons, bodies)]).toEqual([
      ...layoutArmyPlates([...cs].reverse(), [...ribbons].reverse(), [...bodies].reverse()),
    ]);
    expect({ cs, bodies, ribbons }).toEqual(before);
    expect([...layoutArmyPlates(cs, ribbons, [])]).toEqual([...layoutArmyPlates(cs, ribbons)]);
    for (const d of layoutArmyPlates(cs, ribbons, bodies).values())
      expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
    expect(() => layoutArmyPlates(cs, ribbons, [{ x: NaN, y: 0, width: 1, height: 1 }])).toThrow();
  });
  it('clears a broad Sunpu castle label by its bottom edge, not the troop plate width', () => {
    const c = plate('army.sunpu');
    const castle = { x: 590, y: 350, width: 120, height: 30 };
    const d = layoutArmyPlates([c], [castle]).get(c.id)!;
    expect(d).toEqual({ x: 0, y: 19 });
    expect(separated(moved(c.rect, d), castle)).toBe(true);
  });
  it('reserves earlier priority plates and is stable under both input permutations', () => {
    const candidates = [plate('z', 630, 365, 0), plate('b'), plate('a')];
    const obstacles = [
      { x: 580, y: 340, width: 20, height: 10 },
      { x: 710, y: 360, width: 10, height: 10 },
    ];
    const a = layoutArmyPlates(candidates, obstacles);
    expect([...a]).toEqual([
      ...layoutArmyPlates([...candidates].reverse(), [...obstacles].reverse()),
    ]);
    expect(a.get('z')).toEqual({ x: 0, y: 0 });
    const rects = candidates.map((c) => moved(c.rect, a.get(c.id)!));
    for (let i = 0; i < rects.length; i++)
      for (let j = i + 1; j < rects.length; j++) expect(separated(rects[i]!, rects[j]!)).toBe(true);
  });
  it('leaves clear and exactly padded touching labels unchanged', () => {
    const c = plate('a');
    expect(layoutArmyPlates([c], [{ x: 666, y: 365, width: 10, height: 14 }]).get('a')).toEqual({
      x: 0,
      y: 0,
    });
    expect(layoutArmyPlates([c], []).get('a')).toEqual({ x: 0, y: 0 });
  });
  it('never hides dense labels or exceeds the Euclidean displacement limit', () => {
    const cs = Array.from({ length: 12 }, (_, i) => plate(String(i)));
    const layout = layoutArmyPlates(cs, [{ x: 0, y: 0, width: 1000, height: 1000 }]);
    expect(layout.size).toBe(12);
    for (const d of layout.values()) expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
    expect([...layout]).toEqual([
      ...layoutArmyPlates([...cs].reverse(), [{ x: 0, y: 0, width: 1000, height: 1000 }]),
    ]);
  });
  it('chooses minimum overlap, then minimum distance when no escape fits the bound', () => {
    const c = plate('a', 0, 0);
    const obstacle = { x: -100, y: -100, width: 200, height: 160 };
    const d = layoutArmyPlates([c], [obstacle]).get('a')!;
    const area = (r: PlateRect) =>
      Math.max(
        0,
        Math.min(r.x + r.width + 2, obstacle.x + obstacle.width + 2) -
          Math.max(r.x - 2, obstacle.x - 2),
      ) *
      Math.max(
        0,
        Math.min(r.y + r.height + 2, obstacle.y + obstacle.height + 2) -
          Math.max(r.y - 2, obstacle.y - 2),
      );
    expect(d).toEqual({ x: 0, y: 48 });
    expect(area(moved(c.rect, d))).toBeLessThan(area(c.rect));
    expect(area(moved(c.rect, d))).toBeLessThan(area(moved(c.rect, { x: 0, y: -48 })));
    expect(
      layoutArmyPlates([c], [{ x: -1000, y: -1000, width: 2000, height: 2000 }]).get('a'),
    ).toEqual({ x: 0, y: 0 });
  });
  it('uses a second below escape when the first meets another obstacle', () => {
    const c = plate('a', 0, 0);
    const obstacles = [
      { x: -100, y: -10, width: 200, height: 15 },
      { x: -100, y: 20, width: 200, height: 10 },
      { x: -100, y: -60, width: 200, height: 45 },
    ];
    expect(layoutArmyPlates([c], obstacles).get('a')).toEqual({ x: 0, y: 34 });
  });
  it('does not mutate inputs and handles empty input', () => {
    const cs = [plate('a')],
      os = [{ x: 620, y: 360, width: 20, height: 20 }];
    const snapshot = structuredClone({ cs, os });
    layoutArmyPlates(cs, os);
    expect({ cs, os }).toEqual(snapshot);
    expect(layoutArmyPlates([], [])).toEqual(new Map());
  });
  it('rejects nonfinite, negative-sized and duplicate candidates', () => {
    expect(() =>
      layoutArmyPlates([], [{ x: Number.MAX_VALUE, y: 0, width: Number.MAX_VALUE, height: 1 }]),
    ).toThrow();
    expect(() => layoutArmyPlates([plate('a'), plate('a')], [])).toThrow();
    expect(() => layoutArmyPlates([{ ...plate('a'), priority: NaN }], [])).toThrow();
    for (const r of [
      { x: NaN, y: 0, width: 1, height: 1 },
      { x: 0, y: 0, width: -1, height: 1 },
      { x: 0, y: Infinity, width: 1, height: 1 },
    ])
      expect(() => layoutArmyPlates([], [r])).toThrow();
  });
});
