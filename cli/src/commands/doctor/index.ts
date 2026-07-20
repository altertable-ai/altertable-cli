import { defineCommand } from "@/lib/command.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { createDoctorChecks } from "@/commands/doctor/lib/checks.ts";
import { formatDoctorReport } from "@/commands/doctor/lib/render.ts";
import { runDoctorChecks } from "@/commands/doctor/lib/runner.ts";
import { createReadOnlyExecutionContext } from "@/lib/execution-context.ts";

export const doctorCommand = defineCommand({
  metadata: {
    name: "doctor",
    commandGroup: "platform",
    description: "Diagnose local configuration and Altertable connectivity.",
    examples: ["altertable doctor", "altertable doctor --offline", "altertable --json doctor"],
  },
  args: {
    offline: {
      type: "boolean",
      description: "Inspect local configuration without contacting Altertable APIs.",
    },
  },
  async run({ args, runtime, sink }) {
    const report = await runDoctorChecks(createDoctorChecks(), {
      execution: createReadOnlyExecutionContext(runtime),
      offline: args.offline === true,
    });
    await writeCommandOutput(
      {
        kind: "normalized",
        data: report,
        humanText: formatDoctorReport(report),
      },
      sink,
    );
  },
});
