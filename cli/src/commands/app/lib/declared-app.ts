import { extractDataAppManifest } from "@altertable/data-app-manifest";
import { ConfigurationError } from "@/lib/errors.ts";
import { isRecord } from "@/lib/object.ts";

export type DeclaredAppScope = { organization: string; environment: string };

/** Read the authored scope without executing application code. */
export function readDeclaredAppScope(source: string): DeclaredAppScope {
  const { manifest, diagnostics } = extractDataAppManifest(source);
  if (!manifest) {
    const details = diagnostics
      .slice(0, 3)
      .map(({ message, start }) => `${start.line}:${start.column}: ${message}`)
      .join("\n");
    throw new ConfigurationError(`Could not extract the data app manifest.\n${details}`);
  }
  const scope = manifest.scope;
  if (
    !isRecord(scope) ||
    typeof scope.organization !== "string" ||
    !scope.organization.trim() ||
    typeof scope.environment !== "string" ||
    !scope.environment.trim()
  ) {
    throw new ConfigurationError(
      "The data app file must declare scope.organization and scope.environment as string literals.",
    );
  }
  return { organization: scope.organization, environment: scope.environment };
}
