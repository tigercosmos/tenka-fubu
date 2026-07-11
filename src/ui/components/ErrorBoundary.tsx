// 致命錯誤畫面（規格：plan/01-architecture.md §3.10.2「UI 的錯誤攔截」／§6.1（佈局：
// 全螢幕不可關閉遮罩，置於最頂層）／§6.2（繁中字串）；M1-18／01-A9）。
//
// 攔截 React 渲染例外 → 顯示致命錯誤畫面；提供「匯出存檔」「重新載入」與可展開的錯誤詳情
// （code＋stack）。`loop.stop()`／`store.actions.setFatalError` 的實際接線屬呼叫端
// （`src/app/App.tsx`）責任：本元件以 `onFatalError` callback 讓呼叫端注入，元件本身不直接
// import 尚在其他任務施工中的模組，避免耦合。

import { Component, type ReactNode } from 'react';
import { t } from '@i18n/zh-TW';
import { captureFatalError, exportSnapshotToFile, type FatalErrorInfo } from '@app/errors';

export interface ErrorBoundaryProps {
  children: ReactNode;
  /** 由呼叫端注入（App.tsx）：`loop.stop()`／`store.getState().actions.setFatalError(info)`。 */
  onFatalError?: (info: FatalErrorInfo) => void;
}

interface ErrorBoundaryState {
  fatalError: FatalErrorInfo | null;
}

/** 致命錯誤畫面的 z-index：刻意高於 design tokens 既有最高階 `--z-dev`（1200，12 §3.1.6），
 *  因致命錯誤畫面須「置於最頂層」（01 §6.1），優先度高於除錯面板本身。 */
const FATAL_SCREEN_Z_INDEX = 9999;

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { fatalError: null };

  static getDerivedStateFromError(error: unknown): Partial<ErrorBoundaryState> {
    return { fatalError: captureFatalError(error) };
  }

  override componentDidCatch(): void {
    const { fatalError } = this.state;
    if (fatalError !== null) {
      this.props.onFatalError?.(fatalError);
    }
  }

  private handleExport = (): void => {
    exportSnapshotToFile();
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  override render(): ReactNode {
    const { fatalError } = this.state;
    if (fatalError === null) {
      return this.props.children;
    }
    return (
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="fatal-error-title"
        data-testid="fatal-error-screen"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: FATAL_SCREEN_Z_INDEX,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--ink-900)',
          color: 'var(--washi-100)',
          padding: 'var(--space-8)',
        }}
      >
        <div
          style={{
            maxWidth: '32rem',
            width: '100%',
            background: 'var(--ink-700)',
            borderRadius: 'var(--radius-md)',
            padding: 'var(--space-8)',
            boxShadow: 'var(--shadow-2)',
          }}
        >
          <h1 id="fatal-error-title" style={{ marginTop: 0, fontSize: 'var(--font-size-xl)' }}>
            {t('ui.error.title')}
          </h1>
          <p>{t('ui.error.body')}</p>
          <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-6)' }}>
            <button type="button" onClick={this.handleExport}>
              {t('ui.error.export')}
            </button>
            <button type="button" onClick={this.handleReload}>
              {t('ui.error.reload')}
            </button>
          </div>
          <details style={{ marginTop: 'var(--space-6)' }}>
            <summary>{t('ui.error.detail')}</summary>
            <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {fatalError.code}: {fatalError.message}
              {'\n'}
              {fatalError.stack}
            </pre>
          </details>
        </div>
      </div>
    );
  }
}
