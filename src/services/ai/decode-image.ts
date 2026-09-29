import { PNG } from "pngjs";
import { decode as decodeJpeg } from "jpeg-js";
import type { Raster } from "./signals";

const ANALYSIS_EDGE = 280;

export function decodeMeasuredRaster(bytes: Uint8Array, contentType: string): Raster {
  const raster = decodeRaster(bytes, contentType);
  return fitRaster(raster, ANALYSIS_EDGE);
}

function decodeRaster(bytes: Uint8Array, contentType: string): Raster {
  const type = contentType.toLowerCase();
  if (type.includes("webp") || isWebp(bytes)) {
    throw new Error("webp");
  }
  if (type.includes("png") || isPng(bytes)) {
    const png = PNG.sync.read(Buffer.from(bytes));
    return { width: png.width, height: png.height, data: new Uint8ClampedArray(png.data) };
  }
  if (type.includes("jpeg") || type.includes("jpg") || isJpeg(bytes)) {
    const decoded = decodeJpeg(bytes, { useTArray: true, formatAsRGBA: true });
    return { width: decoded.width, height: decoded.height, data: new Uint8ClampedArray(decoded.data) };
  }
  throw new Error("unsupported");
}

export function fitRaster(raster: Raster, maxEdge: number): Raster {
  const scale = Math.min(1, maxEdge / Math.max(raster.width, raster.height));
  if (scale >= 0.999) return raster;
  const width = Math.max(8, Math.round(raster.width * scale));
  const height = Math.max(8, Math.round(raster.height * scale));
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(raster.height - 1, Math.floor(y / scale));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(raster.width - 1, Math.floor(x / scale));
      const from = (sourceY * raster.width + sourceX) * 4;
      const to = (y * width + x) * 4;
      data[to] = raster.data[from] ?? 0;
      data[to + 1] = raster.data[from + 1] ?? 0;
      data[to + 2] = raster.data[from + 2] ?? 0;
      data[to + 3] = raster.data[from + 3] ?? 255;
    }
  }
  return { width, height, data };
}

function isPng(bytes: Uint8Array): boolean {
  return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
}

function isJpeg(bytes: Uint8Array): boolean {
  return bytes[0] === 0xff && bytes[1] === 0xd8;
}

function isWebp(bytes: Uint8Array): boolean {
  return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
}
