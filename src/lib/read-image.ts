import { computeSignals } from "@/services/ai/signals";
import type { RawImageSignals } from "@/services/ai/types";
import type { StoredImage } from "./idb";

const STORE_EDGE = 1400;
const ANALYSIS_EDGE = 280;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("画像を読み込めませんでした"));
    image.src = src;
  });
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("ファイルを読めませんでした"));
    reader.readAsDataURL(file);
  });
}

function canvasOf(image: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("このブラウザでは画像を読み取れません");
  context.drawImage(image, 0, 0, width, height);
  return canvas;
}

export async function fileToStoredImage(file: File): Promise<StoredImage> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} は画像ではありません`);
  }
  if (file.size > 8_000_000) {
    throw new Error(`${file.name} は8MBを超えています`);
  }
  const original = await readFile(file);
  const image = await loadImage(original);
  const scale = Math.min(1, STORE_EDGE / Math.max(image.width, image.height));
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const canvas = canvasOf(image, width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("このブラウザでは画像を読み取れません");
  const sample = context.getImageData(0, 0, Math.min(width, 48), Math.min(height, 48));
  let transparent = 0;
  for (let index = 3; index < sample.data.length; index += 4) {
    if ((sample.data[index] ?? 255) < 20) transparent += 1;
  }
  const hasAlpha = transparent / (sample.data.length / 4) > 0.04;
  return {
    id: crypto.randomUUID(),
    name: file.name,
    createdAt: new Date().toISOString(),
    width: image.width,
    height: image.height,
    dataUrl: hasAlpha ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.84),
  };
}

export async function extractSignals(image: StoredImage): Promise<RawImageSignals> {
  const loaded = await loadImage(image.dataUrl);
  const scale = Math.min(1, ANALYSIS_EDGE / Math.max(loaded.width, loaded.height));
  const width = Math.max(8, Math.round(loaded.width * scale));
  const height = Math.max(8, Math.round(loaded.height * scale));
  const canvas = canvasOf(loaded, width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("このブラウザでは画像を読み取れません");
  const raster = context.getImageData(0, 0, width, height);
  return computeSignals(raster, {
    id: image.id,
    filename: image.name,
    width: image.width,
    height: image.height,
  });
}

export async function makeThumbnail(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);
  const scale = Math.min(1, 480 / Math.max(image.width, image.height));
  const width = Math.max(8, Math.round(image.width * scale));
  const height = Math.max(8, Math.round(image.height * scale));
  const canvas = canvasOf(image, width, height);
  return canvas.toDataURL("image/jpeg", 0.72);
}
