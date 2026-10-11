import { readFileSync } from 'node:fs';

const module = new WebAssembly.Module(
  new Uint8Array(readFileSync('public/wasm/tenka_engine.wasm')),
);

/** Real committed numeric engine, with independent owner memory and no simulation callback. */
export function realRenderWasmExports(): WebAssembly.Exports {
  return new WebAssembly.Instance(module, {
    env: {
      path_node_cost: () => {
        throw new Error('Simulation pathfinding invoked from renderer test instance');
      },
    },
  }).exports;
}
