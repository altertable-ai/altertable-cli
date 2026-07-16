import { createSecretStore, type SecretStore } from "@/lib/secrets.ts";

type FakeKeychain = {
  store: SecretStore;
  calls: string[][];
  failingWrites: Set<string>;
};

function argumentAfter(args: string[], flag: string): string {
  const index = args.indexOf(flag);
  return index >= 0 ? (args[index + 1] ?? "") : "";
}

export function createFakeKeychain(): FakeKeychain {
  const calls: string[][] = [];
  const values = new Map<string, string>();
  const failingWrites = new Set<string>();

  const store = createSecretStore({
    platform: "darwin",
    spawnSync(_command, args) {
      calls.push([...args]);
      if (args.includes("help")) return { status: 0, stdout: Buffer.from("") };

      const account = argumentAfter(args, "-a");
      if (args.includes("add-generic-password")) {
        if (failingWrites.has(account)) return { status: 1, stdout: Buffer.from("") };
        values.set(account, argumentAfter(args, "-w"));
        return { status: 0, stdout: Buffer.from("") };
      }
      if (args.includes("find-generic-password")) {
        const value = values.get(account);
        return value === undefined
          ? { status: 1, stdout: Buffer.from("") }
          : { status: 0, stdout: Buffer.from(value) };
      }
      if (args.includes("delete-generic-password")) {
        values.delete(account);
        return { status: 0, stdout: Buffer.from("") };
      }
      return { status: 1, stdout: Buffer.from("") };
    },
  });

  return { store, calls, failingWrites };
}
