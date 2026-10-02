import { unzipSync } from "fflate";
import {
  fileExtension,
  isImageFileName,
  isPdfFile,
  isZipLike,
  MAX_DOCUMENT_BYTES,
  MAX_IMAGE_BYTES,
  MAX_LIBRARY,
  MAX_PAGES_PER_DOCUMENT,
} from "./library";
import { fileToStoredImage } from "./read-image";
import type { StoredImage } from "./idb";

export interface IngestSkip {
  name: string;
  reason: string;
}

export interface IngestProgress {
  current: number;
  total: number;
  label: string;
}

export interface IngestResult {
  images: StoredImage[];
  skipped: IngestSkip[];
}

interface FileSystemEntryLike {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (ok: (file: File) => void, err?: (error: DOMException) => void) => void;
  createReader?: () => {
    readEntries: (ok: (entries: FileSystemEntryLike[]) => void, err?: (error: DOMException) => void) => void;
  };
}

export async function filesFromDrop(transfer: DataTransfer): Promise<File[]> {
  const items = [...transfer.items];
  if (items.some((item) => typeof item.webkitGetAsEntry === "function")) {
    const collected: File[] = [];
    for (const item of items) {
      const entry = item.webkitGetAsEntry?.() as FileSystemEntryLike | null;
      if (entry) await walkEntry(entry, collected);
      else {
        const file = item.getAsFile();
        if (file) collected.push(file);
      }
    }
    if (collected.length) return collected;
  }
  return [...transfer.files];
}

async function walkEntry(entry: FileSystemEntryLike, into: File[]): Promise<void> {
  if (entry.isFile && entry.file) {
    const file = await new Promise<File>((resolve, reject) => {
      entry.file!(resolve, reject);
    });
    into.push(file);
    return;
  }
  if (!entry.isDirectory || !entry.createReader) return;
  const reader = entry.createReader();
  const readBatch = async (): Promise<void> => {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => {
      reader.readEntries(resolve, reject);
    });
    for (const child of batch) await walkEntry(child, into);
    if (batch.length) await readBatch();
  };
  await readBatch();
}

export function filesFromZipArchive(buffer: Uint8Array, archiveName: string): File[] {
  const unzipped = unzipSync(buffer);
  const files: File[] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    if (!data || path.endsWith("/") || path.includes("__MACOSX") || path.startsWith(".")) continue;
    if (!isImageFileName(path)) continue;
    const name = path.split("/").pop() ?? path;
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    const type = mimeFromName(name);
    files.push(new File([bytes], `${stripExt(archiveName)}/${name}`, { type }));
  }
  return files;
}

function mimeFromName(name: string): string {
  const ext = fileExtension(name);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "avif") return "image/avif";
  return "image/jpeg";
}

function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, "");
}

async function pdfPagesAsFiles(file: File): Promise<File[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const data = new Uint8Array(await file.arrayBuffer());
  const document = await pdfjs.getDocument({ data }).promise;
  const count = Math.min(document.numPages, MAX_PAGES_PER_DOCUMENT);
  const pages: File[] = [];
  for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
    const page = await document.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(1.6, 1400 / Math.max(base.width, base.height));
    const viewport = page.getViewport({ scale });
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(viewport.width));
    canvas.height = Math.max(1, Math.round(viewport.height));
    const context = canvas.getContext("2d");
    if (!context) continue;
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) continue;
    pages.push(new File([blob], `${stripExt(file.name)}-p${pageNumber}.jpg`, { type: "image/jpeg" }));
  }
  return pages;
}

export async function ingestFiles(
  incoming: File[],
  options: { remaining: number; onProgress?: (progress: IngestProgress) => void },
): Promise<IngestResult> {
  const skipped: IngestSkip[] = [];
  const raster: File[] = [];
  const remaining = () => options.remaining - raster.length;

  const queue = [...incoming];
  while (queue.length && remaining() > 0) {
    const file = queue.shift()!;
    options.onProgress?.({ current: raster.length, total: options.remaining, label: file.name });
    if (file.name.startsWith(".")) continue;
    try {
      if (isPdfFile(file)) {
        if (file.size > MAX_DOCUMENT_BYTES) {
          skipped.push({ name: file.name, reason: "PDFが大きすぎます（80MBまで）" });
          continue;
        }
        const pages = await pdfPagesAsFiles(file);
        if (!pages.length) skipped.push({ name: file.name, reason: "PDFのページを画像にできませんでした" });
        queue.unshift(...pages.slice(0, remaining()));
        continue;
      }
      if (isZipLike(file)) {
        if (file.size > MAX_DOCUMENT_BYTES) {
          skipped.push({ name: file.name, reason: "書庫が大きすぎます（80MBまで）" });
          continue;
        }
        const nested = filesFromZipArchive(new Uint8Array(await file.arrayBuffer()), file.name);
        if (!nested.length) skipped.push({ name: file.name, reason: "書庫の中に画像がありませんでした" });
        queue.unshift(...nested.slice(0, remaining()));
        continue;
      }
      if (!file.type.startsWith("image/") && !isImageFileName(file.name)) {
        skipped.push({ name: file.name, reason: "この形式はまだ画像として読めません" });
        continue;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        skipped.push({ name: file.name, reason: "画像が25MBを超えています" });
        continue;
      }
      raster.push(file);
    } catch (error) {
      skipped.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "読み込めませんでした",
      });
    }
  }
  if (queue.length) {
    skipped.push({ name: "ほかのファイル", reason: `資料は${MAX_LIBRARY}点までです。超えた分は入れていません。` });
  }

  const images: StoredImage[] = [];
  for (let index = 0; index < raster.length; index += 1) {
    const file = raster[index];
    options.onProgress?.({ current: index + 1, total: raster.length, label: file.name });
    try {
      images.push(await fileToStoredImage(file));
    } catch (error) {
      skipped.push({
        name: file.name,
        reason: error instanceof Error ? error.message : "画像に変換できませんでした",
      });
    }
  }
  return { images, skipped };
}
