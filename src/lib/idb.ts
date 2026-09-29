import type { DesignBrief, DesignProfile, ImageAnalysis } from "@/services/ai/types";

const DB_NAME = "kuse-studio";
const DB_VERSION = 1;

export interface StoredImage {
  id: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  dataUrl: string;
}

export interface StudioSnapshot {
  analyses: ImageAnalysis[];
  profile: DesignProfile | null;
  brief: DesignBrief;
  styleStrength: number;
  prompt: string;
}

export const emptyBrief: DesignBrief = {
  purpose: "",
  audience: "",
  copyText: "",
  size: "1080×1080（Instagram投稿）",
  mood: "",
  imagery: "",
  notes: "",
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("images")) db.createObjectStore("images", { keyPath: "id" });
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("保存領域を開けませんでした"));
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("保存に失敗しました"));
  });
}

export async function loadImages(): Promise<StoredImage[]> {
  const db = await openDb();
  const images = await requestToPromise(db.transaction("images").objectStore("images").getAll() as IDBRequest<StoredImage[]>);
  db.close();
  return images.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function saveImage(image: StoredImage): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction("images", "readwrite").objectStore("images").put(image));
  db.close();
}

export async function deleteStoredImage(id: string): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction("images", "readwrite").objectStore("images").delete(id));
  db.close();
}

export async function loadSnapshot(): Promise<StudioSnapshot | null> {
  const db = await openDb();
  const snapshot = await requestToPromise(
    db.transaction("kv").objectStore("kv").get("studio") as IDBRequest<StudioSnapshot | undefined>,
  );
  db.close();
  return snapshot ?? null;
}

export async function saveSnapshot(snapshot: StudioSnapshot): Promise<void> {
  const db = await openDb();
  await requestToPromise(db.transaction("kv", "readwrite").objectStore("kv").put(snapshot, "studio"));
  db.close();
}

export async function clearStudio(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(["images", "kv"], "readwrite");
  tx.objectStore("images").clear();
  tx.objectStore("kv").clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("削除に失敗しました"));
  });
  db.close();
}
