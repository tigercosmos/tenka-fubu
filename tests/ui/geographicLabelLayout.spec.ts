import { describe, expect, it } from 'vitest';
import {
  layoutGeographicLabels,
  type GeographicLabelCandidate,
} from '../../src/ui/map/geographicLabelLayout';
import type { PlateRect } from '../../src/ui/map/armyPlateLayout';

const label = (
  id: string,
  kind: GeographicLabelCandidate['kind'] = 'district',
): GeographicLabelCandidate => ({ id, kind, rect: { x: 600, y: 390, width: 60, height: 16 } });
const move = (r: PlateRect, d: { x: number; y: number }) => ({ ...r, x: r.x + d.x, y: r.y + d.y });
const separated = (a: PlateRect, b: PlateRect) =>
  a.x + a.width + 4 <= b.x ||
  b.x + b.width + 4 <= a.x ||
  a.y + a.height + 4 <= b.y ||
  b.y + b.height + 4 <= a.y;

describe('geographic text CSS placement', () => {
  it('retains an unresolved road baseline rather than paying for road clearance with a new army overlap', () => {
    const candidate: GeographicLabelCandidate = {
      id: 'road:between-armies',
      kind: 'road',
      rect: { x: 0, y: 0, width: 10, height: 10 },
      roadCapsules: [{ a: { x: -100, y: 5 }, b: { x: 100, y: 5 }, radius: 2 }],
    };
    const armies = [
      { x: -100, y: -100, width: 200, height: 100 },
      { x: -100, y: 10, width: 200, height: 100 },
    ];
    expect(
      armies.reduce(
        (sum, r) => sum + Math.max(0, Math.min(10, r.y + r.height) - Math.max(0, r.y)) * 10,
        0,
      ),
    ).toBe(0);
    expect(layoutGeographicLabels([candidate], armies).get(candidate.id)).toEqual({ x: 0, y: 0 });
  });
  it('clears a returning displayed road leg that the midpoint tangent alone cannot protect', () => {
    const candidate: GeographicLabelCandidate = {
      id: 'road:return',
      kind: 'road',
      rect: { x: -37, y: -32, width: 74, height: 16 },
      roadLine: { normal: { x: 0, y: -1 }, slack: 10 },
      roadCapsules: [
        { a: { x: -100, y: 0 }, b: { x: 100, y: 0 }, radius: 6 },
        { a: { x: 100, y: 0 }, b: { x: 100, y: -24 }, radius: 6 },
        { a: { x: 100, y: -24 }, b: { x: -100, y: -24 }, radius: 6 },
      ],
    };
    const offset = layoutGeographicLabels([candidate], []).get(candidate.id)!;
    const moved = move(candidate.rect, offset);
    // Independent interval oracle: both horizontal legs span the complete box.
    for (const y of [0, -24]) {
      const gap = Math.max(moved.y - y, y - (moved.y + moved.height), 0);
      expect(gap).toBeGreaterThanOrEqual(6);
    }
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(48);
  });
  it('retains a mandatory baseline when road protection is invalid or every location is blocked', () => {
    const candidate: GeographicLabelCandidate = {
      id: 'road:unresolved',
      kind: 'road',
      rect: { x: 100, y: 100, width: 74, height: 16 },
      roadCapsules: null,
    };
    const result = layoutGeographicLabels([candidate], []);
    expect(result.size).toBe(1);
    expect(result.get(candidate.id)).toEqual({ x: 0, y: 0 });
    const enclosed = {
      ...candidate,
      roadCapsules: [{ a: { x: 0, y: 108 }, b: { x: 500, y: 108 }, radius: 100 }],
    };
    expect(layoutGeographicLabels([enclosed], []).get(candidate.id)).toEqual({ x: 0, y: 0 });
  });
  it('keeps road-only text offsets on the clear side of the own tangent without restricting districts', () => {
    const road: GeographicLabelCandidate = {
      id: 'road:diagonal',
      kind: 'road',
      rect: { x: 100, y: 100, width: 74, height: 16 },
      roadLine: { normal: { x: 0, y: -1 }, slack: 0 },
    };
    const obstacle = { x: 90, y: 90, width: 94, height: 20 };
    const result = layoutGeographicLabels([road], [obstacle]);
    expect(result.get(road.id)!.y).toBeLessThanOrEqual(0);
    expect(Math.hypot(result.get(road.id)!.x, result.get(road.id)!.y)).toBeLessThanOrEqual(48);
    const legacy = { id: 'district', kind: 'district' as const, rect: road.rect };
    expect(layoutGeographicLabels([legacy], [obstacle]).get(legacy.id)!.y).toBeGreaterThan(0);
  });
  it('protects the actual pixel-locked Narumi 1.5 label from the minimap', () => {
    // Actual geography-semantics-narumi1.5 attachment from the retained native report.
    // All visible geographic labels and ordinary/castle-channel obstacles are unchanged.
    const candidates: GeographicLabelCandidate[] = [
      {
        id: 'dist.sunpu-higashi',
        kind: 'district',
        rect: {
          x: 993.2973684210519,
          y: 483.7565789473683,
          width: 49.5,
          height: 15.540001831054687,
        },
      },
      {
        id: 'road:road.narumi-sunpu',
        kind: 'road',
        rect: {
          x: 746.5870071999516,
          y: 544.377901190961,
          width: 37,
          height: 15.040001831054687,
        },
      },
    ];
    const obstacles: PlateRect[] = [
      {
        x: 972.8655502392339,
        y: 453.1326120052199,
        width: 55.122808439487905,
        height: 64.12396694214874,
      },
      {
        x: 1014.5473684210519,
        y: 517.4543281435099,
        width: 49,
        height: 25.083333333333332,
      },
      {
        x: 843.8655502392339,
        y: 537.1326120052199,
        width: 48.36363636363636,
        height: 48.36363636363636,
      },
      {
        x: 850.9640350877185,
        y: 630.7565789473683,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 466.8262367984503,
        y: 421.0065789473683,
        width: 59.14337478942523,
        height: 56.73075441506765,
      },
      {
        x: 486.46403508771846,
        y: 500.33991228070136,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 498.8655502392339,
        y: 379.6326120052199,
        width: 48.36363636363636,
        height: 48.36363636363636,
      },
      {
        x: 505.96403508771846,
        y: 471.2565789473683,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 542.3655502392339,
        y: 435.1326120052199,
        width: 48.36363636363636,
        height: 48.36363636363636,
      },
      {
        x: 549.4640350877185,
        y: 487.2565789473683,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 927.8655502392339,
        y: 483.1326120052199,
        width: 48.36363636363636,
        height: 48.36363636363636,
      },
      {
        x: 934.9640350877185,
        y: 559.7565789473683,
        width: 49,
        height: 25.083333333333332,
      },
      {
        x: 984.7640262132218,
        y: 423.0065789473683,
        width: 58.96516038964847,
        height: 60.4896694214876,
      },
      {
        x: 1042.9468174568647,
        y: 482.33991228070136,
        width: 49,
        height: 25.083333333333332,
      },
      {
        x: 888.8655502392339,
        y: 567.1326120052199,
        width: 48.36363636363636,
        height: 48.36363636363636,
      },
      {
        x: 895.9640350877185,
        y: 630.7565789473683,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 366.8655502392339,
        y: 297.1655886896988,
        width: 48.36363636363636,
        height: 49.830659679157336,
      },
      {
        x: 373.96403508771846,
        y: 375.2565789473683,
        width: 49,
        height: 25.083333333333332,
      },
      {
        x: 434.3655502392339,
        y: 282.1655886896988,
        width: 48.36363636363636,
        height: 62.07174467273739,
      },
      {
        x: 481.94681745686466,
        y: 330.83991228070136,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 1010.3655502392339,
        y: 423.1326120052199,
        width: 60.747394656505456,
        height: 48.36363636363636,
      },
      {
        x: 1057.9468174568647,
        y: 472.2951464404814,
        width: 32.66666666666667,
        height: 25.083333333333332,
      },
      {
        x: 371.14736842105185,
        y: 351.2565789473683,
        width: 96.8,
        height: 20,
      },
      {
        x: 390.055842997323,
        y: 272.7481043710968,
        width: 60,
        height: 56.69491525423729,
      },
      {
        x: 401.8473684210521,
        y: 332.4430196253343,
        width: 35.4,
        height: 3,
      },
      {
        x: 808.9723684210521,
        y: 610.7565789473683,
        width: 85.15,
        height: 16,
      },
      {
        x: 829.083894395078,
        y: 558.5536568694461,
        width: 45,
        height: 34.443993506493506,
      },
      {
        x: 838.3473684210517,
        y: 595.9976503759399,
        width: 26.400000000000002,
        height: 3,
      },
      {
        x: 846.2973684210519,
        y: 539.8036568694461,
        width: 10.5,
        height: 15.75,
      },
      {
        x: 407.8853686041575,
        y: 447.2565789473683,
        width: 107.32399963378906,
        height: 20,
      },
      {
        x: 431.54736842105194,
        y: 373.63600016923374,
        width: 60,
        height: 51.31832797427652,
      },
      {
        x: 443.8473684210521,
        y: 427.9543281435099,
        width: 35.4,
        height: 3,
      },
      {
        x: 482.583894395078,
        y: 426.55365686944606,
        width: 45,
        height: 34.443993506493506,
      },
      {
        x: 491.8473684210521,
        y: 463.9976503759399,
        width: 26.400000000000002,
        height: 3,
      },
      {
        x: 926.8853686041575,
        y: 535.7565789473683,
        width: 107.32399963378906,
        height: 20,
      },
      {
        x: 950.5473684210519,
        y: 462.13600016923374,
        width: 60,
        height: 51.31832797427652,
      },
      {
        x: 962.8473684210517,
        y: 516.4543281435099,
        width: 35.4,
        height: 3,
      },
      {
        x: 975.2973684210519,
        y: 448.63600016923374,
        width: 10.5,
        height: 10.5,
      },
    ];
    const castleChannels: PlateRect[] = [
      {
        x: 390.055842997323,
        y: 272.7481043710968,
        width: 60,
        height: 56.69491525423729,
      },
      {
        x: 401.8473684210521,
        y: 332.4430196253343,
        width: 35.4,
        height: 3,
      },
      {
        x: 829.083894395078,
        y: 558.5536568694461,
        width: 45,
        height: 34.443993506493506,
      },
      {
        x: 838.3473684210517,
        y: 595.9976503759399,
        width: 26.400000000000002,
        height: 3,
      },
      {
        x: 846.2973684210519,
        y: 539.8036568694461,
        width: 10.5,
        height: 15.75,
      },
      {
        x: 431.54736842105194,
        y: 373.63600016923374,
        width: 60,
        height: 51.31832797427652,
      },
      {
        x: 443.8473684210521,
        y: 427.9543281435099,
        width: 35.4,
        height: 3,
      },
      {
        x: 482.583894395078,
        y: 426.55365686944606,
        width: 45,
        height: 34.443993506493506,
      },
      {
        x: 491.8473684210521,
        y: 463.9976503759399,
        width: 26.400000000000002,
        height: 3,
      },
      {
        x: 950.5473684210519,
        y: 462.13600016923374,
        width: 60,
        height: 51.31832797427652,
      },
      {
        x: 962.8473684210517,
        y: 516.4543281435099,
        width: 35.4,
        height: 3,
      },
      {
        x: 975.2973684210519,
        y: 448.63600016923374,
        width: 10.5,
        height: 10.5,
      },
    ];
    const minimap = { x: 1070, y: 510, width: 192, height: 192 };
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const candidate = candidates[0]!;
    const legacy = layoutGeographicLabels(candidates, obstacles, castleChannels).get(candidate.id)!;
    expect(legacy).toEqual({ x: 40, y: 24 });
    expect(area(candidate.rect, minimap)).toBe(0);
    expect(area(move(candidate.rect, legacy), minimap)).toBeCloseTo(170.16124296175738, 8);
    const hard = [...castleChannels, minimap];
    const protectedLayout = layoutGeographicLabels(candidates, obstacles, hard);
    const offset = protectedLayout.get(candidate.id)!;
    expect(area(move(candidate.rect, offset), minimap)).toBe(0);
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(48);
    expect(protectedLayout.size).toBe(candidates.length);
    for (const c of candidates) {
      const moved = move(c.rect, protectedLayout.get(c.id)!);
      for (const channel of hard)
        expect(area(moved, channel)).toBeLessThanOrEqual(area(c.rect, channel));
    }
    expect([...protectedLayout]).toEqual([
      ...layoutGeographicLabels(
        [...candidates].reverse(),
        [...obstacles].reverse(),
        [...hard].reverse(),
      ),
    ]);
  });
  it('does not trade new individual castle-channel collision for less ordinary overlap', () => {
    // Deterministic counterpart of native baseline HP0 -> placed HP86.85.
    // Repeated ordinary blockers make a total-area score prefer the initially clear bar.
    const candidate: GeographicLabelCandidate = {
      id: 'district.channel',
      kind: 'district',
      rect: { x: 0, y: 0, width: 20, height: 10 },
    };
    const ordinary = Array.from({ length: 3 }, () => ({
      x: -100,
      y: -100,
      width: 220,
      height: 140,
    }));
    const bar = { x: -100, y: 44, width: 220, height: 10 };
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const obstacles = [...ordinary, bar];
    const legacy = layoutGeographicLabels([candidate], obstacles).get(candidate.id)!;
    expect(area(candidate.rect, bar)).toBe(0);
    expect(area(move(candidate.rect, legacy), bar)).toBeGreaterThan(0);
    const protectedLayout = layoutGeographicLabels([candidate], obstacles, [bar]);
    const offset = protectedLayout.get(candidate.id)!;
    expect(area(move(candidate.rect, offset), bar)).toBe(0);
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(48);
    expect(protectedLayout.size).toBe(1);
    expect([...protectedLayout]).toEqual([
      ...layoutGeographicLabels([candidate], [...obstacles].reverse(), [bar]),
    ]);
  });
  it('improves the actual native Sunpu 0.8 rectangles using an interior or diagonal escape', () => {
    // Captured actual BitmapText/body/plate/ribbon rectangles from the retained native trace.
    const c: GeographicLabelCandidate = {
      id: 'dist.sunpu-higashi',
      kind: 'district',
      rect: { x: 646.5, y: 349, width: 49.5, height: 15.540001831054687 },
    };
    const obstacles = [
      { x: 633.598484848485, y: 316.875, width: 40.303030303030305, height: 46.875 },
      { x: 639.375, y: 359.125, width: 52.5, height: 26.875 },
      { x: 596.098484848485, y: 341.875, width: 40.303030303030305, height: 46.25 },
      { x: 601.875, y: 414, width: 52.5, height: 26.875 },
      { x: 652.348484848485, y: 301.875, width: 40.303030303030305, height: 46.25 },
      { x: 695.875, y: 345.625, width: 52.5, height: 26.875 },
      { x: 563.598484848485, y: 411.875, width: 40.303030303030305, height: 46.25 },
      {
        x: 663.1215696451172,
        y: 292.9036862710941,
        width: 42.02994550639782,
        height: 45.221313728906054,
      },
      { x: 670.625, y: 314.75, width: 35, height: 26.875 },
      { x: 586.3380001831056, y: 390, width: 107.32399963378906, height: 20 },
    ];
    const area = (r: PlateRect) =>
      obstacles.reduce(
        (sum, o) =>
          sum +
          Math.max(0, Math.min(r.x + r.width, o.x + o.width) - Math.max(r.x, o.x)) *
            Math.max(0, Math.min(r.y + r.height, o.y + o.height) - Math.max(r.y, o.y)),
        0,
      );
    const before = area(c.rect);
    expect(before).toBeCloseTo(651.8205567978372, 8);
    const offset = layoutGeographicLabels([c], obstacles).get(c.id)!;
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(48);
    expect(area(move(c.rect, offset))).toBeLessThan(before);
    expect([...layoutGeographicLabels([c], obstacles)]).toEqual([
      ...layoutGeographicLabels([c], [...obstacles].reverse()),
    ]);
  });
  it('never increases primary unpadded obstacle overlap to clear another label or padding', () => {
    const cs: GeographicLabelCandidate[] = [
      { id: 'province', kind: 'province', rect: { x: -30, y: -20, width: 60, height: 25 } },
      { id: 'district', kind: 'district', rect: { x: 0, y: 0, width: 20, height: 10 } },
    ];
    const obstacles = [
      { x: -42, y: 20, width: 54, height: 43 },
      { x: 0, y: 60, width: 64, height: 21 },
      { x: -48, y: -38, width: 52, height: 17 },
      { x: 43, y: -20, width: 68, height: 66 },
    ];
    const area = (a: PlateRect, b: PlateRect) =>
      Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
      Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
    const layout = layoutGeographicLabels(cs, obstacles);
    for (const c of cs) {
      const baseline = obstacles.reduce((sum, o) => sum + area(c.rect, o), 0);
      const after = obstacles.reduce((sum, o) => sum + area(move(c.rect, layout.get(c.id)!), o), 0);
      expect(after).toBeLessThanOrEqual(baseline);
    }
    expect([...layout]).toEqual([
      ...layoutGeographicLabels([...cs].reverse(), [...obstacles].reverse()),
    ]);
  });
  it('moves a Sunpu district below a visible body/plate/castle cluster without changing its baseline', () => {
    const c = label('district.sunpu');
    const obstacles = [
      { x: 620, y: 365, width: 34, height: 42 },
      { x: 615, y: 407, width: 40, height: 16 },
      { x: 590, y: 350, width: 120, height: 24 },
    ];
    const original = structuredClone(c);
    const offset = layoutGeographicLabels([c], obstacles).get(c.id)!;
    expect(offset).not.toEqual({ x: 0, y: 0 });
    expect(Math.hypot(offset.x, offset.y)).toBeLessThanOrEqual(48);
    for (const obstacle of obstacles) expect(separated(move(c.rect, offset), obstacle)).toBe(true);
    expect(c).toEqual(original);
  });
  it('reserves province before district before road, then uses ASCII IDs', () => {
    const cs = [label('road', 'road'), label('z'), label('a'), label('province', 'province')];
    const layout = layoutGeographicLabels(cs, []);
    expect([...layout.keys()]).toEqual(['province', 'a', 'z', 'road']);
    expect(layout.get('province')).toEqual({ x: 0, y: 0 });
    expect([...layout]).toEqual([...layoutGeographicLabels([...cs].reverse(), [])]);
    const rs = cs.map((c) => move(c.rect, layout.get(c.id)!));
    for (let i = 0; i < rs.length; i++)
      for (let j = i + 1; j < rs.length; j++) expect(separated(rs[i]!, rs[j]!)).toBe(true);
  });
  it('keeps clear/touching labels unchanged and accepts empty visibility input', () => {
    const c = label('road', 'road');
    expect(
      layoutGeographicLabels([c], [{ x: 664, y: 390, width: 5, height: 16 }]).get(c.id),
    ).toEqual({ x: 0, y: 0 });
    expect(layoutGeographicLabels([], [])).toEqual(new Map());
  });
  it('retains every constrained label with finite bounded offsets, without mutating input order', () => {
    const cs = Array.from({ length: 20 }, (_, i) => label(`district.${i}`));
    const obstacles = [{ x: 0, y: 0, width: 1000, height: 1000 }];
    const before = structuredClone({ cs, obstacles });
    const layout = layoutGeographicLabels(cs, obstacles);
    expect(layout.size).toBe(cs.length);
    for (const d of layout.values()) expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(48);
    expect({ cs, obstacles }).toEqual(before);
    expect([...layout]).toEqual([...layoutGeographicLabels([...cs].reverse(), obstacles)]);
  });
  it('inherits fail-closed invalid bounds and duplicate identity validation', () => {
    expect(() => layoutGeographicLabels([label('a'), label('a')], [])).toThrow();
    expect(() =>
      layoutGeographicLabels([label('a')], [], [{ x: 0, y: Infinity, width: 1, height: 1 }]),
    ).toThrow();
    expect(() =>
      layoutGeographicLabels([{ ...label('a'), rect: { x: NaN, y: 0, width: 1, height: 1 } }], []),
    ).toThrow();
    expect(() => layoutGeographicLabels([], [{ x: 0, y: 0, width: -1, height: 1 }])).toThrow();
  });
});
