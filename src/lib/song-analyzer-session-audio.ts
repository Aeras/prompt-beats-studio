const DB_NAME = "promptbeats-song-analyzer";
const DB_VERSION = 1;
const STORE = "session-audio";
const SESSION_KEY = "pb:song-analyzer-session-id";
const MAX_AGE_MS = 12 * 60 * 60 * 1000;

type StoredAudio = {
  sessionId: string;
  name: string;
  type: string;
  lastModified: number;
  blob: Blob;
  updatedAt: number;
};

function getSessionId() {
  if (typeof window === "undefined") return "";
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open Analyzer session storage"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE))
        db.createObjectStore(STORE, { keyPath: "sessionId" });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = run(tx.objectStore(STORE));
      request.onerror = () => reject(request.error ?? new Error("Analyzer session storage failed"));
      request.onsuccess = () => resolve(request.result);
    });
  } finally {
    db.close();
  }
}

export async function saveAnalyzerSessionAudio(file: File) {
  const sessionId = getSessionId();
  if (!sessionId) return;
  const record: StoredAudio = {
    sessionId,
    name: file.name,
    type: file.type,
    lastModified: file.lastModified,
    blob: file,
    updatedAt: Date.now(),
  };
  await withStore("readwrite", (store) => store.put(record));
}

export async function loadAnalyzerSessionAudio(): Promise<File | null> {
  const sessionId = getSessionId();
  if (!sessionId) return null;
  const record = await withStore<StoredAudio | undefined>("readonly", (store) =>
    store.get(sessionId),
  );
  if (!record?.blob) return null;
  return new File([record.blob], record.name, {
    type: record.type,
    lastModified: record.lastModified,
  });
}

export async function clearAnalyzerSessionAudio() {
  const sessionId =
    typeof window === "undefined" ? "" : (window.sessionStorage.getItem(SESSION_KEY) ?? "");
  if (!sessionId) return;
  await withStore("readwrite", (store) => store.delete(sessionId));
}

export async function sweepStaleAnalyzerAudio() {
  const currentSessionId = getSessionId();
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.openCursor();
      request.onerror = () => reject(request.error ?? new Error("Analyzer cleanup failed"));
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return;
        const value = cursor.value as StoredAudio;
        if (value.sessionId !== currentSessionId && Date.now() - value.updatedAt > MAX_AGE_MS) {
          cursor.delete();
        }
        cursor.continue();
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error("Analyzer cleanup failed"));
    });
  } finally {
    db.close();
  }
}
