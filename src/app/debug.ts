// DebugFlags 解析（?debug=1&seed=42 等 URL 參數）＋ window.__TENKA_DEBUG__ 安裝。
// 規格：plan/01-architecture.md §3.11.1（URL 參數表）／§3.11.4（console API）／§4.5（DebugFlags 型別）。
// M1-22（01-A11）實作。

import { bumpTickSeq, setGame, store } from './store';
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
import { startDebugBattle } from '@core/debugBattle';
import { VISUAL_ANCHOR_CASTLE_ID } from '@core/debugVisual';
import { startNewDemoGame } from './newGame';
import { MAPVIEW } from '@ui/map/mapViewConfig';
import { getDebugMapRenderer } from '@ui/map/debugMapBridge';
import type { MapRenderer } from '@ui/map/MapRenderer';

/**
 * URL 參數解析結果（01 §4.5 逐字；boot 前產生，執行期唯讀）。
 * `logTags` 之嚴謹型別（`LogTag[]`）依賴 `src/core/log.ts`（M1-18 CoreLogger，尚未落地含 LogTag
 * 匯出），故先以 `string[]` 表達（值集合不變：解析出的 tag 名稱），待該檔案落地後可窄化。
 */
export interface DebugFlags {
  enabled: boolean; // ?debug=1 或 ?debug=visual-map
  seed: number | null; // ?seed=N（null＝隨機；由呼叫端決定隨機來源，core 禁 Math.random）
  scenario: string; // ?scenario=…；預設 's1560'（v1.0 唯一劇本 id，M1 期間僅作標籤用）
  initialSpeed: GameSpeed; // ?speed=…；預設 'paused'
  skipTitle: boolean; // ?skipTitle=1
  logTags: string[] | 'all' | null; // ?log=battle,ai；'all'＝全開；null＝未指定
  /**
   * `?debug=visual-map`（M6-V2；17 §3.9.3）：載入固定 `buildVisualMapState()` fixture 而非一般
   * 新局／`skipTitle` tiny fixture，供 e2e 截圖 harness 使用。隱含 `enabled=true`；`App.tsx` 依此
   * 旗標優先於 `skipTitle` 選擇啟動路徑（見該檔）。
   */
  visualMap: boolean;
}

const VALID_SPEEDS: readonly GameSpeed[] = ['paused', 'x1', 'x2', 'x5'];

function isGameSpeed(value: string): value is GameSpeed {
  return (VALID_SPEEDS as readonly string[]).includes(value);
}

/** 解析 `location.search`（含開頭 `?`，或空字串）為 {@link DebugFlags}（純函式，01 §3.11.1）。 */
export function parseDebugFlags(search: string): DebugFlags {
  const params = new URLSearchParams(search);

  // `?debug=1`：一般除錯模式；`?debug=visual-map`（M6-V2）：同樣視為啟用，且另立 `visualMap` 旗標
  // 供 App.tsx 選用固定視覺 fixture 啟動路徑。其餘值（含 "true"／"0"）皆視為停用，行為不變。
  const debugRaw = params.get('debug');
  const visualMap = debugRaw === 'visual-map';
  const enabled = debugRaw === '1' || visualMap;

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

  return { enabled, seed, scenario, initialSpeed, skipTitle, logTags, visualMap };
}

/** console 除錯 API（01 §3.11.4 `TenkaDebugApi` 逐字）；僅 `debugFlags.enabled` 時安裝。 */
export interface TenkaDebugApi {
  startBattle(layoutId: string): void;
  getState(): GameState; // 直接參考（唯讀約定，僅供檢查）
  dispatch(cmd: Command): CommandDispatchResult;
  stepDays(n: number): void;
  setSpeed(s: GameSpeed): void;
  getSeed(): number;
  getPerf(): PerfSnapshot;
  exportCommandLog(): CommandLogFile;
  replayCommandLog(log: CommandLogFile): Promise<ReplayResult>;
  /**
   * M6-V2（17 §3.9.3）：瞬移地圖鏡頭至三段 preset 之一並等待 2 個 renderer idle frame——
   * `'overview'`＝整張地圖中心＋`MAPVIEW.visualOverviewScale`；`'operational'`／`'close'`＝
   * `VISUAL_ANCHOR_CASTLE_ID`（本 fixture 被圍之今川本城）座標＋對應 scale。要求目前已有一個
   * `MapCanvasHost` 掛載（`getState()` 需已 boot）；否則擲例外。
   */
  setMapCameraPreset(preset: 'overview' | 'operational' | 'close'): Promise<void>;
  /** 等待地圖 renderer 連續 `frames`（預設 2）個 ticker frame，供截圖前確保畫面已靜止（17 §3.9.3）。 */
  waitMapIdle(frames?: number): Promise<void>;
}

function requireGame(): GameState {
  const game = store.getState().game;
  if (game === null) {
    throw new Error('__TENKA_DEBUG__: game 尚未初始化（尚未開新局）');
  }
  return game;
}

/** M6-V2 專用：目前掛載中的地圖渲染器（`debugMapBridge` 由 `MapCanvasHost` 登記）；未掛載則擲例外。 */
function requireMapRenderer(): MapRenderer {
  const renderer = getDebugMapRenderer();
  if (renderer === null) {
    throw new Error(
      '__TENKA_DEBUG__: map renderer 尚未掛載（尚未進入含地圖的畫面，如 MainScreen）',
    );
  }
  return renderer;
}

/**
 * 三段鏡頭 preset 之世界座標／縮放（17 §3.9.3；`MAPVIEW.visual*Scale` 定義見 mapViewConfig.ts）。
 * 三段皆以 `VISUAL_ANCHOR_CASTLE_ID`（本 fixture 被圍之今川本城）為中心，僅 scale 不同——
 * `'overview'`＝`MAPVIEW.visualOverviewScale`（M6-V2 修正：城／郡 fixture 座標已改為東海沿岸
 * 真實座標簇［見 debugVisual.ts 檔頭］，不再散布全世界，故 `WORLD_SIZE/2` 世界中心已不能讓節點群
 * 置中入鏡；scale 0.25 時視窗涵蓋 5120×2880 世界單位，以錨點城為中心可讓節點群與海岸線構圖穩定）。
 */
function resolveCameraPresetPose(
  game: GameState,
  preset: 'overview' | 'operational' | 'close',
): { center: { x: number; y: number }; scale: number } {
  const anchor = game.castles[VISUAL_ANCHOR_CASTLE_ID];
  if (anchor === undefined) {
    throw new Error(
      `__TENKA_DEBUG__: setMapCameraPreset('${preset}') 需要 VISUAL_ANCHOR_CASTLE_ID` +
        `（${VISUAL_ANCHOR_CASTLE_ID}）存在於目前 game（先以 ?debug=visual-map 開局）`,
    );
  }
  const scale =
    preset === 'overview'
      ? MAPVIEW.visualOverviewScale
      : preset === 'operational'
        ? MAPVIEW.visualOperationalScale
        : MAPVIEW.visualCloseScale;
  return { center: anchor.pos, scale };
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
    startBattle(layoutId) {
      const game = startNewDemoGame({ seed: 42, enabled: true });
      startDebugBattle(game, layoutId);
      setGame(game);
      store.getState().actions.setScreen('battle');
      bumpTickSeq();
    },
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
    async setMapCameraPreset(preset) {
      const renderer = requireMapRenderer();
      const pose = resolveCameraPresetPose(requireGame(), preset);
      renderer.setCameraPose(pose.center, pose.scale);
      await renderer.waitForIdleFrames(2);
    },
    async waitMapIdle(frames = 2) {
      await requireMapRenderer().waitForIdleFrames(frames);
    },
  };
  const debugWindow = window as unknown as {
    __TENKA_DEBUG__?: TenkaDebugApi;
    __tenka?: { debug: TenkaDebugApi };
  };
  debugWindow.__TENKA_DEBUG__ = api;
  debugWindow.__tenka = { debug: api };
}
