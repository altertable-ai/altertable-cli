import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Exercise the shipped CLI outside the checkout, including its embedded app sources. */
export async function smokeDataApp(command: string[], scaffoldOnly = false): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "altertable-packaged-app-"));
  const app = join(directory, "app");
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (key.startsWith("ALTERTABLE_")) delete env[key];
  env.ALTERTABLE_CONFIG_HOME = join(directory, "config");
  async function run(arguments_: string[], cwd: string): Promise<void> {
    const child = Bun.spawn(arguments_, { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    if (code !== 0)
      throw new Error(`Packaged app smoke failed: ${arguments_.join(" ")}\n${stderr}\n${stdout}`);
  }
  try {
    await run(
      [...command, "app", "create", "package-smoke", "--dir", app, "--without-profile"],
      directory,
    );
    if (!(await Bun.file(join(app, ".altertable/runtime/src/server/index.ts")).exists()))
      throw new Error("Packaged runtime is missing");
    if (scaffoldOnly) return;
    await run([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], app);
    await run([...command, "app", "check", "--dir", app], directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
