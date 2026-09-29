import type { ReactNode } from "react";
import type { DataReading, MetricReading, MetricValues } from "../core/reading.ts";
import type { DateRangeRequest } from "../core/contract.ts";
import { invariant } from "../core/invariant.ts";

export type DataContentHelpers<Data> = {
  select: <Value>(select: (data: Data) => Value) => DataReading<Value>;
  metric: (select: (data: Data) => MetricValues) => MetricReading;
};

export type DataContentState<Data, Input> = DataContentHelpers<Data> &
  ({ loading: true; data?: never; input?: never } | { loading: false; data: Data; input: Input });

/** Selectors run only for displayed data. Date comparisons inherit that result's input. */
export function defineDataContent<Data, Input>(
  render: (state: DataContentState<Data, Input>) => ReactNode,
  options: { date?: (input: Input) => DateRangeRequest } = {},
) {
  return {
    loading: render({
      loading: true,
      select: () => ({ loading: true }),
      metric: () => ({ loading: true }),
    }),
    children: (data: Data, input: Input) =>
      render({
        loading: false,
        data,
        input,
        select: (select) => ({ loading: false, value: select(data) }),
        metric: (select) => {
          const values = select(data);
          invariant(
            values.previous === undefined || options.date,
            "Metric comparisons require a view date binding.",
          );
          return { loading: false, value: { ...values, period: options.date?.(input) } };
        },
      }),
  };
}
