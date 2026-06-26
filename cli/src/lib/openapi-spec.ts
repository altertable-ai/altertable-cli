import openapiYaml from "../../openapi/openapi.yaml" with { type: "text" };

export function getOpenapiSpecYaml(): string {
  return openapiYaml;
}

export function getOpenapiSpecJson(): string {
  const document = Bun.YAML.parse(openapiYaml) as unknown;
  return JSON.stringify(document, null, 2);
}
