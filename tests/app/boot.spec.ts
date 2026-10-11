// src/app/boot.ts 單元測試（M2-19；18-roadmap.md M2-19：新遊戲流程最小版）。
import { describe, expect, it } from 'vitest';
import {
  loadScenario,
  summarizeClans,
  buildNewGameState,
  getScenarioTitle,
  SUPPORTED_SCENARIO_IDS,
  NEW_GAME_REGIONS,
} from '../../src/app/boot';
import { validateState } from '../../src/core/state/invariants';
import type { ClanId } from '../../src/core/state/ids';

describe('boot.ts（M2-19 新遊戲流程）', () => {
  it('exposes the single scenario and nine integrated new-game regions', () => {
    expect(SUPPORTED_SCENARIO_IDS).toEqual(['s1560']);
    expect(NEW_GAME_REGIONS).toEqual([
      'tokai',
      'kinki',
      'kanto',
      'koshinetsu',
      'hokuriku',
      'chugoku',
      'shikoku',
      'kyushu',
      'tohoku',
    ]);
  });

  it('getScenarioTitle：已知劇本回傳標題；未知 id 退回 id 本身', () => {
    expect(getScenarioTitle('s1560')).toBe('桶狹間前夜');
    expect(getScenarioTitle('s9999')).toBe('s9999');
  });

  it('loads the nine-region scenario with41 families and121 castles', async () => {
    const bundle = await loadScenario('s1560');
    expect(bundle.id).toBe('s1560');
    expect(bundle.clans.length).toBe(41);
    expect(bundle.castles.length).toBe(121);
    expect(bundle.officers[0]).toHaveLength(91); // Tokai includes deferred Nobutada.
    expect(bundle.officers[1]).toHaveLength(97); // Kinki includes cross-region officers and deferred Yoshiaki.
    expect(bundle.officers[2]).toHaveLength(74);
    expect(bundle.officers[3]).toHaveLength(70);
    expect(bundle.officers[4]).toHaveLength(40);
    expect(bundle.officers[5]).toHaveLength(69);
    expect(bundle.officers.flat()).toHaveLength(619);
    expect(bundle.officers[6]).toHaveLength(37);
    expect(bundle.officers[7]).toHaveLength(76);
    expect(bundle.officers[8]).toHaveLength(65);
  });

  it('loadScenario：不支援的劇本 id 拒絕', async () => {
    await expect(loadScenario('s9999')).rejects.toThrow(/不支援的劇本/);
  });

  it('summarizeClans：織田家摘要（當主／石高/城數/武將數）與 wip.md 校準值一致', async () => {
    const bundle = await loadScenario('s1560');
    const summaries = summarizeClans(bundle);
    expect(summaries.length).toBe(41);
    const oda = summaries.find((s) => s.clanId === 'clan.oda');
    expect(oda).toBeDefined();
    expect(oda?.name).toBe('織田家');
    expect(oda?.leaderName).toBe('織田信長');
    expect(oda?.homeCastleId).toBe('castle.kiyosu');
    expect(oda?.kokudaka).toBe(310000); // wip.md：織田 310,000 石校準 PASS
    expect(oda?.castleCount).toBeGreaterThan(0);
    expect(oda?.officerCount).toBeGreaterThan(0);
  });

  it('buildNewGameState：選織田建局 → GameState 合法（validateState 零違規）', async () => {
    const bundle = await loadScenario('s1560');
    const game = buildNewGameState(bundle, {
      playerClanId: 'clan.oda' as ClanId,
      difficulty: 'normal',
      seed: 42,
    });
    expect(game.meta.playerClanId).toBe('clan.oda');
    expect(game.meta.scenarioId).toBe('s1560');
    expect(game.meta.seed).toBe(42);
    expect(game.time.day).toBe(0); // 1560/1/1（EPOCH_YEAR，02 §5.6）
    expect(Object.keys(game.clans).length).toBe(41);
    expect(Object.keys(game.castles).length).toBe(121);
    expect(validateState(game)).toEqual([]);
  });

  it('buildNewGameState：省略 seed 時仍可建局（隨機種子，比照 M1-20 startNewDemoGame 精神）', async () => {
    const bundle = await loadScenario('s1560');
    const game = buildNewGameState(bundle, {
      playerClanId: 'clan.imagawa' as ClanId,
      difficulty: 'hard',
    });
    expect(typeof game.meta.seed).toBe('number');
    expect(game.meta.playerClanId).toBe('clan.imagawa');
    expect(game.meta.difficulty).toBe('hard');
  });
});
