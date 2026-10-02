#!/usr/bin/env node
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LAUNCHER = path.join(ROOT, "scripts", "kuse-desktop.mjs");
const ICON = path.join(ROOT, "public", "icon-512.png");

function desktopDir() {
  if (process.platform === "win32") {
    const home = process.env.USERPROFILE || os.homedir();
    const oneDrive = path.join(home, "OneDrive", "Desktop");
    const classic = path.join(home, "Desktop");
    return existsSync(oneDrive) ? oneDrive : classic;
  }
  const home = os.homedir();
  const dirs = path.join(home, ".config", "user-dirs.dirs");
  if (existsSync(dirs)) {
    const match = readFileSync(dirs, "utf8").match(/XDG_DESKTOP_DIR="([^"]+)"/);
    if (match?.[1]) return match[1].replace("$HOME", home);
  }
  return path.join(home, "Desktop");
}

function writeLinux() {
  const dir = desktopDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "KUSE.desktop");
  writeFileSync(
    file,
    [
      "[Desktop Entry]",
      "Version=1.0",
      "Type=Application",
      "Name=KUSE",
      "Comment=自分のデザインの癖から Canva 用の指示を作る",
      `Exec=${process.execPath} "${LAUNCHER}"`,
      `Path=${ROOT}`,
      `Icon=${ICON}`,
      "Terminal=false",
      "Categories=Graphics;Office;",
      "",
    ].join("\n"),
  );
  chmodSync(file, 0o755);
  spawnSync("gio", ["set", file, "metadata::trusted", "true"], { stdio: "ignore" });
  return file;
}

function writeMac() {
  const dir = desktopDir();
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "KUSE.command");
  writeFileSync(
    file,
    `#!/bin/bash\ncd "${ROOT}"\nexec "${process.execPath}" "${LAUNCHER}"\n`,
  );
  chmodSync(file, 0o755);
  return file;
}

function writeWindows() {
  const dir = desktopDir();
  mkdirSync(dir, { recursive: true });
  const bat = path.join(dir, "KUSE.bat");
  writeFileSync(
    bat,
    [
      "@echo off",
      "setlocal",
      "title KUSE",
      "chcp 65001 >nul",
      `cd /d "${ROOT}"`,
      "echo KUSE を起動しています。初回は数十秒かかることがあります。",
      "echo.",
      `"${process.execPath}" "${LAUNCHER}"`,
      "if errorlevel 1 (",
      "  echo.",
      "  echo 起動できませんでした。ログ: %TEMP%\\kuse-launch.log",
      "  echo このウィンドウを閉じる前に、上のメッセージを確認してください。",
      "  pause",
      ")",
      "endlocal",
      "",
    ].join("\r\n"),
  );
  const lnk = path.join(dir, "KUSE.lnk");
  const ps = `
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut(${JSON.stringify(lnk)})
$shortcut.TargetPath = ${JSON.stringify(bat)}
$shortcut.WorkingDirectory = ${JSON.stringify(ROOT)}
$shortcut.WindowStyle = 1
$shortcut.Description = "KUSE"
$shortcut.Save()
`;
  spawnSync("powershell", ["-NoProfile", "-Command", ps], { encoding: "utf8" });
  return bat;
}

const target =
  process.platform === "darwin" ? writeMac() : process.platform === "win32" ? writeWindows() : writeLinux();
console.log(target);
