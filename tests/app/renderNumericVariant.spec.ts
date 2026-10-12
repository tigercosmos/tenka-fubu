import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRenderNumericArtifact,
  assertRenderNumericVariant,
  selectRenderNumericArtifact,
  type RenderNumericVariant,
} from '../../src/wasm/renderNumericVariant';
afterEach(() => vi.restoreAllMocks());
const exportsFor = (variant: number) => ({
  render_numeric_abi_version: () => 1,
  render_numeric_variant: () => variant,
});
describe('initialization-time strict SIMD artifact selection', () => {
  it.each([
    { supported: true, variant: 'simd128', file: 'tenka_engine.simd.wasm' },
    { supported: false, variant: 'scalar', file: 'tenka_engine.wasm' },
  ] as const)(
    'selects $variant once before any transport or instantiation',
    ({ supported, variant, file }) => {
      const validate = vi.fn((_bytes: BufferSource) => {
        void _bytes;
        return supported;
      });
      const fetch = vi.spyOn(globalThis, 'fetch');
      const instantiate = vi.spyOn(WebAssembly, 'instantiate');
      const artifact = selectRenderNumericArtifact('/tenka/', validate);
      expect(artifact).toEqual({ variant, url: `/tenka/wasm/${file}` });
      expect(Object.isFrozen(artifact)).toBe(true);
      expect(validate).toHaveBeenCalledOnce();
      expect(fetch).not.toHaveBeenCalled();
      expect(instantiate).not.toHaveBeenCalled();
    },
  );
  it('uses the exact independently validated strict SIMD module without imports', () => {
    let captured: Uint8Array<ArrayBuffer> | undefined;
    const selected = selectRenderNumericArtifact('/', (bytes) => {
      captured = new Uint8Array(bytes as Uint8Array);
      return WebAssembly.validate(bytes);
    });
    expect(selected.variant).toBe('simd128');
    expect(captured).toHaveLength(884);
    expect(createHash('sha256').update(captured!).digest('hex')).toBe(
      'fbfee3afdc0d3537860fde16228b5d03de1329f83b6c637d9b2c5e75e299c533',
    );
    expect(WebAssembly.Module.imports(new WebAssembly.Module(captured!))).toEqual([]);
  });
  it('does not convert a thrown capability check into scalar selection', () => {
    const validate = vi.fn(() => {
      throw new Error('capability check failed');
    });
    expect(() => selectRenderNumericArtifact('/', validate)).toThrow('capability check failed');
    expect(validate).toHaveBeenCalledOnce();
  });
  it('does not share a mutable variant across independent selections', () => {
    const a = selectRenderNumericArtifact('/', () => true),
      b = selectRenderNumericArtifact('/', () => false);
    expect(a.variant).toBe('simd128');
    expect(b.variant).toBe('scalar');
    expect(a.url).toBe('/wasm/tenka_engine.simd.wasm');
    expect(b.url).toBe('/wasm/tenka_engine.wasm');
  });
  it.each(['scalar', 'simd128'] as const)('checks explicit expected %s ABI/variant', (variant) => {
    const abi = vi.fn(() => 1),
      flag = vi.fn(() => (variant === 'scalar' ? 0 : 1));
    assertRenderNumericVariant(
      { render_numeric_abi_version: abi, render_numeric_variant: flag },
      variant,
    );
    expect(abi).toHaveBeenCalledOnce();
    expect(flag).toHaveBeenCalledOnce();
  });
  it.each([
    {},
    { render_numeric_abi_version: () => 1 },
    { render_numeric_variant: () => 0 },
    { ...exportsFor(0), render_numeric_abi_version: () => 2 },
    { ...exportsFor(0), render_numeric_variant: 1 },
  ])('rejects missing or wrong feature ABI %#', (exports) => {
    expect(() => assertRenderNumericVariant(exports, 'scalar')).toThrow('ABI');
  });
  it.each([
    { flag: 1, expected: 'scalar' },
    { flag: 0, expected: 'simd128' },
    { flag: 2, expected: 'scalar' },
    { flag: NaN, expected: 'simd128' },
  ] as const)('rejects declared variant mismatch %#', ({ flag, expected }) => {
    expect(() => assertRenderNumericVariant(exportsFor(flag), expected)).toThrow(
      'variant mismatch',
    );
  });
  it('propagates feature export failures without attempting another variant', () => {
    const flag = vi.fn(() => {
      throw new Error('variant export failed');
    });
    expect(() =>
      assertRenderNumericVariant({ ...exportsFor(0), render_numeric_variant: flag }, 'scalar'),
    ).toThrow('variant export failed');
    expect(flag).toHaveBeenCalledOnce();
  });
  it('requires an explicit valid expected variant for custom artifacts', () => {
    assertRenderNumericArtifact({ url: '/custom.wasm', variant: 'scalar' });
    assertRenderNumericArtifact({ url: '/custom.wasm', variant: 'simd128' });
    expect(() => assertRenderNumericArtifact({ url: '', variant: 'scalar' })).toThrow('selection');
    expect(() =>
      assertRenderNumericArtifact({
        url: '/custom.wasm',
        variant: 'unknown' as RenderNumericVariant,
      }),
    ).toThrow('selection');
    expect(() =>
      assertRenderNumericVariant(exportsFor(0), 'unknown' as RenderNumericVariant),
    ).toThrow('expected');
  });
});
