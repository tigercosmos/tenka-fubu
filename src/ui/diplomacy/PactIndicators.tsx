import type { Pact } from '@core/state/gameState';
import { t } from '@i18n/zh-TW';
import { Badge } from '../components';
import { Icon } from '../components/IconButton/icons';
import styles from './PactIndicators.module.css';

const marks = { marriage: '婚', ceasefire: '休', vassal: '從' } as const;

/** Displays current detached pact facts; expiration remains canonical system work. */
export function PactIndicators({ pacts }: { pacts: readonly Readonly<Pact>[] }) {
  return (
    <span className={styles.indicators}>
      {pacts.map((pact) => (
        <span key={pact.kind} role="img" aria-label={t(`term.pact.${pact.kind}`)}>
          {pact.kind === 'alliance' ? (
            <Icon name="handshake" width={16} height={16} />
          ) : (
            <Badge label={marks[pact.kind]} />
          )}
        </span>
      ))}
    </span>
  );
}
