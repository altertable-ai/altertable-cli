import { useState, type ComponentType, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { invariant } from "../core/invariant.ts";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { dataAppTitle, type DataAppConfig } from "../core/config.ts";

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
  invariant(root, "Data app root element is missing.");
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
