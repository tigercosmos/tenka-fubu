import { afterEach, describe, expect, it, vi } from 'vitest';
import { waitForMapFont } from './mapFontReady';

const original = Object.getOwnPropertyDescriptor(document, 'fonts');
afterEach(() => {
  if (original !== undefined) Object.defineProperty(document, 'fonts', original);
  else Reflect.deleteProperty(document, 'fonts');
});

describe('map canvas font readiness', () => {
  it('explicitly loads the declared font and waits for readiness before proceeding', async () => {
    let finishLoad!: () => void;
    let finishReady!: () => void;
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishLoad = resolve;
        }),
    );
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: {
        load,
        ready: new Promise<void>((resolve) => {
          finishReady = resolve;
        }),
      },
    });
    let finished = false;
    const pending = waitForMapFont().then(() => {
      finished = true;
    });
    expect(load).toHaveBeenCalledWith('400 16px "Noto Serif TC"');
    expect(finished).toBe(false);
    finishLoad();
    await Promise.resolve();
    expect(finished).toBe(false);
    finishReady();
    await pending;
    expect(finished).toBe(true);
  });

  it('supports environments without the Font Loading API', async () => {
    Object.defineProperty(document, 'fonts', { configurable: true, value: undefined });
    await expect(waitForMapFont()).resolves.toBeUndefined();
  });
});
