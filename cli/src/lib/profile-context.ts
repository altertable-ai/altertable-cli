import { getCliContext, setCliContext } from "@/context.ts";
import { ensureProfileExists } from "@/lib/profile.ts";

export function withProfileContextSync<T>(profileName: string | undefined, run: () => T): T {
  if (!profileName) {
    return run();
  }
  ensureProfileExists(profileName);
  const previous = getCliContext();
  setCliContext({ ...previous, profile: profileName });
  try {
    return run();
  } finally {
    setCliContext(previous);
  }
}
