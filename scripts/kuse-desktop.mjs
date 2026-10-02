#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function loadEnvFile(file, env) {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return true;
}

function readJson(url) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: 1500 }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        try {
          resolve({ status: response.statusCode ?? 0, json: JSON.parse(body) });
        } catch {
          resolve({ status: response.statusCode ?? 0, json: null });
        }
      });
    });
    request.on("error", () => resolve(null));
    request.on("timeout", () => {
      request.destroy();
      resolve(null);
    });
  });
}

async function ping() {
  const result = await readJson(`${APP_URL}/api/health`);
  return Boolean(result && result.status === 200 && result.json?.app === "kuse");
}

async function somethingOnPort() {
  const result = await readJson(`${APP_URL}/`);
  if (result) return true;
  return new Promise((resolve) => {
    const request = http.get(APP_URL, { timeout: 1500 }, (response) => {
      response.resume();
      resolve(true);
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
  const env = { ...process.env, FORCE_COLOR: "1" };
  const home = path.join(os.homedir(), ".kuse");
  const data = path.join(home, "data");
  mkdirSync(data, { recursive: true });
  const homeEnv = path.join(home, "env");
  if (!existsSync(homeEnv)) {
    writeFileSync(
      homeEnv,
      "# KUSE local settings. This file is not committed.\nCANVA_REDIRECT_URI=http://127.0.0.1:3847/api/canva/callback\n",
    );
  }
  const localEnv = path.join(ROOT, ".env.local");
  if (!existsSync(localEnv)) {
    const example = path.join(ROOT, ".env.example");
    writeFileSync(
      localEnv,
      existsSync(example)
        ? readFileSync(example, "utf8")
        : "CANVA_REDIRECT_URI=http://127.0.0.1:3847/api/canva/callback\n",
    );
  }
  loadEnvFile(homeEnv, env);
  loadEnvFile(path.join(ROOT, ".env"), env);
  loadEnvFile(localEnv, env);
  env.KUSE_HOME = home;
  env.KUSE_DATA_DIR = data;
  if (!env.CANVA_REDIRECT_URI) env.CANVA_REDIRECT_URI = "http://127.0.0.1:3847/api/canva/callback";
  log(`設定フォルダ: ${home}`);
  log(`Next.js をこの窓で起動します: ${APP_URL}`);
  const child = spawn(process.execPath, [nextJs, "dev", "--port", String(PORT), "--hostname", "127.0.0.1"], {
    cwd: ROOT,
    detached: false,
    stdio: "inherit",
    windowsHide: false,
    env,
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
    log("すでにこのフォルダのサーバーが動いているので、それを使います。");
    await openWindow();
    log("完了。サーバーはこの窓ではなく、先に開いているほうで動いています。");
  } else {
    log("サーバーを起こします。Ready と出るまで待ってください。");
    if (await somethingOnPort()) {
      throw new Error(
        `${PORT}番は別のプロセスが使っています。古い KUSE の黒い窓を閉じてから、もう一度 KUSE.bat を開いてください。`,
      );
    }
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
