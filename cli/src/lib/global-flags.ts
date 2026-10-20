import type { CliContext } from '@/context.ts';
import { asCliArgString } from '@/lib/cli-args.ts';
import { copyProcessEnv } from '@/lib/env.ts';
import { parseTimeoutSeconds } from '@/lib/timeout-args.ts';

export const AGENT_ENV_VARIABLES = [
  'AI_AGENT',
  'AGENT',
  'CLAUDECODE',
  'CODEX_CI',
  'CODEX_SANDBOX',
  'CODEX_THREAD_ID',
  'CURSOR_AGENT',
  'GEMINI_CLI',
  'COPILOT_AGENT',
  'COPILOT_CLI',
  'COPILOT_AGENT_SESSION_ID',
] as const;

type AgentEnvironment = {
  env: Readonly<Record<string, string | undefined>>;
  stdoutIsTTY: boolean;
};

function resolveAgentMode(
  argv: readonly string[],
  { env, stdoutIsTTY }: AgentEnvironment
): boolean {
  if (argv.includes('--no-agent')) return false;
  if (argv.includes('--agent')) return true;
  // Keep early output selection non-throwing; validateEnvironment reports invalid values later.
  const override = env.ALTERTABLE_AGENT_MODE?.toLowerCase();
  if (override === '1' || override === 'true') return true;
  if (override === '0' || override === 'false') return false;
  const explicitFormat = argv.some(
    arg => arg === '--json' || arg === '--format' || arg.startsWith('--format=')
  );
  return (
    !stdoutIsTTY &&
    !explicitFormat &&
    AGENT_ENV_VARIABLES.some(name => Boolean(env[name]))
  );
}

export function parseGlobalOutputFlags(
  argv: readonly string[],
  environment: AgentEnvironment = {
    env: copyProcessEnv(),
    stdoutIsTTY: Boolean(process.stdout.isTTY),
  }
): CliContext {
  const separatorIndex = argv.indexOf('--');
  const globalArgs =
    separatorIndex === -1 ? argv : argv.slice(0, separatorIndex);
  return {
    debug: globalArgs.includes('--debug') || globalArgs.includes('-d'),
    json: globalArgs.includes('--json'),
    agent: resolveAgentMode(globalArgs, environment),
    noColor: globalArgs.includes('--no-color'),
  };
}

export function mergeGlobalFlagsFromArgs(
  context: CliContext,
  args: Record<string, unknown>
): CliContext {
  const merged = { ...context };
  if (args.debug !== undefined) merged.debug = Boolean(args.debug);
  if (args.json !== undefined) merged.json = Boolean(args.json);
  if (args.agent !== undefined) merged.agent = Boolean(args.agent);
  if (args['no-agent']) merged.agent = false;
  if (args['no-color'] !== undefined)
    merged.noColor = Boolean(args['no-color']);

  const profile = asCliArgString(args.profile);
  if (profile.length > 0) merged.profile = profile;
  if (args['connect-timeout'] !== undefined) {
    merged.connectTimeoutMs = parseTimeoutSeconds(
      args['connect-timeout'],
      '--connect-timeout'
    );
  }
  if (args['read-timeout'] !== undefined) {
    merged.readTimeoutMs = parseTimeoutSeconds(
      args['read-timeout'],
      '--read-timeout'
    );
  }
  if (args['ignore-ssl-errors'] !== undefined) {
    merged.ignoreSslErrors = Boolean(args['ignore-ssl-errors']);
  }
  return merged;
}
