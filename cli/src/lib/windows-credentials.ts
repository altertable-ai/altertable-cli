import type { SpawnSyncOptions } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import { CliError } from '@/lib/errors.ts';

type CredentialProcess = (
  command: string,
  args: string[],
  options: SpawnSyncOptions
) => {
  status: number | null;
  stdout: string | Buffer;
  stderr?: string | Buffer;
  error?: Error;
};

type CredentialAction = 'list' | 'set' | 'delete';

// A marker that changes whenever any CLI process writes the vault, so a
// snapshot can be reused until another process changes credentials.
export type CredentialRevision = {
  read(): string;
  advance(): string;
};

// The marker holds a random token, not a secret; a torn read only causes one
// more vault list.
export function fileCredentialRevision(
  markerPath: () => string
): CredentialRevision {
  return {
    read() {
      try {
        return readFileSync(markerPath(), 'utf8');
      } catch {
        return '';
      }
    },
    advance() {
      const token = randomUUID();
      mkdirSync(dirname(markerPath()), { recursive: true });
      writeFileSync(markerPath(), token);
      return token;
    },
  };
}

// CRED_MAX_CREDENTIAL_BLOB_SIZE: Credential Manager rejects larger secrets.
const MAX_SECRET_BYTES = 5 * 512;

const EXIT_RESTRICTED_LANGUAGE = 2;
const EXIT_WIN32_ERROR = 3;
const ERROR_NO_SUCH_LOGON_SESSION = 1312;

const FILE_BACKEND_HINT =
  'Set ALTERTABLE_SECRET_BACKEND=file to store credentials in the configuration directory instead.';

// Static code only: account names and secret values travel over stdin, never
// through PowerShell source, process arguments or a temporary script file.
// Failures report only an exit code and a Win32 error number, because
// exception messages can echo the request that carries the secret.
const CREDENTIAL_SCRIPT = String.raw`
if ($ExecutionContext.SessionState.LanguageMode -ne 'FullLanguage') { exit ${EXIT_RESTRICTED_LANGUAGE} }
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -TypeDefinition @'
using System;
using System.Collections;
using System.ComponentModel;
using System.Runtime.InteropServices;
using System.Text;
public static class AltertableCredentialManager {
  private const string Prefix = "altertable/";
  private const uint GenericType = 1;
  private const uint PersistLocalMachine = 2;
  private const int ErrorNotFound = 1168;
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  private struct Credential {
    public uint Flags, Type;
    public string TargetName, Comment;
    public long LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist, AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias, UserName;
  }
  [DllImport("advapi32.dll", EntryPoint = "CredWriteW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Write(ref Credential credential, uint flags);
  [DllImport("advapi32.dll", EntryPoint = "CredEnumerateW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Enumerate(string filter, uint flags, out uint count, out IntPtr credentials);
  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Delete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")]
  private static extern void CredFree(IntPtr buffer);

  public static Hashtable List() {
    Hashtable values = new Hashtable();
    uint count;
    IntPtr list;
    if (!Enumerate(Prefix + "*", 0, out count, out list)) {
      int error = Marshal.GetLastWin32Error();
      if (error == ErrorNotFound) return values;
      throw new Win32Exception(error);
    }
    try {
      for (int index = 0; index < count; index++) {
        IntPtr pointer = Marshal.ReadIntPtr(list, index * IntPtr.Size);
        Credential credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
        if (credential.Type != GenericType) continue;
        byte[] blob = new byte[credential.CredentialBlobSize];
        if (blob.Length > 0) Marshal.Copy(credential.CredentialBlob, blob, 0, blob.Length);
        values[credential.TargetName.Substring(Prefix.Length)] = Encoding.UTF8.GetString(blob);
        Array.Clear(blob, 0, blob.Length);
      }
    } finally { CredFree(list); }
    return values;
  }
  public static void Set(string account, string value) {
    byte[] bytes = Encoding.UTF8.GetBytes(value);
    IntPtr blob = Marshal.AllocCoTaskMem(Math.Max(bytes.Length, 1));
    try {
      Marshal.Copy(bytes, 0, blob, bytes.Length);
      Credential credential = new Credential();
      credential.Type = GenericType;
      credential.TargetName = Prefix + account;
      credential.UserName = "Altertable";
      credential.CredentialBlobSize = (uint)bytes.Length;
      credential.CredentialBlob = blob;
      credential.Persist = PersistLocalMachine;
      if (!Write(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally {
      Marshal.Copy(new byte[bytes.Length], 0, blob, bytes.Length);
      Marshal.FreeCoTaskMem(blob);
      Array.Clear(bytes, 0, bytes.Length);
    }
  }
  public static void Remove(string account) {
    if (Delete(Prefix + account, GenericType, 0)) return;
    int error = Marshal.GetLastWin32Error();
    if (error != ErrorNotFound) throw new Win32Exception(error);
  }
}
'@
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $result = @{}
  switch ($request.action) {
    'list' { $result.credentials = [AltertableCredentialManager]::List() }
    'set' { [AltertableCredentialManager]::Set($request.account, $request.value) }
    'delete' { [AltertableCredentialManager]::Remove($request.account) }
    default { exit 1 }
  }
  ConvertTo-Json -InputObject $result -Compress
} catch {
  for ($exception = $_.Exception; $exception; $exception = $exception.InnerException) {
    if ($exception -is [System.ComponentModel.Win32Exception]) {
      [Console]::Error.Write($exception.NativeErrorCode)
      exit ${EXIT_WIN32_ERROR}
    }
  }
  exit 1
}
`;

const ACTION_VERBS: Record<CredentialAction, string> = {
  list: 'read',
  set: 'store',
  delete: 'delete',
};

// Each PowerShell start compiles the native wrapper, which costs hundreds of
// milliseconds and blocks the event loop. Reads therefore share one snapshot
// of every Altertable credential, reused until the revision changes; auth is
// resolved per request, so long-running commands depend on this.
export function createWindowsCredentialStore(
  run: CredentialProcess,
  revision: CredentialRevision
) {
  let snapshot: { values: Map<string, string>; revision: string } | undefined;

  function invoke(
    action: CredentialAction,
    request: { account?: string; value?: string } = {}
  ): Record<string, unknown> {
    const result = run(
      'powershell.exe',
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        CREDENTIAL_SCRIPT,
      ],
      {
        input: JSON.stringify({ action, ...request }),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      }
    );
    if (result.error || result.status !== 0) {
      throw new CliError(
        `${failureReason(ACTION_VERBS[action], result)} ${FILE_BACKEND_HINT}`
      );
    }
    try {
      return JSON.parse(String(result.stdout)) as Record<string, unknown>;
    } catch {
      throw new CliError('Invalid response from Windows Credential Manager.');
    }
  }

  function storedValues(): Map<string, string> {
    // Read the revision before listing: a write racing the list only causes
    // one more list later, never a stale snapshot.
    const current = revision.read();
    if (snapshot?.revision === current) return snapshot.values;
    const { credentials } = invoke('list');
    if (typeof credentials !== 'object' || credentials === null) {
      throw new CliError(
        'Invalid credential list from Windows Credential Manager.'
      );
    }
    const values = new Map<string, string>();
    for (const [account, value] of Object.entries(credentials)) {
      if (typeof value === 'string') values.set(account, value);
    }
    snapshot = { values, revision: current };
    return values;
  }

  function write(
    action: 'set' | 'delete',
    account: string,
    value?: string
  ): void {
    invoke(action, { account, value });
    // Carry the snapshot forward only when no other process wrote since it
    // was listed; otherwise the next read lists the vault again.
    const current =
      snapshot?.revision === revision.read() ? snapshot : undefined;
    const next = revision.advance();
    if (!current) {
      snapshot = undefined;
      return;
    }
    if (value === undefined) current.values.delete(account);
    else current.values.set(account, value);
    snapshot = { values: current.values, revision: next };
  }

  return {
    get(account: string): string | null {
      return storedValues().get(account) ?? null;
    },
    exists(account: string): boolean {
      return storedValues().has(account);
    },
    set(account: string, value: string): void {
      const size = Buffer.byteLength(value, 'utf8');
      if (size > MAX_SECRET_BYTES) {
        throw new CliError(
          `This secret is ${size} bytes; Windows Credential Manager stores at most ${MAX_SECRET_BYTES}. ${FILE_BACKEND_HINT}`
        );
      }
      write('set', account, value);
    },
    delete(account: string): void {
      if (storedValues().has(account)) write('delete', account);
    },
  };
}

function failureReason(
  verb: string,
  result: ReturnType<CredentialProcess>
): string {
  const code = (result.error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT') {
    return 'Windows Credential Manager requires Windows PowerShell (powershell.exe), which was not found.';
  }
  if (code === 'ETIMEDOUT') {
    return `Windows Credential Manager did not ${verb} credentials within 15 seconds.`;
  }
  if (result.status === EXIT_RESTRICTED_LANGUAGE) {
    return 'PowerShell is restricted by a language mode policy, which blocks Windows Credential Manager access.';
  }
  const win32Error =
    result.status === EXIT_WIN32_ERROR
      ? Number.parseInt(String(result.stderr ?? ''), 10)
      : Number.NaN;
  if (win32Error === ERROR_NO_SUCH_LOGON_SESSION) {
    return `Windows Credential Manager could not ${verb} credentials: this logon session has no credential vault (common over SSH and in services).`;
  }
  if (Number.isInteger(win32Error)) {
    return `Windows Credential Manager could not ${verb} credentials (Windows error ${win32Error}).`;
  }
  return `Windows Credential Manager could not ${verb} credentials.`;
}
