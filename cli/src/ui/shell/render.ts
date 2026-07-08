import type { ShellExportView } from "@/ui/shell/model.ts";

export function shellExportLine(name: string, value: string): string {
  return `export ${name}=${JSON.stringify(value)}`;
}

export function renderShellExportView(view: ShellExportView): string {
  return view.lines.join("\n");
}
