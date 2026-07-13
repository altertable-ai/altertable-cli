import { asCliArgString } from "@/lib/cli-args.ts";
import { getCliContext, isJsonOutput, setCliContext } from "@/context.ts";
import { CliError, ConfigurationError } from "@/lib/errors.ts";
import type { ProfileInspect } from "@/features/profile/model.ts";
import type { ConfigureAuthPlane } from "@/lib/profile-status.ts";
import { configureVerify } from "@/lib/profile-status.ts";
import {
  configureArgs,
  runProfileConfigure,
  type ConfigureCommandArgs,
} from "@/lib/profile-configure.ts";
import { findFirstPositionalToken, valueFlagsFor } from "@/lib/command-delegation.ts";
import {
  defaultConfigurePrompts,
  type ConfigurePrompts,
} from "@/lib/profile-configure-interactive.ts";
import { defineLocalCommand, defineValueCommand } from "@/lib/operation-command-builders.ts";
import {
  buildProfileDirenvView,
  buildProfileShellExportView,
  profileStatusToJson,
  profileSwitchOption,
  type ProfileStatusResult,
} from "@/features/profile/views.ts";
import {
  formatProfileInspect,
  formatProfileList,
  formatProfileStatus,
} from "@/features/profile/render.ts";
import { renderShellExportView } from "@/ui/shell/render.ts";
import {
  assertProfileHasNoEnvCredentials,
  createEmptyProfile,
  deleteProfile,
  getActiveProfileName,
  inspectProfile,
  listProfiles,
  profileExists,
  renameProfile,
  setActiveProfile,
} from "@/features/profile/model.ts";
import { refreshCliRuntimeContext } from "@/lib/runtime.ts";

function requireProfileName(name: unknown): string {
  const trimmed = asCliArgString(name).trim();
  if (trimmed === "") {
    throw new CliError("A profile name is required.");
  }
  return trimmed;
}

function optionalArg(value: unknown): string | undefined {
  const stringValue = asCliArgString(value).trim();
  return stringValue || undefined;
}

function existingProfileName(name: string): string {
  if (!profileExists(name)) {
    throw new ConfigurationError(`Profile not found: ${name}`);
  }
  return name;
}

function profileNameArgOrActive(args: Record<string, unknown>): string {
  return args.name ? requireProfileName(args.name) : getActiveProfileName();
}

function configuredVerificationPlanes(profile: ProfileInspect): ConfigureAuthPlane[] {
  const planes: ConfigureAuthPlane[] = [];
  if (profile.auth.management !== "none") {
    planes.push("management");
  }
  if (profile.auth.lakehouse !== "none") {
    planes.push("lakehouse");
  }
  return planes;
}

export async function promptProfileSwitch(
  prompts: ConfigurePrompts = defaultConfigurePrompts,
): Promise<string> {
  const profiles = listProfiles();
  const activeProfile = getActiveProfileName();
  return await prompts.readSelect(
    "Switch profile",
    profiles.map(profileSwitchOption),
    activeProfile,
  );
}

const profileListCommand = defineValueCommand({
  id: "profile.list",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "list", description: "List configured profiles" },
  value() {
    return listProfiles();
  },
  present(profiles) {
    return {
      kind: "normalized",
      data: { profiles },
      humanText: formatProfileList(profiles),
    };
  },
});

const profileCreateCommand = defineLocalCommand({
  id: "profile.create",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: {
    name: "create",
    description: "Create a profile and configure its credentials",
    examples: [
      "altertable profile create acme_prod --api-key atm_xxx --env production",
      "altertable profile create acme_staging --user alice --password secret",
      "altertable profile create acme_prod",
    ],
  },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    ...configureArgs,
  },
  parse({ args }) {
    return {
      name: requireProfileName(args.name),
      configure: args as ConfigureCommandArgs,
    };
  },
  async local(input, context) {
    createEmptyProfile(input.name);
    await runProfileConfigure(input.configure, context.sink, input.name);
    setActiveProfile(input.name);
    return inspectProfile(input.name);
  },
  present(profile) {
    return {
      kind: "normalized",
      data: { profile },
      humanText: formatProfileInspect(profile),
    };
  },
});

function profileShowTargetName(args: Record<string, unknown>): string {
  const explicit = optionalArg(args.name);
  if (explicit) {
    return explicit;
  }
  return getCliContext().profile ?? getActiveProfileName();
}

const profileShowCommand = defineLocalCommand<{ profileName: string }, ProfileInspect>({
  id: "profile.show",
  localConfig: true,
  output: "normalized",
  meta: {
    name: "show",
    description: "Show a profile's stored identity, auth, and endpoints",
  },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return { profileName: existingProfileName(profileShowTargetName(args)) };
  },
  local(input) {
    return inspectProfile(input.profileName);
  },
  present(result) {
    return {
      kind: "normalized",
      data: { profile: result },
      humanText: formatProfileInspect(result),
    };
  },
});

function createProfileUseCommand(id: string, name: string, hidden = false) {
  return defineLocalCommand({
    id,
    mutates: true,
    localConfig: true,
    output: "normalized",
    meta: { name, description: "Set the active profile", hidden },
    args: {
      name: { type: "positional", description: "Profile name", required: true },
    },
    parse({ args }) {
      return requireProfileName(args.name);
    },
    local(profileName) {
      assertProfileHasNoEnvCredentials("Switching profiles");
      setActiveProfile(profileName);
      return profileName;
    },
    present(profileName) {
      return {
        kind: "ack",
        data: { active_profile: profileName },
        metadataMessage: `Active profile set to ${profileName}.`,
      };
    },
  });
}

const profileUseCommand = createProfileUseCommand("profile.use", "use");
const profileSwitchCommand = defineLocalCommand<string | undefined, string>({
  id: "profile.switch",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "switch", description: "Interactively switch the active profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: false },
  },
  parse({ args }) {
    return args.name ? requireProfileName(args.name) : undefined;
  },
  async local(profileName) {
    assertProfileHasNoEnvCredentials("Switching profiles");
    if (!profileName) {
      if (isJsonOutput(getCliContext()) || getCliContext().agent || process.stdin.isTTY !== true) {
        throw new CliError("Interactive profile switch requires a TTY. Pass a profile name.");
      }
      profileName = await promptProfileSwitch();
    }
    setActiveProfile(profileName);
    return profileName;
  },
  present(profileName) {
    return {
      kind: "ack",
      data: { active_profile: profileName },
      metadataMessage: `Active profile set to ${profileName}.`,
    };
  },
});

const profileCurrentCommand = defineValueCommand({
  id: "profile.current",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "current", description: "Show the active profile name" },
  value() {
    return getActiveProfileName();
  },
  present(profileName) {
    return {
      kind: "normalized",
      data: { active_profile: profileName },
      humanText: profileName,
    };
  },
});

const profileEnvCommand = defineValueCommand({
  id: "profile.env",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "env", description: "Print shell exports for a profile" },
  args: {
    name: { type: "positional", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileNameArgOrActive(args));
  },
  value(profileName) {
    return profileName;
  },
  present(profileName) {
    const view = buildProfileShellExportView(profileName);
    return {
      kind: "normalized",
      data: { profile: profileName, env: view.env },
      humanText: renderShellExportView(view),
    };
  },
});

const profileDirenvCommand = defineValueCommand({
  id: "profile.direnv",
  capabilities: ["local-config"],
  output: "normalized",
  meta: { name: "direnv", description: "Print a .envrc snippet for a profile" },
  args: {
    name: { type: "positional", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileNameArgOrActive(args));
  },
  value(profileName) {
    return profileName;
  },
  present(profileName) {
    const view = buildProfileDirenvView(profileName);
    return {
      kind: "normalized",
      data: { profile: profileName, env: view.env },
      humanText: renderShellExportView(view),
    };
  },
});

const profileStatusCommand = defineLocalCommand<string, ProfileStatusResult>({
  id: "profile.status",
  localConfig: true,
  output: "normalized",
  meta: {
    name: "status",
    description: "Verify stored credentials and show the profile",
  },
  args: {
    name: { type: "string", description: "Profile name (default: active profile)" },
  },
  parse({ args }) {
    return existingProfileName(profileShowTargetName(args));
  },
  async local(profileName) {
    const previous = getCliContext();
    try {
      const next = { ...previous, profile: profileName };
      setCliContext(next);
      refreshCliRuntimeContext(next);
      const profile = inspectProfile(profileName);
      const verification = await configureVerify(configuredVerificationPlanes(profile));
      return { profile, verification };
    } finally {
      setCliContext(previous);
      refreshCliRuntimeContext(previous);
    }
  },
  present(result) {
    return {
      kind: "normalized",
      data: profileStatusToJson(result),
      humanText: formatProfileStatus(result),
    };
  },
});

const profileRenameCommand = defineLocalCommand({
  id: "profile.rename",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "rename", description: "Rename a profile", hidden: true },
  args: {
    from: { type: "positional", description: "Current profile name", required: true },
    to: { type: "positional", description: "New profile name", required: true },
  },
  parse({ args }) {
    return {
      from: requireProfileName(args.from),
      to: requireProfileName(args.to),
    };
  },
  local(input) {
    renameProfile(input.from, input.to);
    return input;
  },
  present(input) {
    return {
      kind: "ack",
      data: { renamed: true, from: input.from, to: input.to },
      metadataMessage: `Renamed profile ${input.from} to ${input.to}.`,
    };
  },
});

const profileDeleteCommand = defineLocalCommand({
  id: "profile.delete",
  mutates: true,
  localConfig: true,
  output: "normalized",
  meta: { name: "delete", description: "Delete a profile" },
  args: {
    name: { type: "positional", description: "Profile name", required: true },
    yes: { type: "boolean", description: "Confirm deletion" },
  },
  parse({ args }) {
    if (!args.yes) {
      throw new CliError("Pass --yes to delete a profile.");
    }
    return requireProfileName(args.name);
  },
  local(profileName) {
    deleteProfile(profileName);
    return profileName;
  },
  present(profileName) {
    return {
      kind: "ack",
      data: { deleted: profileName },
      metadataMessage: `Deleted profile ${profileName}.`,
    };
  },
});

const profileValueFlags = valueFlagsFor(configureArgs);

/** True when citty already dispatched to a `profile <subcommand>` for this invocation. */
function profileSubcommandInvoked(rawArgs: readonly string[]): boolean {
  return findFirstPositionalToken(rawArgs, { valueFlags: profileValueFlags }) !== undefined;
}

/** Mimic citty's bare-command usage path so `altertable profile` still prints help. */
function throwNoProfileCommand(): never {
  const error = new Error("No command specified.") as Error & { code: string };
  error.name = "CLIError";
  error.code = "E_NO_COMMAND";
  throw error;
}

export const profileCommand = defineLocalCommand<Record<string, unknown>, void>({
  id: "profile",
  mutates: true,
  localConfig: true,
  output: "none",
  meta: {
    name: "profile",
    commandGroup: "platform",
    description: "Manage named profiles and stored credentials.",
    examples: [
      "altertable profile show",
      "altertable profile --configure",
      "altertable profile --configure --api-key atm_xxx --env production",
      "altertable profile --configure --scope lakehouse",
      "altertable profile list",
      "altertable profile create acme_prod --api-key atm_xxx --env production",
      "altertable profile use acme_prod",
      "altertable profile switch",
      "altertable profile status",
      'eval "$(altertable profile env acme_staging)"',
      "altertable --profile acme_staging profile show",
    ],
  },
  args: {
    configure: {
      type: "boolean",
      description:
        "Create or update stored credentials and settings (interactive wizard, or pass flags to set fields)",
    },
    ...configureArgs,
  },
  subCommands: {
    create: profileCreateCommand,
    list: profileListCommand,
    show: profileShowCommand,
    status: profileStatusCommand,
    use: profileUseCommand,
    switch: profileSwitchCommand,
    current: profileCurrentCommand,
    env: profileEnvCommand,
    direnv: profileDirenvCommand,
    rename: profileRenameCommand,
    delete: profileDeleteCommand,
  },
  parse({ args }) {
    return args as Record<string, unknown>;
  },
  async local(args, context) {
    if (args.configure) {
      await runProfileConfigure(args as ConfigureCommandArgs, context.sink);
      return;
    }
    // A subcommand (e.g. `profile list`) already ran; nothing left for the parent.
    if (profileSubcommandInvoked(context.rawArgs)) {
      return;
    }
    throwNoProfileCommand();
  },
});
