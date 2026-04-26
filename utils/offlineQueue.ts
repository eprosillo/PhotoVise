/**
 * offlineQueue.ts
 *
 * IndexedDB-backed queue for Firestore writes that failed while offline.
 * Entries are replayed automatically when the user comes back online
 * (handled by the useEffect in useFirestore.ts).
 *
 * Schema:
 *   DB:    photovise-offline  (version 1)
 *   Store: pendingWrites      (keyPath: id, autoIncrement)
 *   Entry: { id, uid, data, queuedAt }
 */

const DB_NAME    = 'photovise-offline';
const STORE_NAME = 'pendingWrites';
const DB_VERSION = 1;

export interface PendingWrite {
  id?: number;
  uid: string;
  data: Record<string, unknown>;
  queuedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror  = () => reject(req.error);
  });
}

/** Add a failed write to the queue. */
export async function queueWrite(uid: string, data: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const entry: PendingWrite = { uid, data, queuedAt: Date.now() };
    const req = store.add(entry);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/** Retrieve all queued writes (across all uids). */
export async function getQueuedWrites(): Promise<PendingWrite[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.getAll();
    req.onsuccess = () => resolve(req.result as PendingWrite[]);
    req.onerror   = () => reject(req.error);
  });
}

/** Remove a single queued write by its auto-increment id. */
export async function removeQueuedWrite(id: number): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req   = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
