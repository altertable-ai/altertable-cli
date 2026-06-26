import { configureRunClear, configureRunSet, configureRunShow } from "@/lib/configure.ts";
import { writeCommandOutput } from "@/lib/command-output.ts";
import { defineAltertableCommand } from "@/lib/command-context.ts";

export const configureCommand = defineAltertableCommand({
  meta: {
    name: "configure",
    description: "Configure and securely store credentials and settings.",
  },
  args: {
    user: { type: "string", description: "Lakehouse username (global)" },
    password: { type: "string", description: "Lakehouse password (global)" },
    "basic-token": { type: "string", description: "Pre-encoded HTTP Basic token" },
    "api-key": { type: "string", description: "Management API key for the --env environment" },
    env: {
      type: "string",
      description: "Target environment (management API keys are per-environment)",
    },
    "password-stdin": { type: "boolean", description: "Read the lakehouse password from stdin" },
    "api-key-stdin": { type: "boolean", description: "Read the management API key from stdin" },
    show: { type: "boolean", description: "Show stored configuration (secrets masked)" },
    profile: {
      type: "string",
      description: "Profile to configure (default: active profile)",
    },
    clear: {
      type: "boolean",
      description: "Remove all stored configuration and credentials (no prompt)",
    },
    "data-plane-url": {
      type: "string",
      description:
        "Data-plane base URL (stored with the credential; default: https://api.altertable.ai)",
    },
    "control-plane-url": {
      type: "string",
      description:
        "Control-plane server root; the CLI appends /rest/v1 (default: https://app.altertable.ai)",
    },
    "allow-insecure-http": {
      type: "boolean",
      description: "Allow http:// URLs other than localhost (not recommended)",
    },
  },
  async run({ args, sink }) {
    if (args.show) {
      writeCommandOutput({ kind: "human", text: configureRunShow() }, sink);
      return;
    }
    if (args.clear) {
      configureRunClear(sink);
      return;
    }

    await configureRunSet(
      {
        user: args.user,
        password: args.password,
        basicToken: args["basic-token"],
        apiKey: args["api-key"],
        env: args.env,
        passwordStdin: args["password-stdin"],
        apiKeyStdin: args["api-key-stdin"],
        dataPlaneUrl: args["data-plane-url"],
        controlPlaneUrl: args["control-plane-url"],
        profile: args.profile ? String(args.profile) : undefined,
        allowInsecureHttp: args["allow-insecure-http"],
      },
      sink,
    );
  },
});
