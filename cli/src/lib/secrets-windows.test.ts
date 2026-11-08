import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { credentialsFile, kvGet, kvSet } from '@/lib/config.ts';
import { getProfileId } from '@/lib/profile-store.ts';
import { createSecretStore } from '@/lib/secrets.ts';

let directory = '';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'altertable-wincred-test-'));
  process.env.ALTERTABLE_CONFIG_HOME = directory;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  delete process.env.ALTERTABLE_CONFIG_HOME;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});

function fakeWindowsStore() {
  const values = new Map<string, string>();
  const calls: { args: string[]; input: string }[] = [];
  const failures = new Set<string>();
  const store = createSecretStore({
    platform: 'win32',
    spawnSync(_command, args, options) {
      if (typeof options.input !== 'string')
        throw new Error('Expected JSON stdin');
      const input = options.input;
      calls.push({ args, input });
      const request = JSON.parse(input) as {
        action: string;
        account: string;
        value?: string;
      };
      if (failures.has(request.action)) return { status: 1, stdout: '' };
      if (request.action === 'set') values.set(request.account, request.value!);
      if (request.action === 'delete') values.delete(request.account);
      return {
        status: 0,
        stdout: JSON.stringify({
          value: values.get(request.account) ?? null,
          exists: values.has(request.account),
        }),
      };
    },
  });
  return { store, values, calls, failures };
}

test('Windows defaults to Credential Manager without writing plaintext', () => {
  const { store, values, calls } = fakeWindowsStore();
  store.secretSet('api-key', 'atm_native_test', 'default', { fromArgv: true });
  const account = `profile/${getProfileId('default')}/api-key`;
  expect(values.get(account)).toBe('atm_native_test');
  expect(store.secretGet('api-key', 'default')).toBe('atm_native_test');
  expect(store.secretExists('api-key', 'default')).toBe(true);
  expect(store.secretStoreDisplay()).toBe('Windows Credential Manager');
  expect(existsSync(credentialsFile())).toBe(false);
  expect(calls.some(call => call.input.includes('atm_native_test'))).toBe(true);
  expect(
    calls.every(call => !call.args.join(' ').includes('atm_native_test'))
  ).toBe(true);
  store.secretDelete('api-key', 'default');
  expect(store.secretExists('api-key', 'default')).toBe(false);
});

test('Windows migrates existing file secrets only after native storage succeeds', () => {
  const { store, values, failures } = fakeWindowsStore();
  kvSet(credentialsFile(), 'profile/default/api-key', 'atm_legacy_test');
  failures.add('set');
  expect(() => store.secretGet('api-key', 'default')).toThrow(
    'Windows Credential Manager'
  );
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe(
    'atm_legacy_test'
  );
  failures.clear();
  store.migrateProfileSecrets('default', ['api-key']);
  const account = `profile/${getProfileId('default')}/api-key`;
  expect(values.get(account)).toBe('atm_legacy_test');
  expect(values.has('profile/default/api-key')).toBe(false);
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe('');
});

test('Windows native failures never fall back to a plaintext write or stale file value', () => {
  const { store, failures } = fakeWindowsStore();
  failures.add('set');
  expect(() =>
    store.secretSet('api-key', 'atm_do_not_write', 'default')
  ).toThrow('Windows Credential Manager');
  expect(existsSync(credentialsFile())).toBe(false);
  kvSet(credentialsFile(), 'profile/default/api-key', 'atm_stale');
  failures.add('get');
  failures.add('exists');
  failures.add('delete');
  expect(() => store.secretGet('api-key', 'default')).toThrow(
    'Windows Credential Manager'
  );
  expect(() => store.secretExists('api-key', 'default')).toThrow(
    'Windows Credential Manager'
  );
  expect(() => store.secretDelete('api-key', 'default')).toThrow(
    'Windows Credential Manager'
  );
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe('atm_stale');
});
