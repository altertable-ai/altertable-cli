export type TreeNode = {
  label: string;
  children?: readonly TreeNode[];
  emptyLabel?: string;
};

export type TreeView = {
  title?: string;
  children: readonly TreeNode[];
  emptyLabel?: string;
};

const TREE_BRANCH = "├── ";
const TREE_LAST_BRANCH = "└── ";
const TREE_CHILD_PREFIX = "│   ";
const TREE_LAST_CHILD_PREFIX = "    ";

function renderTreeNodes(nodes: readonly TreeNode[], prefix: string): string[] {
  return nodes.flatMap((node, index) => {
    const isLast = index === nodes.length - 1;
    const branch = isLast ? TREE_LAST_BRANCH : TREE_BRANCH;
    const childPrefix = `${prefix}${isLast ? TREE_LAST_CHILD_PREFIX : TREE_CHILD_PREFIX}`;
    const children = node.children ?? [];
    const lines = [`${prefix}${branch}${node.label}`];

    if (children.length > 0) {
      lines.push(...renderTreeNodes(children, childPrefix));
    } else if (node.emptyLabel) {
      lines.push(`${childPrefix}${TREE_LAST_BRANCH}${node.emptyLabel}`);
    }

    return lines;
  });
}

export function renderTree(view: TreeView): string[] {
  const lines = view.title ? [view.title] : [];

  if (view.children.length === 0) {
    lines.push(`${TREE_LAST_BRANCH}${view.emptyLabel ?? "<empty>"}`);
    return lines;
  }

  lines.push(...renderTreeNodes(view.children, ""));
  return lines;
}

export function renderTreeText(view: TreeView): string {
  return renderTree(view).join("\n");
}
