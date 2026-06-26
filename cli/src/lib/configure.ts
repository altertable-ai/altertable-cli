import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { unlinkSync, rmSync, existsSync } from "node:fs";
import {
  configDir,
  configFile,
  configGet,
  configSet,
  configUnset,
  credentialsFile,
  resolveApiBase,
  resolveManagementApiBase,
} from "@/lib/config.ts";
import { CliError } from "@/lib/errors.ts";
import {
  getActiveProfileName,
  ensureProfileExists,
  listProfiles,
  profilesDir,
} from "@/lib/profile.ts";
import { getCliContext, setCliContext } from "@/context.ts";
import { secretDelete, secretExists, secretSet, secretStoreDisplay } from "@/lib/secrets.ts";
import { assertAllowedApiBase } from "@/lib/url-policy.ts";
import { getCliRuntime, getOutputSink, type OutputSink } from "@/lib/runtime.ts";

const ARGV_SECRET_WARNING =
  "Warning: passing secrets on the command line is visible in process listings. Prefer --password-stdin / --api-key-stdin.";

export type ConfigureOptions = {
  user?: string;
  password?: string;
  basicToken?: string;
  apiKey?: string;
  env?: string;
  passwordStdin?: boolean;
  apiKeyStdin?: boolean;
  dataPlaneUrl?: string;
  controlPlaneUrl?: string;
  profile?: string;
  show?: boolean;
  clear?: boolean;
  allowInsecureHttp?: boolean;
};

async function withProfileContext<T>(
  profileName: string | undefined,
  run: () => Promise<T> | T,
): Promise<T> {
  if (!profileName) {
    return await run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return await run();
  } finally {
    setCliContext(previous);
  }
}

function configureClearLakehouseCredentials(profileName?: string): void {
  secretDelete("lakehouse/password", profileName);
  secretDelete("lakehouse/basic-token", profileName);
  configUnset("user");
}

function configureClearManagementCredentials(profileName?: string): void {
  secretDelete("api-key", profileName);
  configUnset("api_key_env");
}

export function configureClearAll(): void {
  configureClearLakehouseCredentials();
  configureClearManagementCredentials();
  configUnset("api_base");
  configUnset("management_api_base");
}

async function readStdinLine(): Promise<string> {
  return await new Promise((resolve) => {
    let buffer = "";
    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      if (buffer.includes("\n")) {
        input.off("data", onData);
        resolve(buffer.split("\n")[0] ?? "");
      }
    }
    input.on("data", onData);
    input.resume();
  });
}

async function readInteractiveLine(prompt: string): Promise<string> {
  if (!input.isTTY) {
    process.stderr.write(prompt);
    return (await readStdinLine()).trim();
  }
  const readline = createInterface({ input, output });
  const answer = (await readline.question(prompt)).trim();
  readline.close();
  return answer;
}

async function readHiddenPassword(prompt: string): Promise<string> {
  if (!input.isTTY) {
    return await readStdinLine();
  }

  output.write(prompt);
  input.setRawMode?.(true);
  input.resume();
  return await new Promise((resolve) => {
    let password = "";
    function onData(char: Buffer): void {
      const value = char.toString("utf8");
      if (value === "\n" || value === "\r" || value === "\u0004") {
        input.setRawMode?.(false);
        input.pause();
        input.removeListener("data", onData);
        output.write("\n");
        resolve(password);
        return;
      }
      if (value === "\u0003") {
        throw new CliError("Interrupted.");
      }
      if (value === "\u007f" || value === "\b") {
        password = password.slice(0, -1);
        return;
      }
      password += value;
    }
    input.on("data", onData);
  });
}

async function configureRunInteractive(sink: OutputSink): Promise<void> {
  const currentUser = configGet("user");

  if (!input.isTTY) {
    const lines = (await Bun.stdin.text())
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const user = lines[0] ?? currentUser;
    const password = lines[1] ?? "";
    if (!user) {
      throw new CliError("Username is required.");
    }
    if (!password) {
      throw new CliError("Password is required.");
    }
    configureClearLakehouseCredentials();
    configSet("user", user);
    secretSet("lakehouse/password", password);
    sink.writeMetadata([`Saved lakehouse credentials for user ${user}.`]);
    return;
  }

  const promptUser = currentUser ? `Lakehouse username [${currentUser}]: ` : "Lakehouse username: ";
  let user = await readInteractiveLine(promptUser);
  if (!user) {
    user = currentUser;
  }

  const password = await readHiddenPassword("Lakehouse password (input hidden): ");
  if (!user) {
    throw new CliError("Username is required.");
  }
  if (!password) {
    throw new CliError("Password is required.");
  }

  configureClearLakehouseCredentials();
  configSet("user", user);
  secretSet("lakehouse/password", password);
  sink.writeMetadata([`Saved lakehouse credentials for user ${user}.`]);
}

export async function configureRunSet(
  options: ConfigureOptions,
  sink: OutputSink = getOutputSink(),
): Promise<void> {
  return withProfileContext(options.profile, async () => {
    let user = options.user ?? "";
    let password = options.password ?? "";
    let apiKey = options.apiKey ?? "";
    const basicToken = options.basicToken ?? "";
    const env = options.env ?? "";
    const dataPlaneUrl = options.dataPlaneUrl ?? "";
    const controlPlaneUrl = options.controlPlaneUrl ?? "";
    const allowInsecureHttp = options.allowInsecureHttp ?? false;

    const passwordFromArgv = Boolean(options.password) && !options.passwordStdin;
    const apiKeyFromArgv = Boolean(options.apiKey) && !options.apiKeyStdin;
    if (passwordFromArgv || apiKeyFromArgv) {
      sink.writeMetadata([ARGV_SECRET_WARNING]);
    }

    const hasAnyInput =
      user ||
      password ||
      basicToken ||
      apiKey ||
      env ||
      options.passwordStdin ||
      options.apiKeyStdin ||
      dataPlaneUrl ||
      controlPlaneUrl;

    if (!hasAnyInput) {
      await configureRunInteractive(sink);
      return;
    }

    if (options.passwordStdin) {
      password = (await Bun.stdin.text()).replace(/\n$/, "");
    }
    if (options.apiKeyStdin) {
      apiKey = (await Bun.stdin.text()).replace(/\n$/, "");
    }

    const hasLakehouse = Boolean(user || password);
    const hasToken = Boolean(basicToken);
    const hasApiKey = Boolean(apiKey);
    const lakehouseMechanismCount = Number(hasLakehouse) + Number(hasToken);
    const hasAnyCredential = hasLakehouse || hasToken || hasApiKey;

    if (lakehouseMechanismCount > 1) {
      throw new CliError(
        "Choose a single lakehouse authentication mechanism: --user/--password or --basic-token.",
      );
    }
    if (hasApiKey && (hasLakehouse || hasToken)) {
      throw new CliError(
        "Choose a single authentication mechanism per configure invocation: lakehouse credentials or --api-key.",
      );
    }
    if ((dataPlaneUrl || controlPlaneUrl) && !hasAnyCredential) {
      throw new CliError("endpoint flags must be set together with a credential.");
    }
    if (env && !hasApiKey) {
      throw new CliError("--env applies only to --api-key.");
    }
    if (!hasAnyCredential) {
      throw new CliError(
        "Nothing to configure. Use --user/--password, --basic-token, or --api-key --env <name>.",
      );
    }
    if (hasLakehouse && (!user || !password)) {
      throw new CliError("--user and --password must be provided together.");
    }
    if (hasApiKey && !env) {
      throw new CliError("--api-key requires --env <name>.");
    }

    if (hasApiKey) {
      configureClearManagementCredentials();
      secretSet("api-key", apiKey, undefined, { fromArgv: apiKeyFromArgv });
      configSet("api_key_env", env);
    }
    if (hasToken) {
      configureClearLakehouseCredentials();
      secretSet("lakehouse/basic-token", basicToken);
    } else if (hasLakehouse) {
      configureClearLakehouseCredentials();
      configSet("user", user);
      secretSet("lakehouse/password", password, undefined, { fromArgv: passwordFromArgv });
    }

    if (dataPlaneUrl) {
      assertAllowedApiBase(dataPlaneUrl, { allowInsecureHttp });
      configSet("api_base", dataPlaneUrl);
    } else if (hasAnyCredential) {
      configUnset("api_base");
    }
    if (controlPlaneUrl) {
      assertAllowedApiBase(controlPlaneUrl, { allowInsecureHttp });
      configSet("management_api_base", controlPlaneUrl);
    } else if (hasAnyCredential) {
      configUnset("management_api_base");
    }

    if (hasApiKey) {
      sink.writeMetadata([`Saved management API key for environment ${env}.`]);
    } else if (hasToken) {
      sink.writeMetadata(["Saved lakehouse Basic token."]);
    } else if (hasLakehouse) {
      sink.writeMetadata([`Saved lakehouse credentials for user ${user}.`]);
    }
  });
}

export function configureRunShowForProfile(profileName: string): string {
  return configureRunShowInternal(profileName);
}

function configureRunShowInternal(profileOverride?: string): string {
  const activeProfile = getActiveProfileName();
  const displayProfile = profileOverride ?? getCliContext().profile ?? activeProfile;

  const lines = [
    "Altertable CLI configuration",
    `  Config dir:    ${configDir()}`,
    `  Active profile: ${displayProfile}`,
    `  Secret store:  ${secretStoreDisplay()}`,
  ];

  return withProfileContextSync(profileOverride ?? getCliContext().profile, () => {
    lines.push(
      `  Data plane:    ${resolveApiBase()}`,
      `  Control plane: ${resolveManagementApiBase()}`,
      "",
    );

    let hasManagement = false;
    let hasLakehouse = false;

    if (secretExists("api-key")) {
      hasManagement = true;
      lines.push(
        "  Authentication: management API key",
        `    environment:  ${configGet("api_key_env")}`,
        "    api key:      set",
      );
    }

    if (secretExists("lakehouse/basic-token")) {
      hasLakehouse = true;
      lines.push("  Authentication: lakehouse Basic token", "    basic token:  set");
    } else if (secretExists("lakehouse/password")) {
      hasLakehouse = true;
      lines.push(
        "  Authentication: lakehouse username/password",
        `    user:         ${configGet("user")}`,
        "    password:     set",
      );
    }

    if (!hasManagement && !hasLakehouse) {
      lines.push("  No credentials configured. Run: altertable configure");
      lines.push(
        "  Hint: run 'altertable configure --api-key atm_xxx --env <name>' for management commands, then 'altertable configure --user <u> --password <p>' for lakehouse queries.",
      );
    } else if (hasManagement && !hasLakehouse) {
      lines.push(
        "  Hint: run 'altertable configure --user <u> --password <p>' for lakehouse query, upload, and append commands.",
      );
    } else if (hasLakehouse && !hasManagement) {
      lines.push(
        "  Hint: run 'altertable configure --api-key atm_xxx --env <name>' for whoami, catalogs, and other management commands.",
      );
    }

    const storedApiKeyEnv = configGet("api_key_env");
    const envOverride = process.env.ALTERTABLE_ENV;
    if (envOverride && envOverride !== storedApiKeyEnv) {
      const storedLabel = storedApiKeyEnv || "none";
      lines.push(`  Environment override: ALTERTABLE_ENV=${envOverride} (stored: ${storedLabel})`);
    }
    if (process.env.ALTERTABLE_API_KEY) {
      lines.push("  API key override: ALTERTABLE_API_KEY is set via environment");
    }

    return lines.join("\n");
  });
}

function withProfileContextSync<T>(profileName: string | undefined, run: () => T): T {
  if (!profileName) {
    return run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return run();
  } finally {
    setCliContext(previous);
  }
}

export function configureRunShow(): string {
  return configureRunShowInternal();
}

export function configureRunClear(sink: OutputSink = getOutputSink()): void {
  const profiles = existsSync(profilesDir()) ? listProfiles() : [];
  for (const profile of profiles) {
    configureClearLakehouseCredentials(profile.name);
    configureClearManagementCredentials(profile.name);
  }
  for (const filePath of [configFile(), credentialsFile()]) {
    try {
      unlinkSync(filePath);
    } catch {
      // already removed
    }
  }
  try {
    rmSync(profilesDir(), { recursive: true, force: true });
  } catch {
    // already removed
  }
  getCliRuntime().session = undefined;
  sink.writeMetadata(["Cleared all altertable configuration."]);
}
