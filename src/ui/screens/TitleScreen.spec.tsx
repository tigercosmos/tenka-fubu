// TitleScreen 元件測試（M1-20；18-roadmap.md M1-20 驗收：「頁面含『天下布武』」）。
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TitleScreen } from './TitleScreen';

afterEach(() => {
  cleanup();
});

describe('TitleScreen（11 §3.2.1 縮減版）', () => {
  it('畫面根節點 data-testid="screen-title"，且畫面含「天下布武」（18-roadmap M1-20 驗收）', () => {
    render(<TitleScreen onNewGame={() => {}} />);
    expect(screen.getByTestId('screen-title')).toBeTruthy();
    expect(screen.getByText('天下布武')).toBeTruthy();
  });

  it('顯示副標與非商業致敬同人作品聲明（00 §1.2）', () => {
    render(<TitleScreen onNewGame={() => {}} />);
    expect(screen.getByText('〜 戰國大戰略・致敬同人作品 〜')).toBeTruthy();
    expect(screen.getByText(/非商業致敬同人作品/)).toBeTruthy();
  });

  it('點擊 data-testid="title-newgame" 呼叫 onNewGame（17 §6.2 testid 契約）', () => {
    const onNewGame = vi.fn();
    render(<TitleScreen onNewGame={onNewGame} />);
    fireEvent.click(screen.getByTestId('title-newgame'));
    expect(onNewGame).toHaveBeenCalledTimes(1);
  });

  it('「繼續」（title-loadgame）與「設定」在無存檔／設定系統前恆為 disabled', () => {
    render(<TitleScreen onNewGame={() => {}} />);
    expect(screen.getByTestId('title-loadgame')).toHaveProperty('disabled', true);
    expect(screen.getByTestId('title-settings')).toHaveProperty('disabled', true);
  });
});
