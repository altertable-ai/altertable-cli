export type DataAppConfig = {
  title: string;
  scope: { organization: string; environment: string };
  appearance: unknown;
};

export function dataAppTitle(config: Pick<DataAppConfig, "title" | "scope">): string {
  return `${config.title} • ${config.scope.organization}/${config.scope.environment} • Altertable app`;
}
