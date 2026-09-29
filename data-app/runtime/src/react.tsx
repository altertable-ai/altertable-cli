import {
  defineDataContent,
  resolveViewInput,
  describeViewInput,
  useViewVariables,
  type DataContentState,
  type DataViewDefinition,
} from "./view.tsx";
import { defineAppVariables, type VariableCollection } from "./ui/variables.ts";
export { defineDataContent } from "./view.tsx";
export type { DataContentState, DataViewDefinition, ResolvedVariables } from "./view.tsx";
import { useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import {
  keepPreviousData,
  hashKey,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DataOperations } from "./contract.ts";
import type { DataClient, InputOf, OutputOf } from "./client.ts";
import { dataAppTitle, type DataAppConfig } from "./config.ts";
import { resolveDataView } from "./ui/DataBoundary.tsx";
import { reportingPeriodText, type ReportingPeriod } from "./ui/PeriodSummary.tsx";

/** Mount once per document; installs document identity and the shared request provider. */
export function mountDataApp({
  config,
  component: Component,
  root = document.getElementById("root"),
}: {
  config: DataAppConfig;
  component: ComponentType;
  root?: HTMLElement | null;
}): void {
  if (!root) throw new Error("Data app root element is missing.");
  document.documentElement.lang = navigator.language;
  document.title = dataAppTitle(config);
  createRoot(root).render(
    <DataAppProvider>
      <Component />
    </DataAppProvider>,
  );
}

export function DataAppProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

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
   * Pass the result to `DataApp.request` or `DataSection.result`.
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
    defineAppVariables(definition.variables);
    return {
      ...definition,
      describeInput: describeViewInput<InputOf<Operations[Name]>>(definition),
      content: (
        render: (
          state: DataContentState<OutputOf<Operations[Name]>, InputOf<Operations[Name]>>,
        ) => ReactNode,
      ) => defineDataContent(render, { date: definition.date?.input }),
    };
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
    const variables = useViewVariables(definition.variables);
    const request = useDataView(
      definition.operation,
      resolveViewInput(definition, variables.resolved),
      {
        ...definition,
        describeInput: describeViewInput<InputOf<Operations[Name]>>(definition),
      },
    );
    return { ...request, empty: definition.empty, controls: variables.controls, variables };
  }
  return { useDataQuery, useDataView, defineDataView, useView };
}
