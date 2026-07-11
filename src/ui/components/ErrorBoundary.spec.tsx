// ErrorBoundary 致命錯誤畫面測試（規格：plan/01-architecture.md §3.10.2；M1-18／01-A9）。
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';
import { CoreError } from '../../core/errors';
import { resetStateSnapshotForTests, type FatalErrorInfo } from '../../app/errors';

/** 渲染時必定擲出指定值的測試用元件。 */
function Boom({ error }: { error: unknown }): never {
  throw error;
}

describe('ErrorBoundary', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // React 攔截到未捕捉例外時本身會 console.error 一份警告；本檔的 captureFatalError
    // 亦依 01 §3.10.2 明文於 DEV 模式 console.error 原例外——兩者皆預期會發生，僅為壓低
    // 測試輸出雜訊而 mock，不代表視為錯誤。
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    resetStateSnapshotForTests();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    cleanup();
  });

  it('無例外時原樣渲染 children', () => {
    render(
      <ErrorBoundary>
        <div>安全內容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('安全內容')).toBeTruthy();
  });

  it('攔截渲染例外後顯示致命錯誤畫面（繁中字串經 t()）', () => {
    render(
      <ErrorBoundary>
        <Boom error={new CoreError('DATA_INTEGRITY', '找不到城 castle.x')} />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('fatal-error-screen')).toBeTruthy();
    expect(screen.getByText('發生未預期的錯誤')).toBeTruthy();
    expect(
      screen.getByText(
        '遊戲遇到無法復原的錯誤，時間已停止。你可以匯出最近的進度存檔，重新載入頁面後讀取。',
      ),
    ).toBeTruthy();
    expect(screen.getByText('錯誤詳情')).toBeTruthy();
    expect(screen.getByText('匯出存檔')).toBeTruthy();
    expect(screen.getByText('重新載入')).toBeTruthy();
    expect(screen.getByText(/DATA_INTEGRITY/)).toBeTruthy();
    expect(screen.getByText(/找不到城 castle\.x/)).toBeTruthy();
  });

  it('非 Error 擲出值（如字面字串）正規化為 UNKNOWN_ERROR_CODE 後仍正確顯示', () => {
    render(
      <ErrorBoundary>
        <Boom error="literal string thrown" />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/UNKNOWN_ERROR_CODE/)).toBeTruthy();
    expect(screen.getByText(/literal string thrown/)).toBeTruthy();
  });

  it('呼叫 onFatalError callback 並傳入正規化後的 FatalErrorInfo（供未來 App.tsx 接線 loop.stop/setFatalError）', () => {
    const onFatalError = vi.fn<(info: FatalErrorInfo) => void>();
    render(
      <ErrorBoundary onFatalError={onFatalError}>
        <Boom error={new CoreError('INVARIANT_VIOLATION', 'INV-04 違反')} />
      </ErrorBoundary>,
    );
    expect(onFatalError).toHaveBeenCalledTimes(1);
    const info = onFatalError.mock.calls[0]?.[0];
    expect(info).toMatchObject({ code: 'INVARIANT_VIOLATION', message: 'INV-04 違反' });
  });

  it('未提供 onFatalError 時不拋錯（callback 為選用）', () => {
    expect(() =>
      render(
        <ErrorBoundary>
          <Boom error={new Error('x')} />
        </ErrorBoundary>,
      ),
    ).not.toThrow();
  });

  it('點擊「重新載入」呼叫 window.location.reload', () => {
    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, reload: reloadSpy },
    });

    render(
      <ErrorBoundary>
        <Boom error={new Error('x')} />
      </ErrorBoundary>,
    );
    fireEvent.click(screen.getByText('重新載入'));
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('尚無狀態快照時點擊「匯出存檔」不拋錯（exportSnapshotToFile 安全早退）', () => {
    render(
      <ErrorBoundary>
        <Boom error={new Error('x')} />
      </ErrorBoundary>,
    );
    expect(() => fireEvent.click(screen.getByText('匯出存檔'))).not.toThrow();
  });
});
