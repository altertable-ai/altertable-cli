import {
  extractAppManifest,
  filePreviewDirectory,
} from '@/commands/app/lib/manifest.ts';
import { readRequiredFile } from '@/commands/app/lib/remote.ts';
import { assertAppScope, profileAppScope } from '@/commands/app/lib/scope.ts';

/** Verify source scope before granting the preview lakehouse access. */
export async function prepareFilePreview(
  file: string,
  profile: string
): Promise<string> {
  const manifest = await extractAppManifest(
    await readRequiredFile(file, 'source')
  );
  assertAppScope(manifest.scope, profileAppScope(profile), 'data app file');
  return filePreviewDirectory();
}
