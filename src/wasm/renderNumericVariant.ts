/** Strict SIMD overlap probe compiled and browser-validated independently of engine artifacts. */
const STRICT_SIMD_PROBE =
  'AGFzbQEAAAABDgFgCXx8fHx8fHx8fAF8AwMCAAAEBQFwAQEBBQMBABAGCQF/AUGAgMAACwcbAwZtZW1vcnkCAAVsYW5lcwAABnNjYWxhcgABCqAGAncBA3sgAP0UIAH9IgEiCSAC/RQgA/0iAf3wASAI/RQiCv3wASAE/RQgBf0iASILIAb9FCAH/SIB/fABIAr98AH99AEgCSAK/fEBIAsgCv3xAf31Af3xAf0MAAAAAAAAAAAAAAAAAAAAAP31ASIK/SEAIAr9IQGiC6UFAQJ8RAAAAAAAAPh/IQlEAAAAAAAA+H8hCgJAIAAgAqAgCKAiAiACYiAEIAagIAigIgYgBmJyDQACQAJAIAJEAAAAAAAAAABiDQAgBkQAAAAAAAAAAGENAQsgAiAGIAIgBmMbIQoMAQsCQCACvUIAUg0ARAAAAAAAAAAAIQogBr1QDQELRAAAAAAAAACAIQoLAkAgACAIoSICIAJiIAQgCKEiBiAGYnINAAJAAkAgAkQAAAAAAAAAAGINACAGRAAAAAAAAAAAYQ0BCyACIAYgAiAGZBshCQwBC0QAAAAAAAAAACEJIAK9UA0ARAAAAAAAAAAARAAAAAAAAACAIAa9UBshCQtEAAAAAAAA+H8hAEQAAAAAAAD4fyEEAkAgCiAJoSICIAJiDQBEAAAAAAAAAAAhBCACRAAAAAAAAAAAYQ0ARAAAAAAAAAAAIAIgAkQAAAAAAAAAAGMbIQQLAkAgASADoCAIoCICIAJiIAUgB6AgCKAiBiAGYnINAAJAAkAgAkQAAAAAAAAAAGINACAGRAAAAAAAAAAAYQ0BCyACIAYgAiAGYxshAAwBCwJAIAK9QgBSDQBEAAAAAAAAAAAhACAGvVANAQtEAAAAAAAAAIAhAAtEAAAAAAAA+H8hBkQAAAAAAAD4fyEJAkAgASAIoSICIAJiIAUgCKEiCCAIYnINAAJAAkAgAkQAAAAAAAAAAGINACAIRAAAAAAAAAAAYQ0BCyACIAggAiAIZBshCQwBC0QAAAAAAAAAACEJIAK9UA0ARAAAAAAAAAAARAAAAAAAAACAIAi9UBshCQsCQCAAIAmhIgggCGINAEQAAAAAAAAAACEGIAhEAAAAAAAAAABhDQBEAAAAAAAAAAAgCCAIRAAAAAAAAAAAYxshBgsgBCAGogs=';
export type RenderNumericVariant = 'scalar' | 'simd128';
export interface RenderNumericArtifact {
  readonly url: string;
  readonly variant: RenderNumericVariant;
}
export function assertRenderNumericArtifact(artifact: RenderNumericArtifact): void {
  if (
    !artifact ||
    typeof artifact !== 'object' ||
    typeof artifact.url !== 'string' ||
    !artifact.url ||
    (artifact.variant !== 'scalar' && artifact.variant !== 'simd128')
  )
    throw new Error('Invalid render numeric artifact selection');
}
/** Select once before fetch/instantiation. Exceptions remain initialization errors. */
export function selectRenderNumericArtifact(
  baseUrl: string,
  validate: (bytes: BufferSource) => boolean = WebAssembly.validate,
): RenderNumericArtifact {
  const probe = Uint8Array.from(atob(STRICT_SIMD_PROBE), (char) => char.charCodeAt(0));
  const variant: RenderNumericVariant = validate(probe) ? 'simd128' : 'scalar';
  return Object.freeze({
    variant,
    url: `${baseUrl}wasm/tenka_engine${variant === 'simd128' ? '.simd' : ''}.wasm`,
  });
}
/** Verify declared feature ABI and expected selected variant before installing any kernel. */
export function assertRenderNumericVariant(
  exports: Record<string, unknown>,
  expected: RenderNumericVariant,
): void {
  if (expected !== 'scalar' && expected !== 'simd128')
    throw new Error('Invalid expected render numeric variant');
  const abi = exports.render_numeric_abi_version;
  const variant = exports.render_numeric_variant;
  if (typeof abi !== 'function' || typeof variant !== 'function' || (abi as () => unknown)() !== 1)
    throw new Error('Unsupported render numeric ABI');
  if ((variant as () => unknown)() !== (expected === 'scalar' ? 0 : 1))
    throw new Error(`Render numeric variant mismatch: expected ${expected}`);
}
