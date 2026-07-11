// Zustand vanilla store（GameStore 型別、初始 session 值）。
// 規格：plan/01-architecture.md §3.4.1（Store 形狀與所有權）／§3.4.2（selector 粒度規則）／§4.1（型別）。
// M1-15（01-A6）實作。
//
// 分層（§3.4.1）：
// - `game` slice：指向目前 GameState 的參考；core 於 advanceDay 內就地變異（§8-D1），
//   本檔只提供 `setGame`/`bumpTickSeq` 兩個窄接口給 bridge.ts 寫入——其餘模組一律唯讀
//  （`store.getState().game`），不得自行 `store.setState({ game })`（慣例、非執行期強制）。
// - `session` slice：純 UI 執行期狀態，只能經 `store.getState().actions` 修改（§3.4.1 第 2 點）。

import { createStore } from 'zustand/vanilla';
import type { GameState } from '@core/state/gameState';

/** 速度檔位；'paused' 之外對應 00 §5.2 的三檔（01 §4.1）。 */
export type GameSpeed = 'paused' | 'x1' | 'x2' | 'x5';

/** 自動暫停原因（00 §5.2 清單＋架構層原因；01 §4.1）。 */
export type PauseReason =
  | 'user' // 玩家手動（空白鍵／按鈕）
  | 'castleBesieged' // 我方城被圍
  | 'battleOffer' // 合戰可發動
  | 'proposalArrived' // 具申送達
  | 'diploEnvoy' // 外交來使
  | 'historicalEvent' // 歷史事件
  | 'monthStart' // 月初
  | 'windowHidden' // 頁面失焦（visibilitychange）
  | 'modalOpen' // 合戰／事件 modal 開啟（00 §5.3）
  | 'fatalError'; // CoreError 捕獲

/**
 * 地圖選取（單選；kind 決定 id 的實體型別；01 §4.1 逐字）。
 * 注意：plan/11-ui-screens.md §4 另定義一個同名但形狀不同的 `Selection`
 *（無 'none' 成員、`id` 非 null、改以 `selection: Selection | null` 表達「無選取」），供 M3-16
 * 建置的獨立 UI 導航 store（`src/ui/hooks/uiStore.ts`）使用。兩型別的整合留待 M3-16 依當時
 * 實況裁決（01 §8 D2「單一 store」與本檔僅涵蓋 M1 所需之最小子集；不在本次 M1-15 範圍內回寫）。
 */
export interface Selection {
  kind: 'castle' | 'district' | 'army' | 'none';
  id: string | null;
}

/**
 * modal 描述。01 §4.1 使用但未在該文件內定義完整形狀（僅註記「▷ plan/11」）；
 * plan/11-ui-screens.md §4 定義的是不同名稱的 `ModalInstance { id: ModalId; params; pausesTime }`。
 * M1 尚無任何 modal 開啟者（合戰／事件 modal 分屬 M5／M8），此處先比照 `ModalInstance` 形狀提供
 * 最小可用定義，`id` 暫留 `string`（未來窄化為 plan/11 `ModalId` 留待該里程碑）。
 */
export interface ModalDescriptor {
  id: string;
  params: Record<string, string>;
  pausesTime: boolean;
}

/** 除錯 overlay 開關（01 §4.3 DebugOverlayFlags）。 */
export interface DebugOverlayFlags {
  aiIntent: boolean;
  pathfinding: boolean;
}

/** session.debug：除錯面板的執行期狀態（01 §4.5 DebugSessionState）。 */
export interface DebugSessionState {
  panelOpen: boolean;
  overlay: DebugOverlayFlags;
  pathPickBuffer: string[];
  jumping: { totalDays: number; doneDays: number } | null;
}

/** 目前畫面 id（plan/11-ui-screens.md §4 ScreenId 全集；M1-20 僅用 'title'／'main'）。 */
export type ScreenId = 'title' | 'scenarioSelect' | 'daimyoSelect' | 'main' | 'battle' | 'ending';

/** 純 UI 執行期狀態（不進存檔；01 §4.1 逐字）。 */
export interface SessionState {
  screen: ScreenId;
  speed: GameSpeed;
  resumeSpeed: Exclude<GameSpeed, 'paused'>;
  lastPauseReason: PauseReason | null;
  selection: Selection;
  openModal: ModalDescriptor | null;
  pendingCommandCount: number;
  fatalError: { code: string; message: string; stack: string } | null;
  debug: DebugSessionState;
}

export const initialSession: SessionState = {
  screen: 'title',
  speed: 'paused',
  resumeSpeed: 'x1',
  lastPauseReason: null,
  selection: { kind: 'none', id: null },
  openModal: null,
  pendingCommandCount: 0,
  fatalError: null,
  debug: {
    panelOpen: false,
    overlay: { aiIntent: false, pathfinding: false },
    pathPickBuffer: [],
    jumping: null,
  },
};

/** session slice 的唯一合法修改路徑（01 §3.4.1 第 2 點：「UI 元件可經 store 上的 action 函式修改」）。 */
export interface SessionActions {
  setScreen(screen: ScreenId): void;
  select(selection: Selection): void;
  openModal(modal: ModalDescriptor): void;
  closeModal(): void;
  /** 純速度切換（不含暫停原因記錄、不重置累加器，§3.5.3）；'paused' 由 requestPause/resume 專責。 */
  setSpeed(speed: Exclude<GameSpeed, 'paused'>): void;
  /** 設檔位為 paused、記錄原因、記住暫停前檔位（已暫停時保留原 resumeSpeed；§3.5.3）。 */
  requestPause(reason: PauseReason): void;
  /** 回到 resumeSpeed、清除 lastPauseReason（§3.5.3）。 */
  resume(): void;
  setPendingCommandCount(count: number): void;
  setFatalError(error: { code: string; message: string; stack: string } | null): void;
  setDebugJumping(jumping: { totalDays: number; doneDays: number } | null): void;
  /** 除錯面板開關（01 §3.11.2「反引號鍵或 HUD 隱藏按鈕」；M1-22）。 */
  setDebugPanelOpen(open: boolean): void;
}

export interface GameStore {
  game: GameState | null; // boot 完成前為 null；boot 後由 bridge.ts 獨佔寫入
  tickSeq: number; // 每次 publishTick +1；selector 重跑的訊號
  session: SessionState;
  actions: SessionActions;
}

export const store = createStore<GameStore>()((set) => ({
  game: null,
  tickSeq: 0,
  session: initialSession,
  actions: {
    setScreen(screen) {
      set((s) => ({ session: { ...s.session, screen } }));
    },
    select(selection) {
      set((s) => ({ session: { ...s.session, selection } }));
    },
    openModal(modal) {
      set((s) => ({ session: { ...s.session, openModal: modal } }));
    },
    closeModal() {
      set((s) => ({ session: { ...s.session, openModal: null } }));
    },
    setSpeed(speed) {
      set((s) => ({ session: { ...s.session, speed, resumeSpeed: speed } }));
    },
    requestPause(reason) {
      set((s) => {
        const resumeSpeed = s.session.speed === 'paused' ? s.session.resumeSpeed : s.session.speed;
        return {
          session: { ...s.session, speed: 'paused', resumeSpeed, lastPauseReason: reason },
        };
      });
    },
    resume() {
      set((s) => ({
        session: { ...s.session, speed: s.session.resumeSpeed, lastPauseReason: null },
      }));
    },
    setPendingCommandCount(count) {
      set((s) => ({ session: { ...s.session, pendingCommandCount: count } }));
    },
    setFatalError(error) {
      set((s) => ({ session: { ...s.session, fatalError: error } }));
    },
    setDebugJumping(jumping) {
      set((s) => ({ session: { ...s.session, debug: { ...s.session.debug, jumping } } }));
    },
    setDebugPanelOpen(open) {
      set((s) => ({ session: { ...s.session, debug: { ...s.session.debug, panelOpen: open } } }));
    },
  },
}));

/** bridge.ts 專用：boot／讀檔完成後掛上 GameState 參考（§3.4.1；本檔以外不應呼叫）。 */
export function setGame(game: GameState | null): void {
  store.setState({ game });
}

/** bridge.ts 專用：publishTick 遞增變更訊號（§3.4.4；本檔以外不應呼叫）。 */
export function bumpTickSeq(): void {
  store.setState((s) => ({ tickSeq: s.tickSeq + 1 }));
}

/** 測試專用：整批重置 store（game/tickSeq/session 回初始值）；非產品程式碼路徑。 */
export function resetGameStoreForTests(game: GameState | null = null): void {
  store.setState({ game, tickSeq: 0, session: initialSession });
}
