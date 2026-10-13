import { injectDataAppStyles, mountDataApp } from "@altertable/data-app/react";
import { App } from "#app/App.tsx";
import app from "#app/config.ts";

injectDataAppStyles();
mountDataApp({ app, component: App });
