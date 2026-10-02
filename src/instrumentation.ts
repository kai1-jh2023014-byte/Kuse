export async function register() {
  const { ensureKuseEnv } = await import("./lib/kuse-env");
  ensureKuseEnv(process.cwd());
}
