/** Self-contained for Playwright expression serialization; never omit state fields. */
export function encodeFullSnapshot(value: unknown): string {
  const active = new Set<object>();
  const fail = (path: string): never => {
    throw new Error(`Full snapshot is not lossless JSON at ${path}`);
  };
  const visit = (item: unknown, path: string): void => {
    if (item === null || typeof item === 'string' || typeof item === 'boolean') return;
    if (typeof item === 'number') {
      if (!Number.isFinite(item) || Object.is(item, -0)) fail(path);
      return;
    }
    if (typeof item !== 'object') fail(path);
    const object = item as object;
    if (active.has(object)) fail(path);
    const array = Array.isArray(object);
    if (Object.getPrototypeOf(object) !== (array ? Array.prototype : Object.prototype)) fail(path);
    if (Object.getOwnPropertySymbols(object).length) fail(path);
    const names = Object.getOwnPropertyNames(object);
    if (array) {
      if (names.length !== object.length + 1) fail(path);
      for (let i = 0; i < object.length; i++)
        if (!Object.hasOwn(object, String(i))) fail(`${path}[${i}]`);
    }
    active.add(object);
    for (const key of names) {
      if (array && key === 'length') continue;
      const descriptor = Object.getOwnPropertyDescriptor(object, key)!;
      if (!descriptor.enumerable || !('value' in descriptor)) fail(`${path}.${key}`);
      visit(descriptor.value, `${path}.${key}`);
    }
    active.delete(object);
  };
  visit(value, '$');
  const encoded = JSON.stringify(value);
  const roundtrip: unknown = JSON.parse(encoded);
  const compare = (a: unknown, b: unknown): void => {
    if (a === null || typeof a !== 'object') {
      if (!Object.is(a, b)) fail('roundtrip');
      return;
    }
    if (b === null || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b))
      fail('roundtrip');
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b as object).length) fail('roundtrip keys');
    for (const key of keys) {
      if (!Object.hasOwn(b as object, key)) fail(`roundtrip.${key}`);
      compare((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]);
    }
  };
  compare(value, roundtrip);
  return encoded;
}
