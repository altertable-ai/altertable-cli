import { defineCommand } from "@/lib/command.ts";
import { profileConfigureCommand } from "@/commands/profile/configure.ts";
import { profileCurrentCommand } from "@/commands/profile/current.ts";
import { profileDeleteCommand } from "@/commands/profile/delete.ts";
import { profileEnvCommand } from "@/commands/profile/env.ts";
import { profileListCommand } from "@/commands/profile/list.ts";
import { profileRenameCommand } from "@/commands/profile/rename.ts";
import { profileShowCommand } from "@/commands/profile/show.ts";
import { profileStatusCommand } from "@/commands/profile/status.ts";
import { profileSwitchCommand } from "@/commands/profile/switch.ts";
import { resolveSelectedSubCommand } from "@/lib/command-delegation.ts";

export const profileCommand = defineCommand({
  meta: {
    name: "profile",
    commandGroup: "platform",
    description: "Manage named profiles and stored credentials.",
    examples: [
      "altertable profile show",
      "altertable profile configure",
      "altertable profile configure acme_production --api-key atm_xxx --env production",
      "altertable profile configure --scope lakehouse",
      "altertable profile list",
      "altertable profile switch",
      "altertable profile status",
      'eval "$(altertable profile env acme_staging)"',
      "altertable --profile acme_staging profile show",
    ],
  },
  subCommands: {
    configure: profileConfigureCommand,
    list: profileListCommand,
    show: profileShowCommand,
    status: profileStatusCommand,
    switch: profileSwitchCommand,
    current: profileCurrentCommand,
    env: profileEnvCommand,
    rename: profileRenameCommand,
    delete: profileDeleteCommand,
  },
  async run({ rawArgs }) {
    if (await resolveSelectedSubCommand(profileCommand, rawArgs)) return;
    throwNoProfileCommand();
  },
});

function throwNoProfileCommand(): never {
  const error = new Error("No command specified.") as Error & { code: string };
  error.name = "CLIError";
  error.code = "E_NO_COMMAND";
  throw error;
}
