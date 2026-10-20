import { readFileSync } from 'node:fs';

import { CliError } from '@/lib/errors.ts';

export function readFileArgument(value: string): string {
  if (value === '@-') {
    return readFileSync(0, 'utf8');
  }
  if (!value.startsWith('@')) {
    return value;
  }
  const filePath = value.slice(1);
  try {
    return readFileSync(filePath, 'utf8');
  } catch {
    throw new CliError(`File not found: ${filePath}`);
  }
}
