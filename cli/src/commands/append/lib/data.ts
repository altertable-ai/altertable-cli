import { CliError } from '@/lib/errors.ts';
import { readFileArgument } from '@/lib/file-argument.ts';

export function parseAppendJsonContent(dataArg: string): string {
  const jsonContent = readFileArgument(dataArg);

  const firstCharacter = jsonContent.trimStart()[0];
  if (firstCharacter !== '{' && firstCharacter !== '[') {
    throw new CliError('Data must be a JSON object or array.');
  }

  try {
    JSON.parse(jsonContent);
    return jsonContent;
  } catch {
    throw new CliError('Data must be valid JSON.');
  }
}
