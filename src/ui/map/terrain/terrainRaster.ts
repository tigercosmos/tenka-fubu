import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { MapStaticData } from '../mapViewTypes';
import { createMountainMaterial } from './terrainMountainMaterial';
import { createForestMaterial } from './terrainForestMaterial';
import { createMountainShade } from './terrainMountainShade';
import { prepareMountainRiverContact, type MountainRiverCapsule } from './mountainRiverContact';
type ContentBounds = { x: number; y: number; width: number; height: number };
type MountainPatch = ReturnType<typeof mountainRasterLayout>[number];
export type MountainContactLand = readonly (readonly number[])[];
export interface ForestPresentationRecord {
  readonly id: string;
  readonly assetId: string | null;
  readonly sourcePixelSize: Readonly<{ width: number; height: number }>;
  readonly contentBounds: Readonly<ContentBounds>;
  readonly position: Readonly<{ x: number; y: number }>;
  readonly scale: number;
  readonly worldPaintFrame: Readonly<ContentBounds>;
  readonly clipId: string;
  readonly clipPolygon: readonly Readonly<{ x: number; y: number }>[];
}

function hasPaintableForestClip(patch: MountainPatch): boolean {
  if (
    patch.polygon.length < 3 ||
    patch.polygon.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))
  )
    return false;
  let twiceArea = 0;
  for (let i = 0; i < patch.polygon.length; i++) {
    const a = patch.polygon[i]!,
      b = patch.polygon[(i + 1) % patch.polygon.length]!;
    twiceArea += a.x * b.y - b.x * a.y;
  }
  return Number.isFinite(twiceArea) && twiceArea !== 0;
}

/** Conservative filter-support cells, followed by a bounded north-only projection.
 * Edges are scanned once per row, never once per texel. Each admitted basis has
 * its complete linear-filter support inside a single actual display-land polygon.
 */
function mountainContactCoverage(patch: MountainPatch, land: MountainContactLand, size: number) {
  const result = new Uint8Array(size * size);
  if (
    land.length > 64 ||
    land.reduce((sum, polygon) => sum + polygon.length, 0) > 16384 ||
    land.some(
      (polygon) =>
        polygon.length < 6 ||
        polygon.length % 2 !== 0 ||
        polygon.some((value) => !Number.isFinite(value) || Math.abs(value) > 1e6),
    )
  )
    return result;
  const dx = patch.width / size;
  const dy = patch.height / size;
  if (!(dx > 0 && dy > 0) || !Number.isFinite(dx + dy)) return result;
  const shifts = Math.floor(Math.min(12, patch.height * 0.12) / dy);
  const rows = size + shifts;
  const grounded = new Uint8Array(rows * size);
  const relevant = land.filter((polygon) => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < polygon.length; i += 2) {
      minX = Math.min(minX, polygon[i]!);
      maxX = Math.max(maxX, polygon[i]!);
      minY = Math.min(minY, polygon[i + 1]!);
      maxY = Math.max(maxY, polygon[i + 1]!);
    }
    return (
      maxX >= patch.x - dx &&
      minX <= patch.x + patch.width + dx &&
      maxY >= patch.y - dy &&
      minY <= patch.y + rows * dy + dy
    );
  });
  for (let row = 0; row < rows; row++) {
    const y = patch.y + (row + 0.5) * dy;
    for (const polygon of relevant) {
      const crossings: number[] = [];
      const blocked = new Int32Array(size + 1);
      for (let i = 0; i < polygon.length; i += 2) {
        const j = (i + 2) % polygon.length;
        const ax = polygon[i]!;
        const ay = polygon[i + 1]!;
        const bx = polygon[j]!;
        const by = polygon[j + 1]!;
        if (ay > y !== by > y) crossings.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        if (Math.max(ay, by) < y - dy || Math.min(ay, by) > y + dy) continue;
        let lo = 0;
        let hi = 1;
        if (by !== ay) {
          const t0 = (y - dy - ay) / (by - ay);
          const t1 = (y + dy - ay) / (by - ay);
          lo = Math.max(0, Math.min(t0, t1));
          hi = Math.min(1, Math.max(t0, t1));
        }
        const x0 = ax + lo * (bx - ax);
        const x1 = ax + hi * (bx - ax);
        const first = Math.max(0, Math.ceil((Math.min(x0, x1) - dx - patch.x) / dx - 0.5));
        const last = Math.min(size - 1, Math.floor((Math.max(x0, x1) + dx - patch.x) / dx - 0.5));
        if (first <= last) {
          blocked[first]!++;
          blocked[last + 1]!--;
        }
      }
      crossings.sort((a, b) => a - b);
      let interval = 0;
      let boundaryCount = 0;
      for (let col = 0; col < size; col++) {
        boundaryCount += blocked[col]!;
        const x = patch.x + (col + 0.5) * dx;
        while (interval + 1 < crossings.length && x >= crossings[interval + 1]!) interval += 2;
        if (
          boundaryCount === 0 &&
          interval + 1 < crossings.length &&
          x > crossings[interval]! &&
          x < crossings[interval + 1]!
        )
          grounded[row * size + col] = 1;
      }
    }
  }
  // Sliding vertical union: moving a safe support cell north never moves its ground east/south.
  for (let col = 0; col < size; col++) {
    let count = 0;
    for (let row = 0; row <= shifts; row++) count += grounded[row * size + col]!;
    for (let row = 0; row < size; row++) {
      result[row * size + col] = count > 0 ? 1 : 0;
      count -= grounded[row * size + col]!;
      if (row + shifts + 1 < rows) count += grounded[(row + shifts + 1) * size + col]!;
    }
  }
  return result;
}

/** Static red-channel coverage; opaque alpha avoids Pixi's default red/alpha product. */
export function mountainFeatherMask(
  patch: MountainPatch,
  contactLand?: MountainContactLand,
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
) {
  const size = 128;
  const pixels = new Uint8Array(size * size * 4);
  const band = Math.min(8, patch.width * 0.12, patch.height * 0.12);
  const contact =
    contactLand === undefined ? null : mountainContactCoverage(patch, contactLand, size);
  for (let row = 0; row < size; row++) {
    for (let col = 0; col < size; col++) {
      const x = patch.x + ((col + 0.5) / size) * patch.width;
      const y = patch.y + ((row + 0.5) / size) * patch.height;
      let inside = false;
      let distance = Infinity;
      for (let i = 0; i < patch.polygon.length; i++) {
        const a = patch.polygon[i]!;
        const b = patch.polygon[(i + 1) % patch.polygon.length]!;
        if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x)
          inside = !inside;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const denominator = dx * dx + dy * dy;
        const t =
          denominator > 0
            ? Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / denominator))
            : 0;
        distance = Math.min(distance, Math.hypot(x - a.x - t * dx, y - a.y - t * dy));
      }
      const t = inside && band > 0 && Number.isFinite(distance) ? Math.min(1, distance / band) : 0;
      let coverage =
        contact && contact[row * size + col] === 0 ? 0 : Math.round(255 * t * t * (3 - 2 * t));
      if (riverContact) {
        const factor = riverContact(
          { x, y },
          { width: patch.width / size, height: patch.height / size },
        );
        if (factor !== 1) coverage = Math.round(coverage * factor);
      }
      const offset = (row * size + col) * 4;
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = coverage;
      pixels[offset + 3] = 255;
    }
  }
  return { size, pixels };
}

/** One shared texture, at most fourteen static masks. Never rotate the authored NW light. */
export function mountainRasterLayout(terrain: NonNullable<MapStaticData['terrain']>) {
  return [...(terrain.mountains ?? [])]
    .sort((a, b) => a.id.localeCompare(b.id))
    .slice(0, 14)
    .filter((mountain) => mountain.mass.length >= 3)
    .map((mountain) => {
      const x = Math.min(...mountain.mass.map((p) => p.x));
      const y = Math.min(...mountain.mass.map((p) => p.y));
      const width = Math.max(...mountain.mass.map((p) => p.x)) - x;
      const height = Math.max(...mountain.mass.map((p) => p.y)) - y;
      const ridges = mountain.ridges
        .map((points) => ({
          points,
          length: points
            .slice(1)
            .reduce((sum, p, i) => sum + Math.hypot(p.x - points[i]!.x, p.y - points[i]!.y), 0),
        }))
        .sort((a, b) => b.length - a.length);
      const principal = ridges[0];
      let centerX = x + width / 2;
      let centerY = y + height / 2;
      let spanX = width;
      let spanY = height;
      if (principal && principal.length > 0) {
        centerX = 0;
        centerY = 0;
        principal.points.slice(1).forEach((p, i) => {
          const a = principal.points[i]!;
          const weight = Math.hypot(p.x - a.x, p.y - a.y) / principal.length;
          centerX += ((p.x + a.x) / 2) * weight;
          centerY += ((p.y + a.y) / 2) * weight;
        });
        spanX =
          Math.max(...principal.points.map((p) => p.x)) -
          Math.min(...principal.points.map((p) => p.x));
        spanY =
          Math.max(...principal.points.map((p) => p.y)) -
          Math.min(...principal.points.map((p) => p.y));
      }
      const axis: 'horizontal' | 'vertical' = spanX >= spanY ? 'horizontal' : 'vertical';
      const axisAssetId = terrain.mountainArtVariants?.[axis] ?? terrain.mountainArtAssetId;
      const assetId = terrain.mountainArtById?.[mountain.id] ?? axisAssetId;
      return {
        id: mountain.id,
        polygon: mountain.mass,
        x,
        y,
        width,
        height,
        ridge:
          principal && principal.length > 0 ? { centerX, centerY, spanX, spanY, axis } : undefined,
        assetId,
        ...(axisAssetId ? { axisAssetId } : {}),
      };
    })
    .filter((patch) => patch.width > 0 && patch.height > 0);
}

/** Preserve the complete painted ridge and its transparent fringe, rather than crop a cover tile. */
export function mountainRasterPlacement(
  patch: ReturnType<typeof mountainRasterLayout>[number],
  width: number,
  height: number,
  contentBounds?: ContentBounds,
) {
  // Metadata refers to the original PNG, not a cropped/rewritten bitmap.
  const frame =
    contentBounds &&
    Object.values(contentBounds).every(Number.isFinite) &&
    contentBounds.x >= 0 &&
    contentBounds.y >= 0 &&
    contentBounds.width > 0 &&
    contentBounds.height > 0 &&
    contentBounds.x + contentBounds.width <= width &&
    contentBounds.y + contentBounds.height <= height
      ? contentBounds
      : { x: 0, y: 0, width, height };
  const ridge = patch.ridge;
  const desiredScale = ridge
    ? ridge.axis === 'horizontal'
      ? Math.max(ridge.spanX * 1.05, patch.width * 0.88) / frame.width
      : Math.max(ridge.spanY * 1.05, patch.height * 0.88) / frame.height
    : Math.min(patch.width / frame.width, patch.height / frame.height) * 0.9;
  const scale = Math.min(
    desiredScale,
    (patch.width * 0.96) / frame.width,
    (patch.height * 0.96) / frame.height,
  );
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  return {
    scale,
    x:
      clamp(
        (ridge?.centerX ?? patch.x + patch.width / 2) - (frame.width * scale) / 2,
        patch.x,
        patch.x + patch.width - frame.width * scale,
      ) -
      frame.x * scale,
    y:
      clamp(
        (ridge?.centerY ?? patch.y + patch.height / 2) - (frame.height * scale) / 2,
        patch.y,
        patch.y + patch.height - frame.height * scale,
      ) -
      frame.y * scale,
  };
}

export function forestRasterLayout(terrain: NonNullable<MapStaticData['terrain']>) {
  return mountainRasterLayout({
    ...terrain,
    mountains: [...(terrain.forests ?? [])]
      .sort((a, b) => a.id.localeCompare(b.id))
      .slice(0, 10)
      .map((forest) => ({ id: forest.id, tier: 1, mass: forest.polygon, ridges: [] })),
  });
}

export function createForestRaster(
  texture: Texture,
  terrain: NonNullable<MapStaticData['terrain']>,
  woodlandTexture?: Texture,
) {
  return createRaster(
    () => ({ texture }),
    forestRasterLayout(terrain),
    false,
    woodlandTexture ? (patch) => createForestMaterial(woodlandTexture, patch) : undefined,
    'forest-woodland-materials',
    undefined,
    undefined,
    undefined,
    { assetId: terrain.forestArtAssetId ?? null },
  );
}

export function createMountainRaster(
  texture: Texture,
  terrain: NonNullable<MapStaticData['terrain']>,
) {
  return createRaster(() => ({ texture }), mountainRasterLayout(terrain));
}

export function createMountainRasterVariants(
  textures: ReadonlyMap<string, Texture>,
  terrain: NonNullable<MapStaticData['terrain']>,
  woodlandTexture?: Texture,
  contactLand?: MountainContactLand,
  riverContacts?: readonly MountainRiverCapsule[],
) {
  return createRaster(
    (patch) => {
      const id = [patch.assetId, patch.axisAssetId, terrain.mountainArtAssetId].find(
        (candidate) => candidate !== undefined && textures.has(candidate),
      );
      const texture = id ? textures.get(id) : undefined;
      if (!texture) return undefined;
      const contentBounds = id ? terrain.mountainArtContentBounds?.[id] : undefined;
      return { texture, ...(contentBounds ? { contentBounds } : {}) };
    },
    mountainRasterLayout(terrain),
    true,
    woodlandTexture
      ? (patch, riverContact) =>
          createMountainMaterial(
            woodlandTexture,
            patch,
            terrain.mountains?.find((mountain) => mountain.id === patch.id)?.ridges ?? [],
            riverContact,
          )
      : undefined,
    'mountain-woodland-materials',
    woodlandTexture
      ? (patch, riverContact) => {
          const mountain = terrain.mountains?.find((m) => m.id === patch.id);
          return mountain
            ? createMountainShade(patch, mountain.ridges, mountain.tier, riverContact)
            : null;
        }
      : undefined,
    contactLand,
    riverContacts === undefined ? undefined : prepareMountainRiverContact(riverContacts),
  );
}

function createRaster(
  textureForPatch: (
    patch: ReturnType<typeof mountainRasterLayout>[number],
  ) => { texture: Texture; contentBounds?: ContentBounds } | undefined,
  patches: ReturnType<typeof mountainRasterLayout>,
  feather = false,
  materialForPatch?: (
    patch: ReturnType<typeof mountainRasterLayout>[number],
    riverContact?: ReturnType<typeof prepareMountainRiverContact>,
  ) => ReturnType<typeof createMountainMaterial>,
  materialLayerLabel = 'mountain-woodland-materials',
  shadeForPatch?: (
    patch: MountainPatch,
    riverContact?: ReturnType<typeof prepareMountainRiverContact>,
  ) => ReturnType<typeof createMountainShade>,
  contactLand?: MountainContactLand,
  riverContact?: ReturnType<typeof prepareMountainRiverContact>,
  forestPresentation?: { assetId: string | null },
) {
  const container = new Container();
  container.eventMode = 'none';
  const sprites: Sprite[] = [];
  const ownedMasks: Texture[] = [];
  const coveredIds = new Set<string>();
  const materials: ReturnType<typeof createMountainMaterial>[] = [];
  const shades: NonNullable<ReturnType<typeof createMountainShade>>[] = [];
  const presentation: ForestPresentationRecord[] = [];
  for (const patch of patches) {
    if (forestPresentation && !hasPaintableForestClip(patch)) continue;
    const asset = textureForPatch(patch);
    if (!asset) continue;
    const contact = patch.id === 'mt.kiso' ? riverContact : undefined;
    if (materialForPatch) {
      const material = materialForPatch(patch, contact);
      materials.push(material);
      const shade = shadeForPatch?.(patch, contact);
      if (shade) {
        shades.push(shade);
        material.container.addChild(shade.container);
      }
    }
    const { texture, contentBounds } = asset;
    const sprite = new Sprite(texture);
    const placement = mountainRasterPlacement(patch, texture.width, texture.height, contentBounds);
    sprite.scale.set(placement.scale);
    sprite.position.set(placement.x, placement.y);
    const mask = new Graphics().poly(patch.polygon.flatMap((p) => [p.x, p.y])).fill(0xffffff);
    mask.eventMode = 'none';
    if (forestPresentation) {
      mask.label = `forest-clip:${patch.id}`;
      const frame = contentBounds ?? { x: 0, y: 0, width: texture.width, height: texture.height };
      presentation.push(
        Object.freeze({
          id: patch.id,
          assetId: forestPresentation.assetId,
          sourcePixelSize: Object.freeze({ width: texture.width, height: texture.height }),
          contentBounds: Object.freeze({ ...frame }),
          position: Object.freeze({ x: sprite.position.x, y: sprite.position.y }),
          scale: sprite.scale.x,
          worldPaintFrame: Object.freeze({
            x: sprite.position.x + frame.x * sprite.scale.x,
            y: sprite.position.y + frame.y * sprite.scale.y,
            width: frame.width * sprite.scale.x,
            height: frame.height * sprite.scale.y,
          }),
          clipId: mask.label,
          clipPolygon: Object.freeze(patch.polygon.map((p) => Object.freeze({ ...p }))),
        }),
      );
    }
    if (feather) {
      const { size, pixels } = mountainFeatherMask(patch, contactLand, contact);
      const maskTexture = new Texture({
        source: new BufferImageSource({
          resource: pixels,
          width: size,
          height: size,
          scaleMode: 'linear',
        }),
      });
      const softMask = new Sprite(maskTexture);
      softMask.position.set(patch.x, patch.y);
      softMask.width = patch.width;
      softMask.height = patch.height;
      softMask.eventMode = 'none';
      const group = new Container();
      group.eventMode = 'none';
      group.addChild(sprite, softMask);
      sprite.mask = softMask;
      group.mask = mask;
      container.addChild(group);
      ownedMasks.push(maskTexture);
    } else {
      container.addChild(sprite);
      sprite.mask = mask;
    }
    container.addChild(mask);
    sprites.push(sprite);
    coveredIds.add(patch.id);
  }
  const materialLayer = materials.length > 0 ? new Container() : null;
  if (materialLayer) {
    materialLayer.label = materialLayerLabel;
    materialLayer.eventMode = 'none';
    for (const material of materials) materialLayer.addChild(material.container);
    container.addChildAt(materialLayer, 0);
  }
  let destroyed = false;
  const records: readonly ForestPresentationRecord[] = Object.freeze(presentation);
  const emptyRecords: readonly ForestPresentationRecord[] = Object.freeze([]);
  return {
    container,
    materialLayer,
    coveredIds,
    /** Static emitted placement/clip records; no per-frame geometry allocation. */
    getPresentationGeometry: () => (destroyed ? emptyRecords : records),
    getShadeDiagnostics: () => ({
      patches: shades.length,
      ownedTextures: destroyed ? 0 : shades.length,
      ownedSources: destroyed ? 0 : shades.length,
      rgbaBytes: destroyed ? 0 : shades.reduce((sum, s) => sum + s.getDiagnostics().rgbaBytes, 0),
    }),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      if (forestPresentation) coveredIds.clear();
      container.parent?.removeChild(container);
      for (const shade of shades) shade.destroy();
      for (const material of materials) material.destroy();
      // May be reparented to a ground-only coast clip; remains raster-owned.
      if (materialLayer) {
        materialLayer.parent?.removeChild(materialLayer);
        materialLayer.destroy({ children: true });
      }
      for (const sprite of sprites) {
        sprite.mask = null;
        sprite.parent?.removeChild(sprite);
        sprite.destroy({ texture: false, textureSource: false });
      }
      container.destroy({ children: true });
      for (const texture of ownedMasks) texture.destroy(true);
    },
  };
}
