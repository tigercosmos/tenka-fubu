// plan/01 §3.9.1–3: actual trusted title-button input, not font/network idle.
export const INITIAL_INTERACTIVE_LIMIT_MS = 3000;
export const FAST_4G_SOURCE =
  'https://chromium.googlesource.com/devtools/devtools-frontend/+/HEAD/front_end/core/sdk/NetworkManager.ts';
// Chromium Fast4GConditions, verified2026-10-09. CDP receives adjusted values.
export const FAST_4G = {
  offline: false,
  latency: 60 * 2.75,
  downloadThroughput: ((9 * 1000 * 1000) / 8) * 0.9,
  uploadThroughput: ((1.5 * 1000 * 1000) / 8) * 0.9,
  connectionType: 'cellular4g',
} as const;

export function initialInteractionPasses(milliseconds: number): boolean {
  return (
    Number.isFinite(milliseconds) && milliseconds > 0 && milliseconds < INITIAL_INTERACTIVE_LIMIT_MS
  );
}

export function coldLoadBaseUrl(external: string | undefined): string {
  if (external === undefined) return 'http://localhost:4181/';
  if (external.trim() !== external || external.length === 0)
    throw new Error('Cold-load URL must be a nonblank absolute HTTP(S) directory URL');
  const url = new URL(external);
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw new Error('Cold-load URL must be HTTP(S), without credentials, query, or fragment');
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.href;
}
