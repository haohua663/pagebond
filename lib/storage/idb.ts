import type { PaperRecord } from "@/lib/storage/types";

const DB_NAME = "yeyuan";
const STORE = "papers";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
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

export async function idbList(): Promise<PaperRecord[]> {
  const db = await openDb();
  const rows = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).getAll());
  db.close();
  return (rows as PaperRecord[]).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function idbGet(id: string): Promise<PaperRecord | null> {
  const db = await openDb();
  const row = await requestToPromise(db.transaction(STORE, "readonly").objectStore(STORE).get(id));
  db.close();
  return (row as PaperRecord) ?? null;
}

export async function idbPut(record: PaperRecord): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).put(record));
  db.close();
}

export async function idbRemove(id: string): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  db.close();
}
