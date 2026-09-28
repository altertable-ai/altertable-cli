import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { readEnv } from "@/lib/env.ts";
import { configGet } from "@/lib/profile-store.ts";
import packageJson from "@/commands/app/templates/package.json.txt";
import tsconfig from "@/commands/app/templates/tsconfig.json.txt";
import assets from "@/commands/app/templates/assets.d.ts.txt";
import html from "@/commands/app/templates/index.html.txt";
import favicon from "@/commands/app/templates/favicon.svg.txt";
import main from "@/commands/app/templates/main.tsx.txt";
import appView from "@/commands/app/templates/App.tsx.txt";
import variables from "@/commands/app/templates/variables.ts.txt";
import styles from "@/commands/app/templates/styles.css.txt";
import server from "@/commands/app/templates/server.ts.txt";
import operations from "@/commands/app/templates/operations.ts.txt";
import dataContext from "@/commands/app/templates/data-context.ts.txt";
import readme from "@/commands/app/templates/README.md.txt";
import agentGuide from "@/commands/app/templates/AGENTS.md.txt";
import gitignore from "@/commands/app/templates/gitignore.txt";
import bunLock from "@/commands/app/templates/bun.lock.txt";
import bunfig from "@/commands/app/templates/bunfig.toml.txt";
import appManifest from "@/commands/app/templates/app.json.txt";
import oxfmtConfig from "@/commands/app/templates/oxfmtrc.json.txt";
import { currentRuntimeIntegrity, runtimeFiles } from "@/commands/app/lib/runtime.ts";

export const appCreateCommand = defineCommand({
  metadata: {
    name: "create",
    description: "Create a minimal data app project.",
    examples: [
      "altertable app create product-pulse",
      "altertable app create product-pulse --dir ./apps/product-pulse",
      "altertable --profile production app create product-pulse",
    ],
  },
  args: {
    name: { type: "positional", description: "App name in kebab-case", required: true },
    dir: { type: "string", description: "Destination directory (default: ./<name>)." },
    "from-profile": {
      type: "boolean",
      description: "Require organization and environment in the active profile.",
    },
    "without-profile": {
      type: "boolean",
      description: "Create an offline scaffold with scope placeholders.",
    },
  },
  async run({ args, runtime, execution, sink }) {
    const name = String(args.name);
    if (name.length > 64 || !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(name)) {
      throw new CliError(
        "App name must be lowercase kebab-case, start with a letter, and be at most 64 characters.",
      );
    }
    if (args.dir !== undefined && (typeof args.dir !== "string" || args.dir.length === 0)) {
      throw new CliError("--dir requires a directory path.");
    }

    const directory = resolve(args.dir ?? name);
    const title = name
      .split("-")
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(" ");
    const selectedProfile =
      args["from-profile"] === true ||
      runtime.context.profile !== undefined ||
      readEnv("ALTERTABLE_PROFILE") !== undefined;
    const withoutProfile = args["without-profile"] === true;
    if (withoutProfile && selectedProfile) {
      throw new CliError("--without-profile cannot be combined with --from-profile or --profile.");
    }
    const candidateProfile = execution.profile;
    const organizationSlug = configGet("organization_slug", candidateProfile).trim();
    const organizationName = configGet("organization_name", candidateProfile).trim();
    const environment = configGet("api_key_env", candidateProfile).trim();
    if (
      !withoutProfile &&
      (selectedProfile || organizationSlug || organizationName || environment) &&
      (!organizationSlug || !environment)
    ) {
      throw new CliError(
        `Profile "${candidateProfile}" needs an organization and environment before it can seed a data app. Run altertable profile show ${candidateProfile} and configure the missing scope, or use --without-profile for an offline scaffold.`,
      );
    }
    const profileName =
      !withoutProfile && organizationSlug && environment ? candidateProfile : undefined;
    const scope = {
      organization: profileName ? organizationName || organizationSlug : "Your organization",
      environment: profileName ? environment : "your environment",
    };
    const templateValues: Record<string, string> = {
      APP_NAME: name,
      APP_TITLE: title,
      APP_ORG_JSON: JSON.stringify(scope.organization),
      APP_ENV_JSON: JSON.stringify(scope.environment),
      APP_ORG_HTML: escapeHtml(scope.organization),
      APP_ENV_HTML: escapeHtml(scope.environment),
    };
    const files = [
      ["package.json", packageJson],
      ["bun.lock", bunLock],
      ["bunfig.toml", bunfig],
      ["tsconfig.json", tsconfig],
      ["src/assets.d.ts", assets],
      ["src/index.html", html],
      ["src/favicon.svg", favicon],
      ["src/main.tsx", main],
      ["src/App.tsx", appView],
      ["src/variables.ts", variables],
      ["src/styles.css", styles],
      ["src/server.ts", server],
      ["src/operations.ts", operations],
      ["src/data-context.ts", dataContext],
      ["README.md", readme],
      ["AGENTS.md", agentGuide],
      [".gitignore", gitignore],
      [".oxfmtrc.json", oxfmtConfig],
      ["app.json", appManifest],
      ...Object.entries(runtimeFiles).map(
        ([path, content]) => [`.altertable/runtime/${path}`, content] as const,
      ),
      [
        ".altertable/runtime/integrity.json",
        `${JSON.stringify(currentRuntimeIntegrity(), null, 2)}\n`,
      ],
    ] as const;

    await mkdir(dirname(directory), { recursive: true });
    try {
      await mkdir(directory);
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "EEXIST") {
        throw new CliError(`Directory already exists: ${directory}`);
      }
      throw new CliError(`Could not create data app directory: ${directory}`, { cause: error });
    }

    try {
      await mkdir(join(directory, "src"));
      await mkdir(join(directory, ".altertable/runtime"), { recursive: true });
      await mkdir(join(directory, ".altertable/runtime/ui"));
      for (const [path, template] of files) {
        const content = template.replace(/{{([A-Z][A-Z0-9_]*)}}/g, (_, key: string) => {
          const value = templateValues[key];
          if (value === undefined) throw new Error(`Unknown template value ${key} in ${path}.`);
          return value;
        });
        await writeFile(join(directory, path), content, { flag: "wx" });
      }
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw new CliError(`Could not create data app in ${directory}.`, { cause: error });
    }

    const result = {
      name,
      directory,
      scope,
      scopeSource: profileName ? "profile" : "placeholder",
      ...(profileName ? { profile: profileName, organizationSlug } : {}),
      files: files.map(([path]) => path),
      nextSteps: ["app dev", "app check", "app build"].map(
        (command) => `altertable${profileName ? ` --profile ${profileName}` : ""} ${command}`,
      ),
    };
    if (sink.json) sink.writeJson(result);
    else
      sink.writeHuman(
        `Created ${title} in ${directory}.\nScope: ${scope.organization} / ${scope.environment}${profileName ? ` (profile ${profileName})` : " (set this before sharing)"}.\nFrom that directory, run ${result.nextSteps[0]}.`,
      );
  },
});

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );
}
