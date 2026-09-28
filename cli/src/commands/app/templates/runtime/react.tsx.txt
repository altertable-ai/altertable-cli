import { useState, type ReactNode } from "react";
import {
  keepPreviousData,
  QueryClient,
  QueryClientProvider,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { DataOperations } from "./contract.ts";
import type { DataClient, InputOf } from "./client.ts";

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
  function useDataQuery<Name extends keyof Operations & string>(
    name: Name,
    input: InputOf<Operations[Name]>,
    options?: {
      enabled?: boolean;
      /** How long a successful response is fresh for these exact inputs. */
      staleTime?: number;
      /** How long an unused response remains available for instant revisit. */
      gcTime?: number;
      refetchOnWindowFocus?: boolean;
    },
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
  return { useDataQuery };
}
