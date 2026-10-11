import { delMany, get, keys, setMany } from 'idb-keyval';

/** 批次寫入／刪除須為原子操作，避免 blob 與摘要來自不同存檔。 */
export interface SaveStorageAdapter {
  get(key: string): Promise<unknown>;
  setMany(entries: [string, unknown][]): Promise<void>;
  delMany(keys: string[]): Promise<void>;
  keys(): Promise<string[]>;
}

export const indexedDbSaveStorage: SaveStorageAdapter = {
  get,
  setMany,
  delMany,
  keys: async () => (await keys()).filter((key): key is string => typeof key === 'string'),
};

/** 測試用 adapter 同樣複製值，符合 IndexedDB 的快照語意。 */
export function createMemorySaveStorage(): SaveStorageAdapter {
  const values = new Map<string, unknown>();
  return {
    get(key) {
      return Promise.resolve(structuredClone(values.get(key)));
    },
    setMany(entries) {
      const copies = structuredClone(entries);
      for (const [key, value] of copies) values.set(key, value);
      return Promise.resolve();
    },
    delMany(keys) {
      for (const key of keys) values.delete(key);
      return Promise.resolve();
    },
    keys() {
      return Promise.resolve([...values.keys()]);
    },
  };
}
