import { writeCommandOutput } from '@/lib/command-output.ts';
import { defineCommand } from '@/lib/command.ts';
import { getActiveProfileName } from '@/lib/profile-store.ts';

export const profileCurrentCommand = defineCommand({
  metadata: { name: 'current', description: 'Show the active profile name' },
  async run({ sink }) {
    const profileName = getActiveProfileName();
    await writeCommandOutput(
      {
        kind: 'normalized',
        data: { active_profile: profileName },
        humanText: profileName,
      },
      sink
    );
  },
});
