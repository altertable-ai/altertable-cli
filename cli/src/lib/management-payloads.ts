export function buildCreateCatalogBody(options: { name: string }): string {
  return JSON.stringify({ name: options.name, engine: "altertable" });
}
