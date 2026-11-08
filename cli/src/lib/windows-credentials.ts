import type { SpawnSyncOptions } from 'node:child_process';

import { CliError } from '@/lib/errors.ts';

type CredentialProcess = (
  command: string,
  args: string[],
  options: SpawnSyncOptions
) => { status: number | null; stdout: string | Buffer; error?: Error };

// Static code only: account names and secret values travel over stdin, never
// through PowerShell source, process arguments or a temporary script file.
const CREDENTIAL_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
try {
  Add-Type -TypeDefinition @'
using System;
using System.ComponentModel;
using System.Runtime.InteropServices;
public static class AltertableCredentialManager {
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
  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Read(string target, uint type, uint flags, out IntPtr credential);
  [DllImport("advapi32.dll", EntryPoint = "CredDeleteW", CharSet = CharSet.Unicode, SetLastError = true)]
  private static extern bool Delete(string target, uint type, uint flags);
  [DllImport("advapi32.dll")]
  private static extern void CredFree(IntPtr credential);

  private static bool Find(string account, out IntPtr pointer) {
    if (Read("altertable/" + account, 1, 0, out pointer)) return true;
    int error = Marshal.GetLastWin32Error();
    if (error == 1168) return false;
    throw new Win32Exception(error);
  }
  public static string Get(string account) {
    IntPtr pointer;
    if (!Find(account, out pointer)) return null;
    try {
      Credential credential = (Credential)Marshal.PtrToStructure(pointer, typeof(Credential));
      return credential.CredentialBlobSize == 0 ? "" : Marshal.PtrToStringUni(credential.CredentialBlob, checked((int)credential.CredentialBlobSize / 2));
    } finally { CredFree(pointer); }
  }
  public static bool Exists(string account) {
    IntPtr pointer;
    if (!Find(account, out pointer)) return false;
    CredFree(pointer);
    return true;
  }
  public static void Set(string account, string value) {
    IntPtr blob = Marshal.StringToCoTaskMemUni(value);
    try {
      Credential credential = new Credential();
      credential.Type = 1;
      credential.TargetName = "altertable/" + account;
      credential.UserName = "Altertable";
      credential.CredentialBlobSize = checked((uint)value.Length * 2);
      credential.CredentialBlob = blob;
      credential.Persist = 2;
      if (!Write(ref credential, 0)) throw new Win32Exception(Marshal.GetLastWin32Error());
    } finally { Marshal.ZeroFreeCoTaskMemUnicode(blob); }
  }
  public static void Remove(string account) {
    if (Delete("altertable/" + account, 1, 0)) return;
    int error = Marshal.GetLastWin32Error();
    if (error != 1168) throw new Win32Exception(error);
  }
}
'@
  $request = [Console]::In.ReadToEnd() | ConvertFrom-Json
  $result = @{}
  switch ($request.action) {
    'get' { $result.value = [AltertableCredentialManager]::Get($request.account) }
    'exists' { $result.exists = [AltertableCredentialManager]::Exists($request.account) }
    'set' { [AltertableCredentialManager]::Set($request.account, $request.value) }
    'delete' { [AltertableCredentialManager]::Remove($request.account) }
    default { throw 'Unknown credential operation' }
  }
  ConvertTo-Json -InputObject $result -Compress
} catch {
  [Console]::Error.WriteLine('Windows Credential Manager operation failed.')
  exit 1
}
`;

export function createWindowsCredentialStore(run: CredentialProcess) {
  function invoke(action: string, account: string, value?: string) {
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
        input: JSON.stringify({ action, account, value }),
        encoding: 'utf8',
        windowsHide: true,
        timeout: 15_000,
        maxBuffer: 1024 * 1024,
      }
    );
    if (result.error || result.status !== 0) {
      throw new CliError(
        `Failed to ${action} secret in Windows Credential Manager.`
      );
    }
    try {
      return JSON.parse(String(result.stdout)) as Record<string, unknown>;
    } catch {
      throw new CliError('Invalid response from Windows Credential Manager.');
    }
  }

  return {
    get(account: string): string | null {
      const result = invoke('get', account);
      if (typeof result.value === 'string' || result.value === null)
        return result.value;
      throw new CliError(
        'Invalid secret response from Windows Credential Manager.'
      );
    },
    exists(account: string): boolean {
      const result = invoke('exists', account);
      if (typeof result.exists === 'boolean') return result.exists;
      throw new CliError(
        'Invalid lookup response from Windows Credential Manager.'
      );
    },
    set(account: string, value: string): void {
      invoke('set', account, value);
    },
    delete(account: string): void {
      invoke('delete', account);
    },
  };
}
