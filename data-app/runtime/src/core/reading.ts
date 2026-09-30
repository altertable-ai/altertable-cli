import type { DateRangeRequest } from "./contract.ts";

export type DataReading<Value> =
  | { loading: true; value?: never }
  | { loading: false; value: Value };

/** Zero is measured data. null or omitted means no previous measurement.
 * Comparison activation belongs to the reading's period, not these values. */
export type MetricValues = { current: number; previous?: number | null };
export type MetricReading = DataReading<MetricValues & { period?: DateRangeRequest }>;
