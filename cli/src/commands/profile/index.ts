import { defineCommand } from "@/lib/command-context.ts";
import { assertNoEnvConfigMode } from "@/features/profile/model.ts";
import {
  configureArgs,
  runProfileConfigure,
  type ConfigureCommandArgs,
} from "@/lib/profile-configure.ts";
import { findFirstPositionalToken, valueFlagsFor } from "@/lib/command-delegation.ts";
import { profileCreateCommand } from "@/commands/profile/create.ts";
import { profileCurrentCommand } from "@/commands/profile/current.ts";
import { profileDeleteCommand } from "@/commands/profile/delete.ts";
import { profileDirenvCommand } from "@/commands/profile/direnv.ts";
import { profileEnvCommand } from "@/commands/profile/env.ts";
import { profileListCommand } from "@/commands/profile/list.ts";
import { profileRenameCommand } from "@/commands/profile/rename.ts";
import { profileShowCommand } from "@/commands/profile/show.ts";
import { profileStatusCommand } from "@/commands/profile/status.ts";
import { profileSwitchCommand } from "@/commands/profile/switch.ts";
import { profileUseCommand } from "@/commands/profile/use.ts";

export { promptProfileSwitch } from "@/commands/profile/lib/profile.ts";

const profileValueFlags = valueFlagsFor(configureArgs);

function profileSubcommandInvoked(rawArgs: readonly string[]): boolean {
  return findFirstPositionalToken(rawArgs, { valueFlags: profileValueFlags }) !== undefined;
}

function throwNoProfileCommand(): never {
  const error = new Error("No command specified.") as Error & { code: string };
  error.name = "CLIError";
  error.code = "E_NO_COMMAND";
  throw error;
}

export const profileCommand = defineCommand({
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
  async run({ args, rawArgs, sink }) {
    if (args.configure) {
      assertNoEnvConfigMode();
      await runProfileConfigure(args as ConfigureCommandArgs, sink);
      return;
    }
    if (profileSubcommandInvoked(rawArgs)) return;
    throwNoProfileCommand();
  },
});
