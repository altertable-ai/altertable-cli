import { describe, expect, test } from "bun:test";

import { renderTree } from "@/ui/renderers/terminal.ts";

describe("tree layout", () => {
  test("renders nested tree branches", () => {
    expect(
      renderTree({
        title: "Catalog",
        children: [
          {
            label: "main",
            children: [{ label: "users" }, { label: "events", children: [{ label: "id" }] }],
          },
          { label: "scratch" },
        ],
      }),
    ).toEqual([
      "Catalog",
      "├── main",
      "│   ├── users",
      "│   └── events",
      "│       └── id",
      "└── scratch",
    ]);
  });

  test("renders empty root and empty children labels", () => {
    expect(
      renderTree({
        children: [{ label: "main", emptyLabel: "<no table>" }],
        emptyLabel: "<no schema>",
      }),
    ).toEqual(["└── main", "    └── <no table>"]);

    expect(renderTree({ children: [], emptyLabel: "<no schema>" })).toEqual(["└── <no schema>"]);
  });
});
