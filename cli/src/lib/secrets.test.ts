import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { chmodSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { credentialsFile } from '@/lib/config.ts';
import { getProfileId } from '@/lib/profile-store.ts';
import {
  createSecretStore,
  secretExists,
  secretGet,
  secretSet,
} from '@/lib/secrets.ts';
import { createFakeKeychain } from '@/test-utils/keychain.ts';

let testHome = '';

beforeEach(() => {
  testHome = mkdtempSync(join(tmpdir(), 'altertable-secrets-test-'));
  process.env.ALTERTABLE_CONFIG_HOME = testHome;
  process.env.ALTERTABLE_SECRET_BACKEND = 'keychain';
});

afterEach(() => {
  rmSync(testHome, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

describe('secretSet', () => {
  test('stores and reads secrets from the file backend', () => {
    process.env.ALTERTABLE_SECRET_BACKEND = 'file';

    secretSet('api-key', 'atm_test', 'default');

    expect(secretGet('api-key', 'default')).toBe('atm_test');
    expect(secretExists('api-key', 'default')).toBe(true);
  });

  test('argv secrets use the protected file instead of Keychain process arguments', () => {
    const keychain = createFakeKeychain();

    keychain.store.secretSet('lakehouse/password', 'secret', 'default', {
      fromArgv: true,
    });

    expect(
      keychain.calls.some(args => args.includes('add-generic-password'))
    ).toBe(false);
    expect(keychain.store.secretGet('lakehouse/password', 'default')).toBe(
      'secret'
    );
  });

  test('distinguishes a Keychain failure from a missing secret', () => {
    const keychain = createFakeKeychain();
    keychain.failingReads.add('profile/default/api-key');

    expect(() => keychain.store.secretExists('api-key', 'default')).toThrow(
      'Failed to inspect secret in macOS keychain'
    );
    expect(() => keychain.store.secretGet('api-key', 'default')).toThrow(
      'Failed to read secret from macOS keychain'
    );
  });
});

describe('secretDelete', () => {
  test('fails closed when Keychain deletion fails', () => {
    const keychain = createFakeKeychain();
    keychain.store.secretSet('api-key', 'atm_test', 'default');
    const account = `profile/${getProfileId('default')}/api-key`;
    keychain.failingDeletes.add(account);

    expect(() => keychain.store.secretDelete('api-key', 'default')).toThrow(
      'Failed to delete secret from macOS keychain'
    );
    expect(keychain.store.secretGet('api-key', 'default')).toBe('atm_test');
  });

  test('accepts an already absent Keychain item', () => {
    const keychain = createFakeKeychain();

    expect(() =>
      keychain.store.secretDelete('api-key', 'default')
    ).not.toThrow();
  });
});

for (const platform of ['linux', 'win32'] as const) {
  test(`file credentials use platform-appropriate mode checks on ${platform}`, () => {
    process.env.ALTERTABLE_SECRET_BACKEND = 'file';
    const store = createSecretStore({
      platform,
      spawnSync() {
        throw new Error(
          'File credentials must not invoke a system keychain command.'
        );
      },
    });
    store.secretSet('api-key', 'atm_file_test', 'default');
    // Windows reports mode bits without Unix owner/group/other distinctions.
    chmodSync(credentialsFile(), 0o666);
    if (platform === 'win32') {
      expect(store.secretGet('api-key', 'default')).toBe('atm_file_test');
      expect(store.secretExists('api-key', 'default')).toBe(true);
    } else {
      expect(() => store.secretGet('api-key', 'default')).toThrow(
        'permissions'
      );
      expect(() => store.secretExists('api-key', 'default')).toThrow(
        'permissions'
      );
    }
  });
}
