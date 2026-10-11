import { createProgressTracker, type MarkSnapshot, type ProgressMark } from './progressTracker';

const EMPTY_MARK: ProgressMark = { tick: 0, lastAppliedCmdSeq: 0, pendingCommands: [] };
interface ProgressBindingOptions {
  getSession: () => object | null;
  getMark: () => ProgressMark | null;
  subscribe: (listener: () => void) => () => void;
  now: () => number;
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  onDirtyChange?: (dirty: boolean) => void;
}

/** 外殼連接 dirty／beforeunload；所有真實時間與 DOM 留在 app 層。 */
export function createSessionProgressBinding(options: ProgressBindingOptions) {
  const tracker = createProgressTracker();
  let session: object | null = null;
  let unsubscribe: (() => void) | null = null;
  let installation = 0;
  let warningInstalled = false;
  let publishedDirty = false;

  function publish(): void {
    const dirty = tracker.isDirty();
    if (dirty !== warningInstalled) {
      if (dirty) options.target.addEventListener('beforeunload', beforeUnload);
      else options.target.removeEventListener('beforeunload', beforeUnload);
      warningInstalled = dirty;
    }
    if (dirty !== publishedDirty) {
      publishedDirty = dirty;
      options.onDirtyChange?.(dirty);
    }
  }
  function synchronize(): void {
    const nextSession = options.getSession();
    const mark = options.getMark() ?? EMPTY_MARK;
    if (nextSession !== session) {
      session = nextSession;
      tracker.reset(session, mark, options.now());
    } else tracker.observe(mark, options.now());
    publish();
  }
  function beforeUnload(event: BeforeUnloadEvent): void {
    synchronize();
    if (!tracker.shouldWarnBeforeUnload()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  return {
    install(): () => void {
      const ownedInstallation = ++installation;
      unsubscribe?.();
      unsubscribe = options.subscribe(synchronize);
      synchronize();
      return () => {
        if (ownedInstallation !== installation) return;
        unsubscribe?.();
        unsubscribe = null;
        if (warningInstalled) options.target.removeEventListener('beforeunload', beforeUnload);
        warningInstalled = false;
      };
    },
    /** 呼叫端先掛上 GameState 並恢復佇列，再建立乾淨的新局／讀檔基線。 */
    resetSession(playtimeSeconds = 0): void {
      session = options.getSession();
      tracker.reset(session, options.getMark() ?? EMPTY_MARK, options.now(), playtimeSeconds);
      publish();
    },
    captureSave(): MarkSnapshot | null {
      synchronize();
      return tracker.captureSave(options.getMark() ?? EMPTY_MARK, options.now());
    },
    completeSave(snapshot: MarkSnapshot): boolean {
      // I/O 期間的進度必須先觀察，再套用舊快照的成功標記。
      synchronize();
      const accepted = tracker.completeSave(snapshot);
      publish();
      return accepted;
    },
    isDirty(): boolean {
      synchronize();
      return tracker.isDirty();
    },
    getPlaytimeSeconds(): number {
      synchronize();
      return tracker.getPlaytimeSeconds(options.now());
    },
  };
}
