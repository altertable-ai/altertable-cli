import type { ConfigurePrompts } from "@/lib/configure-prompts.ts";
import type { OutputSink } from "@/lib/runtime.ts";

export type ConfigureWizardScope = "both" | "management" | "lakehouse";

export type ConfigureWizardOptions = {
  scope?: ConfigureWizardScope;
  profile?: string;
  verify?: boolean;
  noVerify?: boolean;
  allowInsecureHttp?: boolean;
  prompts?: ConfigurePrompts;
  sink?: OutputSink;
};
