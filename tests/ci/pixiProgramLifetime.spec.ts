import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { GlProgram, WebGLRenderer } from 'pixi.js';
import { createRequire } from 'node:module';

let pixi: typeof import('pixi.js');
beforeAll(async () => {
  // Real installed constructors, no browser or GPU. The GL below models linking
  // and context-local locations; it is not rendered-pixel/native-driver proof.
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => null }) });
  pixi = await import('pixi.js');
});
afterAll(() => vi.unstubAllGlobals());
const source = {
  vertex: 'attribute vec2 aPosition; void main() { gl_Position = vec4(aPosition, 0., 1.); }',
  fragment: 'uniform vec4 uColor; void main() { gl_FragColor = uColor; }',
  name: 'tenka test',
};
function context(offset: number) {
  let serial = 0;
  const gl = {
    VERTEX_SHADER: 35633,
    FRAGMENT_SHADER: 35632,
    LINK_STATUS: 35714,
    ACTIVE_ATTRIBUTES: 35721,
    ACTIVE_UNIFORMS: 35718,
    ACTIVE_UNIFORM_BLOCKS: 35382,
    UNIFORM_BLOCK_DATA_SIZE: 35392,
    FLOAT_VEC2: 35664,
    FLOAT_VEC4: 35666,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    createProgram: vi.fn(() => ({ id: ++serial, epoch: 0, context: offset })),
    attachShader: vi.fn(),
    linkProgram: vi.fn((program: { epoch: number }) => {
      program.epoch++;
    }),
    getProgramParameter: vi.fn((_program: unknown, parameter: number) =>
      parameter === 35714 ? true : 1,
    ),
    getActiveAttrib: vi.fn(() => ({ name: 'aPosition', type: 35664 })),
    bindAttribLocation: vi.fn(),
    getAttribLocation: vi.fn(() => offset),
    getActiveUniform: vi.fn(() => ({ name: 'uColor', type: 35666, size: 1 })),
    getUniformLocation: vi.fn((program: { epoch: number }) => ({
      context: offset,
      epoch: program.epoch,
    })),
    getActiveUniformBlockName: vi.fn(() => 'Globals'),
    getUniformBlockIndex: vi.fn(() => offset),
    getActiveUniformBlockParameter: vi.fn(() => 16),
    deleteShader: vi.fn(),
    deleteProgram: vi.fn(),
    useProgram: vi.fn(),
  };
  return gl;
}
function system(gl: ReturnType<typeof context>, library = pixi) {
  class TestShaderSystem extends library.GlShaderSystem {
    useContext(next: WebGL2RenderingContext) {
      this.contextChange(next);
    }
  }
  const renderer = {
    buffer: { nextBindBase: vi.fn() },
    uniformGroup: { updateUniformGroup: vi.fn((group: unknown) => group) },
  };
  const shader = new TestShaderSystem(renderer as unknown as WebGLRenderer);
  Object.assign(renderer, { shader });
  shader.useContext(gl as unknown as WebGL2RenderingContext);
  return { shader, renderer };
}

describe('pinned Pixi GL lifetime backport (synthetic GL metadata)', () => {
  it('bounds repeated real constructor identities and keeps separately owned programs', () => {
    const survivor = new pixi.GlProgram(source);
    const keys = new Set<number>();
    for (let i = 0; i < 20; i++) {
      const program = new pixi.GlProgram(source);
      keys.add(program._key);
      expect(program).not.toBe(survivor);
      program.destroy();
      expect(survivor.fragment).toContain('uColor');
    }
    expect([...keys]).toEqual([survivor._key]);
    survivor.destroy();
  });

  it('executes the patched CommonJS constructor and own-context deletion too', () => {
    const common = createRequire(import.meta.url)('pixi.js') as typeof import('pixi.js');
    const a = new common.GlProgram(source),
      b = new common.GlProgram(source);
    expect(a._key).toBe(b._key);
    expect(a).not.toBe(b);
    a.destroy();
    expect(b.fragment).toContain('uColor');
    const gl = context(17);
    const handle = {} as WebGLProgram;
    const data = new common.GlProgramData(handle, {}, gl as unknown as WebGL2RenderingContext);
    data.destroy();
    data.destroy();
    expect(gl.deleteProgram).toHaveBeenCalledTimes(1);
    expect(gl.deleteProgram).toHaveBeenCalledWith(handle);
    const glSystem = context(19),
      owner = system(glSystem, common);
    const another = new common.GlProgram(source);
    const compiled = owner.shader._getProgramData(b);
    expect(owner.shader._getProgramData(another)).toBe(compiled);
    expect(glSystem.createProgram).toHaveBeenCalledTimes(1);
    const handleSystem = compiled.program;
    owner.shader.destroy();
    expect(glSystem.deleteProgram).toHaveBeenCalledTimes(1);
    expect(glSystem.deleteProgram).toHaveBeenCalledWith(handleSystem);
    another.destroy();
    b.destroy();
  });

  it('preserves precision, names, custom defines, sources and feedback identity', () => {
    const options: ConstructorParameters<typeof pixi.GlProgram>[0][] = [
      source,
      { ...source, preferredFragmentPrecision: 'lowp' },
      { ...source, preferredVertexPrecision: 'mediump' },
      { ...source, name: 'another' },
      { ...source, fragment: source.fragment + '\n// changed' },
      { ...source, fragment: '#define SHADER_NAME custom\n' + source.fragment },
      { ...source, transformFeedbackVaryings: { names: ['one'], bufferMode: 'separate' } },
      { ...source, transformFeedbackVaryings: { names: ['two'], bufferMode: 'separate' } },
      { ...source, transformFeedbackVaryings: { names: ['one'], bufferMode: 'interleaved' } },
    ];
    const programs = options.map((option) => new pixi.GlProgram(option));
    expect(new Set(programs.map((program) => program._key)).size).toBe(options.length);
    const cached = options.map((option) => pixi.GlProgram.from(option));
    expect(new Set(cached).size).toBe(options.length);
    expect(pixi.GlProgram.from(source)).toBe(cached[0]);
    expect(programs[5]!.fragment).toContain('#define SHADER_NAME custom');
    const spaced = new pixi.GlProgram({ ...source, name: 'tenka\ttest' });
    expect(spaced._key).toBe(programs[0]!._key);
    [...programs, ...cached, spaced].forEach((program) => program.destroy());
  });

  it('restores all reflection tables on cache hits across two contexts without relinking', () => {
    const glA = context(7),
      glB = context(11);
    const a = system(glA),
      b = system(glB);
    const es300 = {
      ...source,
      vertex: '#version 300 es\n' + source.vertex,
      fragment: '#version 300 es\n' + source.fragment,
    };
    const first = new pixi.GlProgram(es300),
      second = new pixi.GlProgram(es300);
    const dataA = a.shader._getProgramData(first);
    expect(a.shader._getProgramData(second)).toBe(dataA);
    expect(glA.createProgram).toHaveBeenCalledTimes(1);
    expect(glA.linkProgram).toHaveBeenCalledTimes(1);
    expect(second._attributeData.aPosition!.location).toBe(7);
    const dataB = b.shader._getProgramData(first);
    expect(dataB.program).not.toBe(dataA.program);
    expect(first._attributeData.aPosition!.location).toBe(11);
    a.shader._getProgramData(first);
    expect(first._attributeData.aPosition!.location).toBe(7);
    expect(first._uniformBlockData.Globals!.index).toBe(7);
    expect(first._uniformData.uColor!.name).toBe('uColor');
    expect(glA.linkProgram).toHaveBeenCalledTimes(1);
    const sharedShader = new pixi.Shader({ glProgram: first });
    a.shader.bind(sharedShader, true);
    b.shader.bind(sharedShader, true);
    expect(first._attributeData.aPosition!.location).toBe(11);
    a.shader.bind(sharedShader, true);
    expect(first._attributeData.aPosition!.location).toBe(7);
    expect(first._uniformBlockData.Globals!.index).toBe(7);
    expect(glA.useProgram).toHaveBeenCalledTimes(1);
    expect(glA.linkProgram).toHaveBeenCalledTimes(1);
    const handleA = dataA.program,
      handleB = dataB.program;
    a.shader.useContext(glA as unknown as WebGL2RenderingContext);
    expect(glA.deleteProgram).toHaveBeenCalledTimes(1);
    expect(glA.deleteProgram).toHaveBeenCalledWith(handleA);
    dataA.destroy();
    expect(glA.deleteProgram).toHaveBeenCalledTimes(1);
    a.shader._getProgramData(first);
    a.shader.destroy();
    b.shader.destroy();
    expect(glA.deleteProgram).toHaveBeenCalledTimes(2);
    expect(glB.deleteProgram).toHaveBeenCalledTimes(1);
    expect(glB.deleteProgram).toHaveBeenCalledWith(handleB);
    dataB.destroy();
    expect(glB.deleteProgram).toHaveBeenCalledTimes(1);
    first.destroy();
    second.destroy();
    sharedShader.destroy();
  });

  it('does not relink GLSL100 cache hits or invalidate collected uniform locations', () => {
    const gl = context(3),
      { shader } = system(gl);
    const first = new pixi.GlProgram(source),
      second = new pixi.GlProgram(source);
    const data = shader._getProgramData(first);
    const links = gl.linkProgram.mock.calls.length;
    const locations = data.uniformData as Record<string, { location: WebGLUniformLocation }>;
    const location = locations.uColor!.location;
    expect(shader._getProgramData(second)).toBe(data);
    expect(gl.linkProgram).toHaveBeenCalledTimes(links);
    expect(locations.uColor!.location).toBe(location);
    shader.destroy();
    first.destroy();
    second.destroy();
  });

  it('isolates generated resource sync for distinct shader layouts sharing GLSL', () => {
    const gl = context(3),
      { shader, renderer } = system(gl);
    const programA = new pixi.GlProgram(source),
      programB = new pixi.GlProgram(source);
    function bound(program: GlProgram, index: number) {
      const uniforms = new pixi.UniformGroup({
        uColor: { value: new Float32Array(4), type: 'vec4<f32>' },
      });
      const group = new pixi.BindGroup({ 0: uniforms });
      return {
        uniforms,
        value: new pixi.Shader({
          glProgram: program,
          groups: { [index]: group },
          groupMap: { [index]: { 0: 'uColor' } },
        }),
      };
    }
    const first = bound(programA, 0),
      second = bound(programB, 2);
    shader.bind(first.value);
    shader.bind(second.value);
    shader.bind(first.value);
    expect(renderer.uniformGroup.updateUniformGroup.mock.calls.map((call) => call[0])).toEqual([
      first.uniforms,
      second.uniforms,
      first.uniforms,
    ]);
    expect(gl.createProgram).toHaveBeenCalledTimes(1);
    shader.destroy();
    first.value.destroy(true);
    second.value.destroy(true);
  });

  it('destroys the eager private back-buffer shader without destroying shared white texture', () => {
    const back = new pixi.GlBackBufferSystem({
      context: { supports: { msaa: true } },
    } as unknown as WebGLRenderer);
    back.init({ useBackBuffer: false });
    const owned = Object.getOwnPropertyDescriptor(back, '_bigTriangleShader')!
      .value as import('pixi.js').Shader;
    const program = owned.glProgram;
    expect(program.fragment).toContain('uTexture');
    expect(pixi.Texture.WHITE.source.destroyed).toBe(false);
    back.destroy();
    back.destroy();
    expect(program.fragment).toBeNull();
    expect(Object.getOwnPropertyDescriptor(back, '_bigTriangleShader')!.value).toBeNull();
    expect(Object.getOwnPropertyDescriptor(back, '_renderer')!.value).toBeNull();
    expect(pixi.Texture.WHITE.source.destroyed).toBe(false);
  });
});
