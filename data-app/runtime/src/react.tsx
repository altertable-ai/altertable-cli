import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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

/** Browser entry point: set document identity and mount the app with its request provider.
 * Call once from `src/main.tsx`; import app-specific styles there if needed. */
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

/** Owns React Query request state for one rendered data app. */
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

/** Infer operation names, inputs, and results from the app's operation registry.
 * `placeholderData` can belong to an earlier input: compare the response's scope with
 * the requested input before presenting it as current. `isFetching` alone cannot
 * distinguish an initial load, a refresh, or a changed-input request. */
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
   * `<DataSection result={view}>` and `<DataApp request={view}>`.
   * `isEmpty` is app-owned so a measured zero remains valid. Previous-input data
   * stays labeled through refreshes and errors. Input equality uses React Query's
   * stable key hash by default; override `sameInput` for a custom equivalence rule. */
  function useDataView<Name extends keyof Operations & string>(
    name: Name,
    input: InputOf<Operations[Name]>,
    options: QueryOptions & {
      isEmpty: (data: OutputOf<Operations[Name]>) => boolean;
      describeInput: (input: InputOf<Operations[Name]>) => string;
      sameInput?: (left: InputOf<Operations[Name]>, right: InputOf<Operations[Name]>) => boolean;
    },
  ) {
    const query = useDataQuery(name, input, options);
    const [last, setLast] = useState<{ name: Name; response: NonNullable<typeof query.data> }>();
    useEffect(() => {
      if (query.isSuccess && !query.isPlaceholderData && query.data) {
        setLast({ name, response: query.data });
      }
    }, [name, query.isSuccess, query.isPlaceholderData, query.data]);
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
      describe: options.describeInput,
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
  return { useDataQuery, useDataView };
}
