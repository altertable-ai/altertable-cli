import { mountDataApp } from "@altertable/data-app-runtime/react";
import { App } from "./App.tsx";
import app from "../app.json";

mountDataApp({ config: app, component: App });
