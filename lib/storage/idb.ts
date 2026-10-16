import type { PaperRecord } from "@/lib/storage/types";

const DB_NAME = "pagebond";
const LEGACY_DB_NAME = "yeyuan";
const STORE = "papers";

function openNamed(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(name: string): Promise<PaperRecord[]> {
  const db = await openNamed(name);
  const rows = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  db.close();
  return rows as PaperRecord[];
}

async function legacyExists(): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return false;
  const names = await indexedDB.databases();
  return names.some((item) => item.name === LEGACY_DB_NAME);
}

export async function idbList(): Promise<PaperRecord[]> {
  let rows = await readAll(DB_NAME);
  if (!rows.length && (await legacyExists())) {
    const legacy = await readAll(LEGACY_DB_NAME);
    if (legacy.length) {
      const db = await openNamed(DB_NAME);
      const tx = db.transaction(STORE, "readwrite");
      for (const record of legacy) tx.objectStore(STORE).put(record);
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
      rows = legacy;
    }
  }
  return rows.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function idbGet(id: string): Promise<PaperRecord | null> {
  const db = await openNamed(DB_NAME);
  const row = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
  db.close();
  return (row as PaperRecord) ?? null;
}

export async function idbPut(record: PaperRecord): Promise<void> {
  const db = await openNamed(DB_NAME);
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  db.close();
}

export async function idbRemove(id: string): Promise<void> {
  const db = await openNamed(DB_NAME);
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
}
