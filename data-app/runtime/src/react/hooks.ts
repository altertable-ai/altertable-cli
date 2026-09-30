import { useState, type ReactNode } from "react";
import { keepPreviousData, hashKey, useQuery, useQueryClient } from "@tanstack/react-query";
import type { DataOperations, DateRangeRequest } from "../core/contract.ts";
import type { DataClient, InputOf, OutputOf } from "../client/index.ts";
import { displayedSnapshot, resolveDataView } from "../core/data-view.ts";
import { reportingPeriodText, type ReportingPeriod } from "./ui/PeriodSummary.tsx";
import { defineAppVariables, type VariableCollection } from "../core/variables.ts";
import { dateRangeVariable, type DateRangeVariableOptions } from "./ui/variables.ts";
import {
  dimensionFilter,
  type DimensionFilterOptions,
  type DimensionOption,
  type DimensionValue,
} from "../core/dimension.ts";
import type { EmptyStateProps } from "./ui/EmptyState.tsx";
import { invariant } from "../core/invariant.ts";
import { defineDataContent, type DataContentState } from "./content.ts";
import {
  describeViewInput,
  resolveViewInput,
  type DataViewDefinition,
  type ResolvedVariables,
  type ViewBindings,
} from "./view.ts";
import { useViewVariables } from "./view-controls.tsx";

type TimeVariables<Additional extends VariableCollection> = {
  period: ReturnType<typeof dateRangeVariable>;
} & Additional;
type TimeInput<Additional extends VariableCollection> = keyof Additional extends never
  ? DateRangeRequest
  : ResolvedVariables<TimeVariables<Additional>>;
type TimeInputMapping<Additional extends VariableCollection, Input> =
  TimeInput<Additional> extends Input
    ? { input?: (values: ResolvedVariables<TimeVariables<Additional>>) => Input }
    : { input: (values: ResolvedVariables<TimeVariables<Additional>>) => Input };

/**
 * `placeholderData` may belong to an earlier input. Use `useDataView` to distinguish initial
 * loading, refreshes, and changed-input requests.
 */
export function createDataHooks<Operations extends DataOperations>(client: DataClient<Operations>) {
  type QueryOptions = {
    enabled?: boolean;
    staleTime?: number;
    gcTime?: number;
    refetchOnWindowFocus?: boolean;
  };

  function useDataQuery<Name extends keyof Operations & string>(
    name: Name,
    input: InputOf<Operations[Name]>,
    options?: QueryOptions,
  ) {
    const queryClient = useQueryClient();
    const queryKey = ["data-operation", name, input] as const;
    const query = useQuery({
      queryKey,
      queryFn: ({ signal }) => client.query(name, input, { signal }),
      placeholderData: keepPreviousData,
      enabled: options?.enabled,
      ...(options?.staleTime !== undefined && { staleTime: options.staleTime }),
      ...(options?.gcTime !== undefined && { gcTime: options.gcTime }),
      ...(options?.refetchOnWindowFocus !== undefined && {
        refetchOnWindowFocus: options.refetchOnWindowFocus,
      }),
    });
    return {
      ...query,
      /** Abort the current request and restore its prior query state. */
      cancel: () => queryClient.cancelQueries({ queryKey, exact: true }),
    };
  }

  /** Join a typed request with its displayed-data state. Pass the result to
   * `DataApp.request` or `DataSection.result`.
   * `isEmpty` is app-owned so a measured zero remains valid. Previous-input data
   * stays labeled through refreshes and errors. Input equality uses React Query's
   * stable key hash by default; override `sameInput` for a custom equivalence rule. */
  function useDataView<Name extends keyof Operations & string>(
    name: Name,
    input: InputOf<Operations[Name]>,
    options: QueryOptions & {
      isEmpty: (data: OutputOf<Operations[Name]>) => boolean;
      describeInput?: (input: InputOf<Operations[Name]>) => string;
      period?: (input: InputOf<Operations[Name]>) => ReportingPeriod;
      sameInput?: (left: InputOf<Operations[Name]>, right: InputOf<Operations[Name]>) => boolean;
    },
  ) {
    const query = useDataQuery(name, input, options);
    const [last, setLast] = useState<{ name: Name; response: NonNullable<typeof query.data> }>();
    if (
      query.isSuccess &&
      !query.isPlaceholderData &&
      query.data &&
      (last?.name !== name || last.response !== query.data)
    ) {
      setLast({ name, response: query.data });
    }
    const sameInput =
      options.sameInput ??
      ((left: InputOf<Operations[Name]>, right: InputOf<Operations[Name]>) =>
        hashKey([left]) === hashKey([right]));
    const response = query.data ?? (last?.name === name ? last.response : undefined);
    const snapshot = response && { data: response.data, input: response.input };
    const view = resolveDataView({
      requestedInput: input,
      current:
        snapshot && !query.isPlaceholderData && sameInput(snapshot.input, input)
          ? snapshot
          : undefined,
      previous: snapshot,
      pending: query.isFetching,
      error: query.error instanceof Error ? query.error : undefined,
      sameInput,
      describe:
        options.describeInput ??
        ((input) => (options.period ? reportingPeriodText(options.period(input)) : "this view")),
      isEmpty: options.isEmpty,
    });
    return {
      ...query,
      view,
      snapshot: displayedSnapshot(view),
      response,
      queries: response?.queries,
      refresh: {
        refreshing: query.isFetching,
        onRefresh: () => void query.refetch(),
        onCancel: query.cancel,
      },
    };
  }
  function defineDataView<
    Name extends keyof Operations & string,
    const Variables extends VariableCollection,
  >(
    definition: DataViewDefinition<
      Name,
      Variables,
      InputOf<Operations[Name]>,
      OutputOf<Operations[Name]>
    >,
  ) {
    const variables = defineAppVariables(definition.variables);
    return {
      ...definition,
      variables,
      describeInput: describeViewInput<InputOf<Operations[Name]>>(definition),
      content: (
        render: (
          state: DataContentState<OutputOf<Operations[Name]>, InputOf<Operations[Name]>>,
        ) => ReactNode,
      ) => defineDataContent(render, { date: definition.date?.input }),
    };
  }

  /** One time declaration owns the URL picker, operation input, and displayed-period label.
   * Without extra variables, the default input is the DateRangeRequest; with them it is
   * { period, ...variables }. Other operation shapes require an input mapper.
   * Mappers must preserve the period and dimension selections; bindings extract nested inputs.
   * Use defineDataView with describeInput for deliberately fixed-period views. */
  function defineTimeView<
    Name extends keyof Operations & string,
    const Additional extends VariableCollection = {},
  >(
    definition: {
      operation: Name;
      time: Omit<DateRangeVariableOptions, "key">;
      variables?: Additional & { period?: never };
      bindings?: ViewBindings<
        { period: ReturnType<typeof dateRangeVariable> } & NoInfer<Additional>,
        InputOf<Operations[Name]>
      >;
      isEmpty: (data: OutputOf<Operations[Name]>) => boolean;
      empty: Pick<EmptyStateProps, "title" | "description">;
    } & TimeInputMapping<NoInfer<Additional>, InputOf<Operations[Name]>>,
  ) {
    invariant(
      !definition.variables || !("period" in definition.variables),
      "The period input is owned by defineTimeView.",
    );
    const period = dateRangeVariable({ ...definition.time, key: "period" });
    return defineDataView<Name, { period: typeof period } & Additional>({
      operation: definition.operation,
      variables: { period, ...definition.variables } as { period: typeof period } & Additional,
      bindings: definition.bindings,
      input: (values) => {
        if (definition.input) return definition.input(values);
        if (!definition.variables || !Object.keys(definition.variables).length)
          return values.period as InputOf<Operations[Name]>;
        return { ...values } as InputOf<Operations[Name]>;
      },
      date: {
        variable: "period" as never,
        input: (input) =>
          definition.bindings?.period
            ? (definition.bindings.period(input) as DateRangeRequest)
            : ((input && typeof input === "object" && "period" in input
                ? input.period
                : input) as DateRangeRequest),
      },
      isEmpty: definition.isEmpty,
      empty: definition.empty,
    });
  }

  /** Bind a facet source to a declared operation and its typed input.
   * Options are cached for 60 seconds; known values survive refreshes and errors.
   * Selected values absent from a new result remain available with a zero count. */
  function defineFacetFilter<
    Name extends keyof Operations & string,
    const T extends DimensionValue,
  >(
    config: Omit<DimensionFilterOptions<T>, "options" | "facet"> & {
      facet: {
        operation: Name;
        input: (values: Record<string, unknown>) => InputOf<Operations[Name]>;
      };
    } & (OutputOf<Operations[Name]> extends readonly DimensionOption<T>[] ? object : never),
  ) {
    return dimensionFilter<T>(config);
  }

  function useView<
    Name extends keyof Operations & string,
    const Variables extends VariableCollection,
  >(
    definition: DataViewDefinition<
      Name,
      Variables,
      InputOf<Operations[Name]>,
      OutputOf<Operations[Name]>
    >,
  ) {
    const variables = useViewVariables(definition.variables, (operation, input, signal) =>
      client
        .query(operation as keyof Operations & string, input as never, { signal })
        .then((response) => response.data),
    );
    const request = useDataView(
      definition.operation,
      resolveViewInput(definition, variables.resolved),
      {
        ...definition,
        describeInput: describeViewInput<InputOf<Operations[Name]>>(definition),
      },
    );
    return {
      view: request.view,
      snapshot: request.snapshot,
      refetch: request.refetch,
      refresh: request.refresh,
      queries: request.queries,
      empty: definition.empty,
      controls: variables.controls,
      variables,
    };
  }
  return { useDataQuery, useDataView, defineDataView, defineTimeView, defineFacetFilter, useView };
}
