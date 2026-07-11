// 最小標題畫面（規格：plan/11-ui-screens.md §3.2.1 縮減版；18-roadmap.md M1-20）。
//
// M1 縮減：僅「天下布武」標題＋副標＋三顆主鈕（新遊戲／繼續／設定）。「繼續」「設定」依存檔
// （M8）／設定系統（M8）落地前恆為 disabled（比照 16-T7「無存檔『繼續』停用」精神提前套用）；
// 劇本選擇／大名選擇（11 §3.2.2／§3.2.3）與完整四主鈕流程留待 M2-19／M8-17。
// data-testid 依 plan/17-testing.md §6.2 契約：`screen-title`／`title-newgame`／`title-loadgame`。

import type { ReactElement } from 'react';
import { t } from '@i18n/zh-TW';

export interface TitleScreenProps {
  /** 點擊「新遊戲」（M1 直接以 tests/fixtures/tiny.ts 建局，見 src/app/newGame.ts）。 */
  onNewGame: () => void;
}

export function TitleScreen({ onNewGame }: TitleScreenProps): ReactElement {
  return (
    <div
      data-testid="screen-title"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 'var(--space-8)',
        background: 'var(--ink-900)',
        color: 'var(--washi-100)',
        textAlign: 'center',
      }}
    >
      <div>
        <h1
          style={{
            fontSize: 'var(--font-size-xxl)',
            letterSpacing: '0.3em',
            color: 'var(--washi-100)',
            margin: 0,
          }}
        >
          {t('ui.title.gameTitle')}
        </h1>
        <p style={{ color: 'var(--accent-gold-text)', marginTop: 'var(--space-2)' }}>
          {t('ui.title.subtitle')}
        </p>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-4)',
          width: '20rem',
        }}
      >
        <button type="button" data-testid="title-newgame" onClick={onNewGame}>
          {t('ui.title.newGame')}
        </button>
        {/* 無存檔系統前恆停用（M8-17 落地存讀檔後接線，比照 16-T7 精神）。 */}
        <button type="button" data-testid="title-loadgame" disabled>
          {t('ui.title.continue')}
        </button>
        <button type="button" data-testid="title-settings" disabled>
          {t('ui.title.settings')}
        </button>
      </div>

      <p
        style={{
          position: 'fixed',
          bottom: 'var(--space-4)',
          fontSize: 'var(--font-size-xs)',
          color: 'var(--ink-300)',
        }}
      >
        v0.0.0 ・ {t('ui.title.disclaimer')}
      </p>
    </div>
  );
}
