#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.KUSE_PORT || 3847);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const APP_URL = `http://127.0.0.1:${PORT}`;
const LOG_PATH = path.join(os.tmpdir(), "kuse-launch.log");
const logStream = createWriteStream(LOG_PATH, { flags: "a" });

function log(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  console.log(message);
  logStream.write(`${line}\n`);
}

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

async function waitUntilUp(ms = 60000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await ping()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

function nextEntry() {
  const file = path.join(ROOT, "node_modules", "next", "dist", "bin", "next");
  return existsSync(file) ? file : null;
}

function startServer() {
  const nextJs = nextEntry();
  if (!nextJs) {
    throw new Error(`${ROOT} で npm install が終わっていません。`);
  }
  const child = spawn(process.execPath, [nextJs, "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.on("error", (error) => log(`サーバー起動エラー: ${error.message}`));
  child.unref();
  log(`サーバーを起動しました (pid ${child.pid ?? "?"})。${APP_URL}`);
}

function trySpawn(command, args, useShell = false) {
  if (!useShell && !existsSync(command)) return Promise.resolve(false);
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
      shell: useShell,
      windowsHide: false,
    });
    child.on("error", () => resolve(false));
    child.on("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
}

function windowsBrowsers() {
  const local = process.env.LOCALAPPDATA || "";
  const program = process.env.ProgramFiles || "C:\\Program Files";
  const programX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const appFlag = `--app=${APP_URL}`;
  return [
    [path.join(local, "Google\\Chrome\\Application\\chrome.exe"), [appFlag]],
    [path.join(program, "Google\\Chrome\\Application\\chrome.exe"), [appFlag]],
    [path.join(programX86, "Google\\Chrome\\Application\\chrome.exe"), [appFlag]],
    [path.join(program, "Microsoft\\Edge\\Application\\msedge.exe"), [appFlag]],
    [path.join(programX86, "Microsoft\\Edge\\Application\\msedge.exe"), [appFlag]],
    [path.join(local, "Microsoft\\Edge\\Application\\msedge.exe"), [appFlag]],
  ];
}

async function openWindow() {
  if (process.platform === "darwin") {
    if (await trySpawn("open", ["-na", "Google Chrome", "--args", `--app=${APP_URL}`])) return;
    if (await trySpawn("open", ["-na", "Microsoft Edge", "--args", `--app=${APP_URL}`])) return;
    await trySpawn("open", [APP_URL]);
    return;
  }
  if (process.platform === "win32") {
    for (const [exe, args] of windowsBrowsers()) {
      if (await trySpawn(exe, args, false)) {
        log(`ブラウザを開きました: ${exe}`);
        return;
      }
    }
    const started = await trySpawn("cmd.exe", ["/c", "start", "", APP_URL], false);
    log(started ? "規定のブラウザで開きました。" : "ブラウザを起動できませんでした。");
    return;
  }
  for (const bin of ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "microsoft-edge"]) {
    if (await trySpawn(bin, [`--app=${APP_URL}`])) return;
  }
  await trySpawn("xdg-open", [APP_URL]);
}

try {
  mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  log(`起動: ${ROOT}`);
  if (!(await ping())) {
    log("サーバーがまだないので起こします。初回は数十秒かかることがあります。");
    startServer();
    const ready = await waitUntilUp();
    if (!ready) {
      throw new Error(`KUSE が ${APP_URL} で開きませんでした。ログは ${LOG_PATH} です。`);
    }
  } else {
    log("すでに起動しているサーバーを使います。");
  }
  await openWindow();
  log("完了");
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(message);
  console.error(`\n${message}\nログ: ${LOG_PATH}`);
  process.exitCode = 1;
} finally {
  logStream.end();
}
