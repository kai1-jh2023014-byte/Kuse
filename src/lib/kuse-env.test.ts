import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyEnvFile, ensureKuseEnv } from "./kuse-env";
import { writeFileSync } from "node:fs";

describe("kuse env files", () => {
  let directory = "";
  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("creates a local env stub so Canva is never treated as unconfigured", async () => {
    const home = await mkdtemp(path.join(tmpdir(), "kuse-home-"));
    const repo = await mkdtemp(path.join(tmpdir(), "kuse-repo-"));
    directory = home;
    const env: Record<string, string | undefined> = { KUSE_HOME: home };
    writeFileSync(path.join(repo, ".env.example"), "CANVA_REDIRECT_URI=http://127.0.0.1:3847/api/canva/callback\n");
    ensureKuseEnv(repo, env);
    expect(env.CANVA_REDIRECT_URI).toContain("127.0.0.1:3847");
    expect(env.KUSE_DATA_DIR).toBe(path.join(home, "data"));
    const local = await readFile(path.join(repo, ".env.local"), "utf8");
    expect(local).toContain("CANVA_REDIRECT_URI");
    await rm(repo, { recursive: true, force: true });
  });

  it("reads key=value from a file", async () => {
    directory = await mkdtemp(path.join(tmpdir(), "kuse-env-"));
    const file = path.join(directory, "env");
    writeFileSync(file, "CANVA_CLIENT_ID=abc\n");
    const env: Record<string, string | undefined> = {};
    expect(applyEnvFile(file, env)).toBe(true);
    expect(env.CANVA_CLIENT_ID).toBe("abc");
  });
});
