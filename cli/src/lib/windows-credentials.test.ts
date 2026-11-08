import { expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { credentialsFile, kvGet, kvSet } from '@/lib/config.ts';
import { getProfileId } from '@/lib/profile-store.ts';
import { createSecretStore } from '@/lib/secrets.ts';

test.skipIf(process.platform !== 'win32')(
  'Windows native credentials round-trip without a plaintext store',
  () => {
    const directory = mkdtempSync(
      join(tmpdir(), 'altertable-native-credentials-')
    );
    const oldHome = process.env.ALTERTABLE_CONFIG_HOME;
    const oldBackend = process.env.ALTERTABLE_SECRET_BACKEND;
    process.env.ALTERTABLE_CONFIG_HOME = directory;
    delete process.env.ALTERTABLE_SECRET_BACKEND;
    const store = createSecretStore();
    const secret = 'synthetic native credential: Zoë 🔑 \'$"\nsecond line';
    try {
      store.secretSet('api-key', secret, 'native-test');
      expect(store.secretStoreDisplay()).toBe('Windows Credential Manager');
      expect(store.secretGet('api-key', 'native-test')).toBe(secret);
      expect(store.secretExists('api-key', 'native-test')).toBe(true);
      expect(existsSync(credentialsFile())).toBe(false);
      store.secretDelete('api-key', 'native-test');
      expect(store.secretExists('api-key', 'native-test')).toBe(false);

      // Upgrade an existing stable-profile plaintext credential, then remove it.
      const account = `profile/${getProfileId('native-test')}/api-key`;
      kvSet(credentialsFile(), account, 'synthetic legacy credential');
      expect(store.secretGet('api-key', 'native-test')).toBe(
        'synthetic legacy credential'
      );
      expect(kvGet(credentialsFile(), account)).toBe('');
      expect(store.secretGet('api-key', 'native-test')).toBe(
        'synthetic legacy credential'
      );
    } finally {
      try {
        store.secretDelete('api-key', 'native-test');
      } finally {
        if (oldHome === undefined) delete process.env.ALTERTABLE_CONFIG_HOME;
        else process.env.ALTERTABLE_CONFIG_HOME = oldHome;
        if (oldBackend === undefined)
          delete process.env.ALTERTABLE_SECRET_BACKEND;
        else process.env.ALTERTABLE_SECRET_BACKEND = oldBackend;
        rmSync(directory, { recursive: true, force: true });
      }
    }
  },
  120_000
);
