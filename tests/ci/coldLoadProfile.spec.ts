import { describe, expect, it } from 'vitest';
import {
  FAST_4G,
  coldLoadBaseUrl,
  initialInteractionPasses,
  INITIAL_INTERACTIVE_LIMIT_MS,
} from '../../tools/perf/cold-load';

describe('cold initial interaction budget', () => {
  it('preserves Pages directory paths and rejects ambiguous external targets', () => {
    expect(coldLoadBaseUrl(undefined)).toBe('http://localhost:4181/');
    expect(coldLoadBaseUrl('https://host/tenka-fubu')).toBe('https://host/tenka-fubu/');
    expect(new URL('./', coldLoadBaseUrl('https://host/tenka-fubu')).href).toBe(
      'https://host/tenka-fubu/',
    );
    for (const url of [
      '',
      ' ',
      ' https://host/',
      'relative',
      'file:///tmp/site',
      'https://user:pass@host/',
      'https://host/?debug=1',
      'https://host/#fragment',
    ])
      expect(() => coldLoadBaseUrl(url)).toThrow();
  });
  it('uses the adjusted Chromium Fast4G profile, not Slow4G or unthrottled conditions', () => {
    expect(FAST_4G).toEqual({
      offline: false,
      latency: 165,
      downloadThroughput: 1012500,
      uploadThroughput: 168750,
      connectionType: 'cellular4g',
    });
  });
  it('keeps the strict3000ms limit and rejects missing or nonfinite observations', () => {
    expect(INITIAL_INTERACTIVE_LIMIT_MS).toBe(3000);
    expect(initialInteractionPasses(2999.99)).toBe(true);
    for (const value of [0, -1, 3000, 3000.01, Number.NaN, Infinity])
      expect(initialInteractionPasses(value)).toBe(false);
  });
});
