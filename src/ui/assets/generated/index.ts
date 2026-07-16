// atlas frame map 型別與型別化匯入（規格：plan/12-ui-components.md §3.7；產物格式見
// M6-V3 設計文件 §3.5，型別介面逐字對照）。
//
// `atlas.frames.json` 本身由 `tools/build-atlas.ts` 的 CLI `main()` 產生／覆寫（checked-in，
// 裁決 D11）；平行開發期間（補遺 AD5）先 commit 合法形狀的占位值（`pages:[]`、`frames:{}`），
// 待 Slice A 的 source frame 落地後、整合階段跑一次 `npm run atlas:build` 覆寫為真實產物。
import raw from './atlas.frames.json';

/** atlas 分頁描述（單一分頁 PNG 的檔名／尺寸／內容雜湊）。 */
export interface AtlasPage {
  file: string;
  width: number;
  height: number;
  contentHash: string;
}

/** atlas frame 描述（單一素材在其所屬分頁內的矩形＋來源雜湊）。 */
export interface AtlasFrame {
  page: number;
  x: number;
  y: number;
  w: number;
  h: number;
  sourceHash: string;
}

/** atlas frame map 產物格式（checked-in，見 12 §3.7、設計文件 §3.5）。 */
export interface AtlasFrameMap {
  version: 1;
  generatedBy: string;
  pages: AtlasPage[];
  frames: Record<string, AtlasFrame>;
}

/** 型別化的 frame map 匯入；`tsconfig.json` 已開 `resolveJsonModule`，無需 `.ts` 產物退路。 */
export const ATLAS_FRAME_MAP: AtlasFrameMap = raw as AtlasFrameMap;
