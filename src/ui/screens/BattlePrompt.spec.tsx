import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BattlePrompt } from './BattlePrompt';
import type { KassenOffer } from '../hooks/useKassenOffers';

const offer: KassenOffer = {
  fieldCombatId: 'fc.actual-30',
  place: '城',
  clans: '甲、乙',
  troops: 4000,
  queued: false,
};
afterEach(cleanup);
describe('BattlePrompt', () => {
  it('renders a native dismissible dialog and requests only explicit acceptance', () => {
    const accept = vi.fn(() => ({ ok: true as const }));
    const decline = vi.fn();
    render(<BattlePrompt offer={offer} onAccept={accept} onDecline={decline} />);
    expect(screen.getByRole('dialog', { name: '是否發動合戰？' })).toBeTruthy();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(decline).toHaveBeenCalledWith(offer.fieldCombatId);
    expect(accept).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '發動合戰' }));
    expect(accept).toHaveBeenCalledWith(offer.fieldCombatId);
  });
  it('displays queued intent separately and prevents resubmission', () => {
    const accept = vi.fn(() => ({ ok: true as const }));
    render(
      <BattlePrompt offer={{ ...offer, queued: true }} onAccept={accept} onDecline={() => {}} />,
    );
    const button = screen.getByRole('button', { name: '發動合戰' });
    expect(button).toHaveProperty('disabled', true);
    fireEvent.click(button);
    expect(accept).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toContain('目前尚未進入合戰');
  });
  it('surfaces actual dispatch rejection without claiming that a battle began', () => {
    render(
      <BattlePrompt
        offer={offer}
        onAccept={() => ({ ok: false, reason: 'cmd.reject.invalidTarget' })}
        onDecline={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '發動合戰' }));
    expect(screen.getByRole('alert').textContent).toBeTruthy();
  });
});
