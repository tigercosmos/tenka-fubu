// M1-21 determinism 套件 DT1–DT4（roadmap 18 §3.4；規格 plan/17-testing.md §3.5.2）。
// 驗收（18 §3.4 M1-21）：「17-T5 驗收：植入 `Math.random` 時 DT3 紅燈」。
//
// | # | 案例 | 期望（17 §3.5.2 原文） |
// |---|---|---|
// | DT1 | 同輸入跑兩次 | 各自從 `buildMiniState({ seed: 42 })` 推進 `TESTCFG.determinismDays`(360) tick；
//        兩份最終狀態 `stableStringify` 結果**逐位元組相同**（字串嚴格相等） |
// | DT2 | 含指令的重跑 | 兩次都在第 10 日投遞相同徵兵 Command、第 40 日投遞相同出陣 Command；
//        最終字串仍嚴格相等 |
// | DT3 | 禁用非決定性 API | 靜態掃描 `src/core/**`：出現 `Math.random`、`Date.now`、`new Date(`、
//        `performance.now` 即失敗（正規表達式掃描原始碼，測試實作於 determinism.spec.ts） |
// | DT4 | 分流獨立性 | 只消耗 `rng.battle` 的操作前後，`rng.dev`／`rng.ai`／`rng.event`／`rng.misc`
//        的內部狀態不變 |
//
// 【M1 範圍裁決，沿用既有 18 §8-D4】17 §3.5.2 原文寫 `buildMiniState`（M2 zod fixture），
// 但 mini fixture 是 M2 產物；18-roadmap.md §8-D4 已定案「M1 用 TS 常數 tiny 劇本」支撐 determinism
// 門檻，M2 mini 就緒後 golden 才改用 mini/s1560、tiny 僅留最小單元測試。本檔 DT1/DT2 依此改用
// `buildTinyState`（`tests/fixtures/tiny.ts`），語意等價（固定劇本＋固定種子＋長程 tick）。
//
// 【M1-21 新增裁決：DT2 指令選型】DT2 要求「徵兵 Command」「出陣 Command」，對應 `setConscriptPolicy`／
// `march`（02 §4.18）；此二者之驗證器/apply handler 分屬 M3（內政）／M4（軍事），M1 尚未登錄
// （`src/core/commands/registry.ts` M1 僅登錄 debug 指令）。依 `validate.ts`／`queue.ts` 既有骨架
// （§8-D14；`tests/core/commands.spec.ts` 已示範同一手法），未登錄 handler 回 `command.rejected`
// （`notImplemented`）而非崩潰或被靜默忽略——這仍完整走過 Step 1 驗證／結算管線（消費 seq、
// 推進 `lastAppliedCmdSeq`、發出 `command.rejected`→落地 Report），足以驗證 DT2「含指令重跑」之
// 決定論本質（指令投遞時點與內容影響狀態演化路徑，而非要求該指令的遊戲效果已存在）。待 M3/M4
// 該二 handler 落地後，本檔行為不需改動（仍是相同 Command 序列、只是不再被拒絕）。
//
// 【M1-21 新增裁決：DT3 掃描不誤判「說明用途」的合法字面】17 §3.5.2 原文「出現即失敗」若逐字實作
// 為「原始碼全文（含註解）字面比對」，會誤判 `src/core/rng.ts`／`src/core/systems/index.ts` 檔頭
// 以中文註解**說明**「core 禁止 Math.random/Date.now（ESLint 會擋）」「core 無 Date.now，恆 0」
// 等合法文件字面（M1-4／M1-7 既有程式碼，非違規）。DT3 之立意是攔「實際呼叫」，故本檔掃描前先
// 去除 `//` 行註解與 `/* */` 區塊註解（以空白覆蓋、保留換行避免行號漂移），使其與 18 §3.4 M1-21
// 驗收標準「植入 `Math.random()` 時 DT3 紅燈」（即真的呼叫，非提及其名）語意一致。
//
// 【M1-21 新增裁決：DT3 雙重保險】本檔以三層防線覆蓋 DT3：①（主防線，17 §3.5.2 原文）正規表達式
// 靜態掃描 `src/core/**` 原始碼；②（補強）確認 `eslint.config.js` 對 `src/core/**/*.ts` 仍登記
// `no-restricted-properties`(Math.random／Date.now) 與 `no-restricted-syntax`(new Date) 三項規則
// 存在（防止未來調整設定檔時悄悄拿掉這道防線）；③（補強）以 `vi.spyOn(Math, 'random')` 實際跑一段
// 模擬、斷言全域 `Math.random` 從未被呼叫（防迂迴寫法規避①之逐行正規表達式，如以變數別名呼叫）。
// 附註：`performance.now` 現況未被 `eslint.config.js`（01 §3.7.3 canonical 內容）之
// `no-restricted-globals`／`no-restricted-properties` 限制——01 該清單本就只列 8 個 DOM/BOM 全域
// ＋2 個屬性限制，未含 `performance`；此為 01 既有定案範圍，非本次任務之缺陷，不在本檔擅自回頭
// 修改 `eslint.config.js`（產出物歸 01-A3、M0 已 gate 通過）。`performance.now` 之防線因此僅倚賴
// 上述①③兩層（regex 掃描＋執行期 spy），已回寫 `plan/17-testing.md` §8。

import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { advanceDay } from '../src/core/systems/index';
import { createRngStream, initRng } from '../src/core/rng';
import type { Command, CommandEnvelope } from '../src/core/commands/types';
import type { GameState } from '../src/core/state/gameState';
import {
  buildTinyState,
  CASTLE_A1,
  CASTLE_A2,
  CLAN_ALPHA,
  OFF_ALPHA_LORD,
  TINY_SEED,
  TINY_START_DAY,
} from './fixtures/tiny';
import { stableStringify } from './helpers/hash';
import { TESTCFG } from './config';

// 本檔位於 tests/，回推一層即 repo 根目錄。
const REPO_ROOT = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
const CORE_ROOT = path.join(REPO_ROOT, 'src', 'core');

// ═══════════════════════════════════════════════════════════════════
// 共用 helper：連跑 tiny 劇本，於指定日偏移量投遞指令（DT1/DT2/DT3 補強保險 2 共用）
// ═══════════════════════════════════════════════════════════════════

/** 徵兵 Command（`setConscriptPolicy`，02 §4.18；05 §3 語意——M1 尚未登錄 handler，見檔頭裁決）。 */
function conscriptCommand(): Command {
  return { type: 'setConscriptPolicy', clanId: CLAN_ALPHA, castleId: CASTLE_A1, policy: 'high' };
}

/** 出陣 Command（`march`，02 §4.18；04/07 語意——M4 起由真實 handler 結算）。 */
function marchCommand(): Command {
  return {
    type: 'march',
    clanId: CLAN_ALPHA,
    originCastleId: CASTLE_A1,
    leaderId: OFF_ALPHA_LORD,
    deputyIds: [],
    soldiers: 500,
    food: 100,
    targetNodeId: CASTLE_A2,
  };
}

interface DeterminismRunResult {
  state: GameState;
  /** 全程 `command.rejected` 事件之 `commandType`（依發生序），供驗證指令確實走過 Step 1 管線。 */
  rejectedCommandTypes: string[];
}

/**
 * 建全新 tiny 狀態並連跑 `days` 個 tick；`day10Command`/`day40Command`（若提供）分別於
 * `state.time.day − TINY_START_DAY` 恰為 10／40 的 tick 併入該次 `advanceDay` 的指令佇列
 * （對應 DT2「第 10 日」「第 40 日」）。每次呼叫皆從頭建置全新獨立狀態（不共享物件參照），
 * 供 DT1/DT2 的「兩次獨立重跑」比較。
 */
function runDeterminismTicks(opts: {
  seed: number;
  days: number;
  day10Command?: Command;
  day40Command?: Command;
}): DeterminismRunResult {
  const state = buildTinyState({ seed: opts.seed });
  const rejectedCommandTypes: string[] = [];

  for (let i = 0; i < opts.days; i += 1) {
    const dayOffset = state.time.day - TINY_START_DAY;
    const queue: CommandEnvelope[] = [];
    if (opts.day10Command !== undefined && dayOffset === 10) {
      queue.push({ seq: 1, issuedDay: state.time.day, command: opts.day10Command });
    }
    if (opts.day40Command !== undefined && dayOffset === 40) {
      queue.push({ seq: 2, issuedDay: state.time.day, command: opts.day40Command });
    }
    const result = advanceDay(state, queue);
    for (const event of result.events) {
      if (event.type === 'command.rejected') {
        rejectedCommandTypes.push(event.commandType);
      }
    }
  }

  return { state, rejectedCommandTypes };
}

// ═══════════════════════════════════════════════════════════════════
// DT1 — 同輸入跑兩次
// ═══════════════════════════════════════════════════════════════════

describe('DT1 — 同輸入跑兩次（17 §3.5.2）', () => {
  it('各自從 buildTinyState({ seed: 42 }) 推進 TESTCFG.determinismDays(360) tick，兩份最終狀態 stableStringify 逐位元組相同', () => {
    const runA = runDeterminismTicks({ seed: TINY_SEED, days: TESTCFG.determinismDays });
    const runB = runDeterminismTicks({ seed: TINY_SEED, days: TESTCFG.determinismDays });

    expect(runA.state).not.toBe(runB.state); // 兩次獨立建置，非同一參考（避免恆真比較）
    expect(stableStringify(runA.state)).toBe(stableStringify(runB.state));
  });

  it('推進日數與種子確實一致（比較前提：兩次跑的是同一組輸入）', () => {
    const runA = runDeterminismTicks({ seed: TINY_SEED, days: TESTCFG.determinismDays });
    const runB = runDeterminismTicks({ seed: TINY_SEED, days: TESTCFG.determinismDays });
    expect(runA.state.time.day).toBe(TINY_START_DAY + TESTCFG.determinismDays);
    expect(runA.state.time.day).toBe(runB.state.time.day);
    expect(runA.state.meta.seed).toBe(runB.state.meta.seed);
  });
});

// ═══════════════════════════════════════════════════════════════════
// DT2 — 含指令的重跑
// ═══════════════════════════════════════════════════════════════════

describe('DT2 — 含指令的重跑（17 §3.5.2）', () => {
  it('兩次都在第 10 日投遞相同徵兵 Command、第 40 日投遞相同出陣 Command，最終字串仍嚴格相等', () => {
    const runA = runDeterminismTicks({
      seed: TINY_SEED,
      days: TESTCFG.determinismDays,
      day10Command: conscriptCommand(),
      day40Command: marchCommand(),
    });
    const runB = runDeterminismTicks({
      seed: TINY_SEED,
      days: TESTCFG.determinismDays,
      day10Command: conscriptCommand(),
      day40Command: marchCommand(),
    });

    expect(stableStringify(runA.state)).toBe(stableStringify(runB.state));
  });

  it('兩指令確實投遞並走過 Step 1 管線（M3 徵兵方針與 M4 出陣皆成功）', () => {
    const run = runDeterminismTicks({
      seed: TINY_SEED,
      days: 41, // 涵蓋第 40 日（含）之 tick
      day10Command: conscriptCommand(),
      day40Command: marchCommand(),
    });
    expect(run.rejectedCommandTypes).toEqual([]);
    // 玩家指令產生恰一支 alpha 部隊；beta 部隊為 MVP 大名 AI 自主出陣的正當產物（Step 11），
    // 不走 Step 1 指令管線，故不計入本測試的投遞驗證。
    const alphaArmies = Object.values(run.state.armies).filter(
      (army) => army.clanId === CLAN_ALPHA,
    );
    expect(alphaArmies).toHaveLength(1);
    expect(run.state.meta.lastAppliedCmdSeq).toBe(2);
  });

  it('與 DT1（無指令）的最終狀態不同（指令確實影響了狀態演化路徑，非無操作）', () => {
    const withoutCommands = runDeterminismTicks({ seed: TINY_SEED, days: TESTCFG.determinismDays });
    const withCommands = runDeterminismTicks({
      seed: TINY_SEED,
      days: TESTCFG.determinismDays,
      day10Command: conscriptCommand(),
      day40Command: marchCommand(),
    });
    expect(stableStringify(withCommands.state)).not.toBe(stableStringify(withoutCommands.state));
  });
});

// ═══════════════════════════════════════════════════════════════════
// DT3 — 禁用非決定性 API（靜態掃描 src/core/**）
// ═══════════════════════════════════════════════════════════════════

interface ForbiddenApiFinding {
  file: string;
  line: number;
  api: string;
}

/** DT3 掃描目標（17 §3.5.2 原文四項）。`\s*` 容許零星空白變化，仍對齊字面比對意圖。 */
const FORBIDDEN_APIS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Math.random', pattern: /\bMath\s*\.\s*random\b/ },
  { name: 'Date.now', pattern: /\bDate\s*\.\s*now\b/ },
  { name: 'new Date(', pattern: /\bnew\s+Date\s*\(/ },
  { name: 'performance.now', pattern: /\bperformance\s*\.\s*now\b/ },
];

/** 遞迴列出 dir 下全部 `.ts` 檔（絕對路徑）；dir 不存在時回傳空陣列。 */
function listTsFiles(dir: string): string[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * 去除 `//` 行註解與 `/* *\/` 區塊註解（以空白覆蓋內容、保留換行與相對位置，行號不漂移）。
 * 不處理字串常值內含 `//`／`/*` 的邊界情況（core 原始碼慣例為純遊戲邏輯，不含 URL 等字面；
 * 見檔頭「DT3 掃描不誤判」裁決）。
 */
function blankOutComments(source: string): string {
  const noBlockComments = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  return noBlockComments.replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

/** 純函式：掃描 rootDir 下全部 `.ts` 檔，回傳全部命中（不含註解內的字面提及）。 */
function scanForbiddenApis(rootDir: string): ForbiddenApiFinding[] {
  const findings: ForbiddenApiFinding[] = [];
  for (const full of listTsFiles(rootDir)) {
    const relFile = path.relative(REPO_ROOT, full).split(path.sep).join('/');
    const code = blankOutComments(readFileSync(full, 'utf8'));
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
      for (const api of FORBIDDEN_APIS) {
        if (api.pattern.test(line)) {
          findings.push({ file: relFile, line: idx + 1, api: api.name });
        }
      }
    });
  }
  return findings;
}

/** 建立一個獨立暫存目錄並寫入一個 `.ts` 檔（內容為單行程式碼），回傳其根目錄路徑。 */
function writeCoreProbeFixture(codeLine: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'determinism-dt3-fixture-'));
  writeFileSync(path.join(root, 'probe.ts'), `${codeLine}\n`, 'utf8');
  return root;
}

describe('DT3 — 禁用非決定性 API：主防線（正規表達式靜態掃描 src/core/**；17 §3.5.2）', () => {
  it('目前 src/core 全樹掃描結果為 0 筆（含 rng.ts／systems/index.ts 檔頭「說明用途」註解不誤判）', () => {
    expect(scanForbiddenApis(CORE_ROOT)).toEqual([]);
  });

  describe('植入探針（18 §3.4 M1-21 驗收：「在 core 任意檔案植入 Math.random() 時 DT3 紅燈」）', () => {
    let tempRoot: string | undefined;

    afterEach(() => {
      if (tempRoot !== undefined) {
        rmSync(tempRoot, { recursive: true, force: true });
        tempRoot = undefined;
      }
    });

    const probes: readonly [label: string, codeLine: string, expectedApi: string][] = [
      ['Math.random()', 'const x = Math.random();', 'Math.random'],
      ['Date.now()', 'const t = Date.now();', 'Date.now'],
      ['new Date(...)', 'const d = new Date();', 'new Date('],
      ['performance.now()', 'const p = performance.now();', 'performance.now'],
    ];

    it.each(probes)('植入 %s → 偵測到 1 筆（api=%s）', (_label, codeLine, expectedApi) => {
      tempRoot = writeCoreProbeFixture(codeLine);
      const findings = scanForbiddenApis(tempRoot);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.api).toBe(expectedApi);
    });

    it('同一行內同時出現多個禁用 API 皆各自回報', () => {
      tempRoot = writeCoreProbeFixture('const x = Math.random() + Date.now();');
      const findings = scanForbiddenApis(tempRoot);
      expect(findings.map((f) => f.api).sort()).toEqual(['Date.now', 'Math.random']);
    });

    it('禁用 API 字面僅出現於 `//` 行註解或 `/* */` 區塊註解中則不報（比照 rng.ts 現況之合法文件字面）', () => {
      tempRoot = writeCoreProbeFixture(
        [
          '// 這裡示範禁止寫法：Math.random() 與 Date.now()',
          '/* 區塊註解內提及 new Date( 與 performance.now 亦不應觸發 */',
          'const y = 1;',
        ].join('\n'),
      );
      expect(scanForbiddenApis(tempRoot)).toEqual([]);
    });
  });
});

describe('DT3 — 補強保險 1：ESLint 規則存在性（避免調整 eslint.config.js 時悄悄拿掉這道防線）', () => {
  it('eslint.config.js 對 src/core/**/*.ts 仍登記 Math.random／Date.now／new Date 三項限制規則', () => {
    // performance.now 現況不在 01 §3.7.3 canonical 內容的 no-restricted-globals/properties 清單內
    // （該清單本就只列 8 個 DOM/BOM 全域＋2 個屬性限制），不在本任務範圍內回頭修改 eslint.config.js
    // （產出物歸 01-A3、M0 已 gate 通過）；performance.now 之防線僅倚賴上方主防線與下方補強保險 2。
    const eslintConfigSource = readFileSync(path.join(REPO_ROOT, 'eslint.config.js'), 'utf8');
    expect(eslintConfigSource).toMatch(/object:\s*'Math'\s*,\s*property:\s*'random'/);
    expect(eslintConfigSource).toMatch(/object:\s*'Date'\s*,\s*property:\s*'now'/);
    expect(eslintConfigSource).toMatch(/NewExpression\[callee\.name='Date'\]/);
  });
});

describe('DT3 — 補強保險 2：執行期 Math.random 監控（防迂迴寫法規避正規表達式掃描）', () => {
  it('連跑 tiny 劇本 360 tick（含 DT2 兩指令）期間，全域 Math.random 從未被呼叫', () => {
    const spy = vi.spyOn(Math, 'random');
    try {
      runDeterminismTicks({
        seed: TINY_SEED,
        days: TESTCFG.determinismDays,
        day10Command: conscriptCommand(),
        day40Command: marchCommand(),
      });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// DT4 — 分流獨立性
// ═══════════════════════════════════════════════════════════════════

describe('DT4 — 分流獨立性（03 §3.5.4 禁令 4；17 §3.5.2）', () => {
  it('只消耗 rng.battle 的操作前後，rng.dev／rng.ai／rng.event／rng.misc 的內部狀態不變', () => {
    const rng = initRng(TINY_SEED);
    const before = { dev: rng.dev, ai: rng.ai, event: rng.event, misc: rng.misc };

    const battleStream = createRngStream(rng, 'battle');
    for (let i = 0; i < 300; i += 1) {
      battleStream.next();
    }
    battleStream.nextInt(1, 100);
    battleStream.chance(0.3);
    battleStream.pick([1, 2, 3, 4, 5]);
    battleStream.shuffle([1, 2, 3, 4, 5, 6, 7]);

    expect({ dev: rng.dev, ai: rng.ai, event: rng.event, misc: rng.misc }).toEqual(before);
  });
});
