import { describe, expect, it } from 'vitest';
import {
  admitContainedCastleRibbons,
  layoutCastleRibbons,
  type CastleRibbonCandidate,
} from '../../src/ui/map/sceneParts/castleRibbonLayout';

const candidate: CastleRibbonCandidate = {
  id: 'castle.a',
  anchor: { x: 0, y: 0 },
  baseline: { x: -40, y: 10, width: 80, height: 20 },
};
const compact = { id: candidate.id, baseline: { x: -30, y: 10, width: 60, height: 20 } };

describe('authoritative original castle ribbon containment', () => {
  it('keeps the four retained V4 native names from increased actual UI occlusion', () => {
    // Exact V4 native originals and failed compact variants; no changed fixture oracle.
    const rows = [
      {
        pose: 'hida-near',
        id: 'castle.nochiseyama',
        full: {
          id: 'castle.nochiseyama',
          baseline: {
            x: -41.333830919011234,
            y: 618.5262930484155,
            width: 130.85710678118656,
            height: 18.707106781186546,
          },
          rect: {
            x: -41.333830919011234,
            y: 618.5262930484155,
            width: 130.85710678118656,
            height: 18.707106781186546,
          },
          offset: {
            x: 0,
            y: 0,
          },
          anchor: {
            x: 27.44827586217525,
            y: 596.9193502428252,
          },
          leader: {
            start: {
              x: 27.44827586217525,
              y: 596.9193502428252,
            },
            end: {
              x: 27.44827586217525,
              y: 618.5262930484155,
            },
            visible: false,
          },
          unresolved: false,
          budgetLimited: false,
        },
        compactBaseline: {
          x: -23.258830919011416,
          y: 618.5262930484155,
          width: 94.70710678118655,
          height: 18.707106781186546,
        },
        nameArea: {
          original: {
            x: -5.626724137824567,
            y: 619.6283988377809,
            width: 52,
            height: 15.210001983642579,
          },
          compact: {
            x: 12.448275862175251,
            y: 619.6283988377809,
            width: 52,
            height: 15.210001983642579,
          },
          viewport: {
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
          },
          occlusions: [
            {
              selector: ':scope > nav',
              testId: null,
              x: 8,
              y: 64,
              width: 64,
              height: 644,
              background: 'rgb(23, 37, 44)',
              backgroundImage: 'none',
              border: 'color(srgb 0.278431 0.296627 0.271373)',
              opacity: '1',
            },
          ],
        },
      },
      {
        pose: 'hida-near',
        id: 'castle.tamanawa',
        full: {
          id: 'castle.tamanawa',
          baseline: {
            x: 1053.7310990009018,
            y: 665.6337310649442,
            width: 127.50410644549319,
            height: 18.707106781186546,
          },
          rect: {
            x: 1053.7310990009018,
            y: 665.6337310649442,
            width: 127.50410644549319,
            height: 18.707106781186546,
          },
          offset: {
            x: 0,
            y: 0,
          },
          anchor: {
            x: 1120.8367056142415,
            y: 644.0267882593539,
          },
          leader: {
            start: {
              x: 1120.8367056142415,
              y: 644.0267882593539,
            },
            end: {
              x: 1120.8367056142415,
              y: 665.6337310649442,
            },
            visible: false,
          },
          unresolved: false,
          budgetLimited: false,
        },
        compactBaseline: {
          x: 1076.6295988330548,
          y: 665.6337310649442,
          width: 81.70710678118655,
          height: 18.707106781186546,
        },
        nameArea: {
          original: {
            x: 1089.438205782088,
            y: 666.7358368543096,
            width: 39,
            height: 15.210001983642579,
          },
          compact: {
            x: 1112.3367056142415,
            y: 666.7358368543096,
            width: 39,
            height: 15.210001983642579,
          },
          viewport: {
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
          },
          occlusions: [
            {
              selector: '[data-testid="minimap"]',
              testId: 'minimap',
              x: 1092,
              y: 532,
              width: 176,
              height: 176,
              background: 'rgb(24, 41, 54)',
              backgroundImage: 'none',
              border: 'rgb(117, 86, 35)',
              opacity: '1',
            },
          ],
        },
      },
      {
        pose: 'sunpu-mid',
        id: 'castle.gassan-toda',
        full: {
          id: 'castle.gassan-toda',
          baseline: {
            x: -114.85048396517675,
            y: 293.2126267873348,
            width: 173.03110641497562,
            height: 22.707106781186546,
          },
          rect: {
            x: -114.85048396517675,
            y: 293.2126267873348,
            width: 173.03110641497562,
            height: 22.707106781186546,
          },
          offset: {
            x: 0,
            y: 0,
          },
          anchor: {
            x: -24.98137736709566,
            y: 282.4490241309484,
          },
          leader: {
            start: {
              x: -24.98137736709566,
              y: 282.4490241309484,
            },
            end: {
              x: -24.98137736709566,
              y: 293.2126267873348,
            },
            visible: false,
          },
          unresolved: false,
          budgetLimited: false,
        },
        compactBaseline: {
          x: -89.68848414828221,
          y: 293.2126267873348,
          width: 122.70710678118655,
          height: 22.707106781186546,
        },
        nameArea: {
          original: {
            x: -75.1433771839902,
            y: 295.14473242411214,
            width: 75,
            height: 17.55000228881836,
          },
          compact: {
            x: -49.98137736709566,
            y: 295.14473242411214,
            width: 75,
            height: 17.55000228881836,
          },
          viewport: {
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
          },
          occlusions: [
            {
              selector: ':scope > nav',
              testId: null,
              x: 8,
              y: 64,
              width: 64,
              height: 644,
              background: 'rgb(23, 37, 44)',
              backgroundImage: 'none',
              border: 'color(srgb 0.278431 0.296627 0.271373)',
              opacity: '1',
            },
          ],
        },
      },
      {
        pose: 'sunpu-mid',
        id: 'castle.oko',
        full: {
          id: 'castle.oko',
          baseline: {
            x: -48.55068809953127,
            y: 524.522199923392,
            width: 143.03110641497562,
            height: 22.707106781186546,
          },
          rect: {
            x: -48.55068809953127,
            y: 524.522199923392,
            width: 143.03110641497562,
            height: 22.707106781186546,
          },
          offset: {
            x: 0,
            y: 0,
          },
          anchor: {
            x: 26.318418498549818,
            y: 513.7585972670056,
          },
          leader: {
            start: {
              x: 26.318418498549818,
              y: 513.7585972670056,
            },
            end: {
              x: 26.318418498549818,
              y: 524.522199923392,
            },
            visible: false,
          },
          unresolved: false,
          budgetLimited: false,
        },
        compactBaseline: {
          x: -23.388688282636735,
          y: 524.522199923392,
          width: 92.70710678118655,
          height: 22.707106781186546,
        },
        nameArea: {
          original: {
            x: -8.843581318344718,
            y: 526.4543055601694,
            width: 45,
            height: 17.55000228881836,
          },
          compact: {
            x: 16.318418498549818,
            y: 526.4543055601694,
            width: 45,
            height: 17.55000228881836,
          },
          viewport: {
            x: 0,
            y: 0,
            width: 1280,
            height: 720,
          },
          occlusions: [
            {
              selector: ':scope > nav',
              testId: null,
              x: 8,
              y: 64,
              width: 64,
              height: 644,
              background: 'rgb(23, 37, 44)',
              backgroundImage: 'none',
              border: 'color(srgb 0.278431 0.296627 0.271373)',
              opacity: '1',
            },
          ],
        },
      },
    ];
    const observed = rows.map((row) => {
      const item = { id: row.id, anchor: row.full.anchor, baseline: row.full.baseline };
      const before = { ...row.full, triedPlacements: 1, overlapArea: 0, baselineOverlapArea: 0 };
      const original = new Map([[row.id, before]]);
      const variant = { id: row.id, baseline: row.compactBaseline, nameArea: row.nameArea };
      const result = admitContainedCastleRibbons([item], original, [variant], [], [], 0);
      return {
        id: row.id,
        admitted: result.compactIds.size,
        unchanged: JSON.stringify([...result.placements]) === JSON.stringify([...original]),
      };
    });
    expect(observed).toEqual(rows.map((row) => ({ id: row.id, admitted: 0, unchanged: true })));
  });
  it('retains the actual original Minowa name clipped by the Suzuka near canvas', () => {
    // Retained V3 native Suzuka-near control/candidate, not a shortened ribbon proxy.
    const full = {
      x: 1232.8606230817368,
      y: -15.746291734129045,
      width: 127.50410644549319,
      height: 18.707106781186546,
    };
    const anchor = { x: 1299.9662296950764, y: -37.353234539719324 };
    const item = { id: 'castle.minowa', baseline: full, anchor };
    const original = layoutCastleRibbons([item], []);
    const variant = {
      id: item.id,
      baseline: { x: 1255.7591229138898, y: full.y, width: 81.70710678118655, height: full.height },
      nameArea: {
        original: {
          x: 1268.567729862923,
          y: -14.644185944763649,
          width: 39,
          height: 15.210001983642579,
        },
        compact: {
          x: 1291.4662296950764,
          y: -14.644185944763649,
          width: 39,
          height: 15.210001983642579,
        },
        viewport: { x: 0, y: 0, width: 1280, height: 720 },
        occlusions: [],
      },
    };
    const result = admitContainedCastleRibbons([item], original, [variant], [], [], 0);
    expect(result.compactIds.size).toBe(0);
    expect(result.placements).toEqual(original);
  });
  it('observes original work without changing any default result', () => {
    let work = -1;
    const plain = layoutCastleRibbons([candidate], []);
    const observed = layoutCastleRibbons([candidate], [], [], {
      onWork: (value) => {
        work = value;
      },
    });
    expect(observed).toEqual(plain);
    expect(work).toBeGreaterThanOrEqual(0);
    expect(work).toBeLessThanOrEqual(1_000_000);
  });

  it('requires literal nondecreasing glyph area and charges the additional checks', () => {
    const original = layoutCastleRibbons([candidate], []);
    const name = { x: 0, y: 0, width: 10, height: 10 };
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    const plain = admitContainedCastleRibbons([candidate], original, [compact], [], [], 0);
    const equal = {
      ...compact,
      nameArea: { original: name, compact: name, viewport, occlusions: [] },
    };
    const guarded = admitContainedCastleRibbons([candidate], original, [equal], [], [], 0);
    expect(guarded.compactIds.size).toBe(1);
    expect(guarded.work).toBe(plain.work + 40);
    const reduced = {
      ...equal,
      // Representable loss at width 10; Number.EPSILON would round away in x+w.
      nameArea: { ...equal.nameArea, compact: { ...name, x: -(2 ** -45) } },
    };
    expect(
      admitContainedCastleRibbons([candidate], original, [reduced], [], [], 0).compactIds.size,
    ).toBe(0);
    const limited = admitContainedCastleRibbons([candidate], original, [equal], [], [], 999_970);
    expect(limited.work).toBe(1_000_000);
    expect(limited.placements).toEqual(original);
    expect(limited.compactIds.size).toBe(0);
  });

  it('admits only original-offset contained paint and retains leader bytes and inputs', () => {
    const original = layoutCastleRibbons([candidate], []);
    const snapshot = JSON.stringify([...original]);
    const result = admitContainedCastleRibbons([candidate], original, [compact], [], [], 0);
    expect([...result.compactIds]).toEqual([candidate.id]);
    expect(result.placements.get(candidate.id)?.rect).toEqual(compact.baseline);
    expect(result.placements.get(candidate.id)?.offset).toEqual(original.get(candidate.id)?.offset);
    expect(result.placements.get(candidate.id)?.leader).toBe(original.get(candidate.id)?.leader);
    expect(JSON.stringify([...original])).toBe(snapshot);
    expect(result.work).toBeGreaterThan(0);
  });

  it('certifies each actual UI rectangle within the same budget and fails closed on missing or invalid coverage', () => {
    const original = layoutCastleRibbons([candidate], []);
    const name = { x: 0, y: 0, width: 10, height: 10 };
    const viewport = { x: 0, y: 0, width: 100, height: 100 };
    const ui = { x: 0, y: 0, width: 5, height: 10 };
    const variant = {
      ...compact,
      nameArea: { original: name, compact: name, viewport, occlusions: [ui] },
    };
    const snapshot = JSON.stringify(variant);
    const empty = admitContainedCastleRibbons(
      [candidate],
      original,
      [{ ...variant, nameArea: { ...variant.nameArea, occlusions: [] } }],
      [],
      [],
      0,
    );
    const checked = admitContainedCastleRibbons([candidate], original, [variant], [], [], 0);
    expect(checked.compactIds.size).toBe(1);
    expect(checked.work).toBe(empty.work + 15);
    expect(JSON.stringify(variant)).toBe(snapshot);
    const missing = { ...compact, nameArea: { original: name, compact: name, viewport } };
    expect(
      admitContainedCastleRibbons([candidate], original, [missing], [], [], 0).compactIds.size,
    ).toBe(0);
    const invalid = {
      ...variant,
      nameArea: { ...variant.nameArea, occlusions: [{ ...ui, x: NaN }] },
    };
    expect(
      admitContainedCastleRibbons([candidate], original, [invalid], [], [], 0).placements,
    ).toEqual(original);
    const limited = admitContainedCastleRibbons([candidate], original, [variant], [], [], 999_940);
    expect(limited.work).toBe(1_000_000);
    expect(limited.placements).toEqual(original);
    expect(limited.compactIds.size).toBe(0);
  });

  it('keeps full paint when the narrower rect is not contained or changes a visible tether', () => {
    const original = layoutCastleRibbons([candidate], []);
    const noncontained = { ...compact, baseline: { ...compact.baseline, x: -41 } };
    expect(
      admitContainedCastleRibbons([candidate], original, [noncontained], [], [], 0).placements,
    ).toEqual(original);
    const visible = new Map(original);
    const before = original.get(candidate.id)!;
    visible.set(candidate.id, {
      ...before,
      leader: { ...before.leader, visible: true, end: { x: -40, y: 10 } },
    });
    expect(
      admitContainedCastleRibbons([candidate], visible, [compact], [], [], 0).placements,
    ).toEqual(visible);
  });

  it('rolls every admission back at the single shared work ceiling', () => {
    const original = layoutCastleRibbons([candidate], []);
    for (const work of [999_990, 1_000_000]) {
      const result = admitContainedCastleRibbons([candidate], original, [compact], [], [], work);
      expect(result.compactIds.size).toBe(0);
      expect(result.placements).toEqual(original);
      expect(result.work).toBe(1_000_000);
      expect(result.budgetLimited).toBe(true);
    }
  });

  it('recomputes actual final intersections without exceeding any original placed body overlap', () => {
    const body = { x: 20, y: 10, width: 20, height: 20 };
    const original = layoutCastleRibbons([candidate], []);
    const result = admitContainedCastleRibbons([candidate], original, [compact], [body], [body], 0);
    expect(result.placements.get(candidate.id)?.overlapArea).toBe(200);
    expect(result.placements.get(candidate.id)?.unresolved).toBe(true);
    expect(result.placements.get(candidate.id)?.overlapArea).toBeLessThanOrEqual(400);
  });
});
