#!/usr/bin/env node
import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.KUSE_PORT || 3847);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = `http://127.0.0.1:${PORT}`;

function ping() {
  return new Promise((resolve) => {
    const request = http.get(`${APP_URL}/`, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(response.statusCode !== undefined && response.statusCode < 500);
    });
    request.on("error", () => resolve(false));
    request.on("timeout", () => {
      request.destroy();
      resolve(false);
    });
  });
}

async function waitUntilUp(ms = 45000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

function startServer() {
  const child = spawn("npx", ["next", "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    shell: process.platform === "win32",
    env: process.env,
  });
  child.unref();
}

function trySpawn(command, args) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { detached: true, stdio: "ignore", shell: process.platform === "win32" });
    child.on("error", () => resolve(false));
    child.on("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

async function openWindow() {
  const appFlag = `--app=${APP_URL}`;
  if (process.platform === "darwin") {
    if (await trySpawn("open", ["-na", "Google Chrome", "--args", appFlag])) return;
    if (await trySpawn("open", ["-na", "Microsoft Edge", "--args", appFlag])) return;
    await trySpawn("open", [APP_URL]);
    return;
  }
  if (process.platform === "win32") {
    const local = process.env.LOCALAPPDATA || "";
    const program = process.env["ProgramFiles"] || "C:\\Program Files";
    const programX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const candidates = [
      [path.join(local, "Google\\Chrome\\Application\\chrome.exe"), [appFlag]],
      [path.join(program, "Google\\Chrome\\Application\\chrome.exe"), [appFlag]],
      [path.join(program, "Microsoft\\Edge\\Application\\msedge.exe"), [appFlag]],
      [path.join(programX86, "Microsoft\\Edge\\Application\\msedge.exe"), [appFlag]],
    ];
    for (const [exe, args] of candidates) {
      if (await trySpawn(exe, args)) return;
    }
    await trySpawn("cmd", ["/c", "start", "", APP_URL]);
    return;
  }
  for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    if (await trySpawn(bin, [appFlag])) return;
  }
  await trySpawn("xdg-open", [APP_URL]);
}

if (!(await ping())) {
  startServer();
  const ready = await waitUntilUp();
  if (!ready) {
    console.error(`KUSE が ${APP_URL} で開きませんでした。先に npm install と npm run dev を確認してください。`);
    process.exit(1);
  }
}

await openWindow();
