import "@altertable/data-app/react/styles.css";
import { mountDataApp } from "@altertable/data-app/react";
import { App } from "#app/App.tsx";
import app from "#config";

mountDataApp({ config: app, component: App });
