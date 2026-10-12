import { t } from '@i18n/zh-TW';
import styles from './WizardProgress.module.css';

const steps = [
  t('ui.newGame.stepScenario'),
  t('ui.newGame.stepDaimyo'),
  t('ui.newGame.stepDifficulty'),
  t('ui.newGame.stepSeed'),
] as const;

export function WizardProgress({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className={styles.steps} aria-label={t('ui.newGame.progress')}>
      {steps.map((label, index) => (
        <li key={label} aria-current={index + 1 === step ? 'step' : undefined}>
          <span>{index + 1}</span> {label}
        </li>
      ))}
    </ol>
  );
}
