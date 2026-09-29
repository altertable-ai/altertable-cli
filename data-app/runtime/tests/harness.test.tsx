import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { defineDateRangeContract, defineQueryNames } from "../src/contract.ts";
import { defineDataContent } from "../src/view.tsx";
import { createDataContext } from "../src/ui/data-context.ts";
import { dateRangeVariable, defineAppVariables, textVariable } from "../src/ui/variables.ts";
import { ContentSkeleton } from "../src/ui/ContentSkeleton.tsx";
import { CardViewTabs } from "../src/ui/CardViewTabs.tsx";

const calendar = defineDateRangeContract({
  minDate: "2026-01-01",
  maxDate: "2026-03-31",
  maxRangeDays: 31,
  timeZone: "UTC",
});

test("date requests derive a comparison and reject forged or unavailable ranges", () => {
  const variable = dateRangeVariable({
    key: "period",
    contract: calendar,
    comparison: true,
    defaultValue: { kind: "dates", start: "2026-03-01", end: "2026-03-03" },
  });
  const request = variable.input({ ...variable.defaultValue, comparison: "previous" });
  expect(request.comparison).toEqual({ start: "2026-02-26", end: "2026-02-28" });
  expect(calendar.parseRequest(JSON.parse(JSON.stringify(request)))).toEqual(request);
  expect(variable.describeInput(request)).toBe("Mar 1–3, 2026 UTC");
  expect(() => calendar.parseRequest({ ...request, comparison: request.range })).toThrow(
    "preceding",
  );
  expect(() => calendar.request({ start: "2026-01-01", end: "2026-01-03" }, true)).toThrow(
    "coverage",
  );
  expect(() =>
    calendar.parseRequest({ range: { start: "2026-02-30", end: "2026-03-03" } }),
  ).toThrow();
});

test("variables cannot overwrite navigation, inspection, or presentation routes", () => {
  for (const key of ["view", "about", "tab", "present", "step"]) {
    expect(() => defineAppVariables({ search: textVariable({ key }) })).toThrow("reserved");
  }
  expect(() =>
    defineAppVariables({ first: textVariable({ key: "q" }), second: textVariable({ key: "q" }) }),
  ).toThrow("duplicate");
});

test("context validates glossary queries and binds card evidence to its registries", () => {
  const define = createDataContext(defineQueryNames({ orders: "orders" }));
  const context = define({
    description: "Orders",
    glossary: {
      completed: { term: "Completed", definition: "Completed orders", queryNames: ["orders"] },
    },
  });
  expect(
    context.evidence({ id: "total", glossaryIds: ["completed"], queryNames: ["orders"] })
      .glossaryIds,
  ).toEqual(["completed"]);
  expect(() =>
    define({
      description: "Orders",
      glossary: {
        // @ts-expect-error Unknown glossary queries fail at authoring time and at runtime.
        bad: { term: "Bad", definition: "Bad", queryNames: ["unknown"] },
      },
    }),
  ).toThrow("Unknown query");
});

test("one composition renders skeleton structure without any result values", () => {
  const content = defineDataContent<{ count: number }, { period: string }>((state) => (
    <section>
      <h2>Orders</h2>
      {state.loading ? (
        <ContentSkeleton variant="ranking" rows={6} />
      ) : (
        <p>
          {state.data.count} in {state.input.period}
        </p>
      )}
    </section>
  ));
  const loading = renderToStaticMarkup(content.loading);
  expect(loading.match(/class="altertable-content-skeleton-row"/g)).toHaveLength(6);
  expect(loading).not.toContain("120");
  expect(renderToStaticMarkup(content.children({ count: 120 }, { period: "March" }))).toContain(
    "120 in March",
  );
});

test("an empty card tab renders its authored fallback", () => {
  const markup = renderToStaticMarkup(
    <CardViewTabs
      label="Views"
      selectedKey="orders"
      onSelectionChange={() => {}}
      views={[
        {
          id: "orders",
          label: "Orders",
          isEmpty: true,
          empty: { title: "No orders" },
          content: <p>Must not render</p>,
        },
      ]}
    />,
  );
  expect(markup).toContain("No orders");
  expect(markup).not.toContain("Must not render");
});
