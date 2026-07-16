// 視覺素材 runtime manifest（規格：plan/12-ui-components.md §3.7）。
// 純資料＋純函式：禁止 import pixi.js／node:*／DOM——本檔同時被 src/ui（瀏覽器 loader）與
// tools/（Node 驗證與打包）消費，必須是零副作用、跨環境可 import 的模組。
//
// M6-V3 設計文件 §3.1（canonical，逐字對照）；補遺 AD1 覆寫 compass 條目的生成方式與署名。

/** §3.7 逐字介面（不得增刪欄位或改型別）。 */
export interface VisualAssetManifestEntry {
  id: string; // 例 map.castle.mountain.normal
  runtimePath: string; // atlas frame 或 production asset path
  sourcePath: string | null; // 工作檔；無工作檔時為 null
  kind: 'svg' | 'atlas' | 'texture';
  authorOrTool: string; // 作者或生成工具／模型
  sourceUrl: string | null; // 自繪可為 null；外部來源必填
  license: 'project-original' | 'cc0' | 'cc-by-4.0' | 'compatible-other';
  derivative: boolean;
  contentHash: string;
  pixelSize: { width: number; height: number } | null;
}

/** 四值授權列舉（validate-assets 以此為白名單，未知值一律阻斷）。 */
export const VALID_LICENSES = [
  'project-original',
  'cc0',
  'cc-by-4.0',
  'compatible-other',
] as const satisfies readonly VisualAssetManifestEntry['license'][];

/** id 格式：點分階層，全小寫、每段 kebab-case，允許 @<n>x 縮放後綴。 */
export const ASSET_ID_RE = /^[a-z0-9]+(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)+(?:@[0-9]+x)?$/;

/** 檔名 stem 格式：{domain}-{subject}-{variant}@{scale}，全小寫 kebab-case。 */
export const ASSET_FILENAME_STEM_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:@[0-9]+x)?$/;

/** 禁止的無語意檔名 token（§3.7）；比對規則見補遺 AD2：去掉 @<n>x 後綴後以 '-' 切段、逐段完全比對。 */
export const FORBIDDEN_NAME_TOKENS = ['final2', 'final', 'new', 'copy', 'tmp', 'temp'] as const;

/** M6-V3 交付的真實素材（裁決 D1，見設計 §7）。順序不影響 build-atlas（其自行按 D5 排序）。
 *  五筆 contentHash 已於 `npm run gen:assets` 產生實際檔案後，以 node:crypto sha256 計算並填入
 *  （補遺 AD7：不留 '' 佔位，由 Slice A 直接完成）。 */
export const VISUAL_ASSET_MANIFEST: readonly VisualAssetManifestEntry[] = [
  {
    id: 'texture.washi.base@1x',
    runtimePath: 'assets/textures/washi-base@1x.png',
    sourcePath: 'tools/assets/visual/source/texture-washi-base-master@2x.png',
    kind: 'texture',
    authorOrTool: 'tools/gen-assets.ts（程序生成，washi300 色盤和紙雜訊 tile）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: '63945837177fa786052d215d7829cfc4d5f28670d5b2d781ab8f21cabce39dc7',
    pixelSize: { width: 256, height: 256 },
  },
  {
    id: 'map.decor.compass.normal',
    runtimePath: 'assets/map/compass.svg',
    sourcePath: null,
    kind: 'svg',
    // AD1：改為程序生成（非手繪），署名依補遺逐字採用。
    authorOrTool: 'tools/gen-assets.ts（程序生成，原創方位盤 SVG）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'c4884aa400e15c0c91d2b094c657ad186f95f5a2274372bdf339cfe8cd07f8c5',
    pixelSize: null,
  },
  {
    id: 'map.marker.castle-plain.normal',
    runtimePath: 'map.marker.castle-plain.normal', // atlas frame key（＝id，見 §3.4）
    sourcePath: 'tools/assets/visual/source/frames/map-marker-castle-plain-normal.png',
    kind: 'atlas',
    authorOrTool: 'tools/gen-assets.ts（程序生成，平城占位標記幾何 glyph）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'f80ed6d497d82338f960584e64629b62511e0254c24874687c77699140c80bb5',
    pixelSize: { width: 64, height: 64 },
  },
  {
    id: 'map.marker.castle-mountain.normal',
    runtimePath: 'map.marker.castle-mountain.normal',
    sourcePath: 'tools/assets/visual/source/frames/map-marker-castle-mountain-normal.png',
    kind: 'atlas',
    authorOrTool: 'tools/gen-assets.ts（程序生成，山城占位標記幾何 glyph）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'b5f1992aef1c810c1cc0653a3053e8767daf6beefd777b605abbb797f96f9594',
    pixelSize: { width: 64, height: 64 },
  },
  {
    id: 'map.marker.army-banner.normal',
    runtimePath: 'map.marker.army-banner.normal',
    sourcePath: 'tools/assets/visual/source/frames/map-marker-army-banner-normal.png',
    kind: 'atlas',
    authorOrTool: 'tools/gen-assets.ts（程序生成，軍隊旗型占位 glyph）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'c1b0cb7949393b06899d1aee53d7fe506123c5c9195426c2752c72a2825fce24',
    pixelSize: { width: 48, height: 64 },
  },
  {
    id: 'texture.terrain.relief@1x',
    runtimePath: 'assets/textures/terrain-relief@1x.png',
    sourcePath: null,
    kind: 'texture',
    authorOrTool: 'tools/gen-assets.ts（程序生成，紙雕分層山脈／平原／海岸內陰影 relief）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'cce889580b0c6bdafd6e2330e303c9ba18fe1bafdcbd8222b97781817b2b8dd2',
    pixelSize: { width: 2048, height: 2048 },
  },
  {
    id: 'texture.terrain.forest@1x',
    runtimePath: 'assets/textures/terrain-forest@1x.png',
    sourcePath: null,
    kind: 'texture',
    authorOrTool: 'tools/gen-assets.ts（程序生成，森林群塊冠幅 forest）',
    sourceUrl: null,
    license: 'project-original',
    derivative: false,
    contentHash: 'f3201c3f6516d74ecb2cbbf087b5a91fc6df999ed39d20c9c56a81daec6440c4',
    pixelSize: { width: 2048, height: 2048 },
  },
];

/** 首屏必要素材 id（裁決 D9）：其餘一律 lazy load。 */
export const FIRST_SCREEN_ASSET_IDS: readonly string[] = [
  'texture.washi.base@1x',
  'map.decor.compass.normal',
  'map.marker.castle-plain.normal',
  'map.marker.castle-mountain.normal',
  'map.marker.army-banner.normal',
  'texture.terrain.relief@1x',
  'texture.terrain.forest@1x',
];

/** id → entry（O(1) 查詢；loader 與 validate 共用）。 */
export function getManifestEntry(id: string): VisualAssetManifestEntry | undefined {
  return VISUAL_ASSET_MANIFEST.find((e) => e.id === id);
}
