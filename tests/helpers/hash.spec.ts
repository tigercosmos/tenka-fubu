// 規格：plan/17-testing.md §3.3.2、§5.1、§5.2、§7-T2。
import { describe, expect, it } from 'vitest';
import { fnv1a64, stableStringify } from './hash';

describe('fnv1a64', () => {
  it('對空字串有固定測試向量（17 §7-T2 原文）', () => {
    expect(fnv1a64('')).toBe('cbf29ce484222325');
  });

  it('對已知字串輸出穩定的十六進位雜湊', () => {
    const first = fnv1a64('天下布武');
    const second = fnv1a64('天下布武');
    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('stableStringify', () => {
  it('鍵序不同但內容相同的物件序列化結果相同', () => {
    const a = { b: 1, a: 2 };
    const bObj = { a: 2, b: 1 };
    expect(stableStringify(a)).toBe(stableStringify(bObj));
  });

  it('巢狀陣列與物件皆穩定序列化', () => {
    const v = { list: [3, 1, { z: 1, y: 2 }], name: '織田' };
    expect(stableStringify(v)).toBe('{"list":[3,1,{"y":2,"z":1}],"name":"織田"}');
  });

  it('-0 視為 0', () => {
    expect(stableStringify(-0)).toBe('0');
  });

  it('undefined 欄位視為不存在', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}');
  });

  it('NaN 立即 throw', () => {
    expect(() => stableStringify(Number.NaN)).toThrow();
  });

  it('Map 立即 throw', () => {
    expect(() => stableStringify(new Map())).toThrow();
  });
});
