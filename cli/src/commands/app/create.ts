import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { defineCommand } from "@/lib/command.ts";
import { CliError } from "@/lib/errors.ts";
import { readEnv } from "@/lib/env.ts";
import { configGet } from "@/lib/profile-store.ts";
import { createAppFiles } from "@/commands/app/lib/distribution.ts";
import { dataAppPayload } from "@/commands/app/lib/payload.ts";

export const appCreateCommand = defineCommand({
  metadata: {
    name: "create",
    description: "Create a data app project with a live connection check.",
    examples: [
      "altertable app create product-pulse",
      "altertable app create product-pulse --dir ./apps/product-pulse",
      "altertable --profile production app create product-pulse",
    ],
  },
  args: {
    name: { type: "positional", description: "App name in kebab-case", required: true },
    dir: { type: "string", description: "Destination directory (default: ./<name>)." },
    "without-profile": {
      type: "boolean",
      description: "Create an offline scaffold with organization and environment placeholders.",
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
    const explicitProfile =
      runtime.context.profile !== undefined || readEnv("ALTERTABLE_PROFILE") !== undefined;
    const withoutProfile = args["without-profile"] === true;
    if (withoutProfile && explicitProfile) {
      throw new CliError("--without-profile cannot be combined with --profile.");
    }
    const candidateProfile = execution.profile;
    const organizationSlug = configGet("organization_slug", candidateProfile).trim();
    const organizationName = configGet("organization_name", candidateProfile).trim();
    const environment = configGet("api_key_env", candidateProfile).trim();
    if (!withoutProfile && (!organizationSlug || !environment)) {
      throw new CliError(
        `Profile "${candidateProfile}" needs an organization and environment before it can seed a data app. Run \`altertable login --org <org> --env <env>\` to connect, or use \`--without-profile\` for an offline scaffold.`,
      );
    }
    const profileName = withoutProfile ? undefined : candidateProfile;
    const scope = {
      organization: profileName ? organizationName || organizationSlug : "Your organization",
      environment: profileName ? environment : "your environment",
    };
    const files = Object.entries(createAppFiles(dataAppPayload, { name, title, scope }));

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
      for (const [path, content] of files) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), content, { flag: "wx" });
      }
    } catch (error) {
      await rm(directory, { recursive: true, force: true });
      throw new CliError(`Could not create data app in ${directory}.`, { cause: error });
    }

    const nextSteps = profileName
      ? ["app dev", "app check", "app build"].map(
          (command) => `altertable --profile ${profileName} ${command}`,
        )
      : [
          "Set organization and environment in app.json.",
          "Select a matching profile, or configure one with `altertable login --org <org> --env <env>`.",
          "altertable app dev",
          "altertable app check --lakehouse",
          "altertable app build",
        ];
    const result = {
      name,
      directory,
      scope,
      scopeSource: profileName ? "profile" : "placeholder",
      ...(profileName ? { profile: profileName, organizationSlug } : {}),
      files: files.map(([path]) => path),
      nextSteps,
    };
    if (sink.json) sink.writeJson(result);
    else if (profileName)
      sink.writeHuman(
        `Created ${title} in ${directory}.\nScope: ${scope.organization} / ${scope.environment} (profile ${profileName}).\nFrom that directory, run \`${nextSteps[0]}\`.`,
      );
    else
      sink.writeHuman(
        `Created ${title} in ${directory} with placeholder scope.\nBefore previewing, set the organization and environment in app.json and select a matching profile (or run \`altertable login --org <org> --env <env>\`).\nYou can run \`altertable app build\` from that directory now.`,
      );
  },
});
