"use client";

/**
 * TTS 音訊本機保存(IndexedDB):
 * 同一句話的語音只會生成一次,之後由本機讀取,離線亦可播放,不再消耗 points。
 * 每筆 record: { text, blob, cdnUrl, savedAt } — cdnUrl 保留供 MP3 匯出使用。
 */
const DB_NAME = "english-tutor-audio";
const STORE = "tts";

type AudioRecord = { text: string; blob: Blob; cdnUrl: string; savedAt: number };

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE, { keyPath: "text" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export async function getAudioRecord(text: string): Promise<AudioRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(text.trim());
      req.onsuccess = () => resolve((req.result as AudioRecord) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function putAudioRecord(text: string, blob: Blob, cdnUrl: string) {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({
        text: text.trim(),
        blob,
        cdnUrl,
        savedAt: Date.now(),
      } satisfies AudioRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    /* 無法儲存亦無妨,下次重新生成 */
  }
}
