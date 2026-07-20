import { join } from "node:path";

const repositoryRoot = join(import.meta.dir, "../..");
const defaultBundlePath = join(repositoryRoot, "cli/dist/cli.js");

function optionValue(arguments_: string[], name: string): string | undefined {
  return arguments_.find((argument) => argument.startsWith(`${name}=`))?.slice(`${name}=`.length);
}

async function runBundle(bundlePath: string, arguments_: string[]): Promise<string> {
  const child = Bun.spawn([process.execPath, bundlePath, ...arguments_], {
    cwd: repositoryRoot,
    stdout: "pipe",
    stderr: "inherit",
  });
  const output = await new Response(child.stdout).text();
  const exitCode = await child.exited;
  if (exitCode !== 0) {
    throw new Error(`npm bundle exited with ${exitCode}: ${arguments_.join(" ")}`);
  }
  return output;
}

export async function smokeNpmBundle(arguments_ = Bun.argv.slice(2)): Promise<void> {
  const expectedBun = optionValue(arguments_, "--expected-bun");
  if (expectedBun && Bun.version !== expectedBun) {
    throw new Error(`Expected Bun ${expectedBun}; received ${Bun.version}.`);
  }

  const bundlePath = optionValue(arguments_, "--bundle") ?? defaultBundlePath;
  const version = (await runBundle(bundlePath, ["--version"])).trim();
  if (!/^\d+\.\d+\.\d+(?:-.+)?$/.test(version)) {
    throw new Error(`npm bundle returned an invalid version: ${version}.`);
  }

  const help = await runBundle(bundlePath, ["--help"]);
  if (!help.includes("Altertable CLI") || !help.includes("Commands")) {
    throw new Error("npm bundle help output is incomplete.");
  }

  const specification = JSON.parse(await runBundle(bundlePath, ["api", "spec", "--json"])) as {
    openapi?: string;
  };
  if (specification.openapi !== "3.1.0") {
    throw new Error("npm bundle returned an unexpected OpenAPI document.");
  }

  console.log(`Bun ${Bun.version}: npm bundle smoke test passed.`);
}

if (import.meta.main) {
  await smokeNpmBundle();
}
