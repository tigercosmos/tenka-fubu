// DebugFlags 解析（?debug=1&seed=42 等 URL 參數）＋ window.__TENKA_DEBUG__ 安裝。
// 規格：plan/01-architecture.md §3.11.1（URL 參數表）／§3.11.4（console API）／§4.5（DebugFlags 型別）。
// M1-22（01-A11）實作。

import { store } from './store';
import type { GameSpeed } from './store';
import { dispatchCommand, exportCommandLog, type CommandDispatchResult } from './bridge';
import { gameLoop } from './gameLoop';
import { perfMonitor, type PerfSnapshot } from './perfMonitor';
import { buildNewGameState, loadScenario } from './boot';
import type { Command } from '@core/commands/types';
import type { GameState } from '@core/state/gameState';
import {
  replayCommandLog as replayCoreCommandLog,
  type CommandLogFile,
  type ReplayResult,
} from '@core/replay/commandLog';
import { isClanId } from '@core/state/ids';

/**
 * URL 參數解析結果（01 §4.5 逐字；boot 前產生，執行期唯讀）。
 * `logTags` 之嚴謹型別（`LogTag[]`）依賴 `src/core/log.ts`（M1-18 CoreLogger，尚未落地含 LogTag
 * 匯出），故先以 `string[]` 表達（值集合不變：解析出的 tag 名稱），待該檔案落地後可窄化。
 */
export interface DebugFlags {
  enabled: boolean; // ?debug=1
  seed: number | null; // ?seed=N（null＝隨機；由呼叫端決定隨機來源，core 禁 Math.random）
  scenario: string; // ?scenario=…；預設 's1560'（v1.0 唯一劇本 id，M1 期間僅作標籤用）
  initialSpeed: GameSpeed; // ?speed=…；預設 'paused'
  skipTitle: boolean; // ?skipTitle=1
  logTags: string[] | 'all' | null; // ?log=battle,ai；'all'＝全開；null＝未指定
}

const VALID_SPEEDS: readonly GameSpeed[] = ['paused', 'x1', 'x2', 'x5'];

function isGameSpeed(value: string): value is GameSpeed {
  return (VALID_SPEEDS as readonly string[]).includes(value);
}

/** 解析 `location.search`（含開頭 `?`，或空字串）為 {@link DebugFlags}（純函式，01 §3.11.1）。 */
export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);

  const enabled = params.get('debug') === '1';

  const seedRaw = params.get('seed');
  const seedNum = seedRaw === null ? NaN : Number(seedRaw);
  const seed =
    seedRaw !== null && seedRaw.trim() !== '' && Number.isFinite(seedNum) ? seedNum : null;

  const scenario = params.get('scenario') ?? 's1560';

  const speedRaw = params.get('speed');
  const initialSpeed: GameSpeed = speedRaw !== null && isGameSpeed(speedRaw) ? speedRaw : 'paused';

  const skipTitle = params.get('skipTitle') === '1';

  const logRaw = params.get('log');
  const logTags: DebugFlags['logTags'] =
    logRaw === null
      ? null
      : logRaw === 'all'
        ? 'all'
        : logRaw
            .split(',')
            .map((s) => s.trim())
            .filter((s) => s.length > 0);

  return { enabled, seed, scenario, initialSpeed, skipTitle, logTags };
}

/** console 除錯 API（01 §3.11.4 `TenkaDebugApi` 逐字）；僅 `debugFlags.enabled` 時安裝。 */
export interface TenkaDebugApi {
  getState(): GameState; // 直接參考（唯讀約定，僅供檢查）
  dispatch(cmd: Command): CommandDispatchResult;
  stepDays(n: number): void;
  setSpeed(s: GameSpeed): void;
  getSeed(): number;
  getPerf(): PerfSnapshot;
  exportCommandLog(): CommandLogFile;
  replayCommandLog(log: CommandLogFile): Promise<ReplayResult>;
}

function requireGame(): GameState {
  const game = store.getState().game;
  if (game === null) {
    throw new Error('__TENKA_DEBUG__: game 尚未初始化（尚未開新局）');
  }
  return game;
}

async function replayCommandLog(log: CommandLogFile): Promise<ReplayResult> {
  const playerClanId = log.playerClanId;
  if (!isClanId(playerClanId)) {
    throw new Error(`replayCommandLog: 無效的 playerClanId「${playerClanId}」`);
  }
  const bundle = await loadScenario(log.scenarioId);
  return replayCoreCommandLog(log, () =>
    buildNewGameState(bundle, {
      playerClanId,
      difficulty: 'normal',
      seed: log.seed,
    }),
  );
}

/**
 * 安裝 `window.__TENKA_DEBUG__`（01 §3.11.4）：僅 `flags.enabled` 時安裝，供 Playwright smoke
 * 與人工除錯使用；`flags.enabled === false` 時不安裝（01 §3.11.1）。
 */
export function installDebugApi(flags: DebugFlags): void {
  if (!flags.enabled || typeof window === 'undefined') {
    return;
  }
  const api: TenkaDebugApi = {
    getState: requireGame,
    dispatch: dispatchCommand,
    stepDays(n) {
      gameLoop.stepDays(n);
    },
    setSpeed(s) {
      gameLoop.setSpeed(s);
    },
    getSeed() {
      const game = store.getState().game;
      return game === null ? (flags.seed ?? 0) : game.meta.seed;
    },
    getPerf() {
      return perfMonitor.getSnapshot();
    },
    exportCommandLog,
    replayCommandLog,
  };
  (window as unknown as { __TENKA_DEBUG__?: TenkaDebugApi }).__TENKA_DEBUG__ = api;
}
