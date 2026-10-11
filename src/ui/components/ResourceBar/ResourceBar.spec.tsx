import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResourceBar, type ResourceBarProps } from './ResourceBar';
import { MotionContext } from '../../motion/MotionContext';
import { t } from '@i18n/zh-TW';
import styles from './ResourceBar.module.css';

function foodBar(foodMonthsLeft?: number) {
  return (
    <MotionContext.Provider value={true}>
      <ResourceBar
        {...(foodMonthsLeft === undefined ? {} : { foodMonthsLeft })}
        gold={100}
        goldDelta={{ perMonth: 1, breakdown: [] }}
        foodTotal={300}
        foodDelta={{ perMonth: -100, breakdown: [{ label: 'test upkeep', value: -100 }] }}
        soldiersTotal={10}
        soldiersCap={20}
        prestige={1}
        date={90}
      />
    </MotionContext.Provider>
  );
}

describe('ResourceBar actual forecast food coverage', () => {
  it.each([0, 1, 2, 3])(
    'shows %s months with warning only at the canonical threshold',
    (months) => {
      render(foodBar(months));
      expect(screen.getByLabelText(t('ui.budget.foodMonthsLeft', { months }))).toBeTruthy();
      const number = screen.getByTestId('food-coverage-months');
      expect(number.textContent).toBe(String(months));
      const warningClass = styles.foodWarning;
      if (warningClass === undefined) throw new Error('Missing food warning style');
      expect(number.classList.contains(warningClass)).toBe(months <= 2);
      expect(screen.getByText('300')).toBeTruthy();
    },
  );

  it('distinguishes zero consumption, unknown coverage, and an omitted legacy prop', () => {
    const view = render(foodBar(Infinity));
    expect(screen.getByText(t('ui.hud.foodNoConsumption'))).toBeTruthy();
    for (const value of [NaN, -Infinity]) {
      view.rerender(foodBar(value));
      expect(screen.getByText(t('ui.hud.foodCoverageUnknown'))).toBeTruthy();
      expect(screen.queryByText(t('ui.hud.foodNoConsumption'))).toBeNull();
    }
    view.rerender(foodBar());
    expect(screen.queryByTestId('food-coverage')).toBeNull();
  });

  it('updates coverage without changing inputs or the keyboard-accessible breakdown', () => {
    const props: ResourceBarProps = {
      foodMonthsLeft: 3,
      foodTotal: 300,
      foodDelta: { perMonth: -100, breakdown: [{ label: 'test upkeep', value: -100 }] },
      gold: 100,
      goldDelta: { perMonth: 1, breakdown: [] },
      soldiersTotal: 10,
      soldiersCap: 20,
      prestige: 1,
      date: 90,
    };
    const before = structuredClone(props);
    const renderProps = (months: number) => (
      <MotionContext.Provider value={true}>
        <ResourceBar {...props} foodMonthsLeft={months} />
      </MotionContext.Provider>
    );
    const view = render(renderProps(3));
    fireEvent.focus(screen.getByText(t('ui.hud.food')).closest('[tabindex]')!);
    expect(screen.getByRole('tooltip').textContent).toContain('test upkeep');
    view.rerender(renderProps(1));
    expect(screen.getByTestId('food-coverage-months').textContent).toBe('1');
    expect(props).toEqual(before);
  });
});

describe('ResourceBar faction identity semantics', () => {
  it('live OS reduction cancels number tween frames and preserves the latest semantic value', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(123);
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const resource = (gold: number, reduced: boolean) => (
      <MotionContext.Provider value={reduced}>
        <ResourceBar
          gold={gold}
          goldDelta={{ perMonth: 0, breakdown: [] }}
          foodTotal={0}
          foodDelta={{ perMonth: 0, breakdown: [] }}
          soldiersTotal={0}
          soldiersCap={0}
          prestige={0}
          date={90}
        />
      </MotionContext.Provider>
    );
    const view = render(resource(1000, false));
    view.rerender(resource(2000, false));
    expect(screen.queryByText('2,000')).toBeNull();
    view.rerender(resource(2000, true));
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(cancel).toHaveBeenCalledWith(123);
    view.unmount();
    vi.restoreAllMocks();
  });
  it.each([
    ['織田家', '織田家'],
    ['足利將軍家', '足利將軍家'],
    ['織田', '織田家'],
  ])('names the %s group without duplicating the family suffix', (name, label) => {
    render(
      <ResourceBar
        clanName={name}
        clanColorIndex={5}
        gold={0}
        goldDelta={{ perMonth: 0, breakdown: [] }}
        foodTotal={0}
        foodDelta={{ perMonth: 0, breakdown: [] }}
        soldiersTotal={0}
        soldiersCap={0}
        prestige={0}
        date={90}
      />,
    );
    expect(screen.getByRole('group', { name: label }).tagName).toBe('SPAN');
    expect(screen.getByText(name)).toBeTruthy();
    expect(screen.queryByLabelText(`${label}家`)).toBeNull();
  });
});
