// UI 導航狀態機（plan/11-ui-screens.md §3.1.2、§4、§5.1–§5.2；M3-16）。
// 此狀態只描述畫面、疊層與暫態草稿，不進 GameState／存檔。
import { create } from 'zustand';
import { store as gameStore } from '@app/store';
import type { MapAnalysisMode } from '@app/store';
import type { MapPathPreview } from '@ui/map/mapViewTypes';
import type { CameraState } from '@ui/map/camera';
import type { GameSettings } from '@app/settings';
import type { GameState } from '@core/state/gameState';

export type ScreenId = 'title' | 'scenarioSelect' | 'daimyoSelect' | 'main' | 'battle' | 'ending';
export type PanelId =
  | 'castle'
  | 'district'
  | 'officers'
  | 'officerDetail'
  | 'ronin'
  | 'diplomacy'
  | 'plot'
  | 'policy'
  | 'corps'
  | 'taimei'
  | 'reports'
  | 'saveLoad'
  | 'settings';
export type ModalId =
  | 'realmNavigator'
  | 'march'
  | 'proposalInbox'
  | 'monthSummary'
  | 'rewards'
  | 'event'
  | 'battlePrompt'
  | 'battleResult'
  | 'captive'
  | 'envoy'
  | 'systemMenu'
  | 'confirm';

export interface PanelInstance {
  id: PanelId;
  params: Record<string, string>;
}
export interface ModalInstance {
  id: ModalId;
  params: Record<string, string>;
  pausesTime: boolean;
}
export interface Selection {
  kind: 'castle' | 'district' | 'army';
  id: string;
}
export interface ToastItem {
  reportId: string;
  severity: 'info' | 'warning' | 'critical';
  createdAtMs: number;
}
export interface MarchDraft {
  originCastleId: string;
  leaderOfficerId: string | null;
  subOfficerIds: string[];
  soldiers: number;
  food: number;
  targetNodeId: string | null;
  previewPath: MapPathPreview | null;
  previewDays: number | null;
  phase: 'compose' | 'pickTarget';
  errorKey: string | null;
}

export interface UIState {
  screen: ScreenId;
  panelStack: PanelInstance[];
  modal: ModalInstance | null;
  modalQueue: ModalInstance[];
  selection: Selection | null;
  toasts: ToastItem[];
  marchDraft: MarchDraft | null;
  mapCamera: { camera: CameraState; width: number; height: number } | null;
  speedBeforePause: 1 | 2 | 5;
  uiScale: number;
  mapLabelDensity: GameSettings['mapLabelDensity'];
  effectsEnabled: boolean;
  notificationFilter: GameSettings['notificationFilter'];
  analysisMode: MapAnalysisMode;
  analysisOpacity: number;
  queuedDecisionIds: string[];
}

export interface UIActions {
  setScreen(screen: ScreenId): void;
  openPanel(id: PanelId, params?: Record<string, string>): void;
  closePanel(): void;
  closePanelById(id: PanelId): void;
  enqueueModal(modal: ModalInstance): void;
  closeModal(): void;
  closeOwnedModal(
    expected: ModalInstance,
    options?: { resume?: boolean; expectedGame?: GameState | null },
  ): boolean;
  setSelection(selection: Selection | null): void;
  setMarchDraft(draft: MarchDraft | null): void;
  setMapCamera(value: UIState['mapCamera']): void;
  setUiScale(scale: number): void;
  applyPresentationSettings(
    settings: Pick<
      GameSettings,
      'uiScale' | 'mapLabelDensity' | 'effectsEnabled' | 'notificationFilter'
    >,
  ): void;
  setAnalysisMode(mode: MapAnalysisMode): void;
  setAnalysisOpacity(opacity: number): void;
  markDecisionQueued(id: string): void;
  clearQueuedDecisions(): void;
  onEsc(): void;
  reset(): void;
}

interface UIStore extends UIState {
  /** A flow with explicit continuation owns restoration until its whole FIFO drains. */
  queueResumeBlocked: boolean;
  actions: UIActions;
  /** 強制暫停 modal 後仍有非暫停 modal 排隊時，待整條佇列清空才恢復。 */
  restoreSpeedOnQueueDrain: boolean;
}

const FORCED_MODAL_IDS = new Set<ModalId>([
  'envoy',
  'event',
  'proposalInbox',
  'monthSummary',
  'battleResult',
  'captive',
]);

function speedNumber(): 1 | 2 | 5 {
  const session = gameStore.getState().session;
  const speed = session.speed === 'paused' ? session.resumeSpeed : session.speed;
  return speed === 'x5' ? 5 : speed === 'x2' ? 2 : 1;
}

const initialUIState: UIState = {
  screen: 'title',
  panelStack: [],
  modal: null,
  modalQueue: [],
  selection: null,
  toasts: [],
  marchDraft: null,
  mapCamera: null,
  speedBeforePause: 1,
  uiScale: 1,
  mapLabelDensity: 'medium',
  effectsEnabled: true,
  notificationFilter: 'all',
  analysisMode: 'none',
  analysisOpacity: 0.55,
  queuedDecisionIds: [],
};

/** 只由 action 呼叫；取出 FIFO 首項，必要時透過 app store 暫停策略時間。 */
function pump(state: UIStore): Partial<UIStore> | null {
  if (state.modal !== null || state.modalQueue.length === 0) return null;
  const [next, ...remaining] = state.modalQueue;
  if (next === undefined) return null;
  if (next.pausesTime) {
    const wasRunning = gameStore.getState().session.speed !== 'paused';
    const pauseReason = gameStore.getState().session.lastPauseReason;
    const ownsArrivalPause =
      (next.id === 'battlePrompt' && pauseReason === 'battleOffer') ||
      (next.id === 'envoy' && pauseReason === 'diploEnvoy') ||
      (next.id === 'proposalInbox' &&
        (pauseReason === 'proposalArrived' || pauseReason === 'monthStart'));
    const before = speedNumber();
    if (wasRunning) gameStore.getState().actions.requestPause('modalOpen');
    return {
      modal: next,
      modalQueue: remaining,
      speedBeforePause: wasRunning || ownsArrivalPause ? before : state.speedBeforePause,
      restoreSpeedOnQueueDrain: state.restoreSpeedOnQueueDrain || wasRunning || ownsArrivalPause,
    };
  }
  return { modal: next, modalQueue: remaining };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  ...initialUIState,
  restoreSpeedOnQueueDrain: false,
  queueResumeBlocked: false,
  actions: {
    markDecisionQueued(id) {
      set((state) => ({ queuedDecisionIds: [...new Set([...state.queuedDecisionIds, id])] }));
    },
    clearQueuedDecisions() {
      set({ queuedDecisionIds: [] });
    },
    setScreen(screen) {
      set({ screen });
    },
    openPanel(id, params = {}) {
      set((state) => {
        const prior = state.panelStack.filter((panel) => panel.id !== id);
        return { panelStack: [...prior, { id, params }].slice(-3) };
      });
    },
    closePanel() {
      set((state) => ({ panelStack: state.panelStack.slice(0, -1) }));
    },
    closePanelById(id) {
      set((state) => ({ panelStack: state.panelStack.filter((panel) => panel.id !== id) }));
    },
    enqueueModal(modal) {
      set((state) => ({ modalQueue: [...state.modalQueue, modal] }));
      const pumped = pump(get());
      if (pumped !== null) set(pumped);
    },
    closeModal() {
      const current = get().modal;
      if (current === null) return;
      set({ modal: null });
      const afterClose = get();
      const pumped = pump(afterClose);
      if (pumped !== null) {
        set(pumped);
        return;
      }
      if (
        afterClose.modalQueue.length === 0 &&
        afterClose.restoreSpeedOnQueueDrain &&
        !afterClose.queueResumeBlocked
      ) {
        const speed = afterClose.speedBeforePause;
        const reason = gameStore.getState().session.lastPauseReason;
        if (
          reason === 'modalOpen' ||
          reason === 'battleOffer' ||
          reason === 'proposalArrived' ||
          reason === 'diploEnvoy' ||
          reason === 'monthStart'
        )
          gameStore.getState().actions.setSpeed(speed === 5 ? 'x5' : speed === 2 ? 'x2' : 'x1');
        set({ restoreSpeedOnQueueDrain: false });
      }
    },
    closeOwnedModal(expected, options = {}) {
      const state = get();
      if (state.modal !== expected) {
        if (!state.modalQueue.includes(expected)) return false;
        set({ modalQueue: state.modalQueue.filter((entry) => entry !== expected) });
        return true;
      }
      const app = gameStore.getState();
      const session = app.session;
      const sameGame = options.expectedGame === undefined || options.expectedGame === app.game;
      const resume = options.resume !== false && sameGame;
      const queue = state.modalQueue.filter((entry) => entry !== expected);
      const next = queue[0] ?? null;
      const remaining = next === null ? queue : queue.slice(1);
      const wasRunning = session.speed !== 'paused';
      const ownsArrivalPause =
        next?.pausesTime &&
        ((next.id === 'battlePrompt' && session.lastPauseReason === 'battleOffer') ||
          (next.id === 'envoy' && session.lastPauseReason === 'diploEnvoy') ||
          (next.id === 'proposalInbox' &&
            (session.lastPauseReason === 'proposalArrived' ||
              session.lastPauseReason === 'monthStart')));
      const ownsNextPause = sameGame && next?.pausesTime && (wasRunning || ownsArrivalPause);
      const speedBeforePause = ownsNextPause ? speedNumber() : state.speedBeforePause;
      const restoreSpeedOnQueueDrain =
        next !== null && ((resume && state.restoreSpeedOnQueueDrain) || !!ownsNextPause);
      // Publish the entire ownership transfer before invoking any app-store action.
      set({ modal: next, modalQueue: remaining, speedBeforePause, restoreSpeedOnQueueDrain });
      const current = get();
      const currentApp = gameStore.getState();
      if (
        !sameGame ||
        currentApp.game !== app.game ||
        currentApp.session.speed !== session.speed ||
        currentApp.session.resumeSpeed !== session.resumeSpeed ||
        currentApp.session.lastPauseReason !== session.lastPauseReason ||
        currentApp.session.fatalError !== session.fatalError ||
        currentApp.session.viewportBlocked !== session.viewportBlocked ||
        currentApp.session.screen !== session.screen ||
        current.modal !== next ||
        current.modalQueue !== remaining ||
        current.speedBeforePause !== speedBeforePause ||
        current.restoreSpeedOnQueueDrain !== restoreSpeedOnQueueDrain ||
        current.queueResumeBlocked !== state.queueResumeBlocked
      )
        return true;
      if (next?.pausesTime && wasRunning) {
        currentApp.actions.requestPause('modalOpen');
      } else if (
        next === null &&
        resume &&
        state.restoreSpeedOnQueueDrain &&
        !state.queueResumeBlocked &&
        session.fatalError === null &&
        !session.viewportBlocked &&
        session.screen === 'main' &&
        currentApp.game !== null &&
        currentApp.game.meta.gameOver === null &&
        ['modalOpen', 'battleOffer', 'proposalArrived', 'diploEnvoy', 'monthStart'].includes(
          session.lastPauseReason ?? '',
        )
      ) {
        const speed = state.speedBeforePause;
        currentApp.actions.setSpeed(speed === 5 ? 'x5' : speed === 2 ? 'x2' : 'x1');
      }
      return true;
    },
    setSelection(selection) {
      set({ selection });
    },
    setMarchDraft(marchDraft) {
      set({ marchDraft });
    },
    setMapCamera(mapCamera) {
      set({ mapCamera });
    },
    setUiScale(uiScale) {
      set({ uiScale });
    },
    applyPresentationSettings(settings) {
      const { uiScale, mapLabelDensity, effectsEnabled, notificationFilter } = settings;
      set({ uiScale, mapLabelDensity, effectsEnabled, notificationFilter });
    },
    setAnalysisMode(analysisMode) {
      set({ analysisMode });
    },
    setAnalysisOpacity(analysisOpacity) {
      if (Number.isFinite(analysisOpacity)) {
        set({ analysisOpacity: Math.max(0, Math.min(1, analysisOpacity)) });
      }
    },
    onEsc() {
      const state = get();
      if (state.modal !== null) {
        if (!FORCED_MODAL_IDS.has(state.modal.id)) state.actions.closeModal();
      } else if (state.panelStack.length > 0) {
        state.actions.closePanel();
      } else if (state.selection !== null) {
        state.actions.setSelection(null);
      } else {
        state.actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: true });
      }
    },
    reset() {
      const { uiScale, mapLabelDensity, effectsEnabled, notificationFilter } = get();
      set({
        ...initialUIState,
        uiScale,
        mapLabelDensity,
        effectsEnabled,
        notificationFilter,
        restoreSpeedOnQueueDrain: false,
        queueResumeBlocked: false,
      });
    },
  },
}));

/** 非 React 整合點與測試使用；元件內應優先使用 useUIStore selector。 */
export const uiStore = useUIStore;
