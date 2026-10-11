import { createRequire } from 'node:module';
import { afterAll, describe, expect, it } from 'vitest';
import * as esm from 'pixi.js';

const cjs = createRequire(import.meta.url)('pixi.js') as typeof esm;
const modules = [esm, cjs];
const adapters = modules.map((api) => api.DOMAdapter.get());
modules.forEach((api, index) =>
  api.DOMAdapter.set({
    ...adapters[index]!,
    createCanvas: () => ({ getContext: () => null }) as unknown as HTMLCanvasElement,
  }),
);
afterAll(() => modules.forEach((api, index) => api.DOMAdapter.set(adapters[index]!)));
let rendererUid = 900_000;

// Installed CPU batching and global pool; no native GPU allocation or submission.
function owner(api: typeof esm) {
  const renderer = {
    uid: rendererUid++,
    gc: { now: 0, addResourceHash: () => {} },
    limits: { maxBatchableTextures: 1 },
  } as unknown as ConstructorParameters<typeof esm.GraphicsContextSystem>[0];
  return new api.GraphicsContextSystem(renderer);
}

function texture(api: typeof esm) {
  return new api.Texture({
    source: new api.BufferImageSource({ resource: new Uint8Array(16), width: 2, height: 2 }),
  });
}

function context(api: typeof esm, textures: readonly esm.Texture[]) {
  const result = new api.GraphicsContext();
  result.batchMode = 'no-batch';
  for (const [index, image] of textures.entries()) {
    result.rect(index * 8, 0, 4, 4).fill({ texture: image });
  }
  return result;
}

describe.each([
  ['ESM', esm],
  ['CJS', cjs],
] as const)('installed Pixi %s pooled graphics batches', (_mode, api) => {
  it('reuses more-to-fewer batches after old sources are destroyed without binding stale tails', () => {
    const oldTextures = [texture(api), texture(api), texture(api)];
    const liveTexture = texture(api);
    const separateTexture = texture(api);
    const warmTexture = texture(api);
    const interveningTextures = [texture(api), texture(api), texture(api)];
    const first = owner(api),
      second = owner(api),
      separate = owner(api),
      intervening = owner(api),
      warm = owner(api);
    const oldContext = context(api, oldTextures);
    const liveContext = context(api, [liveTexture]);
    const separateContext = context(api, [separateTexture]);
    const interveningContext = context(api, interveningTextures);
    const warmContext = context(api, [warmTexture]);
    let firstDestroyed = false;
    let warmDestroyed = false;
    try {
      separate.updateGpuContext(separateContext);
      const separateData = separate.getContextRenderData(separateContext);
      first.updateGpuContext(oldContext);
      const oldData = first.getContextRenderData(oldContext);
      expect(oldData.batcher.batchIndex).toBe(3);
      oldContext.destroy();
      first.destroy();
      firstDestroyed = true;
      for (const image of oldTextures) image.destroy(true);
      expect(oldTextures.every((image) => image.destroyed)).toBe(true);

      warm.updateGpuContext(warmContext);
      const warmData = warm.getContextRenderData(warmContext);
      expect(warmData).toBe(oldData);
      expect(warmData.batcher.batchIndex).toBe(1);

      // The ordinary render batcher shares Batch objects with context render-data.
      // Its texture groups are not prepared through the graphics bind-group cache.
      const pipeline = new api.DefaultBatcher({ maxTextures: 1 });
      const instructions = new api.InstructionSet();
      try {
        pipeline.begin();
        for (const batch of intervening.updateGpuContext(interveningContext).batches) {
          pipeline.add(batch);
        }
        pipeline.finish(instructions);
        expect(pipeline.batchIndex).toBe(3);
      } finally {
        pipeline.destroy();
        instructions.destroy();
      }
      interveningContext.destroy();
      for (const image of interveningTextures) image.destroy(true);
      warmContext.destroy();
      warm.destroy();
      warmDestroyed = true;
      warmTexture.destroy(true);

      second.updateGpuContext(liveContext);
      // The global pool returns the actual prior render-data object, not a fabricated stale batch.
      const currentData = second.getContextRenderData(liveContext);
      expect(currentData).toBe(oldData);
      expect(currentData.batcher.batchIndex).toBe(1);
      expect(currentData.instructions.instructionSize).toBe(1);
      expect(currentData.batcher.batches[0]!.textures.textures[0]).toBe(liveTexture.source);
      expect(liveTexture.source.destroyed).toBe(false);
      expect(separate.getContextRenderData(separateContext)).toBe(separateData);
      expect(separateData.batcher.batches[0]!.textures.textures[0]).toBe(separateTexture.source);
      expect(separateTexture.source.destroyed).toBe(false);
    } finally {
      oldContext.destroy();
      liveContext.destroy();
      separateContext.destroy();
      interveningContext.destroy();
      warmContext.destroy();
      if (!firstDestroyed) first.destroy();
      second.destroy();
      separate.destroy();
      intervening.destroy();
      if (!warmDestroyed) warm.destroy();
      for (const image of [
        ...oldTextures,
        ...interveningTextures,
        liveTexture,
        separateTexture,
        warmTexture,
      ]) {
        if (!image.destroyed) image.destroy(true);
      }
    }
  });

  it('retains all unchanged live batches when their current count fills the reused array', () => {
    const images = [texture(api), texture(api), texture(api)];
    const system = owner(api);
    const shape = context(api, images);
    try {
      system.updateGpuContext(shape);
      const data = system.getContextRenderData(shape);
      expect(data.batcher.batchIndex).toBe(3);
      expect(data.instructions.instructionSize).toBe(3);
      expect(
        data.batcher.batches
          .slice(0, data.batcher.batchIndex)
          .map((batch) => batch.textures.textures[0]),
      ).toEqual(images.map((image) => image.source));
      expect(system.getContextRenderData(shape)).toBe(data);
      expect(images.every((image) => !image.source.destroyed)).toBe(true);
    } finally {
      shape.destroy();
      system.destroy();
      for (const image of images) image.destroy(true);
    }
  });
});
