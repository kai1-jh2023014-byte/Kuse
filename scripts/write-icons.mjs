import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "public");
mkdirSync(outDir, { recursive: true });

function put(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const i = (png.width * y + x) << 2;
  png.data[i] = r;
  png.data[i + 1] = g;
  png.data[i + 2] = b;
  png.data[i + 3] = a;
}

function fillRect(png, x0, y0, x1, y1, color) {
  const [r, g, b] = color;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) put(png, x, y, r, g, b);
  }
}

function roundedFill(png, color, radius) {
  const [r, g, b] = color;
  const w = png.width;
  const h = png.height;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const dx = Math.min(x, w - 1 - x);
      const dy = Math.min(y, h - 1 - y);
      if (dx < radius && dy < radius) {
        const dist = Math.hypot(radius - dx, radius - dy);
        if (dist > radius) continue;
      }
      put(png, x, y, r, g, b);
    }
  }
}

function drawK(png) {
  const s = png.width;
  const u = Math.round(s / 16);
  const ink = [250, 246, 240];
  fillRect(png, 4 * u, 3 * u, 6 * u, 13 * u, ink);
  for (let i = 0; i < 8; i += 1) {
    fillRect(png, 6 * u + i * u, 7 * u - i * Math.round(u * 0.55), 8 * u + i * u, 9 * u - i * Math.round(u * 0.55), ink);
    fillRect(png, 6 * u + i * u, 7 * u + i * Math.round(u * 0.55), 8 * u + i * u, 9 * u + i * Math.round(u * 0.55), ink);
  }
}

function writeIcon(size, name) {
  const png = new PNG({ width: size, height: size });
  png.data.fill(0);
  roundedFill(png, [36, 28, 22], Math.round(size * 0.22));
  drawK(png);
  writeFileSync(path.join(outDir, name), PNG.sync.write(png));
}

writeIcon(192, "icon-192.png");
writeIcon(512, "icon-512.png");
writeIcon(180, "apple-touch-icon.png");
console.log("wrote icons");
