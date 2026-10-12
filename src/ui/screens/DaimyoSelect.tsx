// 大名選擇畫面（規格：plan/11-ui-screens.md §3.2.3 縮減版；18-roadmap.md M2-19「11-T2 縮減」）。
//
// 可選勢力＝目前已載入批次（含織田）。選擇留在 App 精靈狀態，返回後仍保留。
// data-testid 依 plan/17-testing.md §6.2 契約：`clan-pick-{clanId}`；根節點比照
// `screen-*` 命名慣例新增 `screen-daimyo-select`。

import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { t, formatNumber } from '@i18n/zh-TW';
import { summarizeClans, getScenarioTitle } from '@app/boot';
import type { ScenarioBundleData } from '@data/schemas';
import type { ClanId } from '@core/state/ids';
import { WizardProgress } from './WizardProgress';
import { DaimyoTerritoryPreview } from './DaimyoTerritoryPreview';
import styles from './DaimyoSelect.module.css';

export interface DaimyoSelectProps {
  /** ScenarioSelectScreen 已載入之劇本資料束。 */
  bundle: ScenarioBundleData;
  onBack: () => void;
  selectedClanId: ClanId | null;
  onSelectClan: (clanId: ClanId) => void;
  onNext: () => void;
}

export function DaimyoSelect({
  bundle,
  onBack,
  selectedClanId,
  onSelectClan,
  onNext,
}: DaimyoSelectProps): ReactElement {
  const summaries = useMemo(() => summarizeClans(bundle), [bundle]);
  const selected = summaries.find((clan) => clan.clanId === selectedClanId);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => heading.current?.focus(), []);

  return (
    <div data-testid="screen-daimyo-select" className={styles.screen}>
      <header className={styles.header}>
        <h1 ref={heading} tabIndex={-1}>
          {t('ui.daimyo.title')}
          {'　'}
          {getScenarioTitle(bundle.id)}
        </h1>
        <button type="button" data-testid="daimyo-back" onClick={onBack}>
          {t('ui.newGame.back')}
        </button>
      </header>
      <WizardProgress step={2} />

      <div className={styles.body}>
        <div className={styles.leftPanel}>
          <DaimyoTerritoryPreview
            bundle={bundle}
            selectedClanId={selectedClanId}
            selectedName={selected?.name ?? null}
            onSelectClan={onSelectClan}
          />
          <div className={styles.roster}>
            {summaries.map((s) => (
              <button
                key={s.clanId}
                type="button"
                data-testid={`clan-pick-${s.clanId}`}
                aria-pressed={selectedClanId === s.clanId}
                onClick={() => onSelectClan(s.clanId)}
                className={styles.clan}
              >
                <strong className={styles.clanName}>{s.name}</strong>
                {s.clanId === 'clan.oda' && (
                  <span className={styles.recommended}>{t('ui.newGame.recommended')}</span>
                )}
                <span>
                  {t('ui.daimyo.leader')}：{s.leaderName}
                </span>
                <span>
                  {t('ui.daimyo.kokudaka')}：{formatNumber(s.kokudaka)}石
                </span>
                <span>
                  {t('ui.daimyo.castles')}：{s.castleCount}
                  {'　'}
                  {t('ui.daimyo.officers')}：{s.officerCount}
                </span>
              </button>
            ))}
          </div>
        </div>

        <aside className={styles.selection} aria-live="polite">
          <div className={styles.selectionHeading}>
            <span className={styles.eyebrow}>{t('ui.daimyo.leader')}</span>
            <h2>{selected?.name ?? t('ui.common.select')}</h2>
            {selected && <p>{selected.leaderName}</p>}
          </div>
          {selected && (
            <dl className={styles.metrics}>
              <div>
                <dt>{t('ui.daimyo.kokudaka')}</dt>
                <dd>{formatNumber(selected.kokudaka)}石</dd>
              </div>
              <div>
                <dt>{t('ui.daimyo.castles')}</dt>
                <dd>{selected.castleCount}</dd>
              </div>
              <div>
                <dt>{t('ui.daimyo.officers')}</dt>
                <dd>{selected.officerCount}</dd>
              </div>
            </dl>
          )}
          <button
            type="button"
            data-testid="daimyo-next"
            disabled={selectedClanId === null}
            onClick={onNext}
            className={styles.start}
          >
            {t('ui.newGame.next')}
          </button>
        </aside>
      </div>
    </div>
  );
}
