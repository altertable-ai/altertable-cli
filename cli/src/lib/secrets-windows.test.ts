import { afterEach, beforeEach, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { credentialsFile, kvGet, kvSet } from '@/lib/config.ts';
import { ensureProfileId, getProfileId } from '@/lib/profile-store.ts';
import { createSecretStore } from '@/lib/secrets.ts';

const savedEnv = {
  ALTERTABLE_CONFIG_HOME: process.env.ALTERTABLE_CONFIG_HOME,
  ALTERTABLE_SECRET_BACKEND: process.env.ALTERTABLE_SECRET_BACKEND,
};
let directory = '';
beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'altertable-wincred-test-'));
  process.env.ALTERTABLE_CONFIG_HOME = directory;
  delete process.env.ALTERTABLE_SECRET_BACKEND;
});
afterEach(() => {
  rmSync(directory, { recursive: true, force: true });
  for (const [name, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

type ProcessResult = {
  status: number | null;
  stdout: string;
  stderr?: string;
  error?: Error;
};

// Stands in for powershell.exe: it speaks the wrapper's stdin/stdout protocol
// over an in-memory vault. Pass another fake's values to model a second CLI
// process sharing the same vault.
function fakeWindowsVault(values = new Map<string, string>()) {
  const calls: { command: string; args: string[]; input: string }[] = [];
  const failures = new Map<string, ProcessResult>();
  const store = createSecretStore({
    platform: 'win32',
    spawnSync(command, args, options) {
      if (typeof options.input !== 'string')
        throw new Error('Expected JSON stdin');
      calls.push({ command, args, input: options.input });
      const request = JSON.parse(options.input) as {
        action: string;
        account?: string;
        value?: string;
      };
      const failure = failures.get(request.action);
      if (failure) return failure;
      if (request.action === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify({ credentials: Object.fromEntries(values) }),
        };
      }
      if (request.action === 'set')
        values.set(request.account!, request.value!);
      if (request.action === 'delete') values.delete(request.account!);
      return { status: 0, stdout: '{}' };
    },
  });
  return { store, values, calls, failures };
}

function actions(calls: { input: string }[]): string[] {
  return calls.map(
    call => (JSON.parse(call.input) as { action: string }).action
  );
}

function stableAccount(key: string, profileName: string): string {
  return `profile/${getProfileId(profileName)}/${key}`;
}

test('Windows defaults to Credential Manager without writing plaintext', () => {
  const { store, values, calls } = fakeWindowsVault();
  store.secretSet('api-key', 'atm_native_test', 'default', { fromArgv: true });

  expect(values.get(stableAccount('api-key', 'default'))).toBe(
    'atm_native_test'
  );
  expect(store.secretGet('api-key', 'default')).toBe('atm_native_test');
  expect(store.secretExists('api-key', 'default')).toBe(true);
  expect(store.secretStoreDisplay()).toBe('Windows Credential Manager');
  expect(existsSync(credentialsFile())).toBe(false);
  expect(calls.every(call => call.command === 'powershell.exe')).toBe(true);
  expect(calls.some(call => call.input.includes('atm_native_test'))).toBe(true);
  expect(
    calls.every(call => !call.args.join(' ').includes('atm_native_test'))
  ).toBe(true);

  store.secretDelete('api-key', 'default');
  expect(store.secretExists('api-key', 'default')).toBe(false);
});

test('Windows serves a command’s secret lookups from one vault read', () => {
  const vault = fakeWindowsVault();
  vault.values.set(
    `profile/${ensureProfileId('default')}/api-key`,
    'atm_native_test'
  );

  // A management command looks up the OAuth token (current and pre-ID
  // account names) before falling back to the API key.
  expect(vault.store.secretGet('oauth/access-token', 'default')).toBe('');
  expect(vault.store.secretGet('api-key', 'default')).toBe('atm_native_test');
  expect(vault.store.secretExists('lakehouse/password', 'default')).toBe(false);

  expect(vault.calls.map(call => JSON.parse(call.input).action)).toEqual([
    'list',
  ]);
});

test('Windows reuses one vault read until another CLI process writes', () => {
  const first = fakeWindowsVault();
  const second = fakeWindowsVault(first.values);

  first.store.secretSet('api-key', 'atm_one', 'default');
  expect(first.store.secretGet('api-key', 'default')).toBe('atm_one');
  first.store.secretSet('api-key', 'atm_two', 'default');
  expect(first.store.secretGet('api-key', 'default')).toBe('atm_two');
  expect(actions(first.calls)).toEqual(['set', 'list', 'set']);

  second.store.secretSet('api-key', 'atm_three', 'default');
  expect(first.store.secretGet('api-key', 'default')).toBe('atm_three');
  expect(first.store.secretGet('api-key', 'default')).toBe('atm_three');
  expect(actions(first.calls)).toEqual(['set', 'list', 'set', 'list']);
});

test('Windows deletes only secrets the vault holds', () => {
  const { store, calls } = fakeWindowsVault();
  store.secretSet('api-key', 'atm_native_test', 'default');

  store.secretDelete('api-key', 'default');
  store.secretDelete('lakehouse/password', 'default');

  // Each key is looked up under its stable and pre-ID account names.
  expect(actions(calls)).toEqual(['set', 'list', 'delete']);
  expect(store.secretExists('api-key', 'default')).toBe(false);
});

test('Windows migrates existing file secrets only after native storage succeeds', () => {
  const { store, values, failures } = fakeWindowsVault();
  kvSet(credentialsFile(), 'profile/default/api-key', 'atm_legacy_test');
  failures.set('set', { status: 1, stdout: '' });
  expect(() => store.secretGet('api-key', 'default')).toThrow(
    'Windows Credential Manager could not store credentials.'
  );
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe(
    'atm_legacy_test'
  );

  failures.clear();
  store.migrateProfileSecrets('default', ['api-key']);
  expect(values.get(stableAccount('api-key', 'default'))).toBe(
    'atm_legacy_test'
  );
  expect(values.has('profile/default/api-key')).toBe(false);
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe('');
});

test('Windows native failures never fall back to a plaintext write or stale file value', () => {
  const { store, values, failures } = fakeWindowsVault();
  failures.set('set', { status: 1, stdout: '' });
  expect(() =>
    store.secretSet('api-key', 'atm_do_not_write', 'default')
  ).toThrow('Windows Credential Manager');
  expect(existsSync(credentialsFile())).toBe(false);

  kvSet(credentialsFile(), 'profile/default/api-key', 'atm_stale');
  failures.set('list', { status: 1, stdout: '' });
  failures.set('delete', { status: 1, stdout: '' });
  expect(() => store.secretGet('api-key', 'default')).toThrow(
    'Windows Credential Manager could not read credentials.'
  );
  expect(() => store.secretExists('api-key', 'default')).toThrow(
    'Windows Credential Manager could not read credentials.'
  );
  expect(() => store.secretDelete('api-key', 'default')).toThrow(
    'Windows Credential Manager could not read credentials.'
  );

  failures.delete('list');
  values.set('profile/default/api-key', 'atm_native');
  expect(() => store.secretDelete('api-key', 'default')).toThrow(
    'Windows Credential Manager could not delete credentials.'
  );
  expect(values.get('profile/default/api-key')).toBe('atm_native');
  expect(kvGet(credentialsFile(), 'profile/default/api-key')).toBe('atm_stale');
});

test('Windows rejects secrets larger than Credential Manager stores', () => {
  const { store, calls } = fakeWindowsVault();
  const oversized = 'x'.repeat(2561);

  expect(() =>
    store.secretSet('oauth/access-token', oversized, 'default')
  ).toThrow(
    'This secret is 2561 bytes; Windows Credential Manager stores at most 2560.'
  );
  expect(calls).toHaveLength(0);
  expect(existsSync(credentialsFile())).toBe(false);

  store.secretSet('oauth/access-token', 'x'.repeat(2560), 'default');
  expect(store.secretGet('oauth/access-token', 'default')).toHaveLength(2560);
});

test.each([
  [
    {
      status: null,
      stdout: '',
      error: Object.assign(new Error('spawn'), { code: 'ENOENT' }),
    },
    'requires Windows PowerShell (powershell.exe), which was not found.',
  ],
  [
    {
      status: null,
      stdout: '',
      error: Object.assign(new Error('spawn'), { code: 'ETIMEDOUT' }),
    },
    'did not read credentials within 15 seconds.',
  ],
  [
    { status: 2, stdout: '' },
    'PowerShell is restricted by a language mode policy',
  ],
  [
    { status: 3, stdout: '', stderr: '1312' },
    'this logon session has no credential vault',
  ],
  [{ status: 3, stdout: '', stderr: '5' }, '(Windows error 5).'],
] satisfies [ProcessResult, string][])(
  'Windows explains native failures and how to opt out: %#',
  (failure, reason) => {
    const { store, failures } = fakeWindowsVault();
    failures.set('list', failure);

    let message = '';
    try {
      store.secretGet('api-key', 'default');
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain(reason);
    expect(message).toContain('Set ALTERTABLE_SECRET_BACKEND=file');
  }
);

test('Windows backend can be required explicitly, and opted out of', () => {
  process.env.ALTERTABLE_SECRET_BACKEND = 'windows';
  expect(fakeWindowsVault().store.secretStoreDisplay()).toBe(
    'Windows Credential Manager'
  );
  const linux = createSecretStore({
    platform: 'linux',
    spawnSync: () => ({ status: 1, stdout: '' }),
  });
  expect(() => linux.secretStoreDisplay()).toThrow(
    'ALTERTABLE_SECRET_BACKEND=windows requires Windows Credential Manager.'
  );

  process.env.ALTERTABLE_SECRET_BACKEND = 'file';
  const { store, calls } = fakeWindowsVault();
  store.secretSet('api-key', 'atm_file_test', 'default');
  expect(kvGet(credentialsFile(), stableAccount('api-key', 'default'))).toBe(
    'atm_file_test'
  );
  expect(calls).toHaveLength(0);
});
