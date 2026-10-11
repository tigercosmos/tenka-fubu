// CastleNameplate —— 城名牌場景元件（M6-V9b 定稿 §2，核心交付 A）。
//
// 規格：docs/design/m6-v9b-map-plates.md §2.1–§2.7／§2.10。原創和紙綬帶名牌，把「城名＋勢力
// 印記＋敵我通道＋兵數」收成一個 pixel-lock 小牌，取代 V9 城名裸標籤（城名由此移出 labelParts）。
// 印記識別欄的現行版面修訂見 art-bible §10.3；歷史 DD-A3 接點不再覆蓋文字。
//
// DD-A3 去同構構圖（§2.1，採納評審 Major 4；非新生名牌之描摹，art-bible §12.2）：
//   1. 城名前置（左）、兵數內嵌綬帶尾段（右）——不另起下掛 chip；
//   2. 勢力印記有獨立左側識別欄，不覆蓋城名或兵數；
//   3. 綬帶寬置中於節點（自 -ribbonW/2 起繪）。
//
// 敵我第二辨識通道（§2.4，art-bible §3.3 canonical；色弱下形態/端形/記號三通道皆成立）：
//   我方＝靛色帶＋ink900 雙環＋圓角＋home tick；友軍＝靛色帶＋單環＋圓角；
//   敵對＝朱色帶＋單環右上缺角＋左端尖角（右斜切）＋印記旁交叉墨記；
//   中立＝灰色帶＋單環空心（心不填色）＋平口＋左端空心菱形。
//
// 冪等 `update`（§2.9）：props（除 pos 外）未變則早退不重繪（比照 castleNode.samePropsExceptPos）；
// 位置＝(pos.x, pos.y + worldGap)（世界座標偏移；pixel-lock 反向縮放由整合層施於 container.scale）。
// 本檔不引入任何逐幀動畫；純繪製 helper 只用 Graphics/BitmapText 子集（供 node 測試 mock 錄製）。

import { BitmapText, Container, Graphics } from 'pixi.js';
import type { CastleTier } from '@core/state/enums';
import { clanColorNum, clanDyeNum, TOKENS_NUM } from '@ui/styles/tokens';
import type { ScenePart } from '@ui/components/types';
import type { LodStage } from '../lod';
import type { ArmyRelation } from '../mapViewTypes';
import type { CastleWarning } from './castleNode';
import {
  NAMEPLATE_GEOMETRY,
  NAMEPLATE_STYLE,
  nameplateTextStyle,
  nameplateMaterial,
  type NameplateGeometrySpec,
} from './nameplateStyle';

/** §2.10 定稿介面：名牌繪製 props（皆入冪等比較，pos 除外）。 */
export interface CastleNameplateProps {
  /** 節點世界座標（容器定位＝pos + (0, worldGap)；純繪製函式不消費本欄位）。 */
  readonly pos: { readonly x: number; readonly y: number };
  readonly name: string;
  readonly tier: CastleTier; // 'main' | 'branch'
  readonly colorIndex: number; // Clan.colorIndex 0..39（旗幟軌印記＋染紙軌暈）
  readonly relation: ArmyRelation; // 'friendly'|'neutral'|'enemy'
  readonly isPlayer: boolean; // 我方通道（雙環＋home tick）
  readonly warning: CastleWarning;
  readonly soldiers: number; // 兵數內嵌區
}

/** 名牌元件介面（ScenePart 加法擴充，§2.10／§3.4）。 */
export interface CastleNameplatePart extends ScenePart<CastleNameplateProps> {
  /** LOD 顯隱（§2.7）：far 全隱／mid 本城顯支城隱／near 全顯（切子物件 visible，不重繪）。 */
  setLodStage(stage: LodStage): void;
  /** §3.4 出陣目標高亮：切既繪金框子物件 visible（不重繪名牌本體、不進 nameplates 計數）。 */
  setTargetHighlight(on: boolean): void;
  /** 綬帶目前螢幕尺寸（CSS px；pixel-lock 後恆定）——供整合層 declutter AABB 佔格（§2.8）。 */
  getRibbonSize(): { w: number; h: number };
  /** Actual local text bounds plus painted seal envelope; not an opaque-pixel segmentation. */
  getContentGeometry(offset?: {
    x: number;
    y: number;
  }): { seal: ContentRect; name: ContentRect; troops: ContentRect } | null;
  /** Baseline local painted envelope, including shadows, relation glyphs and highlight. */
  getPaintBounds(): ContentRect;
  /** Authoritative full-detail producer geometry, independent of compact paint. */
  getOriginalPresentationGeometry(offset?: { x: number; y: number }): {
    readonly paint: ContentRect;
    readonly ribbon: { readonly w: number; readonly h: number };
    readonly content: { seal: ContentRect; name: ContentRect; troops: ContentRect } | null;
  };
  /** Presentation-only; preserves the original text nodes and full geometry. */
  setCompactPresentation(on: boolean): void;
  /** CSS-only displacement; the world container and interaction anchor never move. */
  setPresentationOffset(
    offset: { x: number; y: number },
    leader: { start: { x: number; y: number }; end: { x: number; y: number }; visible: boolean },
  ): void;
}
type ContentRect = { x: number; y: number; width: number; height: number };

/**
 * 兵數格式（§2.10）：單一規則跨所有 LOD——tabular numerals＋千分位（en-US），不縮寫、不混用
 * （art-bible §10）。0 兵時顯 '0'（不隱）。
 */
export function formatSoldierChip(soldiers: number): string {
  return Math.max(0, Math.round(soldiers)).toLocaleString('en-US');
}

/**
 * 綬帶動態寬（§2.1 公式）：`padX + nameW + divGapX*2 + troopDotR*2 + 2 + troopsW + padX`，
 * 下限 `ribbonMinW`。另保留關係帶、完整色章及專用字區間距。
 */
export function ribbonWidthFor(geo: NameplateGeometrySpec, nameW: number, troopsW: number): number {
  return Math.max(
    geo.ribbonMinW,
    geo.ribbonPadX +
      geo.relStripeW +
      geo.sealR * 2 +
      geo.sealTextGap +
      nameW +
      geo.divGapX * 2 +
      geo.troopDotR * 2 +
      2 +
      troopsW +
      geo.ribbonPadX,
  );
}

/** 關係色帶色（§2.4）：我方/友軍靛、敵朱、中立灰——色僅為增強，形態通道另行編碼。 */
function relationStripeColor(relation: ArmyRelation): number {
  if (relation === 'enemy') return TOKENS_NUM.accentVermilion;
  if (relation === 'neutral') return TOKENS_NUM.neutralClanless;
  return TOKENS_NUM.accentIndigo;
}

/**
 * 純繪製（§2.2-1..3／§2.5）：右下微投影 → 和紙綬帶底（α 恆 1.0，左端端形依 relation：圓角/
 * 尖角/平口）→ 頂緣分級暖紙提亮線 → 下緣染紙暈邊。綬帶自 y=0 向下、x 對稱展開（DD-A3-3）。
 */
export function drawRibbon(
  g: Graphics,
  geo: NameplateGeometrySpec,
  w: number,
  colorIndex: number,
  relation: ArmyRelation,
  tier: CastleTier = 'main',
  attention = false,
): void {
  const material = nameplateMaterial(tier, attention);
  const left = -w / 2;
  const right = w / 2;
  const h = geo.ribbonH;
  const r = geo.ribbonRadius;
  const off = NAMEPLATE_STYLE.shadowOffset;
  const stroke = { width: geo.inkHairline, color: TOKENS_NUM.ink900, alpha: material.outlineAlpha };
  // (1) 右下微投影（名牌 < HUD < modal 投影階序，art-bible §7）。
  g.roundRect(left + off, off, w, h, r).fill({
    color: TOKENS_NUM.ink900,
    alpha: material.shadowAlpha,
  });
  // (2) 不透明柔和紙底；左端端形仍為 CVD 端形通道（§2.4）。
  if (relation === 'enemy') {
    // 尖角（右斜切）：左上角向右內切 enemyCutX。
    g.poly([left + NAMEPLATE_STYLE.enemyCutX, 0, right, 0, right, h, left, h])
      .fill({ color: material.paperColor, alpha: material.paperAlpha })
      .stroke(stroke);
  } else if (relation === 'neutral') {
    // 平口：左端直角（右端維持圓角語彙從簡為直角多邊形，端形差異集中於左端）。
    g.poly([left, 0, right, 0, right, h, left, h])
      .fill({ color: material.paperColor, alpha: material.paperAlpha })
      .stroke(stroke);
  } else {
    g.roundRect(left, 0, w, h, r)
      .fill({ color: material.paperColor, alpha: material.paperAlpha })
      .stroke(stroke);
  }
  // (3) 左上柔光：綬帶頂緣 1px 分級暖紙提亮線（§2.5）。
  g.moveTo(left + r, 0.5)
    .lineTo(right - r, 0.5)
    .stroke({ width: 1, color: material.highlightColor, alpha: material.highlightAlpha });
  // (4) 染紙暈邊：下緣 dyeUnderlineH 高 clanDyeNum 薄帶（繫 territory 染紙軌）。
  g.rect(left + 1, h - 1 - geo.dyeUnderlineH, w - 2, geo.dyeUnderlineH).fill({
    color: clanDyeNum(colorIndex),
    alpha: 0.38,
  });
}

/**
 * 純繪製（§2.4）：關係通道——綬帶左內緣 relStripeW 豎帶（靛/朱/灰）＋中立左端小空心菱形記號。
 */
export function drawRelationChannel(
  g: Graphics,
  geo: NameplateGeometrySpec,
  w: number,
  relation: ArmyRelation,
): void {
  const left = -w / 2;
  const h = geo.ribbonH;
  const inset = relation === 'enemy' ? NAMEPLATE_STYLE.enemyCutX : 1;
  g.rect(left + inset, 1, geo.relStripeW, h - 2).fill({ color: relationStripeColor(relation) });
  if (relation === 'neutral') {
    // 中立附加記號：綬帶左端小空心菱形（3px）。
    const d = NAMEPLATE_STYLE.neutralDiamondR;
    const cx = left - d - 2;
    const cy = h / 2;
    g.poly([cx, cy - d, cx + d, cy, cx, cy + d, cx - d, cy]).stroke({
      width: 1,
      color: TOKENS_NUM.neutralClanless,
    });
  }
}

/**
 * 純繪製（§2.3／§2.4）：勢力印記具有獨立欄位；center 由名牌版面提供。
 * 旗幟軌 clanColorNum 填（中立空心不填色）＋ink900 環形態（雙環/單環/缺角/空心）＋tier 刻痕
 * （雙刻＝本城/單刻＝支城；M8-22 家紋 landed 後由 crestGlyph 換圖不換版）＋home tick/交叉墨記。
 */
export function drawSeal(
  g: Graphics,
  geo: NameplateGeometrySpec,
  tier: CastleTier,
  colorIndex: number,
  relation: ArmyRelation,
  isPlayer: boolean,
  center = { x: 0, y: 0 },
): void {
  const r = geo.sealR;
  const { x: cx, y: cy } = center;
  // 印記底：中立＝空心（washi 心，不填勢力色）；其餘＝旗幟軌填色。
  g.circle(cx, cy, r).fill({
    color: relation === 'neutral' ? TOKENS_NUM.washi100 : clanColorNum(colorIndex),
  });
  if (relation === 'enemy') {
    // 單環＋右上缺角（尖角語彙）：缺角置於 -π/4 方向、掃 sealNotchRad。
    const gapCenter = -Math.PI / 4;
    const gapHalf = NAMEPLATE_STYLE.sealNotchRad / 2;
    g.arc(cx, cy, r, gapCenter + gapHalf, gapCenter - gapHalf + Math.PI * 2).stroke({
      width: 1,
      color: TOKENS_NUM.ink900,
    });
    // 附加記號：印記旁小交叉墨記（2px）。
    const mx = cx + r + 3;
    const my = cy - r + 1;
    const s = NAMEPLATE_STYLE.crossMarkHalf;
    g.moveTo(mx - s, my - s)
      .lineTo(mx + s, my + s)
      .stroke({ width: 1, color: TOKENS_NUM.ink900 });
    g.moveTo(mx + s, my - s)
      .lineTo(mx - s, my + s)
      .stroke({ width: 1, color: TOKENS_NUM.ink900 });
  } else {
    g.circle(cx, cy, r).stroke({ width: 1, color: TOKENS_NUM.ink900 });
    if (isPlayer) {
      // 我方：ink900 雙環（友軍語彙）＋印記左上 3px 實心靛點（home tick）。
      g.circle(cx, cy, r - NAMEPLATE_STYLE.sealInnerRingInset).stroke({
        width: 1,
        color: TOKENS_NUM.ink900,
      });
      g.circle(cx - r * 0.7, cy - r * 0.7, NAMEPLATE_STYLE.homeTickR).fill({
        color: TOKENS_NUM.accentIndigo,
      });
    }
  }
  crestGlyph(g, tier, r, center);
}

/**
 * 印記中心圖形（§2.3 家紋佔位，DD-A2 swap 點）：M8-22 家紋渲染器 landed 後，以家紋 sprite
 * 換掉本函式之「tier 刻痕」中心圖形，印記幾何/位置不變（換圖不換版）。
 * 本城＝2 枚短墨橫刻（上下並列）；支城＝1 枚（ink900 α 0.6）。
 */
function crestGlyph(g: Graphics, tier: CastleTier, sealR: number, center = { x: 0, y: 0 }): void {
  const len = sealR * 0.55;
  const stroke = { width: 1.5, color: TOKENS_NUM.ink900, alpha: NAMEPLATE_STYLE.tierNotchAlpha };
  if (tier === 'main') {
    g.moveTo(center.x - len, center.y - 1.8)
      .lineTo(center.x + len, center.y - 1.8)
      .stroke(stroke);
    g.moveTo(center.x - len, center.y + 1.8)
      .lineTo(center.x + len, center.y + 1.8)
      .stroke(stroke);
  } else {
    g.moveTo(center.x - len, center.y)
      .lineTo(center.x + len, center.y)
      .stroke(stroke);
  }
}

/**
 * 純繪製（§2.2-6..7）：名/兵 ink 髮絲分隔豎線＋兵符點（兵數前導小記號）。兵數字本身為
 * BitmapText（工廠內定位，右對齊於綬帶尾段）；divX＝分隔線 x、dotX＝兵符點中心 x。
 */
export function drawTroops(
  g: Graphics,
  geo: NameplateGeometrySpec,
  divX: number,
  dotX: number,
  dividerAlpha = 1,
): void {
  const h = geo.ribbonH;
  g.moveTo(divX, 2)
    .lineTo(divX, h - 2)
    .stroke({ width: geo.inkHairline, color: TOKENS_NUM.ink900, alpha: dividerAlpha });
  g.circle(dotX, h / 2, geo.troopDotR).fill({ color: TOKENS_NUM.ink900 });
}

/** 告急小烽記（§2.6）：綬帶右端（兵數群之後）1 枚 accentVermilion 記號——「此城告急」名牌側索引。 */
function drawWarnMark(g: Graphics, geo: NameplateGeometrySpec, w: number): void {
  const x = w / 2 + NAMEPLATE_STYLE.warnMarkR + 2;
  const cy = geo.ribbonH / 2;
  const r = NAMEPLATE_STYLE.warnMarkR;
  g.poly([x - r, cy + r, x + r, cy + r, x, cy - r]).fill({ color: TOKENS_NUM.accentVermilion });
}

function samePropsExceptPos(a: CastleNameplateProps, b: CastleNameplateProps): boolean {
  return (
    a.name === b.name &&
    a.tier === b.tier &&
    a.colorIndex === b.colorIndex &&
    a.relation === b.relation &&
    a.isPlayer === b.isPlayer &&
    a.warning === b.warning &&
    a.soldiers === b.soldiers
  );
}

function samePos(a: CastleNameplateProps['pos'], b: CastleNameplateProps['pos']): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * 工廠（12 §4 ScenePart 加法擴充）：container（世界定位＝節點 pos + (0, worldGap)，pixel-lock
 * 反向縮放由整合層施加）＋子節點序 [gfx, nameText, troopsText, highlightGfx]——
 * `container.children[0] === gfx`（整合測試以 clear spy 觀測名牌重繪）。
 */
export function createCastleNameplate(): CastleNameplatePart {
  const container = new Container();
  container.label = 'castleNameplate';
  const gfx = new Graphics();
  const nameText = new BitmapText({
    text: '',
    style: nameplateTextStyle(NAMEPLATE_GEOMETRY.main.nameSize),
  });
  nameText.anchor.set(0, 0.5);
  const troopsText = new BitmapText({
    text: '',
    style: nameplateTextStyle(NAMEPLATE_GEOMETRY.main.troopNumSize, 'troops'),
  });
  troopsText.anchor.set(1, 0.5);
  const highlightGfx = new Graphics(); // §3.4 目標高亮金框（既繪、平時隱）
  highlightGfx.visible = false;
  container.addChild(gfx); // children[0]：綬帶/印記/通道（重繪觀測錨點）
  container.addChild(nameText); // children[1]：城名
  container.addChild(troopsText); // children[2]：兵數
  container.addChild(highlightGfx); // children[3]：目標高亮金框
  const leaderGfx = new Graphics();
  leaderGfx.visible = false;
  container.addChild(leaderGfx); // children[4]：位移名牌的錨點引線

  let last: CastleNameplateProps | null = null;
  let lastLodStage: LodStage = 'near';
  let targetHighlight = false;
  let ribbonW: number = NAMEPLATE_GEOMETRY.main.ribbonMinW;
  let ribbonH: number = NAMEPLATE_GEOMETRY.main.ribbonH;
  let sealCenter = { x: 0, y: 0 };
  let presentationOffset = { x: 0, y: 0 };
  let nameBaseline = { x: 0, y: 0 };
  let troopsBaseline = { x: 0, y: 0 };
  let leaderVisible = false;
  let leaderSignature = '';
  let compactPresentation = false;
  let lastCompactPaint = false;
  let originalGeometry: ReturnType<CastleNameplatePart['getOriginalPresentationGeometry']> | null =
    null;
  let originalContent: {
    seal: { x: number; y: number };
    radius: number;
    enemy: boolean;
    name: { baseline: { x: number; y: number }; bounds: ContentRect };
    troops: { baseline: { x: number; y: number }; bounds: ContentRect };
  } | null = null;
  const applyOffset = (): void => {
    gfx.position.set(presentationOffset.x, presentationOffset.y);
    highlightGfx.position.set(presentationOffset.x, presentationOffset.y);
    nameText.position.set(
      nameBaseline.x + presentationOffset.x,
      nameBaseline.y + presentationOffset.y,
    );
    troopsText.position.set(
      troopsBaseline.x + presentationOffset.x,
      troopsBaseline.y + presentationOffset.y,
    );
  };

  /** LOD 顯隱表（§2.7）：far 全隱／mid 本城顯／near 全顯（只切 visible，不重繪、不建毀）。 */
  const applyLod = (stage: LodStage): void => {
    lastLodStage = stage;
    const tier = last?.tier ?? 'branch';
    const shown = stage === 'near' || (stage === 'mid' && tier === 'main');
    gfx.visible = shown;
    nameText.visible = shown;
    troopsText.visible = shown;
    highlightGfx.visible = shown && targetHighlight;
    leaderGfx.visible = shown && leaderVisible;
  };

  const captureOriginal = (): void => {
    const content = part.getContentGeometry();
    const text = (label: BitmapText, baseline: { x: number; y: number }) => {
      const bounds = label.getLocalBounds();
      return {
        baseline: { ...baseline },
        bounds: {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
        },
      };
    };
    originalContent = last
      ? {
          seal: { ...sealCenter },
          radius: NAMEPLATE_GEOMETRY[last.tier].sealR,
          enemy: last.relation === 'enemy',
          name: text(nameText, nameBaseline),
          troops: text(troopsText, troopsBaseline),
        }
      : null;
    originalGeometry = Object.freeze({
      paint: Object.freeze(part.getPaintBounds()),
      ribbon: Object.freeze(part.getRibbonSize()),
      content:
        content &&
        Object.freeze({
          seal: Object.freeze({ ...content.seal }),
          name: Object.freeze({ ...content.name }),
          troops: Object.freeze({ ...content.troops }),
        }),
    });
  };
  const part: CastleNameplatePart = {
    container,
    update(props: CastleNameplateProps): void {
      // Warning information is authoritative at the part boundary, not only
      // after a renderer layout flush. Clearing it requires fresh admission.
      if (props.warning !== 'none') compactPresentation = false;
      const geo = NAMEPLATE_GEOMETRY[props.tier];
      if (last === null || !samePos(last.pos, props.pos) || last.tier !== props.tier) {
        container.position.set(props.pos.x, props.pos.y + geo.worldGap);
      }
      if (
        last !== null &&
        samePropsExceptPos(last, props) &&
        lastCompactPaint === compactPresentation
      ) {
        last = props;
        return; // 冪等早退（§2.9：sameNameplateProps 未變則不重繪）
      }
      if (compactPresentation && (last === null || !samePropsExceptPos(last, props))) {
        // Refresh the original actual producer first, never infer its envelope
        // from a shorter ribbon or allocate a second text/graphics owner.
        compactPresentation = false;
        part.update(props);
        captureOriginal();
        compactPresentation = true;
        part.update(props);
        return;
      }
      // 文字先行（量寬）：城名/兵數字級依 tier；綬帶動態寬由 BitmapText.width 量得（§2.1）。
      // Keep each label's private style/key on non-font redraws. Plain style
      // assignment allocates a new Pixi TextStyle and invalidates layout caches.
      if ((last?.tier ?? 'main') !== props.tier) {
        nameText.style = nameplateTextStyle(geo.nameSize);
        troopsText.style = nameplateTextStyle(geo.troopNumSize, 'troops');
      }
      nameText.text = props.name;
      troopsText.text = formatSoldierChip(props.soldiers);
      const nameW = nameText.width;
      const troopsW = troopsText.width;
      // Compact admission must retain both mandatory columns at their approved
      // font sizes and spacing. The full envelope is the smallest approved
      // ribbon that contains the seal, castle name and troop register.
      const w = ribbonWidthFor(geo, nameW, troopsW);
      ribbonW = w;
      ribbonH = geo.ribbonH;
      const left = -w / 2;
      const midY = geo.ribbonH / 2;
      // 投影→綬帶→關係通道→分隔/兵符→告急→獨立識別欄中的印記。
      gfx.clear();
      drawRibbon(
        gfx,
        geo,
        w,
        props.colorIndex,
        props.relation,
        props.tier,
        props.warning !== 'none',
      );
      drawRelationChannel(gfx, geo, w, props.relation);
      sealCenter = { x: left + geo.ribbonPadX + geo.relStripeW + geo.sealR, y: midY };
      const nameX = sealCenter.x + geo.sealR + geo.sealTextGap;
      const troopsRight = w / 2 - geo.ribbonPadX;
      const dotX = troopsRight - troopsW - 2 - geo.troopDotR;
      const divX = dotX - geo.troopDotR - geo.divGapX;
      // Reserve the numeric register inside the existing ribbon, above its unchanged clan-dye edge.
      const inset = NAMEPLATE_STYLE.troopRegisterInset;
      gfx
        .rect(
          divX + inset,
          inset,
          w / 2 - divX - 2 * inset,
          geo.ribbonH - geo.dyeUnderlineH - 2 * inset,
        )
        .fill({
          color: nameplateMaterial(props.tier, props.warning !== 'none').troopRegisterColor,
          alpha: nameplateMaterial(props.tier, props.warning !== 'none').registerAlpha,
        });
      drawTroops(
        gfx,
        geo,
        divX,
        dotX,
        nameplateMaterial(props.tier, props.warning !== 'none').dividerAlpha,
      );
      if (props.warning !== 'none') drawWarnMark(gfx, geo, w);
      drawSeal(gfx, geo, props.tier, props.colorIndex, props.relation, props.isPlayer, sealCenter);
      // 文字定位：城名接關係色帶右（anchor 0,0.5）；兵數右對齊綬帶尾段（anchor 1,0.5）。
      nameBaseline = { x: nameX, y: midY };
      troopsBaseline = { x: troopsRight, y: midY };
      applyOffset();
      // 目標高亮金框（§3.4）：隨綬帶寬重繪一次（開關只切 visible，不重繪）。
      const pad = NAMEPLATE_STYLE.targetHighlightPad;
      highlightGfx.clear();
      highlightGfx
        .roundRect(left - pad, -pad, w + pad * 2, geo.ribbonH + pad * 2, geo.ribbonRadius + 1)
        .stroke({ width: 1, color: TOKENS_NUM.accentGold });
      last = props;
      lastCompactPaint = compactPresentation;
      applyLod(lastLodStage); // 重繪後重套 LOD 顯隱，保持一致（比照 castleNode）。
      if (!compactPresentation) originalGeometry = null;
    },
    setLodStage(stage: LodStage): void {
      applyLod(stage);
    },
    setTargetHighlight(on: boolean): void {
      targetHighlight = on;
      if (on && compactPresentation) part.setCompactPresentation(false);
      if (!compactPresentation) originalGeometry = null;
      applyLod(lastLodStage);
    },
    setCompactPresentation(on: boolean): void {
      if (on && (targetHighlight || (last?.warning ?? 'none') !== 'none')) return;
      if (compactPresentation === on) return;
      if (on && last && !originalGeometry) captureOriginal();
      compactPresentation = on;
      if (last) part.update(last);
    },
    getOriginalPresentationGeometry(offset = presentationOffset) {
      if (!originalGeometry) captureOriginal();
      const geometry = originalGeometry!;
      const text = (value: NonNullable<typeof originalContent>['name']): ContentRect => ({
        ...value.bounds,
        // Literal original order: position = baseline + offset; bounds follow.
        x: value.baseline.x + offset.x + value.bounds.x,
        y: value.baseline.y + offset.y + value.bounds.y,
      });
      return {
        ...geometry,
        content: originalContent && {
          seal: {
            x: originalContent.seal.x + offset.x - originalContent.radius - 0.5,
            y: originalContent.seal.y + offset.y - originalContent.radius - 0.5,
            width: originalContent.radius * 2 + 1 + (originalContent.enemy ? 4 : 0),
            height: originalContent.radius * 2 + 1,
          },
          name: text(originalContent.name),
          troops: text(originalContent.troops),
        },
      };
    },
    getRibbonSize(): { w: number; h: number } {
      return { w: ribbonW, h: ribbonH };
    },
    setPresentationOffset(offset, leader): void {
      if (offset.x !== presentationOffset.x || offset.y !== presentationOffset.y) {
        presentationOffset = { ...offset };
        applyOffset();
      }
      const signature = JSON.stringify(leader);
      if (signature !== leaderSignature) {
        leaderSignature = signature;
        leaderGfx.clear();
        if (leader.visible)
          leaderGfx
            .moveTo(leader.start.x, leader.start.y)
            .lineTo(leader.end.x, leader.end.y)
            .stroke({ width: 1, color: TOKENS_NUM.ink900, alpha: NAMEPLATE_STYLE.leaderAlpha });
      }
      leaderVisible = leader.visible;
      applyLod(lastLodStage);
    },
    getPaintBounds(): ContentRect {
      const rects: ContentRect[] = [];
      if (typeof gfx.getLocalBounds === 'function') rects.push(gfx.getLocalBounds());
      else rects.push({ x: -ribbonW / 2 - 4, y: -4, width: ribbonW + 8, height: ribbonH + 8 });
      if (targetHighlight && typeof highlightGfx.getLocalBounds === 'function')
        rects.push(highlightGfx.getLocalBounds());
      for (const [text, baseline] of [
        [nameText, nameBaseline],
        [troopsText, troopsBaseline],
      ] as const) {
        const bounds = text.getLocalBounds();
        rects.push({
          x: bounds.x + baseline.x,
          y: bounds.y + baseline.y,
          width: bounds.width,
          height: bounds.height,
        });
      }
      const x = Math.min(...rects.map((r) => r.x)),
        y = Math.min(...rects.map((r) => r.y));
      return {
        x,
        y,
        width: Math.max(...rects.map((r) => r.x + r.width)) - x,
        height: Math.max(...rects.map((r) => r.y + r.height)) - y,
      };
    },
    getContentGeometry(offset) {
      if (!last) return null;
      const r = NAMEPLATE_GEOMETRY[last.tier].sealR;
      const measured = (label: BitmapText): ContentRect => {
        const bounds = label.getLocalBounds();
        return {
          x:
            (offset
              ? (label === nameText ? nameBaseline.x : troopsBaseline.x) + offset.x
              : label.position.x) + bounds.x,
          y:
            (offset
              ? (label === nameText ? nameBaseline.y : troopsBaseline.y) + offset.y
              : label.position.y) + bounds.y,
          width: bounds.width,
          height: bounds.height,
        };
      };
      return {
        seal: {
          x: sealCenter.x + (offset ?? presentationOffset).x - r - 0.5,
          y: sealCenter.y + (offset ?? presentationOffset).y - r - 0.5,
          width: r * 2 + 1 + (last.relation === 'enemy' ? 4 : 0),
          height: r * 2 + 1,
        },
        name: measured(nameText),
        troops: measured(troopsText),
      };
    },
    destroy(): void {
      container.destroy({ children: true });
    },
  };
  return part;
}
