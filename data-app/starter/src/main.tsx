import { createRoot } from "react-dom/client";
import { DataAppProvider } from "@altertable/data-app-runtime/react";
import { App } from "./App.tsx";
import app from "../app.json";
import "./styles.css";

document.documentElement.lang = navigator.language;
document.title = `${app.title} • ${app.scope.organization}/${app.scope.environment} • Altertable app`;

createRoot(document.getElementById("root")!).render(
  <DataAppProvider>
    <App />
  </DataAppProvider>,
);
