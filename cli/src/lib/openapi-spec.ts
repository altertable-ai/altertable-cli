import openapiYaml from "../../openapi/openapi.yaml" with { type: "text" };

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
  const document = Bun.YAML.parse(openapiYaml) as unknown;
  return JSON.stringify(document, null, 2);
}

export type OpenapiSpecFormat = "json" | "yaml";

export function resolveOpenapiSpecFormat(
  jsonContext: boolean,
  stdoutIsTty: boolean,
  explicitFormat?: string,
): OpenapiSpecFormat {
  if (explicitFormat === "json" || explicitFormat === "yaml") {
    return explicitFormat;
  }
  if (jsonContext || !stdoutIsTty) {
    return "json";
  }
  return "yaml";
}
