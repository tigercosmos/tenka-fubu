// UI 導航狀態機（plan/11-ui-screens.md §3.1.2、§4、§5.1–§5.2；M3-16）。
// 此狀態只描述畫面、疊層與暫態草稿，不進 GameState／存檔。
import { create } from 'zustand';
import { store as gameStore } from '@app/store';
import type { MapPathPreview } from '@ui/map/mapViewTypes';
import type { CameraState } from '@ui/map/camera';

export type ScreenId = 'title' | 'scenarioSelect' | 'daimyoSelect' | 'main' | 'battle' | 'ending';
export type PanelId =
  | 'castle'
  | 'district'
  | 'officers'
  | 'officerDetail'
  | 'diplomacy'
  | 'plot'
  | 'policy'
  | 'corps'
  | 'taimei'
  | 'reports'
  | 'saveLoad'
  | 'settings';
export type ModalId =
  | 'march'
  | 'proposalInbox'
  | 'monthSummary'
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
}

export interface UIActions {
  setScreen(screen: ScreenId): void;
  openPanel(id: PanelId, params?: Record<string, string>): void;
  closePanel(): void;
  closePanelById(id: PanelId): void;
  enqueueModal(modal: ModalInstance): void;
  closeModal(): void;
  setSelection(selection: Selection | null): void;
  setMarchDraft(draft: MarchDraft | null): void;
  setMapCamera(value: UIState['mapCamera']): void;
  setUiScale(scale: number): void;
  onEsc(): void;
  reset(): void;
}

interface UIStore extends UIState {
  actions: UIActions;
  /** 強制暫停 modal 後仍有非暫停 modal 排隊時，待整條佇列清空才恢復。 */
  restoreSpeedOnQueueDrain: boolean;
}

const FORCED_MODAL_IDS = new Set<ModalId>([
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
};

/** 只由 action 呼叫；取出 FIFO 首項，必要時透過 app store 暫停策略時間。 */
function pump(state: UIStore): Partial<UIStore> | null {
  if (state.modal !== null || state.modalQueue.length === 0) return null;
  const [next, ...remaining] = state.modalQueue;
  if (next === undefined) return null;
  if (next.pausesTime) {
    const wasRunning = gameStore.getState().session.speed !== 'paused';
    const before = speedNumber();
    if (wasRunning) gameStore.getState().actions.requestPause('modalOpen');
    return {
      modal: next,
      modalQueue: remaining,
      speedBeforePause: wasRunning ? before : state.speedBeforePause,
      restoreSpeedOnQueueDrain: state.restoreSpeedOnQueueDrain || wasRunning,
    };
  }
  return { modal: next, modalQueue: remaining };
}

export const useUIStore = create<UIStore>()((set, get) => ({
  ...initialUIState,
  restoreSpeedOnQueueDrain: false,
  actions: {
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
      if (afterClose.modalQueue.length === 0 && afterClose.restoreSpeedOnQueueDrain) {
        const speed = afterClose.speedBeforePause;
        gameStore.getState().actions.setSpeed(speed === 5 ? 'x5' : speed === 2 ? 'x2' : 'x1');
        set({ restoreSpeedOnQueueDrain: false });
      }
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
    onEsc() {
      const state = get();
      if (state.modal !== null) {
        if (!FORCED_MODAL_IDS.has(state.modal.id)) state.actions.closeModal();
      } else if (state.panelStack.length > 0) {
        state.actions.closePanel();
      } else if (state.selection !== null) {
        state.actions.setSelection(null);
      } else {
        state.actions.enqueueModal({ id: 'systemMenu', params: {}, pausesTime: false });
      }
    },
    reset() {
      set({ ...initialUIState, restoreSpeedOnQueueDrain: false });
    },
  },
}));

/** 非 React 整合點與測試使用；元件內應優先使用 useUIStore selector。 */
export const uiStore = useUIStore;
