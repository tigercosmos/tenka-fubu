import type { Texture } from 'pixi.js';

/** Original art metadata; ground anchors were visually authored, not inferred game positions. */
export interface CastleBodyArtSpec {
  readonly assetId: string;
  readonly contentBounds: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly groundAnchor: { readonly x: number; readonly y: number };
}

export type CastleBodyArt = Partial<
  Record<
    'main' | 'branch',
    Partial<Record<'plain' | 'mountain', { texture: Texture; spec: CastleBodyArtSpec }>>
  >
>;

export const CASTLE_BODY_ART: Readonly<Record<'plain' | 'mountain', CastleBodyArtSpec>> = {
  plain: {
    assetId: 'texture.castle.main-plain-v1',
    contentBounds: { x: 5, y: 95, width: 1244, height: 1064 },
    groundAnchor: { x: 627, y: 875 },
  },
  mountain: {
    assetId: 'texture.castle.main-mountain-v1',
    contentBounds: { x: 47, y: 74, width: 1180, height: 1115 },
    groundAnchor: { x: 627, y: 910 },
  },
};

// Inspected original branch PNG bounds and visually authored footprint-center anchors.
export const BRANCH_CASTLE_BODY_ART: Readonly<Record<'plain' | 'mountain', CastleBodyArtSpec>> = {
  plain: {
    assetId: 'texture.castle.branch-plain-v1',
    contentBounds: { x: 12, y: 210, width: 1232, height: 943 },
    groundAnchor: { x: 627, y: 900 },
  },
  mountain: {
    assetId: 'texture.castle.branch-mountain-v1',
    contentBounds: { x: 36, y: 190, width: 1196, height: 977 },
    groundAnchor: { x: 627, y: 925 },
  },
};
export const CASTLE_BODY_ART_BY_TIER = {
  main: CASTLE_BODY_ART,
  branch: BRANCH_CASTLE_BODY_ART,
} as const;

export function castleBodyArtPlacement(spec: CastleBodyArtSpec, visibleWorldWidth = 28) {
  const scale = visibleWorldWidth / spec.contentBounds.width;
  return { scale, x: -spec.groundAnchor.x * scale, y: -spec.groundAnchor.y * scale };
}
