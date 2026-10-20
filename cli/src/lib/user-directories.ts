import { homedir } from 'node:os';
import { isAbsolute, join, parse } from 'node:path';

import { readEnv } from '@/lib/env.ts';
import { ConfigurationError } from '@/lib/errors.ts';

export function homeDir(): string {
  try {
    return requireAbsoluteDirectory(homedir(), 'OS home directory');
  } catch (cause) {
    throw new ConfigurationError(
      'Unable to determine an absolute OS home directory.',
      { cause }
    );
  }
}

export function configHome(): string {
  const override = readEnv('XDG_CONFIG_HOME');
  return override
    ? requireAbsoluteDirectory(override, 'XDG_CONFIG_HOME')
    : join(homeDir(), '.config');
}

export function dataHome(): string {
  const override = readEnv('XDG_DATA_HOME');
  return override
    ? requireAbsoluteDirectory(override, 'XDG_DATA_HOME')
    : join(homeDir(), '.local', 'share');
}

export function configDir(): string {
  const override = readEnv('ALTERTABLE_CONFIG_HOME');
  return override
    ? requireAbsoluteDirectory(override, 'ALTERTABLE_CONFIG_HOME')
    : join(configHome(), 'altertable');
}

function requireAbsoluteDirectory(value: string, source: string): string {
  // Windows root-relative paths (e.g. \settings) depend on the current drive.
  if (
    !isAbsolute(value) ||
    (process.platform === 'win32' && parse(value).root.length === 1)
  ) {
    throw new ConfigurationError(
      `${source} must be an absolute directory independent of the working directory.`
    );
  }
  return value;
}
