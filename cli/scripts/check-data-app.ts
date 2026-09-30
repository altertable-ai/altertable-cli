import { join } from "node:path";
import { dataAppDirectory } from "@/commands/app/lib/distribution.ts";

for (const project of ["starter", "tests"]) {
  const commands = [
    ["install", "--frozen-lockfile"],
    ...["typecheck", "lint", "format:check"].map((name) => ["run", name]),
    ...(project === "starter" ? [["run", "build"]] : []),
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
