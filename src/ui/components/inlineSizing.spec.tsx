import { act, cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { uiStore } from '../hooks/uiStore';
import { ProgressBar } from './ProgressBar/ProgressBar';
import { StatBar } from './StatBar/StatBar';
import { Tooltip } from './Tooltip/Tooltip';

afterEach(() => {
  cleanup();
  uiStore.getState().actions.setUiScale(1);
});

describe('scaled logical inline component dimensions', () => {
  it.each([0.8, 1, 1.5])(
    'keeps dimensions root-relative and physical tooltip position scaled at%s',
    (scale) => {
      uiStore.getState().actions.setUiScale(scale);
      const { container, getByRole } = render(
        <>
          <ProgressBar value={50} max={100} height={16} label="Progress" />
          <StatBar label="Value" value={90} width={160} />
          <Tooltip content="Tooltip" maxWidth={320}>
            <button type="button">Trigger</button>
          </Tooltip>
        </>,
      );
      expect(getByRole('progressbar').style.height).toBe('1rem');
      expect(
        getByRole('img', { name: 'Value 90' }).querySelector('[style]')?.getAttribute('style'),
      ).toContain('width: 10rem');
      fireEvent.focus(getByRole('button', { name: 'Trigger' }));
      const tip = getByRole('tooltip');
      expect(tip.style.maxWidth).toBe('20rem');
      expect(Number.parseFloat(tip.style.left)).toBeCloseTo(8 * scale, 10);
      expect(Number.parseFloat(tip.style.top)).toBeCloseTo(8 * scale, 10);
      expect(container.querySelector('[role="progressbar"] span')?.getAttribute('style')).toContain(
        'width: 50%',
      );
      act(() => uiStore.getState().actions.setUiScale(scale === 1.5 ? 0.8 : 1.5));
      const next = scale === 1.5 ? 0.8 : 1.5;
      expect(Number.parseFloat(tip.style.left)).toBeCloseTo(8 * next, 10);
    },
  );
});
