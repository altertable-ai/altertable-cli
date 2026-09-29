import type { DataOperation, DateRangeRequest } from "../src/contract.ts";
import { defineDateRangeContract } from "../src/contract.ts";
import { createDataClient } from "../src/client.ts";
import { createDataHooks } from "../src/react.tsx";
import { dateRangeVariable, textVariable } from "../src/ui/variables.ts";
import type { MetricCardProps } from "../src/ui/MetricCard.tsx";
import type { DataSectionProps } from "../src/ui/DataSection.tsx";
import type { DataAppProps } from "../src/ui/DataApp.tsx";

const { defineDataView } = createDataHooks<{
  activity: DataOperation<DateRangeRequest, { count: number }>;
}>(createDataClient());
const period = dateRangeVariable({
  key: "period",
  defaultValue: { kind: "preset", id: "last-7" },
  contract: defineDateRangeContract({ maxRangeDays: 30, timeZone: "UTC" }),
});
defineDataView({
  operation: "activity",
  variables: { period },
  input: ({ period }) => period,
  isEmpty: (data) => data.count === 0,
  empty: { title: "No activity" },
});
defineDataView({
  operation: "activity",
  variables: { period },
  // @ts-expect-error Operation input must match the selected operation.
  input: () => ({ count: 3 }),
  describeInput: period.describeInput,
  isEmpty: () => false,
  empty: { title: "Empty" },
});
// @ts-expect-error Without a date variable, the input needs an authored description.
defineDataView({
  operation: "activity",
  variables: { search: textVariable({ key: "search" }) },
  input: () => ({ range: { start: "2026-01-01", end: "2026-01-02" }, comparison: null }),
  isEmpty: (data) => data.count === 0,
  empty: { title: "No activity" },
});
// @ts-expect-error Numbers require a format.
const metric: MetricCardProps = { label: "Orders", value: 123 };
// @ts-expect-error Secondary requests require an empty state.
const section: DataSectionProps<number> = { view: { kind: "loading" }, children: () => null };
// @ts-expect-error Primary requests require a fallback on the request or shell.
const app: DataAppProps<number> = {
  config: { appearance: {}, title: "Test", scope: { organization: "a", environment: "b" } },
  dataContext: { description: "Test", glossary: {} },
  aboutEmpty: { glossary: { title: "Empty" }, queries: { title: "Empty" } },
  request: { view: { kind: "loading" }, refetch() {} },
  children: () => null,
};
void [metric, section, app];
