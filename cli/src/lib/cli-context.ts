export type CliContext = {
  debug: boolean;
  json: boolean;
  agent: boolean;
  noColor?: boolean;
  profile?: string;
  connectTimeoutMs?: number;
  readTimeoutMs?: number;
};

let bootstrapContext: CliContext = { debug: false, json: false, agent: false };

export function isJsonOutput(context: CliContext): boolean {
  return context.json || context.agent;
}

export function setBootstrapCliContext(context: CliContext): void {
  bootstrapContext = context;
}

export function getBootstrapCliContextState(): CliContext {
  return bootstrapContext;
}
