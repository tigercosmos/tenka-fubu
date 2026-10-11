import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ResourceBar } from './ResourceBar';
import { MotionContext } from '../../motion/MotionContext';
import { t } from '@i18n/zh-TW';
import styles from './ResourceBar.module.css';

describe('ResourceBar compact semantic layout (DOM, not native geometry)', () => {
  it('groups every full value below its label without losing forecast or keyboard details', () => {
    render(
      <MotionContext.Provider value={true}>
        <ResourceBar
          date={90}
          gold={3000}
          foodTotal={26306}
          foodMonthsLeft={12}
          soldiersTotal={5200}
          soldiersCap={3000}
          prestige={123}
          goldDelta={{ perMonth: 188, breakdown: [{ label: 'income detail', value: 188 }] }}
          foodDelta={{ perMonth: -200, breakdown: [] }}
        />
      </MotionContext.Provider>,
    );
    for (const key of ['gold', 'food', 'soldiers', 'prestige']) {
      const label = screen.getByText(t(`ui.hud.${key}`));
      const item = label.closest('[tabindex]');
      expect(item?.querySelector(`.${styles.itemHeading}`)?.textContent).toBe(label.textContent);
      expect(item?.querySelector(`.${styles.itemValue}`)?.querySelector('strong')).toBeTruthy();
    }
    expect(screen.getByText('26,306')).toBeTruthy();
    expect(screen.getByText('5,200')).toBeTruthy();
    expect(screen.getByText('/3,000')).toBeTruthy();
    expect(screen.getByText('123')).toBeTruthy();
    expect(screen.getByTestId('food-coverage-months').textContent).toBe('12');
    fireEvent.focus(screen.getByText(t('ui.hud.gold')).closest('[tabindex]')!);
    expect(screen.getByRole('tooltip').textContent).toContain('income detail');
    expect(screen.getByTestId('hud-date')).toBeTruthy();
  });
});
