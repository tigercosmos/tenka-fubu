/** Load the canvas font before Pixi measures or caches any dynamic bitmap glyphs. */
export async function waitForMapFont(): Promise<void> {
  // jsdom and older browsers may not expose the Font Loading API.
  if (document.fonts === undefined) return;
  await document.fonts.load('400 16px "Noto Serif TC"');
  await document.fonts.ready;
}
