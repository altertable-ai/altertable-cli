import { describe, expect, test } from "bun:test";
import { pluralize, pluralizeLabel } from "@/lib/pluralize.ts";

describe("pluralize", () => {
  test("returns singular for count of 1", () => {
    expect(pluralize(1, "row")).toBe("row");
    expect(pluralize(1, "minute")).toBe("minute");
  });

  test("returns plural for other counts", () => {
    expect(pluralize(0, "row")).toBe("rows");
    expect(pluralize(2, "minute")).toBe("minutes");
    expect(pluralize(5, "day")).toBe("days");
  });

  test("accepts an explicit plural form", () => {
    expect(pluralize(2, "child", "children")).toBe("children");
  });
});

describe("pluralizeLabel", () => {
  test("combines count and pluralized noun", () => {
    expect(pluralizeLabel(1, "row")).toBe("1 row");
    expect(pluralizeLabel(10, "row")).toBe("10 rows");
  });
});
