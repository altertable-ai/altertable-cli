import type { ShellExportView } from "@/ui/shell/model.ts";

export function shellExportLine(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

export function renderShellExportView(view: ShellExportView): string {
  return [
    ...(view.comments ?? []).map((comment) => `# ${comment}`),
    ...Object.entries(view.env).map(([name, value]) => shellExportLine(name, value)),
  ].join("\n");
}
