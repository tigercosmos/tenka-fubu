import { describe, expect, it } from 'vitest';
import { decodeSave, encodeSave } from '../../src/core/save/serialize';
import { buildTinyState } from '../fixtures/tiny';

describe('save contract top-level state shapes (16 §3.7)', () => {
  it.each(['time', 'clans', 'officers', 'castles', 'districts', 'events', 'rng'])(
    'retains the existing envelope rejection for malformed %s',
    (key) => {
      for (const value of [undefined, null, [], 'invalid', 1, false]) {
        const file = JSON.parse(encodeSave(buildTinyState(), 123)) as {
          state: Record<string, unknown>;
        };
        if (value === undefined) delete file.state[key];
        else file.state[key] = value;
        expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'invalidFile' });
      }
    },
  );

  it.each(['provinces', 'armies', 'battles', 'diplomacy', 'court'])(
    'rejects a non-object %s without loading a partially valid state',
    (key) => {
      for (const value of [undefined, null, [], 'invalid', 1, false]) {
        const file = JSON.parse(encodeSave(buildTinyState(), 123)) as {
          state: Record<string, unknown>;
        };
        if (value === undefined) delete file.state[key];
        else file.state[key] = value;
        expect(decodeSave(JSON.stringify(file)), `${key}=${JSON.stringify(value)}`).toEqual({
          ok: false,
          code: 'corrupt',
        });
      }
    },
  );

  it('rejects non-array reports, including an object masquerading as an empty list', () => {
    for (const value of [undefined, null, {}, 'invalid', 1, false]) {
      const file = JSON.parse(encodeSave(buildTinyState(), 123)) as {
        state: Record<string, unknown>;
      };
      if (value === undefined) delete file.state.reports;
      else file.state.reports = value;
      expect(decodeSave(JSON.stringify(file))).toEqual({ ok: false, code: 'corrupt' });
    }
  });

  it('preserves a valid native state without adding defaults or mutating the payload', () => {
    const state = buildTinyState();
    const before = structuredClone(state);
    const result = decodeSave(encodeSave(state, 123));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.saveFile.state).toEqual(before);
    expect(state).toEqual(before);
  });
});
