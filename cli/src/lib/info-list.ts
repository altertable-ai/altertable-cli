import { formatTerminalLabelValue } from "@/ui/terminal/styles.ts";

export type InfoListItem = {
  label: string;
  value: string;
  linkifyUrls?: boolean;
};

export type InfoListOptions = {
  indent?: string;
  labelWidth?: number;
};

function normalizeInfoListLabel(label: string): string {
  return label.endsWith(":") ? label : `${label}:`;
}

export function formatInfoList(
  items: readonly InfoListItem[],
  options: InfoListOptions = {},
): string {
  const normalizedItems = items.map((item) => ({
    ...item,
    label: normalizeInfoListLabel(item.label),
  }));
  const labelWidth =
    options.labelWidth ?? Math.max(...normalizedItems.map((item) => item.label.length), 0);

  return normalizedItems
    .map((item) =>
      formatTerminalLabelValue(item.label, item.value, {
        indent: options.indent,
        labelWidth,
        linkifyUrls: item.linkifyUrls,
      }),
    )
    .join("\n");
}
