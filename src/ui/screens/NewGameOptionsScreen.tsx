import type { Difficulty } from '@core/state/enums';
import { useEffect, useRef } from 'react';
import { t } from '@i18n/zh-TW';
import { WizardProgress } from './WizardProgress';
import styles from './NewGameOptionsScreen.module.css';

export function validWizardSeed(raw: string): number | null {
  if (!/^[0-9]+$/u.test(raw)) return null;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value <= 0xffffffff ? value : null;
}

export interface NewGameOptionsScreenProps {
  step: 'difficulty' | 'seed';
  difficulty: Difficulty;
  seedText: string;
  onDifficulty: (value: Difficulty) => void;
  onSeedText: (value: string) => void;
  onBack: () => void;
  onNext: () => void;
  onStart: () => void;
}

export function NewGameOptionsScreen({
  step,
  difficulty,
  seedText,
  onDifficulty,
  onSeedText,
  onBack,
  onNext,
  onStart,
}: NewGameOptionsScreenProps) {
  const seedValid = validWizardSeed(seedText) !== null;
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [step]);
  return (
    <div
      className={styles.screen}
      data-testid={step === 'difficulty' ? 'screen-difficulty-select' : 'screen-seed-select'}
    >
      <header className={styles.header}>
        <h1 ref={heading} tabIndex={-1}>
          {t(step === 'difficulty' ? 'ui.newGame.stepDifficulty' : 'ui.newGame.stepSeed')}
        </h1>
        <button type="button" onClick={onBack} data-testid={`${step}-back`}>
          {t('ui.newGame.back')}
        </button>
      </header>
      <WizardProgress step={step === 'difficulty' ? 3 : 4} />
      {step === 'difficulty' ? (
        <div className={styles.content}>
          <fieldset className={styles.choices}>
            <legend>{t('ui.newGame.stepDifficulty')}</legend>
            {(['easy', 'normal', 'hard'] as const).map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="newgame-difficulty"
                  value={value}
                  checked={difficulty === value}
                  onChange={() => onDifficulty(value)}
                />
                {t(`term.difficulty.${value}`)}
              </label>
            ))}
          </fieldset>
          <button type="button" data-testid="difficulty-next" onClick={onNext}>
            {t('ui.newGame.next')}
          </button>
        </div>
      ) : (
        <div className={styles.content}>
          <label htmlFor="newgame-seed">{t('ui.newGame.stepSeed')}</label>
          <input
            id="newgame-seed"
            data-testid="newgame-seed"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            value={seedText}
            aria-invalid={!seedValid}
            aria-describedby={
              seedValid ? 'newgame-seed-hint' : 'newgame-seed-hint newgame-seed-error'
            }
            onChange={(event) => onSeedText(event.target.value)}
          />
          <p id="newgame-seed-hint">{t('ui.newGame.seedHint')}</p>
          {!seedValid && (
            <p id="newgame-seed-error" role="alert">
              {t('ui.newGame.seedInvalid')}
            </p>
          )}
          <button type="button" data-testid="newgame-start" disabled={!seedValid} onClick={onStart}>
            {t('ui.newGame.start')}
          </button>
        </div>
      )}
    </div>
  );
}
