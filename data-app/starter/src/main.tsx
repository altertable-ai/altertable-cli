import { mountDataApp } from "@altertable/data-app-runtime/react";
import { App } from "#app/App.tsx";
import app from "#config";

mountDataApp({ config: app, component: App });
