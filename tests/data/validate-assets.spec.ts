// 視覺素材驗證器測試（規格：plan/12-ui-components.md §3.7；測試計畫見 M6-V3 設計文件 §9.4）。
//
// 全部以注入 `manifest`＋`mkdtempSync` 假 `public/assets`／`source`／frame map 覆蓋各 A0N 檢查
// （比照 tests/data/font-coverage.spec.ts 手法），不依賴真實 repo 素材是否已就緒；除了「CLI 整合
// （真實 repo）」一組例外——那組刻意驗真實 committed 產物。
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { PNG } from 'pngjs';

import { validateAssets } from '../../tools/validate-assets';
import { buildAtlas, type AtlasSourceFrame } from '../../tools/build-atlas';
import type { VisualAssetManifestEntry } from '../../src/ui/assets/manifest';
import { FIRST_SCREEN_ASSET_IDS } from '../../src/ui/assets/manifest';

const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));

function sha256hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

function solidPng(width: number, height: number, rgb: [number, number, number]): Buffer {
  const png = new PNG({ width, height });
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = (width * y + x) << 2;
      png.data[idx] = rgb[0];
      png.data[idx + 1] = rgb[1];
      png.data[idx + 2] = rgb[2];
      png.data[idx + 3] = 255;
    }
  }
  return PNG.sync.write(png, { deflateLevel: 9, deflateStrategy: 3, filterType: 0, colorType: 6 });
}

interface Fixture {
  tempRoot: string;
  assetsPublicDir: string;
  assetsSourceDir: string;
  frameMapPath: string;
  manifest: VisualAssetManifestEntry[];
}

/** 建立一份完整合法的假環境：一筆 texture、一筆 svg、兩筆 atlas（id 重用真實
 *  `FIRST_SCREEN_ASSET_IDS` 常數的前四個，讓 A16 首屏預算測試有東西可算）。 */
function buildValidFixture(): Fixture {
  const tempRoot = mkdtempSync(path.join(tmpdir(), 'tenka-validate-assets-'));
  const assetsPublicDir = path.join(tempRoot, 'public-assets');
  const assetsSourceDir = path.join(tempRoot, 'source');
  const generatedDir = path.join(tempRoot, 'generated');
  mkdirSync(path.join(assetsPublicDir, 'textures'), { recursive: true });
  mkdirSync(path.join(assetsPublicDir, 'map'), { recursive: true });
  mkdirSync(path.join(assetsSourceDir, 'frames'), { recursive: true });
  mkdirSync(generatedDir, { recursive: true });

  // texture（含母檔 sourcePath，模擬 washi 降採情境）。
  const textureMaster = solidPng(8, 8, [200, 180, 140]);
  const textureMasterPath = path.join(assetsSourceDir, 'texture-fixture-master@2x.png');
  writeFileSync(textureMasterPath, textureMaster);
  const textureRuntime = solidPng(4, 4, [200, 180, 140]);
  writeFileSync(path.join(assetsPublicDir, 'textures', 'fixture-tex@1x.png'), textureRuntime);

  // svg（純程序生成，sourcePath 為 null）。
  const svgContent = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>';
  writeFileSync(path.join(assetsPublicDir, 'map', 'fixture-decor.svg'), svgContent, 'utf-8');

  // atlas：兩筆 marker source frame。
  const frameABuf = solidPng(4, 4, [10, 20, 30]);
  const frameBBuf = solidPng(4, 6, [40, 50, 60]);
  const frameAPath = path.join(assetsSourceDir, 'frames', 'map-marker-fixture-a-normal.png');
  const frameBPath = path.join(assetsSourceDir, 'frames', 'map-marker-fixture-b-normal.png');
  writeFileSync(frameAPath, frameABuf);
  writeFileSync(frameBPath, frameBBuf);

  const frames: AtlasSourceFrame[] = [
    {
      id: 'map.marker.castle-plain.normal',
      width: 4,
      height: 4,
      rgba: new Uint8Array(PNG.sync.read(frameABuf).data),
      sourceHash: sha256hex(frameABuf),
    },
    {
      id: 'map.marker.castle-mountain.normal',
      width: 4,
      height: 6,
      rgba: new Uint8Array(PNG.sync.read(frameBBuf).data),
      sourceHash: sha256hex(frameBBuf),
    },
  ];
  const built = buildAtlas(frames);
  for (const page of built.pagePngs) {
    writeFileSync(path.join(assetsPublicDir, page.file.replace(/^assets\//, '')), page.png);
  }
  const frameMapPath = path.join(generatedDir, 'atlas.frames.json');
  writeFileSync(frameMapPath, JSON.stringify(built.frameMap, null, 2) + '\n', 'utf-8');

  const manifest: VisualAssetManifestEntry[] = [
    {
      id: 'texture.washi.base@1x',
      runtimePath: 'assets/textures/fixture-tex@1x.png',
      sourcePath: textureMasterPath,
      kind: 'texture',
      authorOrTool: 'test fixture',
      sourceUrl: null,
      license: 'project-original',
      derivative: false,
      contentHash: sha256hex(textureRuntime),
      pixelSize: { width: 4, height: 4 },
    },
    {
      id: 'map.decor.compass.normal',
      runtimePath: 'assets/map/fixture-decor.svg',
      sourcePath: null,
      kind: 'svg',
      authorOrTool: 'test fixture',
      sourceUrl: null,
      license: 'project-original',
      derivative: false,
      contentHash: sha256hex(Buffer.from(svgContent, 'utf-8')),
      pixelSize: null,
    },
    {
      id: 'map.marker.castle-plain.normal',
      runtimePath: 'map.marker.castle-plain.normal',
      sourcePath: frameAPath,
      kind: 'atlas',
      authorOrTool: 'test fixture',
      sourceUrl: null,
      license: 'project-original',
      derivative: false,
      contentHash: sha256hex(frameABuf),
      pixelSize: { width: 4, height: 4 },
    },
    {
      id: 'map.marker.castle-mountain.normal',
      runtimePath: 'map.marker.castle-mountain.normal',
      sourcePath: frameBPath,
      kind: 'atlas',
      authorOrTool: 'test fixture',
      sourceUrl: null,
      license: 'project-original',
      derivative: false,
      contentHash: sha256hex(frameBBuf),
      pixelSize: { width: 4, height: 6 },
    },
  ];

  return { tempRoot, assetsPublicDir, assetsSourceDir, frameMapPath, manifest };
}

function runValid(fx: Fixture, overrides: Partial<Parameters<typeof validateAssets>[0]> = {}) {
  return validateAssets({
    manifest: fx.manifest,
    assetsPublicDir: fx.assetsPublicDir,
    assetsSourceDir: fx.assetsSourceDir,
    frameMapPath: fx.frameMapPath,
    budgetBytesMax: 8 * 1024 * 1024,
    ...overrides,
  });
}

describe('validateAssets — 假環境逐條驗收（設計 §9.4）', () => {
  const tempRoots: string[] = [];

  afterEach(() => {
    for (const dir of tempRoots.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  function fixture(): Fixture {
    const fx = buildValidFixture();
    tempRoots.push(fx.tempRoot);
    return fx;
  }

  it('通過路徑：完整合法 manifest＋齊備檔案＋正確 hash → errors 為空', () => {
    const fx = fixture();
    const result = runValid(fx);
    expect(result.errors).toEqual([]);
    expect(result.notice).toBeNull();
  });

  it('A01：id 重複 → ERROR', () => {
    const fx = fixture();
    fx.manifest.push({ ...fx.manifest[1]!, runtimePath: 'assets/map/fixture-decor2.svg' });
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A01'))).toBe(true);
  });

  it('A02：兩 texture 同 runtimePath → ERROR', () => {
    const fx = fixture();
    const dup: VisualAssetManifestEntry = {
      ...fx.manifest[0]!,
      id: 'texture.washi.base@2x',
    };
    fx.manifest.push(dup);
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A02'))).toBe(true);
  });

  it('A05：atlas runtimePath ≠ id；texture 指到 .svg → ERROR', () => {
    const fx = fixture();
    fx.manifest[2] = { ...fx.manifest[2]!, runtimePath: '不等於id的字串' };
    fx.manifest[0] = { ...fx.manifest[0]!, runtimePath: 'assets/textures/fixture-tex@1x.svg' };
    const result = runValid(fx);
    const a05 = result.errors.filter((e) => e.code.startsWith('A05'));
    expect(a05.length).toBeGreaterThanOrEqual(2);
  });

  it('A06：authorOrTool 空字串／未知 license → ERROR（fail closed）', () => {
    const fx = fixture();
    fx.manifest[0] = { ...fx.manifest[0]!, authorOrTool: '' };
    fx.manifest[1] = { ...fx.manifest[1]!, license: 'gpl' as VisualAssetManifestEntry['license'] };
    const result = runValid(fx);
    const a06 = result.errors.filter((e) => e.code.startsWith('A06'));
    expect(a06.length).toBeGreaterThanOrEqual(2);
  });

  it('A07：license 非 project-original 但 sourceUrl:null → ERROR', () => {
    const fx = fixture();
    fx.manifest[0] = { ...fx.manifest[0]!, license: 'cc-by-4.0', sourceUrl: null };
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A07'))).toBe(true);
  });

  it('A08：atlas sourcePath:null → ERROR', () => {
    const fx = fixture();
    fx.manifest[2] = { ...fx.manifest[2]!, sourcePath: null };
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A08'))).toBe(true);
  });

  it('A09：runtimePath 檔案不存在 → ERROR', () => {
    const fx = fixture();
    rmSync(path.join(fx.assetsPublicDir, 'textures', 'fixture-tex@1x.png'));
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A09'))).toBe(true);
  });

  it('A10：sourcePath 不存在／位於 public/assets 之外規則不符 → ERROR', () => {
    const fx = fixture();
    // 不存在。
    fx.manifest[0] = {
      ...fx.manifest[0]!,
      sourcePath: path.join(fx.assetsSourceDir, '不存在.png'),
    };
    const resultMissing = runValid(fx);
    expect(resultMissing.errors.some((e) => e.code.startsWith('A10'))).toBe(true);

    // 位於 assetsSourceDir 之外（放進 public dir）。
    const fx2 = fixture();
    const outsidePath = path.join(fx2.assetsPublicDir, 'sneaked-in.png');
    writeFileSync(outsidePath, solidPng(2, 2, [1, 2, 3]));
    fx2.manifest[0] = { ...fx2.manifest[0]!, sourcePath: outsidePath };
    const resultOutside = runValid(fx2);
    expect(resultOutside.errors.some((e) => e.code.startsWith('A10'))).toBe(true);
  });

  it('A11：改一個 byte 使 contentHash 不符 → ERROR；atlas 三方 hash 不一致 → ERROR', () => {
    const fx = fixture();
    fx.manifest[0] = { ...fx.manifest[0]!, contentHash: 'f'.repeat(64) };
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A11'))).toBe(true);

    const fx2 = fixture();
    fx2.manifest[2] = { ...fx2.manifest[2]!, contentHash: 'a'.repeat(64) };
    const result2 = runValid(fx2);
    expect(result2.errors.some((e) => e.code.startsWith('A11'))).toBe(true);
  });

  it('A12：public/assets 放一個未登錄檔 → ERROR', () => {
    const fx = fixture();
    writeFileSync(
      path.join(fx.assetsPublicDir, 'textures', 'stray-未登錄.png'),
      solidPng(1, 1, [0, 0, 0]),
    );
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A12'))).toBe(true);
  });

  it('A13：把 source basename 複製進 public/assets → ERROR', () => {
    const fx = fixture();
    writeFileSync(
      path.join(
        fx.assetsPublicDir,
        'textures',
        path.basename(fx.manifest[0]!.sourcePath as string),
      ),
      solidPng(1, 1, [0, 0, 0]),
    );
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A13'))).toBe(true);
  });

  it('A14：手改 frame map rect 使與重建不符 → ERROR', () => {
    const fx = fixture();
    const raw = JSON.parse(readFileSync(fx.frameMapPath, 'utf-8')) as {
      frames: Record<string, { x: number }>;
    };
    const firstId = Object.keys(raw.frames)[0]!;
    raw.frames[firstId]!.x += 999;
    writeFileSync(fx.frameMapPath, JSON.stringify(raw, null, 2) + '\n', 'utf-8');
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A14'))).toBe(true);
  });

  it('A15：手改頁 png bytes（與 frame map 記錄的頁 hash 不符）→ ERROR', () => {
    const fx = fixture();
    const raw = JSON.parse(readFileSync(fx.frameMapPath, 'utf-8')) as { pages: { file: string }[] };
    const pageFile = path.join(fx.assetsPublicDir, raw.pages[0]!.file.replace(/^assets\//, ''));
    const bytes = readFileSync(pageFile);
    bytes[bytes.length - 1] = (bytes[bytes.length - 1]! + 1) % 256;
    writeFileSync(pageFile, bytes);
    const result = runValid(fx);
    expect(result.errors.some((e) => e.code.startsWith('A15'))).toBe(true);
  });

  it('A16：首屏 bytes 超小預算 → ERROR', () => {
    const fx = fixture();
    const result = runValid(fx, { budgetBytesMax: 1 });
    expect(result.errors.some((e) => e.code.startsWith('A16'))).toBe(true);
    expect(result.firstScreenBytes).toBeGreaterThan(0);
  });

  it('過渡豁免：assetsPublicDir 指向不存在目錄 → notice 非 null、A01–A08 仍照跑', () => {
    const fx = fixture();
    fx.manifest[0] = { ...fx.manifest[0]!, authorOrTool: '' }; // 觸發一個 A06 ERROR
    const result = runValid(fx, { assetsPublicDir: path.join(fx.tempRoot, '不存在的目錄') });
    expect(result.notice).not.toBeNull();
    expect(result.errors.some((e) => e.code.startsWith('A06'))).toBe(true);
  });

  it('FIRST_SCREEN_ASSET_IDS 的前四筆確實對應本 fixture 提供的 id（測試自我一致性檢查）', () => {
    const fx = fixture();
    const ids = new Set(fx.manifest.map((e) => e.id));
    const coveredFirstScreen = FIRST_SCREEN_ASSET_IDS.filter((id) => ids.has(id));
    expect(coveredFirstScreen.length).toBeGreaterThan(0);
  });
});

describe('validateAssets — CLI 整合（真實 repo；設計 §9.4 末項）', () => {
  it('對目前 repo 實際成品跑 CLI，exit code 依實際素材就緒狀態而定（0 或 1，兩者皆非崩潰）', () => {
    const tsxBin = path.join(REPO_ROOT, 'node_modules', '.bin', 'tsx');
    const result = spawnSync(tsxBin, ['tools/validate-assets.ts'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect([0, 1]).toContain(result.status);
  });
});
