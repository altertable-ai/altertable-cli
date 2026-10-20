import { CliError } from '@/lib/errors.ts';
import { readFileArgument } from '@/lib/file-argument.ts';

export function parseQueryStatement(statementArg: string): string {
  const statement = readFileArgument(statementArg);
  if (statementArg.startsWith('@') && statement.trim() === '') {
    throw new CliError(
      statementArg === '@-'
        ? 'SQL from stdin is empty.'
        : `SQL file is empty: ${statementArg.slice(1)}`
    );
  }
  return statement;
}
