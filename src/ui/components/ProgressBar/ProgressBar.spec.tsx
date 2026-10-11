import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar accessible names', () => {
  it('uses the displayed label as its accessible name', () => {
    render(<ProgressBar value={65} max={100} label="外交進度" />);
    expect(
      screen.getByRole('progressbar', { name: '外交進度' }).getAttribute('aria-valuenow'),
    ).toBe('65');
    expect(screen.getByText('外交進度')).toBeTruthy();
  });
  it('supports an accessible-only name without adding visible layout content', () => {
    render(<ProgressBar value={700} max={1000} height={4} ariaLabel="展示城 耐久" />);
    expect(
      screen.getByRole('progressbar', { name: '展示城 耐久' }).getAttribute('aria-valuenow'),
    ).toBe('700');
    expect(screen.queryByText('展示城 耐久')).toBeNull();
  });
});
