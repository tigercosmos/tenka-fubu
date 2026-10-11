import { expect, it } from 'vitest';
import { associatedWaterRun, isFixedBankWaterPixel } from '../../e2e/river-bank-pixel-run';
it.each([
  [22, 36, 31], // Actual Echigo green-rock pixel: the old B>R cue wrongly accepts it.
  [20, 31, 22],
  [128, 128, 128],
  [120, 125, 128], // Near-chromatic gray, not convincing cyan water.
  [152, 144, 105],
  [97, 99, 73],
])('rejects low-chroma gray, green terrain and brown bank RGB %j', (...rgb) => {
  expect(isFixedBankWaterPixel(rgb)).toBe(false);
});
it.each([
  [88, 120, 128], // Published material dark palette.
  [115, 148, 151], // Published material shallow palette.
  [101, 120, 124], // Actual archived Kiso center, not inferred from source contrast.
  [106, 125, 128],
  [91, 123, 131], // Actual archived Shinano center.
  [94, 126, 134],
  [32, 48, 48], // Inclusive chroma floor and B>=G boundary.
])('accepts the fixed controls cyan material RGB %j', (...rgb) => {
  expect(isFixedBankWaterPixel(rgb)).toBe(true);
});
it.each([
  [74, 83, 91],
  [43, 63, 64],
])(
  'documents blue-gray/green-cyan rock ambiguity RGB %j, not universal water recognition',
  (...rgb) => {
    expect(isFixedBankWaterPixel(rgb)).toBe(true);
  },
);
it.each(
  [
    [],
    [1, 2],
    [1, 2, 3, 4],
    [NaN, 120, 128],
    [88, Infinity, 128],
    [-1, 120, 128],
    [88, 120, 256],
    [88.5, 120, 128],
  ].map((rgb) => ({ rgb })),
)('rejects non-RGB8 input %j', ({ rgb }) => expect(isFixedBankWaterPixel(rgb)).toBe(false));
const samples = (flags: boolean[]) => flags.map((water, side) => ({ side, water }));
it('rejects isolated terrain specks from banks while retaining them as diagnostics', () => {
  expect(associatedWaterRun(samples([false, true, false, true, true, true, false]), 4)).toEqual({
    left: 3,
    right: 5,
    indices: [3, 4, 5],
    disconnected: [1],
    center: 4,
  });
});
it('associates a connected run and does not replace its pixel banks with geometry', () => {
  expect(associatedWaterRun(samples([false, true, true, true, false]), 2.1).left).toBe(1);
  expect(associatedWaterRun(samples([false, true, true, true, false]), 2.1).right).toBe(3);
});
it('selects only the center-associated run among multiple water runs', () => {
  expect(
    associatedWaterRun(samples([false, true, false, true, true, false]), 3).disconnected,
  ).toEqual([1]);
});
it.each([
  [samples([false, true, false]), 0],
  [samples([true, true, false]), 1],
  [samples([false, true, true]), 1],
  [samples([false, false, false]), 1],
  [samples([false, true, false]), 5],
  [
    [
      { side: 0, water: false },
      { side: 0, water: true },
    ],
    0,
  ],
  [
    [
      { side: 0, water: false },
      { side: 2, water: true },
      { side: 3, water: false },
    ],
    2,
  ],
  [samples([false, true, false]), 0.5],
  [new Array<{ side: number; water: boolean }>(3), 1],
])('fails closed for nonwater, clipped, ambiguous or sparse samples %#', (values, center) => {
  expect(() => associatedWaterRun(values, center)).toThrow();
});
