import { useState } from 'react';
import type { CommandDispatchResult } from '@app/bridge';
import { t } from '@i18n/zh-TW';
import { Dialog } from '../components';
import type { KassenOffer } from '../hooks/useKassenOffers';

interface BattlePromptProps {
  offer: KassenOffer | null;
  onAccept: (fieldCombatId: string) => CommandDispatchResult;
  onDecline: (fieldCombatId: string) => void;
}

export function BattlePrompt(props: BattlePromptProps) {
  return props.offer === null ? null : (
    <BattlePromptContent key={props.offer.fieldCombatId} {...props} offer={props.offer} />
  );
}

function BattlePromptContent({
  offer,
  onAccept,
  onDecline,
}: Omit<BattlePromptProps, 'offer'> & { offer: KassenOffer }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <Dialog open title={t('ui.battle.prompt')} onClose={() => onDecline(offer.fieldCombatId)}>
      <article data-testid="battle-offer">
        <p>
          {t('ui.battle.offer.encounter', {
            place: offer.place,
            clans: offer.clans,
            troops: offer.troops,
          })}
        </p>
        <p>{t('ui.battle.offer.declineHelp')}</p>
        <button type="button" onClick={() => onDecline(offer.fieldCombatId)}>
          {t('ui.battle.offer.decline')}
        </button>
        <button
          type="button"
          disabled={offer.queued}
          onClick={() => {
            const result = onAccept(offer.fieldCombatId);
            setError(result.ok ? null : t(result.reason, result.params));
          }}
        >
          {t('ui.battle.offer.accept')}
        </button>
        {offer.queued && <p role="status">{t('ui.battle.offer.queued')}</p>}
        {error !== null && <p role="alert">{error}</p>}
      </article>
    </Dialog>
  );
}
