export const KAMON_SHAPES = Object.freeze([
  'petal5',
  'petal6',
  'bars2',
  'bars3',
  'nestedDiamond',
  'tripleTriangle',
  'crossRing',
  'star3Bar',
  'tomoe3',
  'squareEyes4',
  'ring',
  'doubleRing',
] as const);
export type KamonShape = (typeof KAMON_SHAPES)[number];
export interface KamonSpec {
  shape: KamonShape;
  fg: string;
  bg: string;
}
