// M6-V3 文件交叉引用回歸測試（規格：plan/12-ui-components.md §8 決策記錄為決策編號單一真相）。
//
// 背景：M6-V3 素材管線的決策在設計 scratchpad 曾用內部工作編號 D1–D12，落地 plan/12 §8 時
// 因既有 D1–D15 而整體平移為 D16–D28。若下游文件（uiConstants.ts 註解、references.md 登錄）
// 仍抄舊內部編號，讀者依指示翻到 §8 會讀到毫不相關的舊決策（如 D9＝Dialog）。既有 gate
// （typecheck／lint／validate:data／validate:assets）皆不核對跨文件散文引用，故以本測試把關。
//
// 治本設計：不做脆弱的字面比對，而是驗「被引用的決策編號實際解析到的 §8 條目，其內容確屬所述主題」。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// 本檔位於 tests/data/，回推兩層即 repo 根目錄。
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PLAN12 = path.join(REPO_ROOT, 'plan/12-ui-components.md');
const UI_CONSTANTS = path.join(REPO_ROOT, 'src/ui/uiConstants.ts');
const REFERENCES = path.join(REPO_ROOT, 'docs/visual/references.md');

/** 解析 plan/12 §8「設計決策記錄」：回傳「決策編號 → 該條目全文（含 tag 與後續說明行）」。 */
function parseSection8Decisions(): Map<number, string> {
  const md = readFileSync(PLAN12, 'utf8');
  const startIdx = md.indexOf('## 8. 設計決策記錄');
  expect(startIdx, 'plan/12 應有「## 8. 設計決策記錄」章節').toBeGreaterThanOrEqual(0);
  const section = md.slice(startIdx);

  // 每個決策條目以行首 `- **D<num>｜` 起始，body 延伸到下一個同類標記或章節結束。
  const marker = /^- \*\*D(\d+)｜/gm;
  const marks: { num: number; idx: number }[] = [];
  for (let m = marker.exec(section); m !== null; m = marker.exec(section)) {
    marks.push({ num: Number(m[1]), idx: m.index });
  }
  const decisions = new Map<number, string>();
  for (let i = 0; i < marks.length; i += 1) {
    const cur = marks[i];
    if (cur === undefined) continue;
    const next = marks[i + 1];
    const end = next !== undefined ? next.idx : section.length;
    decisions.set(cur.num, section.slice(cur.idx, end));
  }
  return decisions;
}

describe('M6-V3 文件交叉引用（plan/12 §8 為決策編號單一真相）', () => {
  it('uiConstants.ts initialVisualAssetBytesMax 註解所引「決策 Dxx」須解析到真正的預算決策', () => {
    const src = readFileSync(UI_CONSTANTS, 'utf8');
    const line = src.split('\n').find((l) => l.includes('initialVisualAssetBytesMax'));
    expect(line, 'uiConstants.ts 應有 initialVisualAssetBytesMax 一列').toBeDefined();

    const cite = /決策 D(\d+)/.exec(line ?? '');
    expect(cite, 'initialVisualAssetBytesMax 註解應引「決策 Dxx」出處').not.toBeNull();
    const citedNum = Number(cite?.[1]);

    const decisions = parseSection8Decisions();
    const body = decisions.get(citedNum);
    expect(body, `plan/12 §8 應存在被引用的決策 D${citedNum}`).toBeDefined();
    // 治本斷言：該編號的條目確實在談首屏視覺資產預算（抓「引到不相關決策」如 D9＝Dialog）。
    expect(body ?? '', `plan/12 §8 D${citedNum} 並非預算決策；註解引錯決策編號`).toContain(
      'initialVisualAssetBytesMax',
    );
  });

  it('references.md 素材登錄所引「§8 決策 Dxx–Dyy」範圍須涵蓋 plan/12 §8 全部 [M6-V3] 決策', () => {
    const refs = readFileSync(REFERENCES, 'utf8');
    // 各式破折號（ASCII hyphen 與 U+2010–U+2015 各式 dash，含 en dash「–」）皆容許。
    const cite = /§8 決策 D(\d+)[-‐-―]D(\d+)/.exec(refs);
    expect(cite, 'references.md 應含「§8 決策 Dxx–Dyy」範圍引用').not.toBeNull();
    const lo = Number(cite?.[1]);
    const hi = Number(cite?.[2]);
    expect(hi, '引用範圍上界須不小於下界').toBeGreaterThanOrEqual(lo);

    const decisions = parseSection8Decisions();
    const m6v3Nums = [...decisions.entries()]
      .filter(([, body]) => body.includes('[M6-V3]'))
      .map(([num]) => num);
    expect(m6v3Nums.length, 'plan/12 §8 應有 [M6-V3] 標記的決策').toBeGreaterThan(0);

    for (const num of m6v3Nums) {
      expect(
        num >= lo && num <= hi,
        `references.md 引用範圍 D${lo}–D${hi} 未涵蓋 M6-V3 決策 D${num}`,
      ).toBe(true);
    }
  });
});
