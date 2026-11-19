export type DataAppPayload = {
  starter: Record<string, string>;
  filePreview: Record<string, string>;
};

export function createAppFiles(
  payload: DataAppPayload,
  identity: {
    name: string;
    title: string;
    scope: { organization: string; environment: string };
  }
): Record<string, string> {
  const files = { ...payload.starter };
  const packageJson = JSON.parse(files['package.json']!);
  packageJson.name = identity.name;
  files['package.json'] = `${JSON.stringify(packageJson, null, 2)}\n`;
  // Substitute whole string literals in the controlled template, never executable source.
  const literals: Record<string, string> = {
    APP_TITLE: identity.title,
    APP_ORGANIZATION: identity.scope.organization,
    APP_ENVIRONMENT: identity.scope.environment,
  };
  files['app.ts'] = files['app.ts']!.replace(
    /'__(APP_TITLE|APP_ORGANIZATION|APP_ENVIRONMENT)__'/g,
    (_match, key: string) => appLiteral(literals[key]!)
  );
  // Bun's text lock is JSONC. Only its root workspace name changes during scaffolding.
  const oldName = JSON.stringify(
    JSON.parse(payload.starter['package.json']!).name
  );
  files['bun.lock'] = files['bun.lock']!.replace(
    `"name": ${oldName}`,
    `"name": ${JSON.stringify(identity.name)}`
  );
  return files;
}

function appLiteral(value: string): string {
  return (
    "'" +
    JSON.stringify(value)
      .slice(1, -1)
      .replaceAll('\\"', '"')
      .replaceAll("'", "\\'") +
    "'"
  );
}
