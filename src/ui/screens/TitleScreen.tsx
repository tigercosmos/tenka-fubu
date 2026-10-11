// Title entry points follow 11 §3.2 and 16 §3.9.
// App supplies the latest loadable save preview and owns loading, settings and new-game navigation.

import { useId, type ReactElement } from 'react';
import { formatDate, t } from '@i18n/zh-TW';
import type { ContinueSavePreview } from '../../app/persistence/useSaveLoad';
import styles from './TitleScreen.module.css';

export interface TitleScreenProps {
  /** Opens the scenario, clan, difficulty and seed wizard. */
  onNewGame: () => void;
  /** 是否存在可續玩的存檔（16 §5.8；MVP 存讀檔先行，決定「繼續」啟用）。 */
  hasSave?: boolean;
  continuePreview?: ContinueSavePreview | null;
  /** 點擊「繼續」：載入最新存檔（App 外殼處理；hasSave=false 時不會被呼叫）。 */
  onContinue?: () => void;
  onSettings?: () => void;
  onLoadGame?: () => void;
}

export function TitleScreen({
  onNewGame,
  hasSave,
  continuePreview,
  onContinue,
  onSettings,
  onLoadGame,
}: TitleScreenProps): ReactElement {
  const previewId = useId();
  const realDate = continuePreview?.timestamp == null ? null : new Date(continuePreview.timestamp);
  return (
    <div data-testid="screen-title" className={styles.screen}>
      <div className={styles.identity}>
        <div className={styles.landscape} aria-hidden="true" />
        <span className={styles.seal} aria-hidden="true">
          天下
        </span>
        <h1 className={styles.title}>{t('ui.title.gameTitle')}</h1>
        <p className={styles.subtitle}>{t('ui.title.subtitle')}</p>
      </div>

      <nav className={styles.menu} aria-label={t('ui.title.gameTitle')}>
        <button
          className={styles.primary}
          type="button"
          data-testid="title-newgame"
          onClick={onNewGame}
        >
          <span className={styles.menuIndex} aria-hidden="true">
            01
          </span>
          {t('ui.title.newGame')}
        </button>
        <div className={styles.continueEntry}>
          <button
            type="button"
            data-testid="title-loadgame"
            disabled={hasSave !== true}
            aria-describedby={hasSave === true && continuePreview ? previewId : undefined}
            onClick={onContinue}
          >
            <span className={styles.menuIndex} aria-hidden="true">
              02
            </span>
            {t('ui.title.continue')}
          </button>
          {hasSave === true && continuePreview && (
            <p
              id={previewId}
              className={styles.continuePreview}
              data-testid="title-continue-preview"
            >
              <span>
                {continuePreview.clanName} · {continuePreview.leaderName}
              </span>
              <span>{continuePreview.dateText ?? formatDate(continuePreview.day)}</span>
              {realDate !== null && Number.isFinite(realDate.getTime()) && (
                <time dateTime={realDate.toISOString()}>{realDate.toLocaleString('zh-TW')}</time>
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          data-testid="title-save-list"
          disabled={onLoadGame === undefined}
          onClick={onLoadGame}
        >
          <span className={styles.menuIndex} aria-hidden="true">
            03
          </span>
          {t('ui.title.loadGame')}
        </button>
        <button
          type="button"
          data-testid="title-settings"
          disabled={onSettings === undefined}
          onClick={onSettings}
        >
          <span className={styles.menuIndex} aria-hidden="true">
            04
          </span>
          {t('ui.title.settings')}
        </button>
      </nav>

      <p className={styles.footer}>v0.0.0 ・ {t('ui.title.disclaimer')}</p>
    </div>
  );
}
