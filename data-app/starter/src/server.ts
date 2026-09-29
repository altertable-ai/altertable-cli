import page from "#app/index.html";
import { serveLocalApp } from "@altertable/data-app-runtime/local";
import { operations } from "#app/operations.ts";
import app from "#config";

serveLocalApp({ page, operations, title: app.title });
