import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const STUB = `# KUSE local settings. This file is not committed.
CANVA_REDIRECT_URI=http://127.0.0.1:3847/api/canva/callback
`;

export function kuseHome(): string {
  const override = process.env.KUSE_HOME?.trim();
  if (override) return override;
  return path.join(os.homedir(), ".kuse");
}

export function dataDirectory(): string {
  const override = process.env.KUSE_DATA_DIR?.trim();
  if (override) return override;
  return path.join(kuseHome(), "data");
}

export function applyEnvFile(file: string, env: Record<string, string | undefined> = process.env): boolean {
  if (!existsSync(file)) return false;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 1) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return true;
}

function writeIfMissing(file: string, contents: string) {
  if (existsSync(file)) return;
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, contents);
}

/** Load ~/.kuse/env, repo .env, repo .env.local. Create stubs so "env is missing" never happens. */
export function ensureKuseEnv(repoRoot = process.cwd(), env: Record<string, string | undefined> = process.env): void {
  const test = env.VITEST === "true";
  const home = env.KUSE_HOME?.trim() || kuseHome();
  const data = env.KUSE_DATA_DIR?.trim() || path.join(home, "data");
  if (!test) {
    mkdirSync(data, { recursive: true });
    writeIfMissing(path.join(home, "env"), STUB);
    const local = path.join(repoRoot, ".env.local");
    const example = path.join(repoRoot, ".env.example");
    if (!existsSync(local)) {
      writeIfMissing(local, existsSync(example) ? readFileSync(example, "utf8") : STUB);
    }
  }
  applyEnvFile(path.join(home, "env"), env);
  applyEnvFile(path.join(repoRoot, ".env"), env);
  applyEnvFile(path.join(repoRoot, ".env.local"), env);
  if (!env.CANVA_REDIRECT_URI) env.CANVA_REDIRECT_URI = "http://127.0.0.1:3847/api/canva/callback";
  if (!env.KUSE_DATA_DIR) env.KUSE_DATA_DIR = data;
}
