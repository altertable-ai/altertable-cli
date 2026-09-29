import { join } from "node:path";
import { dataAppDirectory } from "@/commands/app/lib/distribution.ts";
import { setupDataApp } from "@/../scripts/package-data-app.ts";

await setupDataApp();
for (const project of ["runtime", "starter", "tests"]) {
  const commands = [
    ["install", "--frozen-lockfile"],
    ...["typecheck", "lint", "format:check"].map((name) => ["run", name]),
    ...(project === "runtime"
      ? [["test", "tests"]]
      : project === "starter"
        ? [["run", "build"]]
        : []),
  ];
  for (const args of commands) {
    const child = Bun.spawn([process.execPath, ...args], {
      cwd: join(dataAppDirectory, project),
      stdout: "inherit",
      stderr: "inherit",
    });
    if (await child.exited) throw new Error(`${project}: bun ${args.join(" ")} failed`);
  }
}
