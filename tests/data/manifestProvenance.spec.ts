import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import {
  FIRST_SCREEN_ASSET_IDS,
  VISUAL_ASSET_MANIFEST,
  type VisualAssetManifestEntry,
} from '../../src/ui/assets/manifest';
import { buildTerrainPack } from '../../src/ui/map/terrain/terrainPack';
import { CASTLE_BODY_ART, BRANCH_CASTLE_BODY_ART } from '../../src/ui/map/sceneParts/castleBodyArt';
import { ARMY_BODY_ART } from '../../src/ui/map/sceneParts/armyBodyArt';

const root = resolve(import.meta.dirname, '../..');
interface GenerationProvenance {
  license?: string;
  asset: string;
  generator: string;
  mode: string;
  generatedDate: string;
  transparentBackgroundRequested: boolean;
  referencedImages: string[];
  sha256: string;
  dimensions: { width: number; height: number };
  bytes?: number;
  alphaInspection: {
    zeroAlphaPixels: number;
    partialAlphaPixels: number;
    opaquePixels: number;
    centerAlpha: number;
  };
  prompt: string;
  visibleContentBounds?: {
    alphaThresholdExclusive: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
  groundAnchor?: { x: number; y: number; method: string };
}
function repoFile(path: string): string {
  const file = resolve(root, path);
  const local = relative(root, file);
  if (isAbsolute(local) || local.startsWith('..')) throw Error('not repository provenance');
  return file;
}
function loadProvenance(entry: VisualAssetManifestEntry): GenerationProvenance {
  if (
    !entry.sourceUrl?.startsWith('assets/generated/') ||
    !entry.sourceUrl.endsWith('.provenance.json')
  )
    throw Error('missing repository provenance');
  return JSON.parse(readFileSync(repoFile(entry.sourceUrl), 'utf8')) as GenerationProvenance;
}
/** Repository-only evidence chain; validates files/declared authorship, not copyright by inference. */
function verifyReferences(
  references: readonly string[],
  read: (path: string) => Buffer = (path) => readFileSync(repoFile(path)),
  manifest: readonly VisualAssetManifestEntry[] = VISUAL_ASSET_MANIFEST,
): void {
  const verified = new Set<string>();
  const visiting = new Set<string>();
  const visit = (path: string): void => {
    if (
      typeof path !== 'string' ||
      isAbsolute(path) ||
      path.includes('\\') ||
      path.split('/').includes('..')
    )
      throw Error('reference is not a canonical repository path');
    repoFile(path);
    if (visiting.has(path)) throw Error('cyclic provenance references');
    if (verified.has(path)) return;
    const entry = manifest.find((asset) => `public/${asset.runtimePath}` === path);
    const retained = /^assets\/generated\/source-images\/[a-z0-9-]+\.png$/.test(path);
    if (!entry && !retained) throw Error('reference has no qualified original source');
    if (entry && (entry.license !== 'project-original' || entry.derivative))
      throw Error('reference is not project-original');
    const bytes = read(path);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (entry) expect(hash).toBe(entry.contentHash);
    const sidecar =
      entry?.sourceUrl ?? (retained ? path.replace(/\.png$/, '.provenance.json') : null);
    visiting.add(path);
    if (sidecar !== null) {
      if (!sidecar.startsWith('assets/generated/') || !sidecar.endsWith('.provenance.json'))
        throw Error('reference sidecar is not repository provenance');
      const provenance = JSON.parse(read(sidecar).toString('utf8')) as GenerationProvenance;
      if (retained) expect(provenance.license).toBe('project-original');
      expect(provenance.asset).toBe(path);
      if (
        path ===
        'assets/generated/source-images/terrain-mountain-akaishi-massif-v3-layout-guide.png'
      ) {
        expect(provenance.generator).toBe('playwright.chromium');
        expect(provenance.mode).toBe('headless-render');
        expect(Reflect.get(provenance, 'purpose')).toBe(
          'spatial-layout-reference-not-generated-art',
        );
        expect(provenance.sha256).toBe(
          '83545db94b8019f83550c855afc0e98e5f308ba5009cb362459c210097ef010f',
        );
        expect(provenance.dimensions).toEqual({ width: 228, height: 413 });
        expect(provenance.referencedImages).toEqual([]);
      } else {
        expect(provenance.generator).toBe('image_gen.imagegen');
        expect(provenance.mode).toBe('built-in');
      }
      expect(typeof provenance.prompt).toBe('string');
      expect(provenance.prompt.trim().length).toBeGreaterThan(0);
      expect(provenance.sha256).toBe(hash);
      const png = PNG.sync.read(bytes);
      expect(provenance.dimensions).toEqual({ width: png.width, height: png.height });
      if (entry) expect(entry.pixelSize).toEqual(provenance.dimensions);
      expect(Array.isArray(provenance.referencedImages)).toBe(true);
      for (const reference of provenance.referencedImages) visit(reference);
    }
    visiting.delete(path);
    verified.add(path);
  };
  for (const reference of references) visit(reference);
}
function verify(entry: VisualAssetManifestEntry, provenance = loadProvenance(entry)): void {
  expect(entry.license).toBe('project-original');
  expect(entry.derivative).toBe(false);
  expect(provenance.asset).toBe(`public/${entry.runtimePath}`);
  expect(provenance.generator).toBe('image_gen.imagegen');
  expect(provenance.mode).toBe('built-in');
  expect(provenance.generatedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(typeof provenance.transparentBackgroundRequested).toBe('boolean');
  if (
    [
      'texture.terrain.mountain-akaishi-massif-v1',
      'texture.terrain.mountain-chugoku-massif-v1',
      'texture.terrain.mountain-hida-massif-v1',
      'texture.terrain.mountain-hida-massif-v2',
      'texture.terrain.mountain-kiso-massif-v1',
    ].includes(entry.id)
  ) {
    expect(provenance.referencedImages).toEqual([
      `assets/generated/source-images/${entry.id.replace('texture.terrain.', 'terrain-')}-input.png`,
    ]);
    verifyReferences(provenance.referencedImages);
  } else if (entry.id === 'texture.terrain.mountain-akaishi-massif-v3') {
    expect(provenance.referencedImages).toEqual([
      'assets/generated/source-images/terrain-mountain-akaishi-massif-v3-input.png',
      'assets/generated/source-images/terrain-mountain-akaishi-massif-v3-layout-guide.png',
    ]);
    verifyReferences(provenance.referencedImages);
  } else if (entry.id === 'texture.terrain.mountain-akaishi-massif-v2') {
    expect(provenance.referencedImages).toEqual([
      'public/assets/textures/terrain-mountain-akaishi-massif-v1.png',
    ]);
    verifyReferences(provenance.referencedImages);
  } else if (
    entry.id.startsWith('texture.army.') ||
    ['texture.castle.branch-plain-v1', 'texture.castle.branch-mountain-v1'].includes(entry.id)
  ) {
    expect(provenance.referencedImages.length).toBeGreaterThan(0);
    verifyReferences(provenance.referencedImages);
  } else expect(provenance.referencedImages).toEqual([]);
  expect(typeof provenance.prompt).toBe('string');
  expect(provenance.prompt.trim().length).toBeGreaterThan(0);
  const bytes = readFileSync(repoFile(provenance.asset));
  const hash = createHash('sha256').update(bytes).digest('hex');
  expect(provenance.sha256).toBe(hash);
  expect(entry.contentHash).toBe(hash);
  expect(bytes.length).toBeGreaterThan(0);
  if (provenance.bytes !== undefined) expect(provenance.bytes).toBe(bytes.length);
  const png = PNG.sync.read(bytes);
  expect(provenance.dimensions).toEqual({ width: png.width, height: png.height });
  expect(entry.pixelSize).toEqual(provenance.dimensions);
  expect(png.width).toBeLessThanOrEqual(2048);
  expect(png.height).toBeLessThanOrEqual(2048);
  let zeroAlphaPixels = 0,
    partialAlphaPixels = 0,
    opaquePixels = 0;
  let minX = png.width,
    minY = png.height,
    maxX = -1,
    maxY = -1;
  if (provenance.visibleContentBounds)
    expect(provenance.visibleContentBounds.alphaThresholdExclusive).toBe(8);
  for (let offset = 3; offset < png.data.length; offset += 4) {
    const alpha = png.data[offset]!;
    if (alpha === 0) zeroAlphaPixels++;
    else if (alpha === 255) opaquePixels++;
    else partialAlphaPixels++;
    if (
      provenance.visibleContentBounds &&
      alpha > provenance.visibleContentBounds.alphaThresholdExclusive
    ) {
      const pixel = (offset - 3) / 4;
      const x = pixel % png.width,
        y = Math.floor(pixel / png.width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }
  if (provenance.transparentBackgroundRequested) {
    expect(zeroAlphaPixels).toBeGreaterThan(0);
    expect(partialAlphaPixels).toBeGreaterThan(0);
  } else {
    expect(zeroAlphaPixels).toBe(0);
    expect(partialAlphaPixels).toBe(0);
    expect(opaquePixels).toBe(png.width * png.height);
  }
  const center = (Math.floor(png.height / 2) * png.width + Math.floor(png.width / 2)) * 4 + 3;
  expect(provenance.alphaInspection).toEqual({
    zeroAlphaPixels,
    partialAlphaPixels,
    opaquePixels,
    centerAlpha: png.data[center],
  });
  if (provenance.visibleContentBounds) {
    expect(maxX).toBeGreaterThanOrEqual(minX);
    expect(maxY).toBeGreaterThanOrEqual(minY);
    expect(provenance.visibleContentBounds).toEqual({
      alphaThresholdExclusive: 8,
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    });
  }
  if (provenance.groundAnchor) {
    expect(provenance.groundAnchor.method.trim().length).toBeGreaterThan(0);
    expect(provenance.groundAnchor.x).toBeGreaterThanOrEqual(0);
    expect(provenance.groundAnchor.x).toBeLessThan(png.width);
    expect(provenance.groundAnchor.y).toBeGreaterThanOrEqual(0);
    expect(provenance.groundAnchor.y).toBeLessThan(png.height);
  }
}

// sourceUrl here is a repository provenance reference, not a published runtime hyperlink.
const generated = VISUAL_ASSET_MANIFEST.filter((e) => e.authorOrTool.startsWith('image_gen'));
describe('original generated terrain provenance against real source files', () => {
  it('retains the asymmetric Hida framing edit and its original V1 source chain', () => {
    const entry = generated.find(
      (asset) => asset.id === 'texture.terrain.mountain-hida-massif-v2',
    )!;
    const provenance = loadProvenance(entry);
    expect(provenance.referencedImages).toEqual([
      'assets/generated/source-images/terrain-mountain-hida-massif-v2-input.png',
    ]);
    verifyReferences(provenance.referencedImages);
    expect(provenance.visibleContentBounds).toEqual({
      alphaThresholdExclusive: 8,
      x: 244,
      y: 77,
      width: 582,
      height: 1376,
    });
    expect(Reflect.get(provenance, 'sourceImageSha256')).toBe(
      '8db9a571f4dffbfedcba8eae85aaa46ed5972515c26c2de29348ecd885747416',
    );
    expect(provenance.prompt).toContain('asymmetrical three-group ridge topology');
    expect(FIRST_SCREEN_ASSET_IDS).not.toContain(entry.id);
    verify(entry);
  });
  it('retains the Hida edit chain and exact inspected full-ridge source', () => {
    const entry = generated.find((asset) => asset.id === 'texture.terrain.mountain-hida-massif-v1');
    expect(entry).toBeDefined();
    const provenance = loadProvenance(entry!);
    expect(provenance.referencedImages).toEqual([
      'assets/generated/source-images/terrain-mountain-hida-massif-v1-input.png',
    ]);
    verifyReferences(provenance.referencedImages);
    expect(provenance.visibleContentBounds).toEqual({
      alphaThresholdExclusive: 8,
      x: 251,
      y: 65,
      width: 573,
      height: 1423,
    });
    expect(Reflect.get(provenance, 'sourceImageSha256')).toBe(
      '6da797d2da995ff166e9c036fdaeb5bad7102a5d380a9230ce501d8d7376bc56',
    );
    expect(FIRST_SCREEN_ASSET_IDS).not.toContain(entry!.id);
    verify(entry!);
  });
  it('records the Echigo built-in portrait edit without claiming adoption of the discarded landscape', () => {
    const entry = generated.find(
      (asset) => asset.id === 'texture.terrain.mountain-echigo-massif-v1',
    )!;
    const provenance = loadProvenance(entry);
    expect(provenance.generatedDate).toBe('2026-10-11');
    expect(Reflect.get(provenance, 'sourceImageSha256')).toBe(entry.contentHash);
    expect(Reflect.get(provenance, 'sourceImage')).toBe(
      '/Users/tigercosmos/.codex/generated_images/01a11830-d07d-78c3-a239-4290f3a612ac/exec-3c849b82-9258-4b3a-aa71-f6f265c3c2d4.png',
    );
    const history = Reflect.get(provenance, 'generationHistory') as Record<string, unknown>;
    expect(history.initialOutputAdopted).toBe(false);
    expect(history.portraitEditNumLastImagesToInclude).toBe(1);
    expect(history.initialPrompt).toContain('single connected Echigo-inspired');
    expect(provenance.prompt).toContain('TALL PORTRAIT connected massif');
    expect(provenance.referencedImages).toEqual([]);
  });
  it('keeps source-less original entries legitimate and verifies every generated PNG/JSON pair', () => {
    expect(
      VISUAL_ASSET_MANIFEST.some((e) => e.license === 'project-original' && e.sourceUrl === null),
    ).toBe(true);
    expect(generated).toHaveLength(30);
    for (const entry of generated) verify(entry);
  });
  it('keeps both branch castles lazy with same-kind original style references and actual renderer frames', () => {
    expect(Object.keys(BRANCH_CASTLE_BODY_ART).sort()).toEqual(['mountain', 'plain']);
    for (const [kind, spec] of Object.entries(BRANCH_CASTLE_BODY_ART)) {
      expect(spec.assetId).toBe(`texture.castle.branch-${kind}-v1`);
      const entry = generated.find((asset) => asset.id === spec.assetId)!;
      expect(entry).toBeDefined();
      expect(FIRST_SCREEN_ASSET_IDS).not.toContain(entry.id);
      const provenance = loadProvenance(entry);
      expect(provenance.referencedImages).toEqual([
        `public/assets/textures/castle-main-${kind}-v1.png`,
      ]);
      verifyReferences(provenance.referencedImages);
      const bounds = provenance.visibleContentBounds!;
      expect(spec.contentBounds).toEqual({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      expect(provenance.groundAnchor?.method).toContain('not a gameplay coordinate');
      expect(spec.groundAnchor).toEqual({
        x: provenance.groundAnchor!.x,
        y: provenance.groundAnchor!.y,
      });
    }
  });
  it('keeps four original infantry views lazy with truthful registered-source chains and actual renderer frames', () => {
    for (const [direction, spec] of Object.entries(ARMY_BODY_ART)) {
      expect(spec.assetId).toBe(`texture.army.infantry-${direction}-v1`);
      const entry = generated.find((asset) => asset.id === spec.assetId)!;
      expect(entry).toBeDefined();
      expect(FIRST_SCREEN_ASSET_IDS).not.toContain(entry.id);
      const provenance = loadProvenance(entry);
      expect(provenance.license).toBe('project-original');
      expect(provenance.referencedImages).toEqual(
        direction === 'east'
          ? ['public/assets/textures/castle-main-plain-v1.png']
          : [
              'public/assets/textures/army-infantry-east-v1.png',
              'public/assets/textures/castle-main-plain-v1.png',
            ],
      );
      verifyReferences(provenance.referencedImages);
      const bounds = provenance.visibleContentBounds!;
      expect(spec.contentBounds).toEqual({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      expect(provenance.groundAnchor?.method).toContain('authored foremost-foot baseline');
      expect(provenance.groundAnchor?.method).toContain('not a gameplay coordinate');
      expect(spec.groundAnchor).toEqual({
        x: provenance.groundAnchor!.x,
        y: provenance.groundAnchor!.y,
      });
    }
  });
  it('keeps original castle art lazy with an explicitly authored, not pixel-inferred, ground anchor', () => {
    for (const id of ['texture.castle.main-plain-v1', 'texture.castle.main-mountain-v1']) {
      const entry = generated.find((e) => e.id === id)!;
      expect(entry).toBeDefined();
      expect(FIRST_SCREEN_ASSET_IDS).not.toContain(id);
      const provenance = loadProvenance(entry);
      expect(provenance.groundAnchor?.method).toContain('authored footprint center');
      expect(provenance.groundAnchor?.method).toContain('not a gameplay coordinate');
      expect(provenance.visibleContentBounds).toBeDefined();
      const spec = Object.values(CASTLE_BODY_ART).find((art) => art.assetId === entry.id);
      expect(spec).toBeDefined();
      const bounds = provenance.visibleContentBounds!;
      expect(spec!.contentBounds).toEqual({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      // Metadata consistency only: the anchor itself was visually authored, not pixel-derived.
      expect(spec!.groundAnchor).toEqual({
        x: provenance.groundAnchor!.x,
        y: provenance.groundAnchor!.y,
      });
    }
  });
  it('keeps directional variants lazy and rejects a forged visible-content frame', () => {
    for (const id of [
      'texture.terrain.mountain-horizontal-v3',
      'texture.terrain.mountain-vertical-v4',
      'texture.terrain.mountain-vertical-v5',
      'texture.terrain.mountain-foothills-v1',
      'texture.terrain.mountain-akaishi-massif-v1',
      'texture.terrain.mountain-akaishi-massif-v2',
      'texture.terrain.mountain-akaishi-massif-v3',
      'texture.terrain.mountain-aso-massif-v1',
      'texture.terrain.mountain-echigo-massif-v1',
      'texture.terrain.mountain-chugoku-massif-v1',
      'texture.terrain.mountain-shikoku-massif-v1',
      'texture.terrain.mountain-kii-massif-v1',
      'texture.terrain.mountain-kiso-massif-v1',
      'texture.terrain.mountain-horizontal-v2',
      'texture.terrain.mountain-vertical-v2',
    ]) {
      const entry = generated.find((e) => e.id === id)!;
      expect(entry).toBeDefined();
      expect(FIRST_SCREEN_ASSET_IDS).not.toContain(id);
      const provenance = loadProvenance(entry);
      expect(provenance.visibleContentBounds).toBeDefined();
      const bounds = provenance.visibleContentBounds!;
      expect(buildTerrainPack().mountainArtContentBounds?.[entry.id]).toEqual({
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      });
      provenance.visibleContentBounds!.width++;
      expect(() => verify(entry, provenance)).toThrow();
    }
  });
  it('retains directional defaults with original Ibuki, Akaishi, Aso and Echigo variants', () => {
    expect(generated.some((entry) => entry.id === 'texture.terrain.mountain-horizontal-v4')).toBe(
      false,
    );
    expect(buildTerrainPack().mountainArtVariants).toEqual({
      horizontal: 'texture.terrain.mountain-horizontal-v3',
      vertical: 'texture.terrain.mountain-vertical-v4',
    });
    expect(buildTerrainPack().mountainArtById).toEqual({
      'mt.hida': 'texture.terrain.mountain-hida-massif-v2',
      'mt.ibuki': 'texture.terrain.mountain-foothills-v1',
      'mt.kiso': 'texture.terrain.mountain-kiso-massif-v1',
      'mt.akaishi': 'texture.terrain.mountain-akaishi-massif-v3',
      'mt.kyushu-aso': 'texture.terrain.mountain-aso-massif-v1',
      'mt.suzuka': 'texture.terrain.mountain-vertical-v5',
      'mt.echigo': 'texture.terrain.mountain-echigo-massif-v1',
      'mt.chugoku': 'texture.terrain.mountain-chugoku-massif-v1',
      'mt.shikoku': 'texture.terrain.mountain-shikoku-massif-v1',
      'mt.kii': 'texture.terrain.mountain-kii-massif-v1',
    });
    expect(generated.some((entry) => entry.id === 'texture.terrain.mountain-vertical-v3')).toBe(
      false,
    );
    expect(
      loadProvenance(
        generated.find((entry) => entry.id === 'texture.terrain.mountain-horizontal-v3')!,
      ).referencedImages,
    ).toEqual([]);
  });
  it('keeps opaque ground materials lazy and rejects wrong transparency flags against real pixels', () => {
    const grass = generated.find((e) => e.id === 'texture.terrain.ground-grass-v1')!;
    expect(grass).toBeDefined();
    expect(FIRST_SCREEN_ASSET_IDS).not.toContain(grass.id);
    expect(loadProvenance(grass).transparentBackgroundRequested).toBe(false);
    const transparent = generated.find((e) => e.id === 'texture.terrain.forest-canopy-v1')!;
    const woodland = generated.find((e) => e.id === 'texture.terrain.woodland-material-v1')!;
    expect(woodland).toBeDefined();
    expect(FIRST_SCREEN_ASSET_IDS).not.toContain(woodland.id);
    expect(loadProvenance(woodland).transparentBackgroundRequested).toBe(false);
    expect(loadProvenance(woodland).referencedImages).toEqual([]);
    const field = generated.find((e) => e.id === 'texture.terrain.lowland-field-material-v1')!;
    expect(field).toBeDefined();
    expect(FIRST_SCREEN_ASSET_IDS).not.toContain(field.id);
    expect(loadProvenance(field).transparentBackgroundRequested).toBe(false);
    expect(loadProvenance(field).referencedImages).toEqual([]);
    for (const entry of [grass, woodland, field, transparent]) {
      const provenance = loadProvenance(entry);
      provenance.transparentBackgroundRequested = !provenance.transparentBackgroundRequested;
      expect(() => verify(entry, provenance)).toThrow();
    }
  });
  it('rejects a missing provenance file without changing the manifest or asset', () => {
    expect(() =>
      loadProvenance({ ...generated[0]!, sourceUrl: 'assets/generated/missing.provenance.json' }),
    ).toThrow();
  });
  it.each(['sha256', 'dimensions', 'generator', 'prompt'] as const)(
    'rejects tampered %s provenance',
    (field) => {
      const entry = generated[0]!;
      const provenance = loadProvenance(entry);
      if (field === 'sha256') provenance.sha256 = '0'.repeat(64);
      if (field === 'dimensions') provenance.dimensions.width++;
      if (field === 'generator') provenance.generator = 'unverified-generator';
      if (field === 'prompt') provenance.prompt = '';
      expect(() => verify(entry, provenance)).toThrow();
    },
  );
});

describe('own-only repository reference-chain qualification', () => {
  const reference = 'public/assets/textures/castle-main-plain-v1.png';
  const sidecar = 'assets/generated/castle-main-plain-v1.provenance.json';
  it('requires the real retained Akaishi original and rejects an omitted or forged edit reference', () => {
    const entry = generated.find(
      (asset) => asset.id === 'texture.terrain.mountain-akaishi-massif-v1',
    )!;
    expect(entry).toBeDefined();
    const provenance = loadProvenance(entry);
    verify(entry, provenance);
    const retained = provenance.referencedImages[0]!;
    const retainedSidecar = retained.replace(/\.png$/, '.provenance.json');
    for (const missing of [retained, retainedSidecar]) {
      expect(() =>
        verifyReferences([retained], (path) => {
          if (path === missing) throw Error('missing retained evidence');
          return readFileSync(repoFile(path));
        }),
      ).toThrow();
    }
    expect(() => verify(entry, { ...provenance, referencedImages: [] })).toThrow();
    expect(() => verify(entry, { ...provenance, referencedImages: [reference] })).toThrow();
  });
  it('accepts an existing real original source and a source-less procedural original leaf', () => {
    verifyReferences([reference, 'public/assets/textures/washi-base@1x.png']);
  });
  it('qualifies a retained-source sidecar only with original license and a verified own reference chain (reader fixture)', () => {
    const retained = 'assets/generated/source-images/diagnostic-original-v1.png';
    const retainedSidecar = retained.replace(/\.png$/, '.provenance.json');
    const provenance = JSON.parse(readFileSync(repoFile(sidecar), 'utf8')) as GenerationProvenance;
    provenance.asset = retained;
    provenance.license = 'project-original';
    provenance.referencedImages = [reference];
    const read = (path: string): Buffer => {
      if (path === retained) return readFileSync(repoFile(reference));
      if (path === retainedSidecar) return Buffer.from(JSON.stringify(provenance));
      return readFileSync(repoFile(path));
    };
    // No files are fabricated in the repository: this exercises the optional retained-source reader contract.
    verifyReferences([retained], read);
    provenance.license = 'cc-by-4.0';
    expect(() => verifyReferences([retained], read)).toThrow();
  });
  it.each([
    'https://example.com/image.png',
    '/private/tmp/image.png',
    '../image.png',
    'assets/generated/unknown.png',
  ])('rejects unqualified reference %s', (path) =>
    expect(() => verifyReferences([path])).toThrow(),
  );
  it.each(['png', 'sidecar'] as const)('rejects missing %s evidence', (kind) => {
    const missing = kind === 'png' ? reference : sidecar;
    expect(() =>
      verifyReferences([reference], (path) => {
        if (path === missing) throw Error('missing evidence');
        return readFileSync(repoFile(path));
      }),
    ).toThrow();
  });
  it('rejects a source whose manifest declares external authorship', () => {
    const manifest = VISUAL_ASSET_MANIFEST.map((entry) =>
      `public/${entry.runtimePath}` === reference
        ? { ...entry, license: 'cc-by-4.0' as const }
        : entry,
    );
    expect(() => verifyReferences([reference], undefined, manifest)).toThrow();
  });
  it.each(['sha256', 'dimensions', 'generator', 'cycle'] as const)(
    'rejects %s drift in a referenced sidecar',
    (field) => {
      const provenance = JSON.parse(
        readFileSync(repoFile(sidecar), 'utf8'),
      ) as GenerationProvenance;
      if (field === 'sha256') provenance.sha256 = '0'.repeat(64);
      if (field === 'dimensions') provenance.dimensions.width++;
      if (field === 'generator') provenance.generator = 'unknown';
      if (field === 'cycle') provenance.referencedImages = [reference];
      expect(() =>
        verifyReferences([reference], (path) =>
          path === sidecar ? Buffer.from(JSON.stringify(provenance)) : readFileSync(repoFile(path)),
        ),
      ).toThrow();
    },
  );
});
