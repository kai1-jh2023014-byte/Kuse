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

async function waitUntilUp(ms = 120000) {
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

function stopProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    spawn("taskkill", ["/pid", String(pid), "/t", "/f"], { stdio: "ignore", windowsHide: true });
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }
}

function startServer() {
  const nextJs = nextEntry();
  if (!nextJs) {
    throw new Error(`${ROOT} で npm install が終わっていません。`);
  }
  log(`Next.js をこの窓で起動します: ${APP_URL}`);
  const child = spawn(process.execPath, [nextJs, "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    detached: false,
    stdio: "inherit",
    windowsHide: false,
    env: { ...process.env, FORCE_COLOR: "1" },
  });
  child.on("error", (error) => log(`サーバー起動エラー: ${error.message}`));
  return child;
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

function waitForExit(child) {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve(child.exitCode);
      return;
    }
    child.on("exit", (code) => resolve(code ?? 1));
  });
}

let server = null;
try {
  mkdirSync(path.dirname(LOG_PATH), { recursive: true });
  log(`起動: ${ROOT}`);
  if (await ping()) {
    log("すでに起動しているサーバーを使います。");
    await openWindow();
    log("完了。サーバーはこの窓ではなく、先に開いているほうで動いています。");
  } else {
    log("サーバーを起こします。Ready と出るまで待ってください。");
    server = startServer();
    const ready = await waitUntilUp();
    if (!ready) {
      stopProcessTree(server.pid);
      throw new Error(`KUSE が ${APP_URL} で開きませんでした。この窓の赤いエラーと ${LOG_PATH} を確認してください。`);
    }
    await openWindow();
    log(`準備できました: ${APP_URL}`);
    log("この黒い窓がサーバーです。閉じると KUSE は止まります。");
    const code = await waitForExit(server);
    if (code !== 0) process.exitCode = code;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log(message);
  console.error(`\n${message}\nログ: ${LOG_PATH}`);
  process.exitCode = 1;
  if (server?.pid) stopProcessTree(server.pid);
} finally {
  logStream.end();
}
