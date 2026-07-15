import type { DisplayText } from "@/ui/document.ts";

export type TreeNode = {
  label: DisplayText;
  children?: readonly TreeNode[];
  emptyLabel?: DisplayText;
};

export type TreeView = {
  title?: DisplayText;
  children: readonly TreeNode[];
  emptyLabel?: DisplayText;
};
