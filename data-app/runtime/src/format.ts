type CommonOptions = { locale?: string; missing?: string };

export type MetricFormat =
  | { kind: "count"; compact?: boolean; locale?: string }
  | { kind: "ratio"; maximumFractionDigits?: number; locale?: string }
  | { kind: "currency"; currency: string; locale?: string };

export function formatMetric(value: number, format: MetricFormat): string {
  if (format.kind === "count") return formatCount(value, format);
  if (format.kind === "ratio") return formatPercent(value, format);
  return formatNumber(value, {
    style: "currency",
    currency: format.currency,
    locale: format.locale,
  });
}

/** Missing and non-finite values use the `missing` label; negative zero renders as zero. */
export function formatNumber(
  value: number | null | undefined,
  options: CommonOptions & Intl.NumberFormatOptions = {},
): string {
  const { locale = "en-US", missing = "—", ...numberOptions } = options;
  return value === null || value === undefined || !Number.isFinite(value)
    ? missing
    : new Intl.NumberFormat(locale, numberOptions).format(Object.is(value, -0) ? 0 : value);
}

/** Negative and fractional counts render as missing. Compact notation is opt-in. */
export function formatCount(
  value: number | null | undefined,
  options: CommonOptions & { compact?: boolean } = {},
): string {
  const { compact = false, ...common } = options;
  if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0)) {
    return common.missing ?? "—";
  }
  return formatNumber(value, {
    ...common,
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : 0,
  });
}

const pluralRules = new Intl.PluralRules();

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return pluralRules.select(count) === "one" ? singular : plural;
}

/** Accepts a ratio (0.116), not a percentage (11.6). */
export function formatPercent(
  ratio: number | null | undefined,
  options: CommonOptions & { maximumFractionDigits?: number } = {},
): string {
  if (ratio === null || ratio === undefined || !Number.isFinite(ratio)) {
    return options.missing ?? "—";
  }
  const digits = options.maximumFractionDigits ?? (Math.abs(ratio) < 0.01 ? 2 : 1);
  const percentOptions = {
    locale: options.locale,
    style: "percent" as const,
    maximumFractionDigits: digits,
  };
  const smallestVisibleRatio = 10 ** -digits / 100;
  if (ratio !== 0 && Math.round(Math.abs(ratio) / smallestVisibleRatio) === 0) {
    const boundary = formatNumber(smallestVisibleRatio, percentOptions);
    return ratio > 0 ? `<${boundary}` : `>−${boundary}`;
  }
  return formatNumber(ratio, percentOptions);
}
