import { expect, test } from "bun:test";
import {
  dimensionFilter,
  dimensionPredicate,
  parseDimensionSelection,
  parseDimensionOptions,
  type DimensionSelection,
} from "../src/core/dimension.ts";
import { resolveViewInput } from "../src/react/view.ts";

const interfaceFilter = dimensionFilter<string>({
  key: "interface",
  label: "Interface",
  valueType: "string",
  selection: "multiple",
  options: [
    { value: "HTTP", label: "HTTP" },
    { value: "null", label: "Literal null" },
  ],
  allowMissing: true,
});

test("dimension URLs distinguish All, literal null, and missing", () => {
  const all = { kind: "all" } as const;
  const selected = {
    kind: "include" as const,
    members: [{ kind: "value" as const, value: "null" }, { kind: "missing" as const }],
  };
  expect(interfaceFilter.write(all).interface).toBeNull();
  const params = new URLSearchParams();
  params.set("interface", interfaceFilter.write(selected).interface!);
  expect(interfaceFilter.read(params)).toEqual(selected);
  expect(interfaceFilter.read(new URLSearchParams())).toEqual(all);
  expect(dimensionPredicate("variant", selected, ["variant"])).toBe(
    "(variant IN ('null') OR variant IS NULL)",
  );
  expect(dimensionPredicate("variant", all, ["variant"])).toBe("");
});

test("filter input preserves selected members and rejects forged values", () => {
  const selected = {
    kind: "include" as const,
    members: [{ kind: "value" as const, value: "HTTP" }],
  };
  const definition = {
    input: (values: { interface: DimensionSelection<string> }) => ({ interface: values.interface }),
    filters: { interface: interfaceFilter },
  };
  expect(
    resolveViewInput<
      {},
      { interface: typeof interfaceFilter },
      { interface: DimensionSelection<string> }
    >(definition, { interface: selected }),
  ).toEqual({ interface: selected });
  expect(() =>
    resolveViewInput<
      {},
      { interface: typeof interfaceFilter },
      { interface: DimensionSelection<string> }
    >(
      { ...definition, input: () => ({ interface: { kind: "all" as const } }) },
      { interface: selected },
    ),
  ).toThrow("preserve");
  expect(() =>
    parseDimensionSelection({ kind: "include", members: [] }, interfaceFilter),
  ).toThrow();
  expect(() =>
    parseDimensionSelection(
      { kind: "include", members: [{ kind: "value", value: "unlisted" }] },
      interfaceFilter,
    ),
  ).toThrow();
  expect(interfaceFilter.read(new URLSearchParams("interface=bogus"))).toEqual({ kind: "all" });
  expect(() =>
    dimensionPredicate("variant; DROP TABLE users", selected, ["variant"] as string[]),
  ).toThrow();
});

test("SQL literals escape quotes even for a validated dimension value", () => {
  expect(
    dimensionPredicate(
      "variant",
      {
        kind: "include",
        members: [{ kind: "value", value: "O'Brien" }],
      },
      ["variant"],
    ),
  ).toBe("(variant IN ('O''Brien'))");
});

test("facets accept bounded typed options and keep selected values valid when absent", () => {
  const facet = dimensionFilter<string>({
    key: "category",
    label: "Category",
    valueType: "string",
    selection: "multiple",
    facet: { operation: "category-facet", input: (values) => ({ period: values.period }) },
  });
  expect(parseDimensionOptions([{ value: "A", label: "Alpha", count: 0 }], facet)).toEqual([
    { value: "A", label: "Alpha", count: 0 },
  ]);
  expect(
    parseDimensionSelection({ kind: "include", members: [{ kind: "value", value: "A" }] }, facet),
  ).toEqual({ kind: "include", members: [{ kind: "value", value: "A" }] });
  expect(() =>
    parseDimensionOptions(
      [
        { value: "A", label: "Alpha" },
        { value: "A", label: "Duplicate" },
      ],
      facet,
    ),
  ).toThrow("Duplicate");
  expect(() => parseDimensionOptions([{ value: "A", label: "Alpha", count: -1 }], facet)).toThrow(
    "Invalid",
  );
  expect(() =>
    parseDimensionSelection(
      { kind: "include", members: [{ kind: "value", value: "x".repeat(101) }] },
      facet,
    ),
  ).toThrow();
});

test("dimension resets to All and enforces selection limits", () => {
  const filter = dimensionFilter<string>({
    key: "region",
    label: "Region",
    valueType: "string",
    selection: "multiple",
    options: [{ value: "eu", label: "Europe" }],
    maxSelected: 1,
  });
  expect(filter.read(new URLSearchParams())).toEqual({ kind: "all" });
  expect(filter.valid({ kind: "include", members: [{ kind: "missing" }] })).toBe(false);
  expect(filter.valid({ kind: "include", members: [{ kind: "value", value: "eu" }] })).toBe(true);
});
