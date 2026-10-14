import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Exercise the shipped CLI outside the checkout, including its embedded starter and published runtime. */
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
  async function preview(arguments_: string[], route: string): Promise<void> {
    const reservation = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = reservation.port!;
    await reservation.stop(true);
    const url = `http://127.0.0.1:${port}`;
    const child = Bun.spawn([...command, "app", "dev", ...arguments_, "--port", String(port)], {
      cwd: directory,
      env,
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = new Response(child.stdout).text();
    const stderr = new Response(child.stderr).text();
    let failure: unknown;
    try {
      const deadline = Date.now() + 20_000;
      let ready = false;
      while (Date.now() < deadline && child.exitCode === null) {
        ready = await fetch(`${url}${route}`).then(
          (response) => response.ok,
          () => false,
        );
        if (ready) break;
        await Bun.sleep(50);
      }
      if (!ready) throw new Error(`Packaged app preview did not start: ${arguments_.join(" ")}`);
      if (
        route === "/bundle.js" &&
        !(await (await fetch(`${url}${route}`)).text()).includes("Packaged preview")
      )
        throw new Error("Packaged file preview did not bundle the app.");
    } catch (error) {
      failure = error;
    }
    child.kill("SIGTERM");
    try {
      await Promise.race([
        child.exited,
        new Promise<never>((_, reject) => {
          const timer = setTimeout(
            () => reject(new Error("Packaged preview did not stop.")),
            5_000,
          );
          timer.unref();
        }),
      ]);
    } catch (error) {
      child.kill("SIGKILL");
      throw error;
    }
    const [output, errors] = await Promise.all([stdout, stderr]);
    if (failure)
      throw new Error(
        `Packaged preview failed: ${failure instanceof Error ? failure.message : "unknown error"}\n${errors}\n${output}`,
      );
    if (route === "/bundle.js" && child.exitCode !== 0)
      throw new Error(`Packaged preview failed (${child.exitCode}):\n${errors}\n${output}`);
    if (
      await fetch(url).then(
        () => true,
        () => false,
      )
    )
      throw new Error("Packaged preview is still serving after shutdown.");
  }
  try {
    await run(
      [...command, "app", "create", "package-smoke", "--dir", app, "--without-profile"],
      directory,
    );
    const manifest = await Bun.file(join(app, "package.json")).json();
    if (!/^\d+\.\d+\.\d+$/.test(manifest.dependencies?.["@altertable/data-app"] ?? ""))
      throw new Error("Packaged starter must pin a published runtime");
    if (await Bun.file(join(app, ".altertable/runtime/package.json")).exists())
      throw new Error("Packaged starter must not vendor the runtime");
    if (scaffoldOnly) return;
    await run([process.execPath, "install", "--frozen-lockfile", "--ignore-scripts"], app);
    await run(
      [
        process.execPath,
        "-e",
        'import { createDataHandler } from "@altertable/data-app/server"; import { localLakehouse } from "@altertable/data-app/server/bun"; if (typeof createDataHandler !== "function" || typeof localLakehouse !== "function") process.exit(1);',
      ],
      app,
    );
    await run([...command, "app", "lint", "--dir", app], directory);
    await preview(["--dir", app], "/");
    const file = join(directory, "index.tsx");
    await Bun.write(
      file,
      `import { defineDataApp as declareApp } from "@altertable/data-app";
import { injectDataAppStyles, mountDataApp } from "@altertable/data-app/react";
const app = declareApp({ title: "Packaged preview", description: "Preview smoke test", scope: { organization: "Test", environment: "test" }, queries: {} });
function View() { return <p>Packaged preview</p>; }
injectDataAppStyles();
mountDataApp({ app, component: View });`,
    );
    await preview(["--file", file], "/bundle.js");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
