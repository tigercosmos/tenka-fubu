// 存檔 codec 單元測試（16 §3.2／§5.1／§5.5；MVP 先行實作）。
// 重點：往返 deep-equal、亂數流銜接（讀檔後 tick 序列與未存檔完全一致）、
// 篡改／版本／垃圾輸入的錯誤碼契約、遷移鏈框架。
import { describe, expect, it } from 'vitest';
import {
  buildSaveFile,
  buildSaveMeta,
  decodeSave,
  encodeSave,
} from '../../src/core/save/serialize';
import { SAVE_FORMAT_VERSION } from '../../src/core/save/migrate';
import { advanceDay } from '../../src/core/systems/index';
import { stateHash } from '../../src/core/state/serialize';
import { buildTinyState, CLAN_ALPHA } from '../fixtures/tiny';

const TS = 1_751_808_000_000; // 固定時間戳（core 禁 Date.now，呼叫端注入）

describe('存檔 codec（16 §3.2／§5.5）', () => {
  it('往返 deep-equal：encode → decode 後 state 與原始 state 結構相等', () => {
    const state = buildTinyState();
    for (let i = 0; i < 10; i += 1) advanceDay(state, []);
    const decoded = decodeSave(encodeSave(state, TS));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.saveFile.version).toBe(SAVE_FORMAT_VERSION);
    expect(decoded.saveFile.timestamp).toBe(TS);
    expect(decoded.saveFile.pendingCommands).toEqual([]);
    expect(decoded.saveFile.state).toEqual(JSON.parse(JSON.stringify(state)));
    expect(decoded.migrated).toBe(false);
  });

  it('亂數流銜接（16 §3.2 規則 2）：讀檔續跑與不中斷連跑 bit-exact', () => {
    const straight = buildTinyState();
    for (let i = 0; i < 40; i += 1) advanceDay(straight, []);

    const interrupted = buildTinyState();
    for (let i = 0; i < 20; i += 1) advanceDay(interrupted, []);
    const decoded = decodeSave(encodeSave(interrupted, TS));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const resumed = decoded.saveFile.state;
    for (let i = 0; i < 20; i += 1) advanceDay(resumed, []);

    expect(stateHash(resumed)).toBe(stateHash(straight));
  });

  it('meta 摘要：城數／家臣數／石高／劇本欄位（16 §3.3 列表資料）', () => {
    const state = buildTinyState();
    const meta = buildSaveMeta(state);
    expect(meta.clanId).toBe(CLAN_ALPHA);
    expect(meta.clanName).toBe(state.clans[CLAN_ALPHA]!.name);
    expect(meta.castleCount).toBe(2); // a1/a2
    expect(meta.officerCount).toBeGreaterThan(0);
    expect(meta.totalKokudaka).toBeGreaterThan(0);
    expect(meta.scenarioId).toBe('tiny');
    expect(meta.day).toBe(state.time.day);
  });

  it('快照解耦：buildSaveFile 之後變異活狀態不影響信封', () => {
    const state = buildTinyState();
    const saveFile = buildSaveFile(state, TS);
    const goldBefore = saveFile.state.clans[CLAN_ALPHA]!.gold;
    state.clans[CLAN_ALPHA]!.gold += 999;
    expect(saveFile.state.clans[CLAN_ALPHA]!.gold).toBe(goldBefore);
  });

  it('錯誤碼契約：垃圾輸入 invalidFile；篡改成違規 corrupt；未來版本 newerVersion', () => {
    expect(decodeSave('not json').ok).toBe(false);
    expect(decodeSave('not json')).toMatchObject({ code: 'invalidFile' });
    expect(decodeSave('{"version":1}')).toMatchObject({ ok: false, code: 'invalidFile' });

    const state = buildTinyState();
    const raw = encodeSave(state, TS);

    const newer = JSON.parse(raw) as { version: number };
    newer.version = SAVE_FORMAT_VERSION + 1;
    expect(decodeSave(JSON.stringify(newer))).toMatchObject({ ok: false, code: 'newerVersion' });

    // 篡改：把玩家城主改指到不存在武將 → INV 違規 → corrupt
    const tampered = JSON.parse(raw) as {
      state: { castles: Record<string, { lordId: string }> };
    };
    tampered.state.castles['castle.a1']!.lordId = 'off.ghost';
    expect(decodeSave(JSON.stringify(tampered))).toMatchObject({ ok: false, code: 'corrupt' });

    // 版本 0（不存在的史前版本）：信封淺驗證即擋（version ≥ 1）
    const ancient = JSON.parse(raw) as { version: number };
    ancient.version = 0;
    expect(decodeSave(JSON.stringify(ancient))).toMatchObject({ ok: false, code: 'invalidFile' });
  });
});
