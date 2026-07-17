// The bundled asset lives outside src/, so the @ alias cannot resolve it.
// oxlint-disable-next-line no-relative-import-paths/no-relative-import-paths
import openapiYaml from "../../openapi/openapi.yaml" with { type: "text" };
import { parse } from "yaml";

const OPENAPI_SOURCE_HEADER_PATTERN = /^# AUTO-GENERATED[^\n]*\n(?:# [^\n]*\n)*/;

export function stripOpenapiSourceHeader(yaml: string): string {
  if (!yaml.startsWith("# AUTO-GENERATED")) {
    return yaml;
  }
  return yaml.replace(OPENAPI_SOURCE_HEADER_PATTERN, "");
}

export function getOpenapiSpecYaml(): string {
  return stripOpenapiSourceHeader(openapiYaml);
}

export function getOpenapiSpecJson(): string {
  const document = parse(openapiYaml) as unknown;
  return JSON.stringify(document, null, 2);
}
