import { readFileSync } from 'node:fs';
import { createWasmCastleRibbonPlanner } from '../../src/ui/map/wasmCastleRibbonPlanner';
interface CastleKernelExports {
  memory: WebAssembly.Memory;
  engine_alloc: (words: number) => number;
  engine_free: (pointer: number, words: number) => void;
  castle_ribbon_abi_version: () => number;
  castle_ribbon_solve: (pointer: number, words: number) => number;
}
let compiled: WebAssembly.Module | null = null;
let compiledPath: string | null = null;
export function realCastleOwner() {
  const artifact = 'public/wasm/tenka_engine.wasm';
  if (!compiled || compiledPath !== artifact) {
    compiled = new WebAssembly.Module(new Uint8Array(readFileSync(artifact)));
    compiledPath = artifact;
  }
  const instance = new WebAssembly.Instance(compiled, {
    env: {
      path_node_cost: () => {
        throw new Error('Simulation pathfinding invoked from castle render instance');
      },
    },
  });
  const exports = instance.exports as unknown as CastleKernelExports;
  if (exports.castle_ribbon_abi_version() !== 1) throw new Error('Expected real castle ABI1');
  return { exports, planner: createWasmCastleRibbonPlanner(instance.exports) };
}
