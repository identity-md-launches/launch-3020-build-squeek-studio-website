const dbPromise =
  typeof indexedDB === "undefined"
    ? null
    : new Promise<IDBDatabase>((resolve, reject) => {
        const r = indexedDB.open("squeek-studio", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("cache");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      }).catch(() => null);
const memory = new Map<string, unknown>();
export async function cached<T>(key: string): Promise<T | undefined> {
  try {
    if (!dbPromise) return memory.get(key) as T;
    const db = await dbPromise;
    if (!db) return memory.get(key) as T;
    return await new Promise((resolve, reject) => {
      const r = db.transaction("cache").objectStore("cache").get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return memory.get(key) as T;
  }
}
export async function remember(key: string, value: unknown) {
  memory.set(key, value);
  try {
    if (!dbPromise) return;
    const db = await dbPromise;
    if (!db) return;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("cache", "readwrite");
      tx.objectStore("cache").put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    /* Private mode and full storage keep an in-memory cache. */
  }
}
